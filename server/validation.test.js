import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUDIO_BYTES, MAX_TEXT_LENGTH, validateAudioFile,
  validateSpeechText, validateVoiceId, validateVoiceName
} from "./validation.js";

const audio = (mimetype, buffer) => ({ mimetype, buffer, size: buffer.length });

test("accepts a WAV file with a valid RIFF/WAVE signature", () => {
  const buffer = Buffer.alloc(16);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WAVE", 8, "ascii");
  assert.equal(validateAudioFile(audio("audio/wav", buffer)), null);
});

test("accepts an MP3 file with an ID3 signature", () => {
  assert.equal(validateAudioFile(audio("audio/mpeg", Buffer.from("ID3\u0004\u0000\u0000\u0000", "binary"))), null);
});

test("rejects a file whose declared MIME type does not match its content", () => {
  assert.match(validateAudioFile(audio("audio/wav", Buffer.from("not an audio file"))), /content does not match/);
});

test("rejects unsupported MIME types, empty files, and oversized files", () => {
  assert.match(validateAudioFile(audio("application/octet-stream", Buffer.from("x"))), /Unsupported audio format/);
  assert.match(validateAudioFile({ mimetype: "audio/mpeg", size: 0, buffer: Buffer.alloc(0) }), /empty/);
  assert.match(validateAudioFile({ mimetype: "audio/mpeg", size: MAX_AUDIO_BYTES + 1, buffer: Buffer.from("ID3x") }), /10 MB/);
});

test("rejects missing uploads", () => {
  assert.match(validateAudioFile(null), /Choose an audio recording/);
});

test("validates speech text boundaries", () => {
  assert.match(validateSpeechText("  "), /Enter the text/);
  assert.match(validateSpeechText("x".repeat(MAX_TEXT_LENGTH + 1)), /5000 characters/);
  assert.equal(validateSpeechText("  Hello there  "), null);
});

test("validates voice names and provider voice IDs", () => {
  assert.match(validateVoiceName(" "), /name/);
  assert.match(validateVoiceName("x".repeat(81)), /80 characters/);
  assert.equal(validateVoiceName(" My voice "), null);
  assert.match(validateVoiceId("bad/id"), /valid cloned voice ID/);
  assert.equal(validateVoiceId("voice_12345"), null);
});
