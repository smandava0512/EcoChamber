# Sortly

A desktop waste-sorting companion for Gator Hack V. Built with Electron, React, Node.js, and TypeScript.

## Phase 1: what works today

- Real webcam preview, camera selection, and single-frame JPEG capture.
- Complete scan → classify → align → deposit → confirm workflow.
- Clearly labeled, selectable **simulated** classifier and device adapters. These do not analyze images or move hardware.
- Trash, paper, plastic, unknown, classifier-error, and movement-error scenarios.
- Manual overrides, cancellation, error recovery, three-bin animation, and session history.
- Local camera/angle settings, isolated Electron renderer, validated IPC, Windows portable build.

No Gemini key, Arduino, internet connection, or USB port is required to run the app after installation.

## Run on Windows

Install Node.js 22.12+ (or a supported newer version) and run these commands in this repository:

```powershell
npm install
npm run dev
```

The development script compiles Electron, starts Vite at `127.0.0.1:5173`, and opens the desktop app. Renderer changes refresh automatically. Restart `npm run dev` after changing Electron or core code. Use Ctrl+C to stop development.

Enable Windows **Settings → Privacy & security → Camera → Let desktop apps access your camera**. The app requests video only, never audio. Close other apps using an exclusive webcam. Choose **System default camera** in Setup if a saved camera is no longer attached.

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run dist:win
```

`dist:win` produces `release/Sortly-0.1.0-Windows.exe` and the unpacked app. This hackathon executable is unsigned. `npm run start` launches a previously built app; `npm run build` creates it. `npm run pack:win` builds only the unpacked app. Downloads of npm packages and Electron require network access during setup/build.

The Playwright tests launch real Electron with Chromium's fake video device; no separate browser download or physical webcam is needed. To test the packaged app:

```powershell
$env:SORTLY_EXECUTABLE = '.\release\win-unpacked\Sortly.exe'
npm run test:e2e
Remove-Item Env:\SORTLY_EXECUTABLE
```

## Demo in two minutes

1. Open Sortly. The simulated device connects automatically; a persistent banner explains rehearsal mode.
2. Select **Paper sheet**, hold up an item, and click **Scan item**. The frame is real; the selected result is predetermined.
3. Wait for the simulated paper bin to align. Deposit the item if demonstrating with a prop, then click **Done — item deposited**.
4. Repeat with **Plastic bottle** and **Used tissue**. Open Session history to show confirmed counts.
5. Try **Unclear item** to rescan or explicitly select a bin. Try **Movement failure** to demonstrate safe recovery.

The image is held in memory only for the request and is not logged or saved. Session history is in memory and resets on app exit. Only camera ID and bin angles persist in Electron's per-user `settings.json` (normally `%APPDATA%/sortly`). Counts are user-confirmed, not sensor measurements or measured environmental impact.

## Architecture and Phase 2 handoff

- `src/core/`: validated shared types, a main-process sorting controller, and interchangeable `Classifier` / `BinDevice` interfaces with simulation adapters.
- `electron/`: main-process composition, trusted-origin camera permission checks, local app protocol, validated IPC, and sandboxed preload bridge.
- `src/`: React UX, real camera lifecycle/capture, CSS bin illustration, settings, and session history.

The controller blocks concurrent cycles, refuses movement for `unknown` or invalid classifier output, rejects stale results after cancellation, requires a movement-completion promise before deposit instructions, and requires reconnection after movement failure. Classification deadline: 15 seconds. Movement deadline: 5 seconds. Settings cannot change during an active cycle.

### ChatGPT's Phase 2 software work

1. Implement a Gemini `Classifier` using `@google/genai` and the existing validated `Classification` type. Read credentials in the main process. `.env.example` is a template only; **Phase 1 does not load `.env` files**. Add main-process configuration loading during integration. Never expose keys through `VITE_` variables.
2. Implement a USB serial `BinDevice`, Arduino sketch, versioned handshake, request IDs, category-to-calibrated-angle mapping, and acknowledgement/completion messages. Resolve `moveTo` only on matching completion; reject on timeout/disconnect. Fence late serial messages by connection generation and never automatically replay movement.
3. Add explicit live connection configuration/status and keep simulation as an explicitly selected mode. Do not silently fall back on failures.
4. Add guarded calibration test commands and verify native serial bindings in the packaged app.

### Ananya and Shravya's Phase 2 hardware work

Confirm the positional servo model, power requirements, travel, clearance, and three-bin layout within 180°. Assemble the cardboard mechanism, provide a suitably rated external servo supply and common Arduino ground, flash the supplied firmware, and calibrate unloaded before mounting. The current 20° / 90° / 160° settings are placeholders, not verified movement limits. No physical commands exist in Phase 1.

### Demo sorting policy

Clean, dry paper/cardboard → paper. Empty rigid plastic bottles/containers → plastic. Clearly identified ordinary non-recyclable waste → trash. Glass, metal, films, batteries, electronics, ambiguous composites, and hazardous items → review. Local recycling rules vary; this is a constrained demo, not universal disposal advice.

## Out of scope

Continuous detection, automatic deposit sensing, accounts, cloud hosting, full-circle rotation, custom model training, production signing/updates, and macOS/Linux packaging.
