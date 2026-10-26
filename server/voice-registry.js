/**
 * Process-local voice ownership registry.
 *
 * Ownership is scoped to the signed browser session ID. This registry is
 * intentionally small and dependency-free; it is cleared on process restart,
 * so production deployments needing durable ownership must use a database.
 */
export class VoiceRegistry {
  #sessions = new Map();

  add(sessionId, voice) {
    if (!sessionId || !voice?.id || !voice?.name) {
      throw new TypeError("A session ID and complete voice record are required.");
    }
    let voices = this.#sessions.get(sessionId);
    if (!voices) {
      voices = new Map();
      this.#sessions.set(sessionId, voices);
    }
    voices.set(voice.id, { id: voice.id, name: voice.name, createdAt: voice.createdAt || new Date().toISOString() });
    return voices.get(voice.id);
  }

  list(sessionId) {
    return [...(this.#sessions.get(sessionId)?.values() || [])];
  }

  owns(sessionId, voiceId) {
    return this.#sessions.get(sessionId)?.has(voiceId) || false;
  }

  remove(sessionId, voiceId) {
    const voices = this.#sessions.get(sessionId);
    if (!voices?.has(voiceId)) return false;
    voices.delete(voiceId);
    if (voices.size === 0) this.#sessions.delete(sessionId);
    return true;
  }
}
