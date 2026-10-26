import test from "node:test";
import assert from "node:assert/strict";
import { VoiceRegistry } from "./voice-registry.js";

test("voice records are isolated by session", () => {
  const registry = new VoiceRegistry();
  registry.add("session-a", { id: "voice_12345", name: "My voice" });
  assert.equal(registry.owns("session-a", "voice_12345"), true);
  assert.equal(registry.owns("session-b", "voice_12345"), false);
  assert.deepEqual(registry.list("session-b"), []);
});

test("lists owned voices and removes only the requested voice", () => {
  const registry = new VoiceRegistry();
  registry.add("session-a", { id: "voice_12345", name: "First" });
  registry.add("session-a", { id: "voice_67890", name: "Second" });
  assert.equal(registry.list("session-a").length, 2);
  assert.equal(registry.remove("session-a", "voice_12345"), true);
  assert.equal(registry.owns("session-a", "voice_12345"), false);
  assert.equal(registry.owns("session-a", "voice_67890"), true);
  assert.equal(registry.remove("session-a", "missing"), false);
});

test("rejects incomplete records and cleans up empty session buckets", () => {
  const registry = new VoiceRegistry();
  assert.throws(() => registry.add("session-a", { id: "voice_12345" }), /complete voice record/);
  registry.add("session-a", { id: "voice_12345", name: "My voice" });
  assert.equal(registry.remove("session-a", "voice_12345"), true);
  assert.deepEqual(registry.list("session-a"), []);
});
