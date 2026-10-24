# Sortly

A desktop waste-sorting companion for Gator Hack V. Built with Electron, React, Node.js, and TypeScript.

## Phase 2, Part 1: Gemini classification

Sortly supports two explicit classification modes, both with simulated bin movement:

- **Demo**: a selected, predetermined scenario; works offline without credentials.
- **Gemini**: one captured JPEG analyzed by Google; requires credentials and internet.

The webcam preview stays local. Clicking **Scan item** in Gemini mode sends one JPEG (maximum dimension 1024 pixels) to Google. Images remain in application memory and are not saved or logged locally. Session history records Demo/Gemini source and manual overrides; counts require user confirmation. Arduino, USB serial and physical movement remain for Part 2.

### Configure Gemini

Create an ignored `.env` beside `package.json` for development:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

For `release/Sortly-0.1.0-Windows.exe`, put `.env` beside that executable. Portable builds use `PORTABLE_EXECUTABLE_DIR`; unpacked builds read beside `Sortly.exe`. Credentials are never loaded from the application archive or included in the build. Inherited environment variables take precedence over `.env`; a blank model uses `gemini-3.8-flash`. Restart the app after any configuration change.

Open **Setup**, choose **Gemini** under **Classification mode**, and save. Existing settings migrate to Demo while preserving the camera and angles. Gemini selection is disabled without a key. **Configured** means credentials are present, not that Google has accepted them. Model errors are shown without substituting models or switching to Demo. Setup changes are locked until the current cycle is resolved.

Requests have a 15-second deadline, no automatic retries, and abort on cancellation. Gemini chooses paper, plastic or trash by dominant visible material; uncertainty defaults to trash. Demo mode retains its explicit unknown/review rehearsal scenario. API errors require an explicit fresh scan. The mechanism remains labeled simulated, and deposit confirmation appears only after simulated alignment completes. Never put keys in `VITE_` variables, HTML, React, or `.env.example`.

Official references: [models](https://ai.google.dev/gemini-api/docs/models), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).

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

1. Open Sortly and select Demo in Setup. The simulated device connects automatically; a persistent banner explains rehearsal mode.
2. Select **Paper sheet**, hold up an item, and click **Scan item**. The frame is real; the selected result is predetermined.
3. Wait for the simulated paper bin to align. Deposit the item if demonstrating with a prop, then click **Done — item deposited**.
4. Repeat with **Plastic bottle** and **Used tissue**. Open Session history to show confirmed counts.
5. Try **Unclear item** to rescan or explicitly select a bin. Try **Movement failure** to demonstrate safe recovery.

The image is held in memory only for the request and is not logged or saved. Session history is in memory and resets on app exit. Only classification mode, camera ID and bin angles persist in Electron's per-user `settings.json` (normally `%APPDATA%/sortly`). Counts are user-confirmed, not sensor measurements or measured environmental impact.

## Architecture and Phase 2 handoff

- `src/core/`: validated shared types, a main-process sorting controller, and interchangeable `Classifier` / `BinDevice` interfaces with simulation adapters.
- `electron/`: main-process composition, trusted-origin camera permission checks, local app protocol, validated IPC, and sandboxed preload bridge.
- `src/`: React UX, real camera lifecycle/capture, CSS bin illustration, settings, and session history.

The controller blocks concurrent cycles, refuses movement for `unknown` or invalid classifier output, rejects stale results after cancellation, requires a movement-completion promise before deposit instructions, and requires reconnection after movement failure. Classification deadline: 15 seconds. Movement deadline: 5 seconds. Settings cannot change during an active cycle.

### Part 2 remaining software work

Implement USB serial `BinDevice`, Arduino firmware, versioned handshake, request IDs, calibrated angles, and matching completion acknowledgements. Fence late messages by connection generation, reject disconnects/timeouts, never replay movement automatically, and verify native bindings in the packaged app. Add guarded calibration controls before physical testing.

### Ananya and Shravya's Phase 2 hardware work

Confirm the positional servo model, power requirements, travel, clearance, and three-bin layout within 180°. Assemble the cardboard mechanism, provide a suitably rated external servo supply and common Arduino ground, flash the firmware when Part 2 supplies it, and calibrate unloaded before mounting. The current 20° / 90° / 160° settings are placeholders, not verified movement limits. No physical commands exist in this build.

### Material-based sorting policy

Gemini always chooses one of three bins based on the main visible material. Mostly paper/cardboard objects go to paper. Mostly plastic objects (including pens, wrappers, bags, toys and containers) go to plastic. Other materials and mixed/uncertain objects go to trash. Minor components do not override dominant material. With several objects, Gemini selects the largest or most central foreground object; empty or unclear images default to trash. Gemini does not request a rescan or enter the unknown review flow. API failures and malformed responses still stop movement. Demo mode retains the explicit unknown scenario for testing manual overrides.

These bins demonstrate material grouping, not local recycling eligibility. Hazardous objects still need special handling rather than physical deposit.

## Out of scope

Continuous detection, automatic deposit sensing, accounts, cloud hosting, full-circle rotation, custom model training, production signing/updates, and macOS/Linux packaging.

See [Phase 2 verification and demonstration script](PHASE2-VERIFICATION.md) for recorded checks and the outstanding live object evaluation.
