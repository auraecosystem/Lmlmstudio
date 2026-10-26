import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VoiceRegistry } from "./voice-registry.js";
import {
  MAX_AUDIO_BYTES, MAX_TEXT_LENGTH, validateAudioFile,
  validateSpeechText, validateVoiceId, validateVoiceName
} from "./validation.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const isProduction = process.env.NODE_ENV === "production";
const appPassword = process.env.APP_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const apiKey = process.env.ELEVENLABS_API_KEY;
const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const sessionCookie = "lmlm_voice_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const voiceRegistry = new VoiceRegistry();

if (isProduction && (!appPassword || !sessionSecret || !apiKey)) {
  throw new Error("Production requires ELEVENLABS_API_KEY, APP_PASSWORD, and SESSION_SECRET.");
}
if (!apiKey) console.warn("ELEVENLABS_API_KEY is not set. Provider actions will return a configuration error.");
if (!appPassword || !sessionSecret) console.warn("Password login is disabled for local development. Configure APP_PASSWORD and SESSION_SECRET before deployment.");

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(express.json({ limit: "32kb" }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
const cloneLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Voice creation limit reached. Try again later." } });
const speechLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Speech generation limit reached. Please wait a minute." } });

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function readSession(req) {
  const raw = req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(sessionCookie + "="))?.slice(sessionCookie.length + 1);
  if (!raw || !sessionSecret) return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Math.floor(Date.now() / 1000) && typeof data.sid === "string" ? data : false;
  } catch { return false; }
}
function requireSession(req, res, next) {
  if ((!appPassword || !sessionSecret) && !isProduction) return next();
  if (readSession(req)) return next();
  return res.status(401).json({ error: "Please sign in to use the voice studio." });
}
function setSessionCookie(res, sessionId = crypto.randomUUID()) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = signSession({ exp, sid: sessionId });
  const flags = ["HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${SESSION_TTL_SECONDS}`];
  if (isProduction) flags.push("Secure");
  res.setHeader("Set-Cookie", `${sessionCookie}=${value}; ${flags.join("; ")}`);
}
function sessionIdFor(req, res) {
  const session = readSession(req);
  if (session?.sid) return session.sid;
  const sessionId = crypto.randomUUID();
  setSessionCookie(res, sessionId);
  return sessionId;
}
function clearSessionCookie(res) {
  const flags = ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"];
  if (isProduction) flags.push("Secure");
  res.setHeader("Set-Cookie", `${sessionCookie}=; ${flags.join("; ")}`);
}
function providerError(status, body) {
  const message = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
  const error = new Error(message || "The speech provider could not complete the request.");
  error.status = status >= 400 && status < 500 ? 422 : 502;
  return error;
}
async function providerFetch(url, options) {
  if (!apiKey) {
    const error = new Error("Voice provider is not configured. Add ELEVENLABS_API_KEY to the server environment.");
    error.status = 503;
    throw error;
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(60_000),
    headers: { "xi-api-key": apiKey, ...options.headers }
  });
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* non-JSON provider response */ }
    throw providerError(response.status, body);
  }
  return response;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, authRequired: Boolean(appPassword && sessionSecret) }));
app.get("/api/session", (req, res) => {
  const authRequired = Boolean(appPassword && sessionSecret) || isProduction;
  res.json({ authenticated: !authRequired || Boolean(readSession(req)), authRequired });
});
app.post("/api/login", loginLimiter, (req, res) => {
  if (!appPassword || !sessionSecret) {
    if (!isProduction) return res.json({ authenticated: true, authRequired: false });
    return res.status(503).json({ error: "Login is not configured." });
  }
  if (typeof req.body?.password !== "string" || !safeEqual(req.body.password, appPassword)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  setSessionCookie(res, crypto.randomUUID());
  return res.json({ authenticated: true, authRequired: true });
});
app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 4, parts: 6 }
});

app.post("/api/voices/clone", requireSession, cloneLimiter, upload.single("audio"), async (req, res) => {
  try {
    if (req.body?.consent !== "true") return res.status(400).json({ error: "Confirm that you own this voice or have explicit permission to clone it." });
    const nameError = validateVoiceName(req.body?.name);
    if (nameError) return res.status(400).json({ error: nameError });
    const fileError = validateAudioFile(req.file);
    if (fileError) return res.status(400).json({ error: fileError });

    // The uploaded recording stays in memory and is forwarded directly to the provider.
    // It is not written to disk or retained by this application.
    const form = new FormData();
    form.append("name", req.body.name.trim());
    form.append("files", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"));
    const response = await providerFetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", body: form });
    const result = await response.json();
    if (!result.voice_id) return res.status(502).json({ error: "Provider did not return a voice ID." });
    const voice = voiceRegistry.add(sessionIdFor(req, res), { id: result.voice_id, name: req.body.name.trim() });
    return res.status(201).json({ voiceId: voice.id, name: voice.name });
  } catch (error) {
    const status = error instanceof multer.MulterError ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400) : (error.status || 502);
    return res.status(status).json({ error: error instanceof multer.MulterError ? "Recording is too large or the upload is invalid." : error.message || "Could not create the voice clone." });
  }
});

app.get("/api/voices", requireSession, (req, res) => {
  return res.json({ voices: voiceRegistry.list(sessionIdFor(req, res)) });
});

app.delete("/api/voices/:voiceId", requireSession, async (req, res) => {
  const voiceError = validateVoiceId(req.params.voiceId);
  if (voiceError) return res.status(400).json({ error: voiceError });
  const sessionId = sessionIdFor(req, res);
  if (!voiceRegistry.owns(sessionId, req.params.voiceId)) {
    return res.status(404).json({ error: "Voice not found in this session." });
  }
  try {
    await providerFetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(req.params.voiceId)}`, { method: "DELETE" });
    voiceRegistry.remove(sessionId, req.params.voiceId);
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || "Could not delete the voice from the provider." });
  }
});

app.post("/api/speech", requireSession, speechLimiter, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const textError = validateSpeechText(text);
  if (textError) return res.status(400).json({ error: textError });
  if (text.length > MAX_TEXT_LENGTH) return res.status(400).json({ error: "Text is too long." });
  const voiceError = validateVoiceId(req.body?.voiceId);
  if (voiceError) return res.status(400).json({ error: voiceError });
  const sessionId = sessionIdFor(req, res);
  if (!voiceRegistry.owns(sessionId, req.body.voiceId)) {
    return res.status(403).json({ error: "You can only generate speech with a voice created in this session." });
  }

  try {
    const response = await providerFetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.body.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      }
    );
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'attachment; filename="lmlm-generated-speech.mp3"');
    res.setHeader("Cache-Control", "no-store");
    const audio = Buffer.from(await response.arrayBuffer());
    return res.status(200).send(audio);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || "Could not generate speech." });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
if (isProduction) {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Recording is too large or the upload is invalid." });
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, "0.0.0.0", () => console.log(`LMLM Studio API listening on port ${port}`));
