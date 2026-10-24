# Arduino integration — Phase 2, Part 2

## This prototype

- Board identified on this computer: Arduino Uno (`arduino:avr:uno`).
- USB port: **COM5**. Select a different port if Windows reassigns it.
- Positional servo signal: **digital pin D5**, as confirmed by the team.
- App/firmware baud rate: **115200** (the original sweep sketch used 9600).
- Servo travel supported by this build: **0–180 degrees**.

The supplied continuous-sweep sketch is preserved in `firmware/original_sweep/original_sweep.ino`. It does not read serial commands and cannot be used with the app. Uploading that original sketch restores automatic sweeping immediately.

The replacement `firmware/sortly/sortly.ino` starts idle: it does not attach the servo or send movement pulses during boot or handshake. The app does not automatically reconnect Arduino mode on startup. Connecting opens USB and checks the firmware; it does not request movement. Opening USB can reset an Uno, so use the Sortly firmware rather than the old sweep sketch.

## First-time setup and calibration

1. Close Arduino Serial Monitor and any other program using COM5. Keep the USB data cable connected.
2. Open Sortly and choose **Setup → Mechanism mode → Arduino USB**. Select **COM5** and click **Save settings** on the left. This disconnects the simulator.
3. Click **Connect Arduino**. A successful handshake displays **Connected · D5 positional servo**. A busy port, missing cable, or incompatible sketch produces an error instead of enabling motion.
4. The initial trash/paper/plastic angles (20°/90°/160°) are **uncalibrated placeholders**. Adjust one saved angle toward the position you want to inspect. Save settings before testing.
5. With the mechanism clear, click **Test Trash**, **Test Paper**, or **Test Plastic**. Each button commands only that saved position. Tests do not count as deposits and never start an automatic sweep. The first position command after a board reset moves directly toward its target and waits 3.1 seconds; subsequent commands step by one degree every 15 ms, then settle for 400 ms.
6. Repeat individual tests and adjustments until each opening aligns. Have Ananya and Shravya check the mechanism's clearance, load, and actual servo travel. Use a suitably rated external servo supply and a common ground with the Arduino; do not power a high-torque servo from the Uno's 5V pin.
7. Once all three positions have been tested and aligned, check **I have tested and aligned all three bin positions** and save. Changing angles, hardware mode, or port clears confirmation and the displayed position.
8. Return to **Sort station**. Choose Demo classification for a controlled rehearsal or Gemini for actual image recognition. In Arduino mode, either classification source can trigger physical movement after a valid result. The banner identifies this explicitly.

Until calibration is confirmed, hardware scans remain disabled. Position tests remain available after connection so calibration can be performed. The prototype was reported as uncalibrated; do not treat a protocol handshake as physical alignment validation.

## Firmware build/upload

Use Arduino IDE with **Arduino Uno** and **COM5** selected. Install the **Servo** library and **ArduinoJson 6.21.5**, then upload `firmware/sortly/sortly.ino`.

Equivalent Arduino CLI commands:

```powershell
arduino-cli lib install Servo ArduinoJson@6.21.5
arduino-cli compile --fqbn arduino:avr:uno firmware/sortly
arduino-cli upload --fqbn arduino:avr:uno --port COM5 firmware/sortly
```

The integration run used the CLI bundled with the installed Arduino IDE. Firmware libraries were installed into a task-local sketchbook; normal IDE users should install them through Library Manager or the commands above.

## Serial protocol 1

Transport: UTF-8 newline-delimited JSON, 115200 baud. Each command has a unique request ID. The app waits for Uno reset before sending `hello`.

Handshake only:

```json
{"id":"request-1","type":"hello"}
{"id":"request-1","type":"ready","protocol":1,"servoPin":5,"busy":false}
```

Movement:

```json
{"id":"request-2","type":"move","category":"paper","angle":90}
{"id":"request-2","type":"ack"}
{"id":"request-2","type":"done","category":"paper","angle":90}
```

Firmware errors:

```json
{ "id": "request-2", "type": "error", "code": "INVALID_ANGLE" }
```

- The host validates protocol version, D5, and idle state before marking the Arduino connected.
- Only one movement is allowed at a time. Firmware rejects invalid categories, out-of-range/non-integer angles, oversized input, and concurrent movement.
- The app requires matching request ID, category, angle, and a preceding acknowledgement before accepting completion.
- `done` means the command's travel/settling timer completed. **There is no position, obstruction, or deposit sensor.** Inspect the mechanism if it stalls or fails to align; software cannot verify that mechanically.
- Movement has a 4.5-second serial deadline and a 5-second controller deadline. Timeout, cable loss, unexpected board reboot, or invalid matching response clears position and requires reconnection. Commands are never automatically replayed.
- Old connection messages and late write failures cannot complete or interrupt a newer connection.
- Closing a port is not an emergency-stop mechanism and cannot guarantee that a powered servo has stopped. Use the physical power arrangement if an immediate hardware stop is needed.

## Verification

Routine tests run without hardware and use an injected fake serial transport. They cover handshake-only connection, saved-angle mapping, partial input, stale IDs, acknowledgements, errors, timeouts, disconnects, board restart, and late failures from older connections. Controller and UI tests cover calibration gating, explicit connection, and position tests that do not count deposits.

An optional real-device test sends **hello only**:

```powershell
$env:SORTLY_HARDWARE_TEST = '1'
npm run test:e2e -- --grep 'real COM5 handshake'
Remove-Item Env:\SORTLY_HARDWARE_TEST
```

For packaged verification, set `SORTLY_EXECUTABLE` to `release/win-unpacked/Sortly.exe` and invoke `npm exec -- playwright test --grep 'real COM5 handshake'` with the same explicit hardware opt-in. Close all other connections to COM5 first.

Physical bin-angle calibration and repeated alignment tests must be completed by the team before a live sorting demonstration.
