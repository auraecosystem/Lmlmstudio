# LMLM Studio — AI Voice Cloner

LMLM Studio is a web application for creating an AI voice clone from a recording you own or are explicitly authorized to use, then turning text into speech with that voice. It provides a browser interface for voice enrollment and speech generation, audio preview, and MP3 download.

The application uses a React/Vite frontend and a Node.js/Express API. Requests to the speech provider are made by the server, so the provider API key stays out of browser code.

## Features

- **Voice enrollment:** Submit an authorized recording with a name and explicit consent confirmation.
- **Audio upload validation:** Accepts supported audio formats, checks file signatures, and enforces a 10 MB upload limit.
- **Text-to-speech:** Generate speech from text using a created voice.
- **Audio playback and download:** Preview generated audio in the browser and download the returned MP3.
- **Server-side provider access:** The ElevenLabs API key is sent only by the server.
- **Optional password gate:** Configure a shared application password for access control.
- **Baseline abuse controls:** Login, voice creation, and speech-generation endpoints have rate limits.
- **Automated checks:** Node's built-in test runner and a Vite production build.

## Architecture

```text
Browser (React + Vite)
        |
        | same-origin /api requests
        v
Node.js + Express
  ├── Session/password gate
  ├── Request, text, and upload validation
  ├── Rate limits and security headers
  └── ElevenLabs API client
        |
        v
ElevenLabs voice cloning and text-to-speech
```

The server keeps uploaded recordings in memory and forwards them to the provider; this application does not write the uploaded recording to disk. Provider-side processing and retention are subject to the provider's policies and settings.

## Requirements

- Node.js **20.18 or newer**
- npm
- An ElevenLabs API key with access to the voice-cloning and text-to-speech endpoints

## Quick start

1. Clone this repository and enter its directory.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a local `.env` file based on `.env.example` if that example file is present, or set the environment variables listed below in your shell.
4. Configure `ELEVENLABS_API_KEY`. For local password protection, also set `APP_PASSWORD` and `SESSION_SECRET`.
5. Start the frontend and API in development mode:

   ```sh
   npm run dev
   ```

6. Open the local URL printed by Vite. The development server normally uses `http://127.0.0.1:5173`.

Keep secrets in the server environment. **Never put the provider API key in a `VITE_*` variable or commit secrets to the repository.**

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Yes for provider operations; required in production | Server-side API key for voice cloning and speech generation |
| `APP_PASSWORD` | Required in production | Shared password for the application's login gate |
| `SESSION_SECRET` | Required in production | Long, random secret used to sign session cookies |
| `ELEVENLABS_MODEL_ID` | No | Text-to-speech model ID; defaults to `eleven_multilingual_v2` |
| `PORT` | No | Express server port; defaults to `8787` |
| `NODE_ENV` | Set to `production` for production | Enables production startup requirements and serving the built frontend |

For local development, the application can run without password protection if `APP_PASSWORD` and `SESSION_SECRET` are not configured. Do not use that mode for a public deployment.

Generate a strong session secret rather than reusing a password. For example, with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API and Vite development server together |
| `npm run dev:server` | Run the Express API in watch mode |
| `npm run dev:client` | Run the Vite development server |
| `npm test` | Run Node's built-in test suite |
| `npm run build` | Build the frontend into `dist/` |
| `npm run check` | Run tests followed by the production build |
| `npm start` | Start the Express server |

In production, build the frontend and then start the server:

```sh
npm ci
npm run check
npm run build
NODE_ENV=production npm start
```

Set `ELEVENLABS_API_KEY`, `APP_PASSWORD`, and `SESSION_SECRET` in the deployment environment or secret manager before starting the production server. Production startup fails if any of those three values is missing. The Express server serves the built frontend from `dist/`.

## Application flow

1. **Sign in** if password protection is configured.
2. **Enroll a voice:** Provide a voice name, select a recording, and confirm that you own the voice or have explicit permission to clone it.
3. **Validation:** The server checks the declared format, file signature, non-empty content, and maximum upload size before forwarding the recording.
4. **Create the clone:** The server submits the recording to the provider and returns its voice ID.
5. **Generate speech:** Enter text and request speech with the returned voice ID.
6. **Listen and download:** The API returns MP3 audio for playback and download.

The current API limits uploaded recordings to **10 MB** and text to **5,000 characters**. Voice names are limited to 80 characters. Upload signature checks are basic format checks; they do not prove that a file is fully decodable or that its contents are safe in every downstream system.

## API overview

The Express server exposes these application endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Basic health response and whether password authentication is configured |
| `GET` | `/api/session` | Report the current authentication state |
| `POST` | `/api/login` | Check the configured shared password and set a signed session cookie |
| `POST` | `/api/logout` | Clear the session cookie |
| `POST` | `/api/voices/clone` | Validate consent and recording, then request voice cloning |
| `POST` | `/api/speech` | Validate text and voice ID, then return generated MP3 audio |

The clone endpoint expects multipart form data containing `audio`, `name`, and `consent=true`. The speech endpoint expects JSON containing `text` and `voiceId`. Protected operations require a valid session when authentication is enabled.

## Security and responsible use

- Clone only your own voice or a voice for which you have explicit authorization. Never use voice cloning to impersonate, defraud, harass, or mislead people.
- Deploy behind HTTPS. In production, the session cookie is `HttpOnly`, `Secure`, and `SameSite=Strict`.
- Store `ELEVENLABS_API_KEY`, `APP_PASSWORD`, and `SESSION_SECRET` in your deployment secret manager. Never expose them in client-side code or logs.
- Keep the application and dependencies updated. Monitor provider usage and configure provider-side spending limits.
- Current rate limits are in-memory and primarily IP-based. They are a baseline, not a substitute for identity-aware quotas, monitoring, or a shared rate-limit store in a multi-instance deployment.
- The current password gate is a **single shared password**, not individual user accounts. It does not provide per-user isolation or a database-backed voice ownership registry.
- The speech endpoint validates the syntax of a voice ID but does not maintain an owner-to-voice mapping. Do not treat a valid voice ID as proof that the caller is authorized to use that voice.
- The app does not currently provide a verified provider-side voice deletion workflow. Removing a local reference does not remove a voice stored by the provider. Establish and document a retention/deletion process before offering a multi-user production service.
- The app does not persist uploaded recordings to disk, but the recording is sent to the configured provider. Review the provider's current consent, eligibility, processing, and retention terms before use.

## Testing and verification

Run the automated checks locally:

```sh
npm test
npm run build
# or run both in sequence
npm run check
```

The test suite covers request/input validation, including audio file checks. The build verifies that the frontend compiles. These checks do **not** verify a live ElevenLabs request; that requires valid provider credentials and a controlled test. CI results should be checked in the repository's Actions tab before treating a commit as verified.

## Current limitations

- Shared-password authentication only; no individual accounts.
- No persistent voice registry or per-user voice authorization.
- No built-in provider-side voice deletion or retention management.
- Rate limits use the default in-memory store and are not shared across multiple server instances.
- Audio signature validation is not a full media decoder or malware scan.
- Provider integration and account permissions require separate live verification.

These limitations should be addressed before exposing the application as a public, multi-user service.
