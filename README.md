# Directly

Instagram, DMs only. The app opens straight into your messages and removes the feed, Reels and
Explore — you can still watch the one reel a friend sent you, and then you stop.

Two surfaces, one shared core:

- **iOS app** (`apps/ios`) — an Expo/React Native shell around Instagram's own mobile web in a single
  WKWebView, with a native four-tab bar.
- **Browser extension** (`apps/extension`) — MV3, runs on `instagram.com` only, same blocking logic,
  plus a four-item nav that replaces Instagram's.
- **Website** (`apps/web`) — static landing, help and privacy pages. It never shows Instagram; it
  points you at the app or the extension.

Nothing here reads, stores or transmits your password, cookies or messages, and nothing automates
anything on Instagram. There is no server.

## Requirements

Node 20+ and pnpm 10+ (`packageManager` in the root manifest is pnpm 12).

## Commands

```bash
pnpm install
pnpm build          # core → extension → web
pnpm test           # 120 unit tests (routes, guard, reel lock, cleanup, protocol)
pnpm typecheck      # core, extension, web
```

### The app (iOS + Android)

The Expo app lives in `apps/ios` and targets both platforms from one codebase.

```bash
cd apps/ios
pnpm typecheck
pnpm ios            # expo run:ios      — needs Xcode
pnpm android        # expo run:android  — needs JDK 17 + Android SDK
```

For a first run, `npx expo prebuild --platform android --clean` generates
`android/`, and `android/local.properties` must point at your SDK
(`sdk.dir=/Users/you/Library/Android/sdk`). The generated `android/` and `ios/`
folders are gitignored — they are build output, not source.

#### Release builds

A release build compiles the JS bundle into the APK (`assets/index.android.bundle`, Hermes
bytecode), so the app starts on the device with no Metro and no `adb reverse`:

```bash
cd apps/ios/android

./gradlew assembleRelease                                        # all four ABIs — sideload anywhere
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a   # arm64 only — emulator, modern phones
```

The output is `app/build/outputs/apk/release/app-release.apk`; `adb install -r` it and it keeps
working after every Metro process is gone. The ABI list comes from `reactNativeArchitectures` in
`android/gradle.properties`, and overriding it on the command line is the whole difference: the
arm64-only build compiles one set of native libraries instead of four, so it pays back on every
clean build and produces a 23 MB APK rather than a 75 MB one. Build universal when you want one
file for any device; build arm64-only while iterating.

Signing uses the debug keystore the Expo template wires into `signingConfigs.debug`. That is fine
for sideloading on your own devices, but it is not a Play Store key — replace it with your own
keystore before publishing.

### Try the browser surfaces without an account

```bash
node packages/core/test/fixtures/serve.mjs     # http://127.0.0.1:4319
```

A local page shaped like Instagram mobile web (bottom nav, "Use the app" banner, an inbox, a
three-slide reel overlay) running the **real built** in-page script. Open `/`, `/explore/`,
`/direct/inbox/` or `/reel/Cabc/` and watch the guard work. This is not Instagram and needs no login.

### Extension

```bash
pnpm build:extension
# Chrome/Edge/Brave/Arc: chrome://extensions → Developer mode → Load unpacked → apps/extension/dist/chrome
# Firefox: about:debugging → Load Temporary Add-on → apps/extension/dist/firefox/manifest.json
```

### Website

```bash
cd apps/web && pnpm build && pnpm serve    # http://127.0.0.1:4320
```

### iOS app

```bash
cd apps/ios
npm install
npx expo run:ios          # needs Xcode; Expo Go is not enough (native cookie module + Safari extension)
```

Regenerate the injected script after changing the core:

```bash
pnpm build:core && node apps/ios/scripts/gen-injection.mjs
```

### Icons

```bash
node tools/make-icons.mjs     # extension, web and iOS icons, generated from code
```

## How it works in one paragraph

Instagram is single-page, so navigation never triggers a document load; that is why the guard has two
layers. The in-page layer patches `history.pushState`/`replaceState`, listens for `popstate` and
intercepts clicks before Instagram's router runs. The host layer (WKWebView's
`onShouldStartLoadWithRequest`, the extension's `webNavigation.onBeforeNavigate`) catches real loads,
including the redirect after login. Every URL is reduced to a path and checked against one ordered
table: blocked → the inbox; a reel or post is allowed only when it is the single id that was opened
from a DM or a profile, and then its sibling slides are hidden, vertical gestures cancelled and the
video looped. Blocking fails closed; cosmetic hiding fails open.

## Docs

| File | What it holds |
|---|---|
| [01-teardown.md](docs/01-teardown.md) | the reference recording restated as 36 features, screen map, allowed/blocked table, open questions |
| [02-architecture.md](docs/02-architecture.md) | why this shape and not seven others, route model, guard, injection plan, reel lock, risks |
| [03-findings.md](docs/03-findings.md) | verified headers and routes, what the fixture proved, the ten things only you can check |
| [04-plan.md](docs/04-plan.md) | the build order actually used, and where it deviates from the original plan |
| [09-test-plan.md](docs/09-test-plan.md) | allowed/blocked acceptance tables with honest pass/device status |
| [10-review.md](docs/10-review.md) | security and performance review, remote-config design, risk register |
| [11-ship-prep.md](docs/11-ship-prep.md) | store copy, privacy answers, EAS/TestFlight, Safari conversion, listings, deploy |
| [DECISIONS.md](docs/DECISIONS.md) | every decision, with its reason and date (D001–D026) |

## Status, honestly

Built, unit-tested and exercised in a browser against a fixture: the blocking layer, the reel lock,
the cleanup, the injected nav, the settings, the extension builds, and the website at 375px and
1440px. Both mobile builds have also been run: the iOS app in an iPhone simulator, and the Android
app on an emulator in both debug and release form. Not verified at all: anything that needs a
logged-in Instagram session (see
`09-test-plan.md` §5), and the single biggest unknown, whether Instagram permits login inside a
WKWebView (risk R1).

Directly is an independent project, not affiliated with Instagram or Meta.
