import { useEffect, useRef, useState } from "react";

const SAMPLE_TEXT = "Hello! This is my AI voice clone. I can turn your written text into natural-sounding speech.";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export default function App() {
  const [session, setSession] = useState({ loading: true, authenticated: false, authRequired: false });
  const [password, setPassword] = useState("");
  const [name, setName] = useState("My voice");
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [voice, setVoice] = useState(null);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("lmlm-generated-speech.mp3");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    fetch("/api/session").then(readJson).then(setSession).catch(() => setSession({ loading: false, authenticated: false, authRequired: true }));
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  async function signIn(event) {
    event.preventDefault(); setBusy("login"); setError("");
    try {
      const result = await readJson(await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password })
      }));
      setSession({ loading: false, authenticated: result.authenticated, authRequired: result.authRequired });
      setPassword("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function enrollVoice(event) {
    event.preventDefault(); setError(""); setNotice("");
    if (!file) return setError("Choose a voice recording first.");
    if (file.size > MAX_FILE_BYTES) return setError("Recording must be 10 MB or smaller.");
    if (!consent) return setError("Confirm you own this voice or have explicit permission to clone it.");
    const form = new FormData();
    form.append("audio", file); form.append("name", name); form.append("consent", "true");
    setBusy("clone");
    try {
      const result = await readJson(await fetch("/api/voices/clone", { method: "POST", body: form }));
      setVoice({ id: result.voiceId, name: result.name });
      setNotice("Voice clone created. You can now generate speech with it.");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function generateSpeech(event) {
    event.preventDefault(); setError(""); setNotice("");
    if (!voice?.id) return setError("Create a voice clone before generating speech.");
    if (!text.trim()) return setError("Enter the text you want to speak.");
    if (text.length > 5000) return setError("Keep text to 5,000 characters or fewer.");
    setBusy("speech");
    try {
      const response = await fetch("/api/speech", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, text })
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Speech generation failed (${response.status}).`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("The provider returned an empty audio file.");
      const nextUrl = URL.createObjectURL(blob);
      setAudioUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return nextUrl; });
      setAudioName("lmlm-speech-" + new Date().toISOString().replace(/[:.]/g, "-") + ".mp3");
      setNotice("Speech generated successfully. Listen below or download the MP3.");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    setSession((s) => ({ ...s, authenticated: false }));
    setVoice(null); setAudioUrl(""); setNotice("Signed out.");
  }

  if (session.loading) return <main className="loading">Opening LMLM Studio…</main>;
  if (session.authRequired && !session.authenticated) return (
    <main className="login-wrap">
      <div className="brand"><span className="brand-mark">L</span><span>LMLM <b>STUDIO</b></span></div>
      <form className="login-card" onSubmit={signIn}>
        <p className="eyebrow">PRIVATE VOICE WORKSPACE</p><h1>Welcome back.</h1>
        <p className="muted">Sign in to access your voice studio.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label htmlFor="password">Workspace password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary full" disabled={busy === "login"}>{busy === "login" ? "Signing in…" : "Sign in"} <span>→</span></button>
      </form>
      <p className="footnote">Your voice data deserves privacy. Only use recordings you’re authorized to clone.</p>
    </main>
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="LMLM Studio home"><span className="brand-mark">L</span><span>LMLM <b>STUDIO</b></span></a>
        <div className="topbar-right"><span className="status"><i /> VOICE LAB</span>{session.authRequired && <button className="quiet" onClick={signOut}>Sign out</button>}</div>
      </header>

      <section className="hero">
        <div className="hero-copy"><p className="eyebrow"><span className="spark">✳</span> YOUR VOICE, REIMAGINED</p>
          <h1>Give your words<br />a <em>familiar sound.</em></h1>
          <p className="hero-sub">Create a voice from a recording you’re authorized to use, then turn any text into speech you can hear and keep.</p>
          <div className="hero-points"><span><i>✓</i> Your voice, your control</span><span><i>✓</i> Instant MP3 output</span></div>
        </div>
        <div className="wave-card" aria-label="Decorative audio waveform">
          <div className="wave-top"><span className="live-dot" /> AUDIO ENGINE <span className="wave-time">LMLM / 01</span></div>
          <div className="waveform">{Array.from({ length: 58 }, (_, i) => <span key={i} style={{ height: `${12 + Math.abs(Math.sin(i * 0.73) * Math.cos(i * 0.21)) * (i % 7 === 0 ? 65 : 43)}%` }} />)}</div>
          <div className="wave-bottom"><span>VOICE INPUT</span><span className="wave-line" /><span>VOICE OUTPUT</span></div>
        </div>
      </section>

      {error && <div className="alert error" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="alert success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      <div className="workspace">
        <section className="panel">
          <div className="panel-head"><div className="step">01</div><div><p className="eyebrow">VOICE ENROLLMENT</p><h2>Build your voice</h2></div><span className="panel-icon">◉</span></div>
          <p className="panel-description">Upload a clear recording to create a reusable voice profile. A quiet, natural speaking voice works best.</p>
          <form onSubmit={enrollVoice}>
            <label className="field-label" htmlFor="voice-name">VOICE PROFILE NAME</label>
            <input id="voice-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. My narration voice" required />
            <label className="field-label upload-label">RECORDING <span>MP3 · WAV · M4A · WEBM · up to 10 MB</span></label>
            <input ref={fileInput} className="file-hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button type="button" className={"dropzone " + (file ? "has-file" : "")} onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const dropped = e.dataTransfer.files?.[0]; if (dropped) setFile(dropped); }}>
              <span className="upload-icon">↑</span><b>{file ? file.name : "Drop your recording here"}</b><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Click to change` : "or browse files on your device"}</span>
            </button>
            <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I confirm I own this voice or have explicit permission to create this clone.</span></label>
            <button className="primary full" type="submit" disabled={busy === "clone" || !file || !consent}>{busy === "clone" ? <><span className="spinner" /> Creating voice…</> : <>Create voice clone <span>↗</span></>}</button>
          </form>
          {voice && <div className="voice-created"><span className="voice-avatar">♫</span><div><b>{voice.name}</b><small>Voice profile ready · {voice.id.slice(0, 8)}…</small></div><span className="checkmark">✓</span><button className="quiet" type="button" onClick={() => setVoice(null)}>Reset</button></div>}
          <p className="privacy-note"><span>◇</span> Recording is held in server memory for forwarding and isn’t saved to this app’s disk. The provider may process or retain voice data under its own terms.</p>
        </section>

        <section className="panel panel-generate">
          <div className="panel-head"><div className="step">02</div><div><p className="eyebrow">TEXT TO SPEECH</p><h2>Make it speak</h2></div><span className="panel-icon">⌁</span></div>
          <p className="panel-description">Write what you want to say. Your generated audio will be ready to preview and download.</p>
          <form onSubmit={generateSpeech}>
            <div className="text-label-row"><label className="field-label" htmlFor="speech-text">YOUR SCRIPT</label><span>{text.length.toLocaleString()} / 5,000</span></div>
            <textarea id="speech-text" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Type something you’d like your voice to say…" required />
            <div className="script-tools"><button type="button" className="quiet" onClick={() => setText(SAMPLE_TEXT)}>↺ Use sample text</button><span>{voice ? "● Voice selected" : "○ Create a voice to continue"}</span></div>
            <div className="selected-voice"><span className="voice-avatar">♫</span><div><small>GENERATING WITH</small><b>{voice?.name || "No voice selected yet"}</b></div><span className={voice ? "ready-pill" : "pending-pill"}>{voice ? "READY" : "WAITING"}</span></div>
            <button className="primary full" type="submit" disabled={busy === "speech" || !voice || !text.trim()}>{busy === "speech" ? <><span className="spinner" /> Generating audio…</> : <>Generate speech <span>↗</span></>}</button>
          </form>
          {audioUrl ? <div className="audio-result"><div className="audio-result-head"><span className="result-icon">♫</span><div><b>Your speech is ready</b><small>MP3 audio · generated just now</small></div><span className="ready-pill">READY</span></div><audio controls src={audioUrl}>Your browser does not support audio playback.</audio><a className="download-btn" href={audioUrl} download={audioName}>↓ Download MP3 <span>↓</span></a></div> :
            <div className="empty-audio"><span className="empty-icon">♫</span><b>Your audio will appear here</b><span>Generate speech to preview it and download the MP3.</span></div>}
        </section>
      </div>

      <footer className="footer"><span>© {new Date().getFullYear()} LMLM STUDIO</span><span><i /> BUILT FOR RESPONSIBLE VOICE CREATION</span><a href="https://elevenlabs.io" target="_blank" rel="noreferrer">Powered by ElevenLabs ↗</a></footer>
    </main>
  );
}
