
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TEXT =
  "Hello! This is my AI voice clone. I can turn your written text into natural-sounding speech.";

type Props = {
  // Set this to the voice ID returned when the clone was created.
  initialVoiceId?: string;
};

export default function VoiceClonerTTS({
  initialVoiceId = "",
}: Props) {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [voiceId, setVoiceId] = useState(initialVoiceId);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function generateSpeech() {
    setError("");

    if (!voiceId.trim()) {
      setError("Select or create a voice clone first.");
      return;
    }

    if (!text.trim() || text.length > 5000) {
      setError("Enter between 1 and 5,000 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke("generate-speech", {
          body: {
            text: text.trim(),
            voiceId: voiceId.trim(),
          },
        });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (!data?.audioBase64) {
        throw new Error(
          data?.error || "The provider returned no audio."
        );
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const audioBlob = new Blob([bytes], {
        type: data.contentType || "audio/mpeg",
      });

      const nextUrl = URL.createObjectURL(audioBlob);

      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Speech generation failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 rounded-2xl border p-6">
      <div>
        <h2 className="text-2xl font-semibold">
          AI Voice Cloner
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate speech with your authorized cloned voice.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Cloned voice ID
        </span>
        <input
          className="w-full rounded-lg border bg-background p-3"
          value={voiceId}
          onChange={(event) => setVoiceId(event.target.value)}
          placeholder="Enter your provider voice ID"
          autoComplete="off"
        />
        <span className="text-xs text-muted-foreground">
          Use the ID returned by the voice-cloning step.
        </span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Text to speak
        </span>
        <textarea
          className="min-h-36 w-full resize-y rounded-lg border bg-background p-3"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={5000}
          placeholder="Type what your cloned voice should say..."
        />
        <span className="text-xs text-muted-foreground">
          {text.length}/5000 characters
        </span>
      </label>

      <button
        type="button"
        onClick={generateSpeech}
        disabled={loading || !text.trim() || !voiceId.trim()}
        className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Generating speech..." : "Generate speech"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {audioUrl && (
        <div className="space-y-3 rounded-xl bg-muted p-4">
          <h3 className="font-medium">Generated audio</h3>
          <audio
            key={audioUrl}
            controls
            preload="metadata"
            src={audioUrl}
            className="w-full"
          >
            Your browser does not support audio playback.
          </audio>
          <a
            href={audioUrl}
            download="ai-voice-clone.mp3"
            className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Download MP3
          </a>
        </div>
      )}
    </section>
  );
}

