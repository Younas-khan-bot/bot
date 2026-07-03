# Video Chat + Coins App

A video chat app where users buy coins (via Google Play Billing) to spend on
per-minute paid video calls with "hosts", who earn a share of those coins.

- **`server/`** — Node.js/Express + Socket.io + PostgreSQL backend: auth,
  coin wallet, Google Play purchase verification, host discovery, WebRTC
  call signaling with live per-minute billing. See `server/README.md`.
- **`mobile/`** — React Native (Android) app: auth, wallet/coin purchases,
  host discovery, WebRTC video calling. See `mobile/README.md`.

Start with `server/README.md` to get the backend running locally, then
`mobile/README.md` for the app and what's still needed before a Play Store
submission (real device testing, app icon, signing key, Play Billing
products, a deployed HTTPS backend, and — importantly — the content
moderation / policy requirements Google Play applies to paid video-chat
apps).
