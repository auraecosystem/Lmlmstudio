# LMLM Studio

LMLM Studio is the home for the AI Voice Cloner application.

The initial repository was empty. The application scaffold and implementation will be added in a dedicated feature branch so changes can be reviewed before merging.

## Planned workflow

- Enroll an authorized voice recording with a supported voice-cloning provider.
- Enter text and synthesize speech using the enrolled voice.
- Play generated audio and download it as an audio file.
- Keep provider credentials on the server; never expose them to browser code.

## Safety and privacy

Only upload recordings you own or are explicitly authorized to use. Voice clones can be sensitive biometric-like data. Configure authentication, access controls, retention, and deletion policies before deploying to production.
