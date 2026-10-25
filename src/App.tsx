import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  History,
  Leaf,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Unplug,
  X,
} from 'lucide-react';
import Camera from './components/Camera';
import type { CameraHandle } from './components/Camera';
import Bins, { BinIcon, labels } from './components/Bins';
import { categories, settingsSchema } from './core/types';
import type { Scenario, Settings, SortState, SerialPortInfo } from './core/types';

const scenarios: { value: Scenario; label: string }[] = [
  { value: 'paper', label: 'Paper sheet' },
  { value: 'plastic', label: 'Plastic bottle' },
  { value: 'trash', label: 'Used tissue' },
  { value: 'unknown', label: 'Unclear item' },
  { value: 'classification-error', label: 'Classification failure' },
  { value: 'device-error', label: 'Movement failure' },
];
const stageText: Record<string, { title: string; body: string }> = {
  ready: {
    title: 'A better place for every item.',
    body: 'Hold up one item. We’ll help it find its way.',
  },
  capturing: { title: 'Taking a closer look.', body: 'Capturing a single frame from your webcam.' },
  identifying: { title: 'A little sorting magic.', body: 'Running your selected demo scenario.' },
  moving: {
    title: 'Making room for your item.',
    body: 'The simulated mechanism is aligning the selected bin.',
  },
  deposit: { title: 'Right bin. Ready for you.', body: 'Deposit your item, then confirm below.' },
  review: {
    title: 'Let’s take another look.',
    body: 'Try a clearer view, or select the right bin yourself.',
  },
  error: {
    title: 'A small pause. An easy reset.',
    body: 'Your item has not been counted. Follow the recovery step below.',
  },
};

