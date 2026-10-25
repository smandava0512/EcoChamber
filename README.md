# EcoChamber

A desktop waste-sorting companion for Gator Hack V. Built with Electron, React, Node.js, and TypeScript.

## Phase 2: Gemini classification and Arduino integration

EcoChamber supports two independent classification modes and a choice of simulated or Arduino USB bin movement:

- **Demo**: a selected, predetermined scenario; works offline without credentials.
- **Gemini**: one captured JPEG analyzed by Google; requires credentials and internet.

The webcam preview stays local. Clicking **Scan item** in Gemini mode sends one JPEG (maximum dimension 1024 pixels) to Google. Images remain in application memory and are not saved or logged locally. Session history records Demo/Gemini source and manual overrides; counts require user confirmation. Arduino USB control is available in Setup. See [Arduino setup and calibration](ARDUINO-SETUP.md).

### Configure Gemini

Create an ignored `.env` beside `package.json` for development:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

The example selects `gemini-3.5-flash-lite`, which completed a text-only structured request in 4.2 seconds during troubleshooting. `gemini-3.8-flash` accepted the key but returned deadline errors in generation probes. Real-object accuracy still needs evaluation.

For `release/EcoChamber-0.2.0-Windows.exe`, put `.env` beside that executable. Portable builds use `PORTABLE_EXECUTABLE_DIR`; unpacked builds read beside `EcoChamber.exe`. Credentials are never loaded from the application archive or included in the build. Inherited environment variables take precedence over `.env`; a blank model uses `gemini-3.8-flash`. Restart the app after any configuration change.

Open **Setup**, choose **Gemini** under **Classification mode**, and save. Existing settings migrate to Demo while preserving the camera and angles. Gemini selection is disabled without a key. **Configured** means credentials are present, not that Google has accepted them. Model errors are shown without substituting models or switching to Demo. Setup changes are locked until the current cycle is resolved.

Requests have a 15-second deadline, no automatic retries, and abort on cancellation. Gemini chooses paper, plastic or trash by dominant visible material; uncertainty defaults to trash. Demo mode retains its explicit unknown/review rehearsal scenario. API errors require an explicit fresh scan. The UI labels the selected mechanism independently. Deposit confirmation appears only after its movement command completes; Arduino completion is timed, not sensor-verified. Never put keys in `VITE_` variables, HTML, React, or `.env.example`.

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

`dist:win` produces `release/EcoChamber-0.2.0-Windows.exe` and the unpacked app. This hackathon executable is unsigned. `npm run start` launches a previously built app; `npm run build` creates it. `npm run pack:win` builds only the unpacked app. Downloads of npm packages and Electron require network access during setup/build.

The Playwright tests launch real Electron with Chromium's fake video device; no separate browser download or physical webcam is needed. To test the packaged app:

```powershell
$env:ECOCHAMBER_EXECUTABLE = '.\release\win-unpacked\EcoChamber.exe'
npm run test:e2e
Remove-Item Env:\ECOCHAMBER_EXECUTABLE
```

## Demo in two minutes

1. Open EcoChamber and select **Demo** classification and **Simulated** mechanism in Setup, then save. The simulated device connects automatically; a persistent banner explains rehearsal mode.
2. Select **Paper sheet**, hold up an item, and click **Scan item**. The frame is real; the selected result is predetermined.
3. Wait for the simulated paper bin to align. Deposit the item if demonstrating with a prop, then click **Done — item deposited**.
4. Repeat with **Plastic bottle** and **Used tissue**. Open Session history to show confirmed counts.
5. Try **Unclear item** to rescan or explicitly select a bin. Try **Movement failure** to demonstrate safe recovery.

The image is held in memory only for the request and is not logged or saved. Session history is in memory and resets on app exit. Classification mode, camera ID, bin angles, mechanism mode, USB port and calibration confirmation persist in Electron's per-user `settings.json` (normally `%APPDATA%/sortly`, retained for settings compatibility). Counts are user-confirmed, not sensor measurements or measured environmental impact.

## Architecture and hardware workflow

