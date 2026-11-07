import express from "express";
import rateLimit from "express-rate-limit";

const API_BASE = "https://api.cloudflare.com/client/v4";
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ZONE_ID = /^[a-f0-9]{32}$/i;
const DNS_TYPES = new Set([
  "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"
]);

export function normalizeDomain(value) {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > 253 || domain.includes("://") || domain.includes("/")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) return null;
  return domain;
}

export function validateDnsRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "A DNS record object is required.";
  const type = typeof input.type === "string" ? input.type.toUpperCase() : "";
  if (!DNS_TYPES.has(type)) return "Unsupported DNS record type.";
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 253) return "A valid DNS record name is required.";
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 2048) return "DNS record content is required and must be at most 2,048 characters.";
  if (type === "MX" && (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 65535)) return "MX records require a priority between 0 and 65535.";
  if (input.ttl !== undefined && (!Number.isInteger(input.ttl) || input.ttl !== 1 && (input.ttl < 60 || input.ttl > 86400))) return "TTL must be automatic (1) or between 60 and 86400 seconds.";
  if (input.proxied !== undefined && typeof input.proxied !== "boolean") return "proxied must be a boolean.";
  return null;
}

function configuration() {
  return {
    token: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID
  };
}

async function cloudflareRequest(path, { method = "GET", body } = {}) {
  const { token } = configuration();
  if (!token) {
    const error = new Error("Cloudflare is not configured. Set CLOUDFLARE_API_TOKEN on the server.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  let payload;
  try { payload = await response.json(); }
  catch { payload = null; }

  if (!response.ok || payload?.success !== true) {
    const error = new Error(payload?.errors?.[0]?.message || `Cloudflare API request failed (HTTP ${response.status}).`);
    error.status = response.status === 429 ? 429 : response.status >= 400 && response.status < 500 ? 422 : 502;
    if (response.headers.get("retry-after")) error.retryAfter = response.headers.get("retry-after");
    throw error;
  }
  return payload.result;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createCloudflareRouter(requireSession) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Cloudflare management rate limit reached. Try again shortly." }
  });

  router.use(requireSession, limiter);

  router.get("/status", (_req, res) => {
    const { token, accountId } = configuration();
    res.json({ configured: Boolean(token && accountId), tokenConfigured: Boolean(token), accountConfigured: Boolean(accountId) });
  });

  router.get("/zones", asyncRoute(async (_req, res) => {
    const { accountId } = configuration();
    if (!accountId) return res.status(503).json({ error: "Set CLOUDFLARE_ACCOUNT_ID on the server." });
    const zones = await cloudflareRequest(`/zones?account.id=${encodeURIComponent(accountId)}&per_page=50`);
    return res.json({ zones: zones.map(({ id, name, status, name_servers, type }) => ({ id, name, status, nameServers: name_servers || [], type })) });
  }));

  router.post("/zones", asyncRoute(async (req, res) => {
    const { accountId } = configuration();
    if (!accountId) return res.status(503).json({ error: "Set CLOUDFLARE_ACCOUNT_ID on the server." });
    const domains = req.body?.domains;
    if (!Array.isArray(domains) || domains.length < 1 || domains.length > 50) {
      return res.status(400).json({ error: "Provide between 1 and 50 domains." });
    }
    const normalized = domains.map(normalizeDomain);
    if (normalized.some((domain) => !domain)) return res.status(400).json({ error: "One or more domains are invalid." });
    if (new Set(normalized).size !== normalized.length) return res.status(400).json({ error: "Duplicate domains are not allowed in one request." });

    const results = [];
    for (const domain of normalized) {
      try {
        const zone = await cloudflareRequest("/zones", {
          method: "POST",
          body: { account: { id: accountId }, name: domain, type: "full" }
        });
        results.push({ domain, success: true, zone: { id: zone.id, name: zone.name, status: zone.status, nameServers: zone.name_servers || [] } });
      } catch (error) {
        results.push({ domain, success: false, error: error.message, status: error.status || 502 });
      }
    }
    const failed = results.filter((item) => !item.success).length;
    return res.status(failed === results.length ? 502 : failed ? 207 : 201).json({
      created: results.length - failed,
      failed,
      results
    });
  }));

  router.get("/zones/:zoneId/dns", asyncRoute(async (req, res) => {
    if (!ZONE_ID.test(req.params.zoneId)) return res.status(400).json({ error: "Invalid zone ID." });
    const records = await cloudflareRequest(`/zones/${req.params.zoneId}/dns_records?per_page=100`);
    return res.json({ records });
  }));

  router.post("/zones/:zoneId/dns", asyncRoute(async (req, res) => {
    if (!ZONE_ID.test(req.params.zoneId)) return res.status(400).json({ error: "Invalid zone ID." });
    const validationError = validateDnsRecord(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const { type, name, content, ttl = 1, proxied = false, priority } = req.body;
    const record = await cloudflareRequest(`/zones/${req.params.zoneId}/dns_records`, {
      method: "POST",
      body: { type: type.toUpperCase(), name: name.trim(), content: content.trim(), ttl, proxied, ...(type.toUpperCase() === "MX" ? { priority } : {}) }
    });
    return res.status(201).json({ record });
  }));

  router.delete("/zones/:zoneId/dns/:recordId", asyncRoute(async (req, res) => {
    if (!ZONE_ID.test(req.params.zoneId) || !ZONE_ID.test(req.params.recordId)) {
      return res.status(400).json({ error: "Invalid zone or DNS record ID." });
    }
    const result = await cloudflareRequest(`/zones/${req.params.zoneId}/dns_records/${req.params.recordId}`, { method: "DELETE" });
    return res.json({ deleted: true, id: result.id });
  }));

  router.use((error, _req, res, _next) => {
    if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
    return res.status(error.status || 502).json({ error: error.message || "Cloudflare request failed." });
  });

  return router;
}
