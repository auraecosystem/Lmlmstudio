export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 5000;
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/flac",
  "video/webm", "video/mp4"
]);

export function validateSpeechText(value) {
  if (typeof value !== "string") return "Text is required.";
  const text = value.trim();
  if (!text) return "Enter the text you want to speak.";
  if (text.length > MAX_TEXT_LENGTH) return `Text must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  return null;
}

export function validateVoiceName(value) {
  if (typeof value !== "string" || !value.trim()) return "Give your voice clone a name.";
  if (value.trim().length > 80) return "Voice name must be 80 characters or fewer.";
  return null;
}

function hasSignature(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const starts = (...bytes) => bytes.every((byte, index) => buffer[index] === byte);
  switch (mimetype) {
    case "audio/wav":
    case "audio/x-wav":
      return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
    case "audio/webm":
    case "video/webm":
      return starts(0x1a, 0x45, 0xdf, 0xa3);
    case "audio/ogg":
      return buffer.toString("ascii", 0, 4) === "OggS";
    case "audio/flac":
      return buffer.toString("ascii", 0, 4) === "fLaC";
    case "audio/mp4":
    case "video/mp4":
      return buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp";
    case "audio/aac":
      return starts(0xff) && (buffer[1] & 0xf6) === 0xf0;
    case "audio/mpeg":
    case "audio/mp3":
      return buffer.toString("ascii", 0, 3) === "ID3" || (starts(0xff) && (buffer[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}

export function validateAudioFile(file) {
  if (!file) return "Choose an audio recording first.";
  if (!ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) return "Unsupported audio format. Use MP3, WAV, M4A/MP4, WebM, OGG, AAC, or FLAC.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected recording is empty.";
  if (file.size > MAX_AUDIO_BYTES) return "Recording must be 10 MB or smaller.";
  if (!hasSignature(file.buffer, file.mimetype)) return "The uploaded file content does not match a supported audio format.";
  return null;
}

export function validateVoiceId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{5,128}$/.test(value)) {
    return "A valid cloned voice ID is required.";
  }
  return null;
}