function SettingsPanel({
  state,
  devices,
  run,
}: {
  state: SortState;
  devices: MediaDeviceInfo[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [saved, setSaved] = useState(false);
  const [validation, setValidation] = useState('');
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const refreshPorts = () =>
    window.ecochamber
      .listPorts()
      .then(setPorts)
      .catch(() => setValidation('Could not list USB ports. Check the connection and refresh.'));
  useEffect(() => {
    void refreshPorts();
  }, []);
  const locked = state.stage !== 'ready';
  const moving = ['capturing', 'identifying', 'moving', 'deposit'].includes(state.stage);
  const hardware = state.settings.deviceMode === 'arduino';
  const unsaved = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const save = async () => {
    const parsed = settingsSchema.safeParse(draft);
    if (!parsed.success) {
      setValidation('Use whole-number angles between 0° and 180°.');
      return;
    }
    await run(async () => {
      if (
        state.connected &&
        (parsed.data.deviceMode !== state.settings.deviceMode ||
          parsed.data.serialPort !== state.settings.serialPort)
      )
        await window.ecochamber.disconnect();
      await window.ecochamber.saveSettings(parsed.data);
      setDraft((await window.ecochamber.getState()).settings);
      setValidation('');
      setSaved(true);
    });
  };
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h2>Camera & bin positions</h2>
        <p className="muted">
          Save bin angles before testing. In Arduino mode, Test position moves the physical device.
        </p>
        <fieldset disabled={locked}>
          <label className="field-label" htmlFor="classification-mode">
            Classification mode
          </label>
          <select
            id="classification-mode"
            value={draft.classificationMode}
            onChange={(event) => {
              setDraft({
                ...draft,
                classificationMode: event.target.value as Settings['classificationMode'],
              });
              setSaved(false);
            }}
          >
            <option value="demo">Demo</option>
            <option value="gemini" disabled={!state.classifierStatus.configured}>
              Gemini
            </option>
          </select>
          <p className="muted">
            Gemini credentials: {state.classifierStatus.configured ? 'Configured' : 'Missing'}.
            Model: {state.classifierStatus.model}. Configured does not confirm connectivity.
          </p>
          <p className="tiny">
            Set GEMINI_API_KEY in .env beside the portable executable (repository root in
            development), then restart. Inherited environment variables take precedence. Gemini
            sends one captured image to Google per scan.
          </p>
          <label className="field-label" htmlFor="camera-select">
            Webcam
          </label>
          <select
            id="camera-select"
            value={draft.cameraId}
            onChange={(event) => {
              setDraft({ ...draft, cameraId: event.target.value });
              setSaved(false);
            }}
          >
            <option value="">System default camera</option>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
            {draft.cameraId && !devices.some((device) => device.deviceId === draft.cameraId) && (
              <option value={draft.cameraId}>Previously selected camera (unavailable)</option>
            )}
          </select>
          <div className="angle-fields">
            {categories.map((category) => (
              <label key={category}>
                <span>
                  <BinIcon category={category} size={16} />
                  {labels[category]}
                </span>
                <div className="angle-input">
                  <input
                    aria-label={`${labels[category]} angle`}
                    type="number"
                    min="0"
                    max="180"
                    step="1"
                    value={Number.isNaN(draft.angles[category]) ? '' : draft.angles[category]}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        angles: {
                          ...draft.angles,
                          [category]: event.target.value === '' ? NaN : Number(event.target.value),
                        },
                        hardwareCalibrated: false,
                      });
                      setSaved(false);
                    }}
                  />
                  <span>°</span>
                </div>
              </label>
            ))}
          </div>
          {validation && (
            <p role="alert" className="field-error">
              {validation}
            </p>
          )}
          <button className="button primary" onClick={() => void save()}>
            {saved ? <Check size={17} /> : <SlidersHorizontal size={17} />}
            {saved ? 'Settings saved' : 'Save settings'}
          </button>
        </fieldset>
        {locked && (
          <p className="muted">Finish or cancel your sorting cycle before changing setup.</p>
        )}
      </section>
      <section className="panel settings-panel">
        <span className="eyebrow">CONNECTIONS</span>
        <h2>Connect your mechanism.</h2>
        <fieldset disabled={locked}>
          <label className="field-label" htmlFor="device-mode">
            Mechanism mode
          </label>
          <select
            id="device-mode"
            value={draft.deviceMode}
            onChange={(event) => {
              setDraft({
                ...draft,
                deviceMode: event.target.value as Settings['deviceMode'],
                hardwareCalibrated: false,
              });
              setSaved(false);
            }}
          >
            <option value="simulated">Simulated mechanism</option>
            <option value="arduino">Arduino USB</option>
          </select>
          {draft.deviceMode === 'arduino' && (
            <>
              <label className="field-label" htmlFor="serial-port">
                USB serial port
              </label>
              <select
                id="serial-port"
                value={draft.serialPort}
                onChange={(event) => {
                  setDraft({ ...draft, serialPort: event.target.value, hardwareCalibrated: false });
                  setSaved(false);
                }}
              >
                {!ports.some((port) => port.path === draft.serialPort) && (
                  <option value={draft.serialPort}>{draft.serialPort} (not detected)</option>
                )}
                {ports.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.path}
                    {port.manufacturer ? ` — ${port.manufacturer}` : ''}
                  </option>
                ))}
              </select>
              <button className="text-button" onClick={() => void run(refreshPorts)}>
                Refresh USB ports
              </button>
              <p className="tiny">
                Arduino Uno · Servo signal D5 · 115200 baud · EcoChamber firmware protocol 1
              </p>
              <label className="calibration-confirm">
                <input
                  type="checkbox"
                  checked={draft.hardwareCalibrated}
                  onChange={(event) => {
                    setDraft({ ...draft, hardwareCalibrated: event.target.checked });
                    setSaved(false);
                  }}
                />
                I have tested and aligned all three bin positions.
              </label>
            </>
          )}
        </fieldset>
        {unsaved && (
          <p className="muted">
            Save settings on the left to apply these changes. Switching mechanisms disconnects the
            current device.
          </p>
        )}
        <div className="connection-row">
          <div className="connection-icon">
            <FlaskConical size={22} />
          </div>
          <div>
            <strong>
              {hardware ? `Arduino · ${state.settings.serialPort}` : 'Simulated mechanism'}
            </strong>
            <p>
              {state.connected
                ? hardware
                  ? 'Connected · D5 positional servo'
                  : 'Connected · no physical movement'
                : 'Disconnected · reconnect to sort'}
            </p>
          </div>
          <span className={'status-dot ' + (!state.connected ? 'offline' : '')} />
        </div>
        <button
          className="button light"
          disabled={moving || unsaved}
          onClick={() =>
            void run(() =>
              state.connected ? window.ecochamber.disconnect() : window.ecochamber.connect(),
            )
          }
        >
          {state.connected ? <Unplug size={16} /> : <RotateCcw size={16} />}
          {hardware
            ? state.connected
              ? 'Disconnect Arduino'
              : 'Connect Arduino'
            : state.connected
              ? 'Disconnect simulator'
              : 'Reconnect simulator'}
        </button>
        {state.stage === 'error' && (
          <button
            className="button light"
            onClick={() => void run(() => window.ecochamber.reset())}
          >
            Reset cycle
          </button>
        )}
        <div className="calibration-tests">
          <h3>Test saved positions</h3>
          <p className="tiny">
            Each click selects one saved angle. Keep the mechanism clear while it moves. Tests do
            not count as deposits.
          </p>
          <div className="override-buttons">
            {categories.map((category) => (
              <button
                key={category}
                disabled={locked || !state.connected || unsaved}
                aria-label={`Test ${labels[category]} position`}
                onClick={() => void run(() => window.ecochamber.testPosition(category))}
              >
                <BinIcon category={category} size={17} />
                Test {labels[category]}
              </button>
            ))}
          </div>
        </div>
        <div className="phase-two">
          <span className="tag">ARDUINO INTEGRATION</span>
          <h3>From pixels to physical.</h3>
          <p>
            Gemini identifies the item. Ananya and Shravya’s mechanism rotates to its saved bin
            position after a valid classification.
          </p>
          <ul>
            <li>Upload firmware/ecochamber/ecochamber.ino to the Uno</li>
            <li>Save Arduino mode and connect the USB port</li>
            <li>Test angles, align bins, then confirm calibration</li>
          </ul>
          <p className="tiny">
            Arduino completion is timed, not sensor-verified. Connect does not move the servo.
            Hardware mode requires reconnecting each time the app starts.
          </p>
        </div>
      </section>
    </div>
  );
}

