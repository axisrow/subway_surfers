# Subway-Surfers-Game
A WebGL version of Subway Surfers. Runs in the browser, as an Android app and as a macOS app.

## Download

Ready-made builds are produced by GitHub Actions (`.github/workflows/build.yml`):

- **Releases** page: every push to `master` publishes a release with both files.
- Any workflow run: open **Actions → Build apps → (run) → Artifacts**.

| Platform | File | How to install |
| --- | --- | --- |
| macOS (Apple Silicon) | `Subway-Surfers-<version>-mac-arm64.dmg` | Open the DMG, drag *Subway Surfers* to *Applications*, then run once in Terminal: `xattr -cr "/Applications/Subway Surfers.app"` (the app is not signed with an Apple Developer ID, so macOS would otherwise say it is "damaged"). |
| Android | `Subway-Surfers-android.apk` | Copy/download to the phone, open it and allow "Install unknown apps". |

## Controls

| Action | Keyboard | Touch screen |
| --- | --- | --- |
| Change lane | ← → or A D | swipe left / right |
| Jump | ↑, W or Space | swipe up |
| Drop down from a jump | ↓ or S | swipe down |
| Pause / resume | P or Esc | ❚❚ button (Android back button also pauses) |
| Quit the run | Q | |
| Grayscale / lightning | G / F | |
| Start / play again | Enter or Space | Play button |

Keys are matched by their physical position, so they work with any keyboard layout.
The game pauses automatically when the window or app goes to the background.

## Development

```bash
npm install                 # tooling: Capacitor (Android) + Electron (macOS)
npm run serve               # play in the browser: http://localhost:8080
npm start                   # run the desktop app (Electron)
npm run mac:dmg             # build dist/*.dmg (on a Mac)
npm run android:apk         # build android/app/build/outputs/apk/debug/app-debug.apk (needs Android SDK + JDK 21)
npm run android:open        # open the Android project in Android Studio
python3 scripts/generate_icons.py   # regenerate app icons (needs Pillow)
```

Project layout:

- `www/` – the game itself (HTML, JS, textures, music). Shared by all platforms.
- `android/` – Capacitor Android project (landscape, fullscreen).
- `electron/` – macOS desktop wrapper.
