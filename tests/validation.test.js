import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUDIO_BYTES, MAX_TEXT_LENGTH, validateAudioFile,
  validateSpeechText, validateVoiceId, validateVoiceName
} from "../server/validation.js";

test("speech text must be non-empty and bounded", () => {
  assert.match(validateSpeechText("   "), /Enter the text/);
  assert.match(validateSpeechText(null), /required/);
  assert.equal(validateSpeechText(" Hello "), null);
  assert.match(validateSpeechText("x".repeat(MAX_TEXT_LENGTH + 1)), /characters/);
});

test("voice names must be present and bounded", () => {
  assert.match(validateVoiceName(" "), /name/);
  assert.equal(validateVoiceName("My voice"), null);
  assert.match(validateVoiceName("x".repeat(81)), /80 characters/);
});

test("audio upload enforces MIME type, non-empty data, and size", () => {
  assert.match(validateAudioFile(null), /Choose/);
  assert.match(validateAudioFile({ mimetype: "text/plain", size: 10 }), /Unsupported/);
  assert.match(validateAudioFile({ mimetype: "audio/mpeg", size: 0 }), /empty/);
  assert.match(validateAudioFile({ mimetype: "audio/mpeg", size: MAX_AUDIO_BYTES + 1 }), /10 MB/);
  assert.equal(validateAudioFile({ mimetype: "audio/mpeg", size: 1024 }), null);
});

test("voice IDs reject empty and unsafe input", () => {
  assert.match(validateVoiceId(""), /valid cloned voice ID/);
  assert.match(validateVoiceId("../etc/passwd"), /valid cloned voice ID/);
  assert.equal(validateVoiceId("voice_123456"), null);
});
