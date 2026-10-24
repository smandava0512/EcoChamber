# Phase 2 Part 1 verification

## Recorded automated results (October 24, 2026)

- TypeScript checks: passed.
- Repository formatting check: passed.
- Unit tests: 39 passed across three test files.
- Electron source build: all nine scenarios passed.
- Packaged Windows executable: all nine scenarios passed, including mocked Gemini success, quota errors, malformed output, source labels, mode locking and missing credentials.
- Packaged archive inspection: zero .env files; final configuration and Gemini modules present. IPC snapshots exclude the test credential.
- Host Node was 22.11, below the documented 22.12 minimum. Electron installation, app checks and packaging used a temporary supported Node 22 runtime. Install Node 22.12+ for normal local development.

## Automated coverage

Routine tests use mocked responses and never call Google. Adapter tests cover supported categories, unknown, invalid JSON/schema, extra fields, empty/blocked responses, error sanitization, request options, and inline JPEG routing. Controller tests cover settings migration, mode guards, source provenance, cancellation signals, late results, timeouts, duplicate scans, review and manual override. Electron tests cover the full Demo flow, Gemini with mocked main-process fetch, missing credentials, setup locking and IPC state redaction. The same suite can target the unpacked executable via SORTLY_EXECUTABLE.

## Live evaluation: outstanding

The model access probe found no nonempty GEMINI_API_KEY in the local configuration. No live classification claims or accuracy numbers are available. The official model documentation lists gemini-3.8-flash; actual access still needs verification with the team's key.

On the demo laptop, evaluate five objects per paper/plastic/trash category. Record object, expected category, actual category, classification latency, total scan-to-deposit readiness, and manual intervention. Target 13/15 correct and readiness within eight seconds, retaining the 15-second deadline. Also test unclear frames, multiple items, invalid credentials and lost internet; each must require review or recoverable error without bin movement. Repeat a successful cycle from the portable executable with .env beside it. This requires the team, physical objects and the actual webcam.

## Demonstration script

1. Configure .env, restart, open Setup and save Gemini mode. Explain that Configured is presence only.
2. Point out Gemini classification and Simulated mechanism labels. Explain one captured image goes to Google when Scan item is clicked.
3. Show one clear clean paper item, scan, wait for simulated alignment, then confirm deposit.
4. Repeat with an empty rigid plastic container and ordinary trash.
5. Show an unsupported object or unclear frame and demonstrate review/rescan or explicit manual override.
6. Show history source labels and user-confirmed counts. Select Demo in Setup for offline rehearsal; no automatic fallback occurs.

## Live troubleshooting follow-up

After credentials were supplied, the model metadata request for gemini-3.8-flash succeeded. Two text-only structured generation probes returned HTTP 504 DEADLINE_EXCEEDED within the configured deadline, including a probe with low thinking effort. A text-only structured request using gemini-3.5-flash-lite succeeded in 4.229 seconds with the same key. This verifies request connectivity and structured output, not webcam classification accuracy. The configured model was not changed automatically. Set GEMINI_MODEL=gemini-3.5-flash-lite and restart to try that alternative.

Timeout errors now have a dedicated recovery message. Gemini 3 requests use low thinking effort. Type checks and all 42 unit tests passed after this adjustment. Real-object evaluation remains outstanding; earlier Windows deliverables precede this follow-up change.

## Material-based policy update

The user's updated policy supersedes the original plan's constrained Gemini recycling policy. Gemini now requests only paper/plastic/trash, grouping by dominant visible material. Mostly plastic pens, bags, films and toys are eligible for plastic. Other or uncertain materials default to trash; an unexpected valid legacy unknown response is normalized to trash without review or a rescan request. Demo's explicit unknown rehearsal scenario remains available. Provider failures and invalid output still stop the cycle.

The updated source passes type checking and 43 unit tests, including the three-category response schema and unknown-to-trash normalization. Real-object accuracy remains unverified. Earlier portable Windows deliverables use the older policy; the project build is updated.
