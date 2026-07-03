# VideoChatApp (Android)

React Native app for the video chat + coins product: sign up/login, buy coin
packs via Google Play Billing, browse online "hosts", and make WebRTC video
calls that are billed per minute against the caller's coin balance.

Pairs with the backend in `../server`.

## Setup

```bash
npm install
```

Point the app at your backend: edit `src/config/env.ts`. By default in dev
it targets `http://10.0.2.2:4000` (the Android emulator's alias for your
host machine's `localhost:4000`, i.e. the `server` project running via
`npm run dev`). A physical device needs your machine's LAN IP instead, and
you'll need to add that IP to `android/app/src/main/res/xml/network_security_config.xml`
too since cleartext HTTP is blocked everywhere else by design.

Run it (requires Android Studio + SDK + an emulator or a device with USB
debugging enabled — **this repo was built without an Android SDK available,
so none of this has been run on a real emulator; expect to debug the first
build**):

```bash
npx react-native start        # Metro bundler, in one terminal
npx react-native run-android  # in another terminal
```

## What's implemented

- Email/password auth (`src/screens/Login|RegisterScreen.tsx`), JWT stored
  in AsyncStorage, auto-attached to every API request (`src/api/client.ts`).
- Wallet screen (`src/screens/WalletScreen.tsx`): lists coin packages from
  the backend, buys them via `react-native-iap`, and posts the resulting
  purchase token to the backend for server-side verification before any
  coins are credited.
- Host discovery (`src/screens/HomeScreen.tsx`) and becoming a host /
  managing earnings (`src/screens/ProfileScreen.tsx`).
- Video calling (`src/screens/CallScreen.tsx`): `react-native-webrtc` peer
  connection, signaled over the same Socket.io connection as the rest of
  the app (`src/context/SocketContext.tsx`), with a live call timer and
  mic/camera toggle. Coin balance updates in near-real-time as the backend
  bills per minute.

## Before you can actually publish this to Google Play

This is a functional MVP scaffold, not a submitted app. Concretely still
needed:

1. **Run it on a real device/emulator and fix whatever breaks.** No Android
   SDK was available while building this, so the native build has not been
   executed even once. Expect at least some Gradle/native-linking
   friction on the first `run-android` — that's normal for a from-scratch
   RN + WebRTC + IAP project, not a sign the code is wrong.
2. **Real app icon** — `android/app/src/main/res/mipmap-*/ic_launcher*.png`
   are solid-color placeholders right now. Replace with real launcher icons
   (use Android Studio's Image Asset tool, or any adaptive-icon generator).
3. **Application ID** — `com.videochatapp` in `android/app/build.gradle`
   (`applicationId`) and `android/app/src/main/java/com/videochatapp/*` is a
   placeholder. Rename to your real reverse-domain package before release
   (Android Studio's "Refactor > Rename Package" handles this cleanly).
4. **Release signing key**. Generate one:
   ```bash
   keytool -genkeypair -v -keystore videochat-release.keystore \
     -alias videochat -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep it and its passwords out of git. Build with:
   ```bash
   ./gradlew bundleRelease \
     -PVIDEOCHAT_UPLOAD_STORE_FILE=/absolute/path/videochat-release.keystore \
     -PVIDEOCHAT_UPLOAD_STORE_PASSWORD=... \
     -PVIDEOCHAT_UPLOAD_KEY_ALIAS=videochat \
     -PVIDEOCHAT_UPLOAD_KEY_PASSWORD=...
   ```
   (or Play App Signing, which is the option Google recommends and shows
   during your first upload — you can let Google manage the signing key
   instead of self-managing one).
5. **Google Play Billing products** must exist in Play Console before coin
   purchases work at all — see `../server/README.md`'s Billing section.
6. **A deployed, HTTPS backend.** `src/config/env.ts`'s production branch
   points at a placeholder domain; update it once `server/` is deployed.
7. **A TURN server for production** (see `../server/README.md`) — without
   one, calls between two users on restrictive networks (mobile data,
   corporate wifi) will frequently fail to connect.
8. **Privacy Policy URL** — required by Play Console for any app requesting
   camera/microphone, and especially for one handling in-app purchases.
   Must disclose camera/mic use, what call data you retain, and your coin
   refund policy.
9. **Play Console "paid host" / marketplace policy review.** An app where
   users pay coins to video call other individual users is squarely inside
   Google Play's higher-scrutiny categories:
   - **Live-streaming / video-chat content policy** — requires an in-app
     reporting/blocking mechanism for abusive users (not yet built here —
     the backend has no report/block/ban endpoints yet) and a moderation
     process for hosts.
   - **User-generated content policy** — same reporting requirement.
   - **Financial features** — since hosts cash out coins for real money,
     depending on your jurisdiction this can trigger money-transmitter /
     payment-facilitator obligations. Talk to a lawyer before enabling real
     payouts; the withdrawal flow in this codebase intentionally stops at
     "admin marks it paid" and does not move real money anywhere.
   - Expect a **manual Google review** (sometimes multiple rounds) before
     approval, and budget time for it separately from engineering time.
10. **Age gate / content rating.** Random or paid video chat with strangers
    is typically rated for mature audiences and Play Console will ask
    detailed content-rating questionnaire questions about it.

None of the above is optional if the goal is "live on the Play Store" — the
code in this repo gets you a working product to test and iterate on, but
the policy/compliance items are the long pole for this category of app.
