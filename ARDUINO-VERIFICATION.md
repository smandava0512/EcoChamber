# Phase 2, Part 2 — Arduino integration verification

## Implementation

- EcoChamber 0.2.0 adds independent simulated/Arduino mechanism selection, COM port enumeration, explicit connection, saved bin angles, individual position tests, and calibration confirmation.
- The main process uses `serialport`; native bindings are included in the Windows package.
- The adapter validates protocol 1, servo signal pin D5, request IDs, acknowledgement/completion order, category, and angle. It handles fragmented data, wrong IDs, invalid replies, timeouts, unplug, board restart, and late failures from old connections. Movement is never automatically replayed.
- Hardware scans remain disabled until the operator confirms calibration. Changes to angles, port, or mechanism clear confirmation and displayed position. Hardware does not auto-connect on app startup.
- Arduino completion is timed, not sensor-verified. Manual confirmation still records deposits.
- The original supplied ELEGOO D5 sweep sketch is preserved in `firmware/original_sweep/`. The replacement `firmware/ecochamber/` sketch starts idle and waits for app commands.

## Actual device work completed

- Detected **Arduino Uno on COM5**, USB VID 2341 / PID 0043, FQBN `arduino:avr:uno`.
- Compiled the command firmware using the installed Arduino CLI, Servo 1.3.0, and ArduinoJson 6.21.5.
- Firmware size: 10,874 bytes flash (33%); 807 bytes global RAM (39%).
- Uploaded the replacement firmware successfully to COM5.
- Verified a real main-process adapter handshake: protocol 1, servoPin 5, busy false.
- Verified a second real handshake through the packaged Electron application using its native serial dependency.
- No movement commands were sent to the physical device during verification. All automated position tests used the simulator or an injected fake transport.

## Software verification

- TypeScript checks and production build: passed.
- **58 unit tests**: passed.
- **12 packaged Electron end-to-end tests**: passed, including real COM5 handshake, hardware-mode selection, calibration lockout, simulator position tests, and all prior Gemini/demo regression cases.
- Native serial dependency packaging: passed.
- Dependency install audit reported zero vulnerabilities.
- Git diff whitespace check: passed.

The optional hardware test requires `ECOCHAMBER_HARDWARE_TEST=1`. Routine tests skip it and do not require a connected Arduino. Gemini end-to-end tests use mocked API responses; no live API requests were made for this hardware integration.

## Remaining physical validation

The team reported that the prototype is **not calibrated**. The initial 20° / 90° / 160° values remain placeholders; no bin alignment or physical movement accuracy is claimed.

Ananya and Shravya should follow [ARDUINO-SETUP.md](ARDUINO-SETUP.md): connect COM5, save and test each angle individually, align the openings, then confirm calibration. Verify at least ten consecutive bin selections and a full webcam/Gemini/Arduino/deposit demonstration after calibration. Physical wiring, servo power/load, travel, obstruction handling, and alignment require observation at the prototype.

The software changes remain local unless separately committed and pushed.
