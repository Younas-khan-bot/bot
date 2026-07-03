# Video Chat backend

Node.js/Express + Socket.io + PostgreSQL (Prisma) backend for the video chat
app: accounts, coin wallet with Google Play Billing receipt verification,
host discovery, and WebRTC call signaling with live per-minute coin billing.

## Quick start (local dev)

```bash
npm install
cp .env.example .env      # then edit as needed

# Postgres: either run the provided docker-compose, or point DATABASE_URL
# at any Postgres instance you already have.
docker compose up -d

npx prisma migrate dev --name init
npm run dev                # nodemon, restarts on file change
```

The server listens on `http://localhost:4000` by default. `GET /health`
returns `{"ok":true}` once it's up.

By default `SKIP_IAP_VERIFICATION=true` in `.env.example`, so you can test
the coin-purchase flow without a real Google Play Console app. **Set it to
`false` and configure `GOOGLE_PLAY_PACKAGE_NAME` +
`GOOGLE_SERVICE_ACCOUNT_JSON_PATH` before shipping** — see below.

## Architecture

- **Auth**: email/password, bcrypt hashes, JWT bearer tokens (`/auth`).
- **Wallet**: coin balance + immutable transaction ledger. Every balance
  change goes through `applyCoinDelta` in a DB transaction so the wallet
  balance and the ledger can never drift apart (`/wallet`).
- **Coin purchases**: the app buys a Google Play "managed product" (a coin
  pack), then POSTs the purchase token to `/wallet/purchase/verify`. The
  server re-verifies the token against the real Google Play Developer API
  (`src/services/googlePlayBilling.js`) and only then credits coins — never
  trust a client-reported purchase. The purchase token is stored as a unique
  key (`IapReceipt.purchaseToken`) so replaying the same token is a no-op.
- **Hosts**: any user can apply to become a paid host (`POST /hosts/apply`),
  but `isApproved` defaults to `false` — an admin must approve them
  (`POST /hosts/admin/:userId/approve`) before they're callable. This gate
  exists because a marketplace where strangers pay to video call people is
  exactly the kind of feature that needs a human review step for abuse
  prevention.
- **Calls / signaling**: `src/sockets/signaling.js` runs over Socket.io.
  Clients connect with `auth: { token: <JWT> }`. Events:
  `call:request` → `call:incoming` → `call:accept`/`call:reject` →
  `call:accepted` (includes ICE server config) → `webrtc:offer` /
  `webrtc:answer` / `webrtc:ice-candidate` (raw relay) → `call:end` →
  `call:ended`. While a call is `ONGOING` the server charges the caller
  `ratePerMinute` coins once per minute (prepaid: the first minute is
  charged immediately on accept) and credits the host `HOST_PAYOUT_PERCENT`%
  of that as `CALL_EARN`. If the caller's balance runs out, the call is
  ended automatically with reason `INSUFFICIENT_BALANCE`.
- **Withdrawals**: hosts request a cash-out of earned coins
  (`POST /withdrawals/request`, coins are held immediately); an admin
  approves/pays or rejects (`/withdrawals/admin/...`). Actually paying real
  money out is intentionally NOT automated here — wire up your own
  payout/KYC provider before enabling this for real users.

## Google Play Billing setup (required before release)

1. In Play Console, create your app and add **in-app products** (type:
   Managed product / consumable) with product IDs matching
   `src/config/coinPackages.js` exactly (`coins_100`, `coins_550`, etc.), or
   edit that file to match the IDs you choose.
2. Play Console → Setup → API access → create/link a Google Cloud project,
   then create a **service account** with the "Financial data" permission
   under Play Console's API access page, and download its JSON key.
3. Set `GOOGLE_PLAY_PACKAGE_NAME` to your app's applicationId and
   `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` to point at that JSON key file. Set
   `SKIP_IAP_VERIFICATION=false`.
4. The mobile app purchases products with `react-native-iap`, then calls
   `POST /wallet/purchase/verify` with `{ productId, purchaseToken }`.

## WebRTC TURN server

`STUN_URL` alone (the default, Google's public STUN) is enough for two
devices on open networks, but many real-world networks (carrier NAT,
corporate/school wifi) need a **TURN** relay to connect at all. For
production, run [coturn](https://github.com/coturn/coturn) yourself or use a
hosted TURN provider (Twilio Network Traversal, Xirsys, Cloudflare Calls),
and set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`.

## Data model

See `prisma/schema.prisma`. Key tables: `User`, `Wallet`, `CoinTransaction`
(append-only ledger), `IapReceipt` (purchase replay protection),
`HostProfile`, `Call`, `WithdrawalRequest`.

## Deploying

Any Node host works (Render, Fly.io, Railway, a plain VPS). Requirements:
- A reachable Postgres database (`DATABASE_URL`).
- `npx prisma migrate deploy` on release instead of `migrate dev`.
- Socket.io needs a host that supports long-lived WebSocket connections
  (works fine on all of the above; if you put it behind a load balancer,
  enable sticky sessions or a Socket.io Redis adapter for multi-instance).
- HTTPS/WSS in production — mobile apps and Play Store review both expect
  it, and browsers/OS block plaintext WebRTC signaling to non-localhost
  hosts in some configurations.
