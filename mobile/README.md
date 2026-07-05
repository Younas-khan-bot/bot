# StarCallLive (Android)

React Native app for the video chat + coins product: sign up/login, buy coin
packs via Google Play Billing, browse online "hosts", and make WebRTC video
calls that are billed per minute against the caller's coin balance.

Application ID: `com.starcalllive.app`. Pairs with the backend in `../server`.

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
debugging enabled):

```bash
npx react-native start        # Metro bundler, in one terminal
npx react-native run-android  # in another terminal
```

**This has been verified to build and produce a working, installable debug
APK** (`android/app/build/outputs/apk/debug/app-debug.apk` after
`./gradlew assembleDebug`) using a manually-installed Android SDK/NDK/CMake
and the system Gradle, since no Android Studio was available in the build
environment. A few real fixes were needed along the way and are already
applied in this repo:

- `react-native-gesture-handler` is pinned to `2.16.2` — newer 2.2x/2.3x
  releases need codegen features RN 0.74's toolchain doesn't produce, and
  fail with "Cannot access 'ViewManagerWithGeneratedInterface'".
- `compileSdk`/`targetSdk` are 35 and AGP is bumped to 8.6.0 (see
  `android/build.gradle`) because a transitive `androidx.core:core:1.16.0`
  dependency requires it; `androidx.core` is also pinned via
  `resolutionStrategy.force` as a safety net.
- `app/build.gradle` sets `missingDimensionStrategy 'store', 'play'`
  because `react-native-iap` ships separate Google Play/Amazon Appstore
  build flavors and Gradle can't pick one on its own.
- `settings.gradle` / `app/build.gradle` use the real RN 0.74 autolinking
  mechanism (`native_modules.gradle`'s `applyNativeModulesSettingsGradle`/
  `applyNativeModulesAppBuildGradle`) — RN 0.75+ tutorials online show a
  different `com.facebook.react.settings` plugin API that doesn't exist yet
  in 0.74's gradle plugin.

If your build environment sits behind a corporate proxy/VPN that injects a
`JAVA_TOOL_OPTIONS` environment variable (common in locked-down corporate
Windows setups), watch out for this: every `java` subprocess prints a
harmless "Picked up JAVA_TOOL_OPTIONS: ..." notice to stderr when that
variable is set, and Android Gradle Plugin's prefab (native library) step
misreads *any* stderr output from its worker process as a hard failure —
surfacing as a baffling `[CXX1210] No compatible library found` error from
`react-native-screens`' CMake build that has nothing to do with libraries
at all. If you hit that exact error, check whether `JAVA_TOOL_OPTIONS` is
set in your shell; if so, move those flags to `GRADLE_OPTS` instead and
unset `JAVA_TOOL_OPTIONS` before running Gradle.

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

## Release build (signed AAB)

Release signing reads `android/keystore.properties`, which points at
`android/app/upload-keystore.jks`. Both are committed to this **private**
repo on purpose: the app is only ever built in an ephemeral cloud
environment, so the signing key has to persist here or future updates could
never be signed. Google Play App Signing is enabled, so this is the *upload*
key (resettable in the Play Console if it's ever compromised).

Build the AAB you upload to Play:

```bash
cd android
# If the environment sets JAVA_TOOL_OPTIONS (e.g. a proxy injects SSL/proxy
# flags), unset it and pass those flags via GRADLE_OPTS instead — otherwise
# AGP's CMake step fails with "[CXX1210] No compatible library found" because
# it misreads the "Picked up JAVA_TOOL_OPTIONS" stderr notice as an error.
GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx3g $JAVA_TOOL_OPTIONS" \
  JAVA_TOOL_OPTIONS= \
  ANDROID_HOME=/opt/android-sdk \
  gradle :app:bundleRelease --no-daemon
# → app/build/outputs/bundle/release/app-release.aab
```

The release build bundles JS automatically with `__DEV__=false`, so the app
talks to the production Railway backend (`src/config/env.ts`).

## Play Store readiness — status

Done and in this repo:

- ✅ **Application ID** renamed to `com.starcalllive.app` (package, gradle,
  manifest, native source).
- ✅ **Release signing** configured (`keystore.properties` +
  `upload-keystore.jks`), signed AAB builds.
- ✅ **Deployed HTTPS backend** — `src/config/env.ts` points at the Railway
  production URL for release builds.
- ✅ **Report / block users** — required for this app category. In-app "⋮"
  safety menu on the host list and an in-call ⚠️ button (report reasons +
  block), a Blocked-users management screen, and server endpoints
  (`/moderation/*`) that also hide blocked users from discovery and calls.
- ✅ **Privacy Policy + Terms** — hosted in `../docs` (GitHub Pages) and
  linked from the Profile screen. Enable Pages in repo Settings → Pages
  (source: `main` branch, `/docs`) so the URLs in `src/config/env.ts`
  resolve.

Still needed before / during submission:

1. **Real app icon** — `android/app/src/main/res/mipmap-*/ic_launcher*.png`
   are solid-color placeholders. Replace with real launcher icons.
2. **Google Play Billing products** must be created in Play Console with the
   exact IDs `coins_100`, `coins_550`, `coins_1200`, `coins_2600`,
   `coins_7000` before coin purchases work — see `../server/README.md`.
3. **A TURN server for production** (see `../server/README.md`) — without
   one, calls between users on restrictive networks (mobile data) frequently
   fail to connect.
4. **Content rating + data-safety form** — random/paid video chat with
   strangers is rated mature; fill in the Play Console questionnaires.
5. **Financial/legal** — hosts cashing out coins for real money can trigger
   money-transmitter obligations depending on jurisdiction. The withdrawal
   flow intentionally stops at "admin marks it paid" and moves no real money
   until you wire a payout provider. Talk to a lawyer before enabling real
   payouts.
6. Expect a **manual Google review**, possibly multiple rounds, for this
   category — budget time for it separately from engineering.