function Activity({ state, full = false }: { state: SortState; full?: boolean }) {
  const entries = [...state.history].reverse().slice(0, full ? undefined : 4);
  return (
    <section className={'panel activity-panel ' + (full ? 'activity-full' : '')}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">SMALL ACTIONS ADD UP</span>
          <h2>{full ? 'Your session, item by item.' : 'This session'}</h2>
        </div>
        <span className="count-pill">
          {state.history.length} {state.history.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="session-totals">
        {categories.map((category) => (
          <div key={category}>
            <span className={`mini-icon ${category}`}>
              <BinIcon category={category} size={16} />
            </span>
            <strong>{state.history.filter((entry) => entry.category === category).length}</strong>
            <span>{labels[category]}</span>
          </div>
        ))}
      </div>
      {entries.length ? (
        <div className="activity-list">
          {entries.map((entry) => (
            <div className="activity-row" key={entry.id}>
              <span className={`mini-icon ${entry.category}`}>
                <BinIcon category={entry.category} size={17} />
              </span>
              <div>
                <strong>{entry.manual ? 'Manually selected item' : entry.itemName}</strong>
                <p>
                  {labels[entry.category]}
                  {entry.manual
                    ? ' - Manual override'
                    : entry.source === 'gemini'
                      ? ' - Gemini result'
                      : ' - Demo result'}
                  {entry.deviceMode === 'arduino' && ' · Arduino'}
                </p>
              </div>
              <time>
                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
              <Check size={15} />
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-empty">
          <span>
            <Leaf size={24} />
          </span>
          <strong>A fresh start.</strong>
          <p>Your confirmed deposits will appear here.</p>
        </div>
      )}
      <p className="panel-footnote">
        Counts reflect deposits you confirm, not sensor measurements. Session resets when the app
        closes.
      </p>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<SortState | null>(null);
  const [tab, setTab] = useState<'station' | 'session' | 'setup'>('station');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [help, setHelp] = useState(false);
  const camera = useRef<CameraHandle>(null);
  const gate = useRef(false);
  const operation = useRef(0);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
      if (event.key === 'Tab') {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.help-modal button');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [help]);
  useEffect(() => {
    if (!window.ecochamber) {
      setNotice('Open EcoChamber in the Electron desktop app using npm run dev.');
      return;
    }
    let active = true;
    const unsubscribe = window.ecochamber.onState((next) => {
      if (active) setState(next);
    });
    void window.ecochamber
      .getState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => setNotice('Could not load the app. Close and reopen EcoChamber.'));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const onCamera = useCallback((ready: boolean) => setCameraReady(ready), []);
  const onDevices = useCallback((available: MediaDeviceInfo[]) => setDevices(available), []);
  const run = async (action: () => Promise<void>) => {
    if (gate.current) return;
    const token = ++operation.current;
    gate.current = true;
    setPending(true);
    setNotice('');
    try {
      await action();
    } catch (cause) {
      if (token === operation.current)
        setNotice(
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
            : 'Something went wrong. Try again.',
        );
    } finally {
      if (token === operation.current) {
        gate.current = false;
        setPending(false);
      }
    }
  };
  const scan = () =>
    run(async () => {
      if (!camera.current) throw new Error('The camera is not ready.');
      const image = camera.current.capture();
      await window.ecochamber.scan(image);
    });
  if (!state)
    return (
      <div className="boot">
        <Leaf size={42} />
        <h1>
          EcoChamber<span>.</span>
        </h1>
        <p>{notice || 'Preparing your sorting station…'}</p>
      </div>
    );
  const gemini = state.settings.classificationMode === 'gemini';
  const hardware = state.settings.deviceMode === 'arduino';
  const busy = ['capturing', 'identifying', 'moving', 'deposit'].includes(state.stage);
  const progress = ['ready', 'capturing', 'identifying'].includes(state.stage)
    ? 0
    : state.stage === 'moving'
      ? 1
      : state.stage === 'deposit'
        ? 2
        : -1;
  const resultCategory = state.target;
  const subtitle =
    tab === 'station'
      ? 'A little intention. A lighter footprint.'
      : tab === 'session'
        ? 'Every item has a story. Here’s yours.'
        : 'Make this station your own.';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setTab('station');
          }}
        >
          <span className="brand-mark">
            <Leaf size={24} strokeWidth={2} />
          </span>
          EcoChamber<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button className={tab === 'station' ? 'active' : ''} onClick={() => setTab('station')}>
            <ScanLine size={19} />
            Sort station
            <ChevronRight size={16} />
          </button>
          <button className={tab === 'session' ? 'active' : ''} onClick={() => setTab('session')}>
            <History size={19} />
            Session history
            {state.history.length > 0 && <span className="nav-count">{state.history.length}</span>}
          </button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>
            <Settings2 size={19} />
            Setup
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="little-planet">
            <Leaf size={23} />
            <p>
              Good habits.
              <br />
              <strong>Better tomorrows.</strong>
            </p>
            <span>One item at a time.</span>
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            How it works
            <ArrowUpRight size={15} />
          </button>
          <div className="hackathon-label">
            BUILT FOR GATOR HACK V <span>2026</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {tab === 'station' ? 'Sort station' : tab === 'session' ? 'Session history' : 'Setup'}
            </strong>
          </div>
          <div className="top-status">
            <span>
              <i className={'status-dot ' + (!cameraReady ? 'offline' : '')} />
              Camera {cameraReady ? 'on' : 'off'}
            </span>
            <span className="demo-badge">
              <FlaskConical size={13} />
              {gemini ? 'Gemini classification' : 'Demo mode'}
            </span>
            <span>
              <i className={'status-dot ' + (!state.connected ? 'offline' : '')} />
              {hardware
                ? `Arduino ${state.connected ? 'connected' : 'disconnected'}`
                : 'Simulated mechanism'}
            </span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-title">
            <div>
              <span className="eyebrow">LESS GUESSWORK. BETTER SORTING.</span>
              <h1>
                {tab === 'station'
                  ? 'Give waste a better way.'
                  : tab === 'session'
                    ? 'Small steps, all accounted for.'
                    : 'Set up for a good sort.'}
              </h1>
              <p>{subtitle}</p>
            </div>
            <div className="session-badge">
              <Leaf size={18} />
              <div>
                <strong>{state.history.length}</strong>
                <span>items this session</span>
              </div>
            </div>
          </div>
          <div className="demo-banner">
            <FlaskConical size={18} />
            <p>
              {gemini ? (
                <>
                  <strong>
                    Gemini classification / {hardware ? 'Arduino mechanism' : 'Simulated mechanism'}
                    .
                  </strong>{' '}
                  Clicking Scan item sends one captured image to Google for analysis. Continuous
                  video stays on this laptop.
                </>
              ) : (
                <>
                  <strong>
                    {hardware ? 'Demo classification / Arduino mechanism.' : 'Demo rehearsal.'}
                  </strong>{' '}
                  {hardware
                    ? 'The selected demo outcome moves your physical prototype.'
                    : 'Classification and movement are simulated.'}{' '}
                  Your webcam is live.
                </>
              )}
            </p>
            <span>PHASE 2{hardware ? ' / ARDUINO' : ''}</span>
          </div>
          {notice && (
            <div className="notice" role="alert">
              <p>{notice}</p>
              <button aria-label="Dismiss message" onClick={() => setNotice('')}>
                <X size={17} />
              </button>
            </div>
          )}
          <div hidden={tab !== 'station'}>
            <div className="station-grid">
              <section className="panel scan-panel">
                <div className="section-heading">
                  <div className="heading-inline">
                    <span className="step-number">01</span>
                    <h2>Meet your item</h2>
                  </div>
                  <span className="tag">WEBCAM</span>
                </div>
                <Camera
                  ref={camera}
                  selected={state.settings.cameraId}
                  disabled={busy}
                  onReady={onCamera}
                  onDevices={onDevices}
                />
                <div className="capture-footer">
                  <div>
                    <strong>One item. A clear view.</strong>
                    <p>
                      {gemini
                        ? 'Scan item sends one JPEG to Google. Use good lighting.'
                        : 'Good lighting helps you rehearse a clear capture.'}
                    </p>
                  </div>
                  <button
                    className="button primary scan-button"
                    disabled={
                      !cameraReady ||
                      !state.connected ||
                      state.stage !== 'ready' ||
                      pending ||
                      (hardware && !state.settings.hardwareCalibrated)
                    }
                    onClick={() => void scan()}
                  >
                    {['capturing', 'identifying'].includes(state.stage) ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <ScanLine size={18} />
                    )}
                    {state.stage === 'identifying'
                      ? 'Identifying…'
                      : state.stage === 'moving'
                        ? 'Moving…'
                        : 'Scan item'}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </section>
              <section className="panel result-panel">
                <div className="section-heading">
                  <div className="heading-inline">
                    <span className="step-number">02</span>
                    <h2>Find its place</h2>
                  </div>
                  <Sparkles size={18} className="subtle-icon" />
                </div>
                <div className="result-content" aria-live="polite">
                  <div
                    className={`result-symbol ${resultCategory || ''} ${state.stage === 'moving' ? 'motion-symbol' : ''}`}
                  >
                    {resultCategory ? (
                      <BinIcon category={resultCategory} size={39} />
                    ) : state.stage === 'identifying' ? (
                      <ScanLine size={39} className="pulse" />
                    ) : state.stage === 'review' || state.stage === 'error' ? (
                      <CircleHelp size={39} />
                    ) : (
                      <Leaf size={39} />
                    )}
                  </div>
                  <span className="eyebrow">
                    {state.stage === 'deposit'
                      ? hardware
                        ? 'BIN COMMAND COMPLETE · ARDUINO'
                        : 'BIN IN POSITION · SIMULATED'
                      : state.stage === 'moving'
                        ? 'PLEASE WAIT'
                        : state.stage === 'review'
                          ? 'NEEDS YOUR INPUT'
                          : state.stage === 'error'
                            ? 'LET’S RESET'
                            : 'SORT WITH A LITTLE CARE'}
                  </span>
                  <h2>
                    {state.stage === 'deposit' && resultCategory
                      ? `${labels[resultCategory]} it is.`
                      : stageText[state.stage].title}
                  </h2>
                  <p>
                    {state.error ||
                      state.classification?.reason ||
                      (hardware && state.stage === 'ready' && !state.settings.hardwareCalibrated
                        ? 'Test and confirm the three physical bin positions in Setup before sorting.'
                        : hardware && state.stage === 'moving'
                          ? 'Arduino is executing the saved position command. Wait for completion.'
                          : gemini && state.stage === 'identifying'
                            ? 'Google is analyzing your captured image.'
                            : stageText[state.stage].body)}
                  </p>
                  {state.classification && (
                    <div className="identified-label">
                      {state.manual
                        ? 'Manual bin selection'
                        : `${state.classification.itemName} - ${state.source === 'gemini' ? 'Gemini result' : 'Demo result'}`}
                    </div>
                  )}
                  {state.stage === 'deposit' && (
                    <button
                      className="button primary full-width"
                      disabled={pending}
                      onClick={() => void run(() => window.ecochamber.done())}
                    >
                      <CheckCircle2 size={18} />
                      Done — item deposited
                    </button>
                  )}
                  {state.stage === 'review' && (
                    <div className="review-actions">
                      <button
                        className="button light full-width"
                        disabled={pending}
                        onClick={() => void run(() => window.ecochamber.reset())}
                      >
                        <RotateCcw size={16} />
                        Rescan item
                      </button>
                      <span className="tiny">Or choose a bin manually</span>
                      <div className="override-buttons">
                        {categories.map((category) => (
                          <button
                            key={category}
                            disabled={pending}
                            aria-label={`Override to ${labels[category]}`}
                            onClick={() => void run(() => window.ecochamber.override(category))}
                          >
                            <BinIcon category={category} size={17} />
                            {labels[category]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {state.stage === 'error' && (
                    <button
                      className="button primary full-width"
                      disabled={pending}
                      onClick={() =>
                        void run(() =>
                          state.connected ? window.ecochamber.reset() : window.ecochamber.connect(),
                        )
                      }
                    >
                      <RotateCcw size={17} />
                      {state.connected
                        ? 'Try another scan'
                        : hardware
                          ? 'Reconnect Arduino'
                          : 'Reconnect simulator'}
                    </button>
                  )}
                  {!state.connected && state.stage === 'ready' && (
                    <button
                      className="button primary full-width"
                      disabled={pending}
                      onClick={() => void run(() => window.ecochamber.connect())}
                    >
                      <RotateCcw size={17} />
                      {hardware ? 'Connect Arduino' : 'Connect simulator'}
                    </button>
                  )}
                  {hardware &&
                    state.stage === 'ready' &&
                    state.connected &&
                    !state.settings.hardwareCalibrated && (
                      <button className="button light full-width" onClick={() => setTab('setup')}>
                        Calibrate positions
                      </button>
                    )}
                  {state.stage === 'identifying' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        void window.ecochamber
                          .reset()
                          .then(() => {
                            ++operation.current;
                            gate.current = false;
                            setPending(false);
                          })
                          .catch(() => setNotice('Could not cancel this scan.'));
                      }}
                    >
                      Cancel scan
                    </button>
                  )}
                </div>
                <div className="process-steps">
                  {['Scan', 'Align', 'Deposit'].map((step, index) => (
                    <div
                      key={step}
                      className={
                        progress === index ? 'current' : progress > index ? 'complete' : ''
                      }
                    >
                      <span>{progress > index ? <Check size={12} /> : index + 1}</span>
                      {step}
                      {index < 2 && <i />}
                    </div>
                  ))}
                </div>
              </section>
            </div>
            {!gemini && (
              <div className="demo-controls">
                <div>
                  <FlaskConical size={17} />
                  <strong>Demo scenario</strong>
                  <span>Pick the next result</span>
                </div>
                <select
                  aria-label="Demo scenario"
                  disabled={busy || pending}
                  value={state.scenario}
                  onChange={(event) =>
                    void run(() => window.ecochamber.configure(event.target.value as Scenario))
                  }
                >
                  {scenarios.map((scenario) => (
                    <option
                      key={scenario.value}
                      value={scenario.value}
                      disabled={hardware && scenario.value === 'device-error'}
                    >
                      {scenario.label}
                    </option>
                  ))}
                </select>
                <span className="demo-control-note">Selected outcome, not image recognition</span>
              </div>
            )}
            <div className="lower-grid">
              <Bins state={state} />
              <Activity state={state} />
            </div>
          </div>
          {tab === 'session' && <Activity state={state} full />}
          {tab === 'setup' && <SettingsPanel state={state} devices={devices} run={run} />}
          <footer className="page-footer">
            <span>
              <Leaf size={13} />A little smarter. A little greener.
            </span>
            <span>Demo sorting policy · Local recycling rules vary.</span>
          </footer>
        </div>
      </main>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close help"
              autoFocus
              onClick={() => setHelp(false)}
            >
              <X size={21} />
            </button>
            <span className="eyebrow">A BETTER SORT STARTS HERE</span>
            <h2 id="help-title">Three easy steps.</h2>
            {[
              ['Hold it up', 'Show one item clearly in the webcam preview.'],
              [
                'Scan & align',
                gemini
                  ? `Click Scan item to send one captured image to Google. ${hardware ? 'The Arduino selects the physical bin.' : 'Bin alignment is simulated.'}`
                  : `Click Scan item. Demo uses your selected scenario ${hardware ? 'to move the physical Arduino mechanism.' : 'and a simulated bin.'}`,
              ],
              ['Drop it in', 'Wait for the bin-ready message, deposit the item, then click Done.'],
            ].map(([title, body], index) => (
              <div className="help-step" key={title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
            <div className="help-note">
              <ArrowDown size={18} />
              <p>
                Paper: mostly paper or cardboard. Plastic: mostly plastic, including pens, bags and
                wrappers. Trash: other materials or uncertain objects. Gemini always picks one of
                the three bins.
              </p>
            </div>
            <button className="button primary full-width" onClick={() => setHelp(false)}>
              Got it
              <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