- `src/core/`: validated shared types, a main-process sorting controller, and interchangeable `Classifier` / `BinDevice` interfaces with simulation adapters.
- `electron/`: main-process composition, trusted-origin camera permission checks, local app protocol, validated IPC, and sandboxed preload bridge.
- `src/`: React UX, real camera lifecycle/capture, CSS bin illustration, settings, and session history.

The controller blocks concurrent cycles, refuses movement for `unknown` or invalid classifier output, rejects stale results after cancellation, requires a movement-completion promise before deposit instructions, and requires reconnection after movement failure. Classification deadline: 15 seconds. Movement deadline: 5 seconds. Settings cannot change during an active cycle.

### Arduino USB integration

The Uno on COM5 uses servo signal pin D5 and the command-based firmware in `firmware/ecochamber/ecochamber.ino`. The original ELEGOO sweep sketch is preserved separately. Firmware has been compiled and uploaded; no physical bin angles have been calibrated.

1. Connect the Uno by USB and close Arduino Serial Monitor/Plotter.
2. In **Setup**, choose **Arduino USB**, select the detected port (previously **COM5**), save, then click **Connect Arduino**.
3. Keep the mechanism clear. Set the Trash angle, save, and click **Test Trash**. Adjust in small increments until its opening aligns.
4. Repeat with **Test Paper** and **Test Plastic**, saving each adjustment. Verify alignment when moving between all three bins.
5. Check **I have tested and aligned all three bin positions** and save. Scanning remains disabled until calibration is confirmed.
6. Start with Demo classification for predictable physical bin selections, then use Gemini for material recognition. Both modes can cause physical movement when Arduino USB is selected.

Changing angles, device mode, or port clears calibration confirmation. Hardware mode starts disconnected and never automatically replays a move after failure. Use an appropriately rated external servo supply and common Arduino ground. The app has no position or obstruction sensor; timed completion does not prove alignment. Disconnecting USB in the app is not an emergency stop.

Read [ARDUINO-SETUP.md](ARDUINO-SETUP.md) for wiring, firmware upload, the versioned JSON protocol, recovery, and the real-device handshake test. Ananya and Shravya must align the three openings and verify clearance and power before a physical sorting demonstration. The initial 20° / 90° / 160° values are placeholders.

### Validation and troubleshooting

The renamed source build passes TypeScript and formatting checks, 58 unit tests, and 11 Electron tests. The real COM5 handshake test is opt-in and was skipped during the rename checks; no physical movements were requested. Earlier packaged-device verification is recorded in [ARDUINO-VERIFICATION.md](ARDUINO-VERIFICATION.md). Rebuild with `npm run dist:win` to create a Windows executable under the EcoChamber name; older release files retain their original branding.

- Missing `serialport` or inferred-type errors: run `npm install` in this repository, then `npm run typecheck`.
- Node version warnings: use Node.js 22.12 or newer. The development machine was upgraded to 22.23.4.
- Gemini unavailable in Setup: confirm a nonempty `GEMINI_API_KEY` in the correct `.env`, then restart. Configuration presence does not verify access.
- Gemini deadline errors: wait and explicitly try another scan, or set the model in `.env` to the tested Flash-Lite option and restart. The application does not substitute models automatically.
- Arduino connection errors: check the actual COM port, close Serial Monitor/Plotter and other apps using it, and verify the command firmware is uploaded. Connecting performs a handshake without requesting movement.

### Material-based sorting policy

Gemini always chooses one of three bins based on the main visible material. Mostly paper/cardboard objects go to paper. Mostly plastic objects (including pens, wrappers, bags, toys and containers) go to plastic. Other materials and mixed/uncertain objects go to trash. Minor components do not override dominant material. With several objects, Gemini selects the largest or most central foreground object; empty or unclear images default to trash. Gemini does not request a rescan or enter the unknown review flow. API failures and malformed responses still stop movement. Demo mode retains the explicit unknown scenario for testing manual overrides.

These bins demonstrate material grouping, not local recycling eligibility. Hazardous objects still need special handling rather than physical deposit.

## Out of scope

Continuous detection, automatic deposit sensing, accounts, cloud hosting, full-circle rotation, custom model training, production signing/updates, and macOS/Linux packaging.

See [Phase 2 verification and demonstration script](PHASE2-VERIFICATION.md) for recorded checks and the outstanding live object evaluation.
