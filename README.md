# LMLM Studio — AI Voice Cloner

A React/Vite interface with a Node/Express API for enrolling an authorized voice recording, generating speech with that voice, previewing the audio, and downloading an MP3.

## Stack

- React + Vite frontend
- Express API
- ElevenLabs Instant Voice Cloning API for voice enrollment and text-to-speech
- Node's built-in test runner and GitHub Actions CI

## Requirements

- Node.js 20.18 or newer
- An ElevenLabs API key with access to voice cloning and text-to-speech

## Local development

1. Copy `.env.example` to `.env`.
2. Add your provider key to `ELEVENLABS_API_KEY`. Keep this value server-side; never prefix it with `VITE_`.
3. Optionally set `APP_PASSWORD` and a long random `SESSION_SECRET` to enable password protection during local testing.
4. Install dependencies and start both services:

   ```sh
   npm install
   npm run dev
   ```

5. Open the local URL printed by Vite (normally http://127.0.0.1:5173).

For a production build, run `npm run build`, then set `NODE_ENV=production`, `ELEVENLABS_API_KEY`, `APP_PASSWORD`, and a strong random `SESSION_SECRET`, and run `npm start`. The Express server serves the built frontend in production.

## How it works

- Voice enrollment accepts one audio recording up to 10 MB and requires an explicit authorization confirmation.
- The server validates the upload, holds it in memory, and forwards it to ElevenLabs. This app does not write the uploaded audio to disk.
- The server returns the provider's voice ID. The browser uses that ID to request speech; it does not call ElevenLabs directly.
- Speech is returned as MP3 audio, previewed in the browser, and downloadable.
- Requests have rate limits. Production startup fails closed if the provider key or login configuration is missing.

## Production security checklist

- Deploy behind HTTPS. Production session cookies are Secure, HttpOnly, and SameSite=Strict.
- Use a strong, unique `APP_PASSWORD` and a cryptographically random `SESSION_SECRET`; keep them in the deployment platform's secret manager.
- Configure deployment-level rate limiting, monitoring, and a persistent session store if you scale beyond one instance.
- Set provider account spending/usage limits. Current per-IP rate limits are a baseline, not a substitute for identity-based quotas or abuse monitoring.
- Confirm your provider's voice-cloning eligibility, retention, and consent rules. Provider-side processing and retention are governed by the provider's terms.
- Add user accounts and per-user voice ownership checks before offering this to multiple users. The current single-workspace password gate does not provide multi-tenant isolation or a database-backed voice registry.
- Add an explicit delete-voice workflow and retention policy before production use; deleting the local browser state does not delete the provider-side voice.
- Use only voices you own or are authorized to clone. Do not use cloning to impersonate or deceive.

## Validation

`npm test` runs input-validation tests. `npm run build` compiles the frontend. CI runs both checks. A live provider test requires valid ElevenLabs credentials and is not part of CI.
