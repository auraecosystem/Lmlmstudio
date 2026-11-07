import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, validateDnsRecord } from "../server/cloudflare.js";

test("normalizes valid domains and rejects malformed input", () => {
  assert.equal(normalizeDomain(" Example.COM. "), "example.com");
  assert.equal(normalizeDomain("sub.example.co.uk"), "sub.example.co.uk");
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain("https://example.com"), null);
  assert.equal(normalizeDomain("-bad.example"), null);
  assert.equal(normalizeDomain("example..com"), null);
  assert.equal(normalizeDomain("localhost"), null);
});

test("validates supported DNS records", () => {
  assert.equal(validateDnsRecord({ type: "A", name: "example.com", content: "192.0.2.1" }), null);
  assert.equal(validateDnsRecord({ type: "MX", name: "example.com", content: "mail.example.com", priority: 10 }), null);
  assert.match(validateDnsRecord({ type: "MX", name: "example.com", content: "mail.example.com" }), /priority/);
  assert.match(validateDnsRecord({ type: "BOGUS", name: "example.com", content: "x" }), /Unsupported/);
  assert.match(validateDnsRecord({ type: "TXT", name: "example.com", content: "" }), /content/);
  assert.match(validateDnsRecord({ type: "A", name: "example.com", content: "192.0.2.1", ttl: 5 }), /TTL/);
  assert.match(validateDnsRecord(null), /object/);
});
