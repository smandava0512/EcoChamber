import { describe, it, expect, vi, afterEach } from 'vitest';
import { SortController } from './controller';
import { SimulatedClassifier, SimulatedDevice } from './simulator';
import {
  settingsSchema,
  defaultSettings,
  type BinDevice,
  type Classification,
  type Classifier,
} from './types';
const image = { base64: '/9j/AAAA', mimeType: 'image/jpeg' as const };
const paper: Classification = {
  category: 'paper',
  itemName: 'Paper sheet',
  reason: 'Clean paper.',
};
function setup(classify = vi.fn<Classifier['classify']>().mockResolvedValue(paper)) {
  const device: BinDevice = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    moveTo: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new SortController({ classify }, device);
  return { controller, device, classify };
}
afterEach(() => vi.useRealTimers());
describe('sorting lifecycle', () => {
  it('requires a connection and a valid image before classification', async () => {
    const { controller, classify } = setup();
    await expect(controller.scan(image)).rejects.toThrow('Connect');
    await controller.connect();
    await expect(controller.scan({ ...image, base64: 'bad data!' })).rejects.toThrow();
    expect(classify).not.toHaveBeenCalled();
  });
  it.each(['trash', 'paper', 'plastic'] as const)(
    'only counts a %s deposit after user confirmation',
    async (category) => {
      const { controller, device } = setup(vi.fn().mockResolvedValue({ ...paper, category }));
      await controller.connect();
      await controller.scan(image);
      expect(device.moveTo).toHaveBeenCalledExactlyOnceWith(category);
      expect(controller.snapshot()).toMatchObject({
        stage: 'deposit',
        target: category,
        history: [],
      });
      controller.done();
      expect(controller.snapshot()).toMatchObject({
        stage: 'ready',
        position: category,
        history: [{ category, manual: false }],
      });
      expect(() => controller.done()).toThrow();
    },
  );
  it('blocks a duplicate scan and ignores a late result after cancellation', async () => {
    let resolve!: (value: Classification) => void;
    const { controller, device, classify } = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    await controller.connect();
    const first = controller.scan(image);
    await expect(controller.scan(image)).rejects.toThrow('already active');
    controller.reset();
    resolve(paper);
    await first;
    expect(classify).toHaveBeenCalledTimes(1);
    expect(device.moveTo).not.toHaveBeenCalled();
    expect(controller.snapshot().stage).toBe('ready');
  });
  it('asks for review on unknown and records an explicit override', async () => {
    const { controller, device } = setup(
      vi.fn().mockResolvedValue({ ...paper, category: 'unknown' }),
    );
    await controller.connect();
    await controller.scan(image);
    expect(controller.snapshot().stage).toBe('review');
    expect(device.moveTo).not.toHaveBeenCalled();
    await controller.override('plastic');
    controller.done();
    expect(controller.snapshot().history[0]).toMatchObject({ category: 'plastic', manual: true });
  });
  it.each([new Error('API unavailable'), { invalid: 'json' }])(
    'does not move on classifier failure or malformed output',
    async (response) => {
      const { controller, device } = setup(
        response instanceof Error
          ? vi.fn().mockRejectedValue(response)
          : vi.fn().mockResolvedValue(response),
      );
      await controller.connect();
      await controller.scan(image);
      expect(controller.snapshot().stage).toBe('error');
      expect(device.moveTo).not.toHaveBeenCalled();
    },
  );
  it('times out classification and rejects its eventual result', async () => {
    vi.useFakeTimers();
    let resolve!: (value: Classification) => void;
    const { controller, device } = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    await controller.connect();
    const scan = controller.scan(image);
    await vi.advanceTimersByTimeAsync(15001);
    await scan;
    expect(controller.snapshot()).toMatchObject({ stage: 'error', connected: true });
    controller.reset();
    resolve(paper);
    await Promise.resolve();
    expect(device.moveTo).not.toHaveBeenCalled();
    expect(controller.snapshot().stage).toBe('ready');
  });
  it('waits for movement before deposit and prevents setup changes during travel', async () => {
    let finish!: () => void;
    const { controller, device } = setup();
    device.moveTo = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await controller.connect();
    const scan = controller.scan(image);
    await vi.waitFor(() => expect(controller.snapshot().stage).toBe('moving'));
    expect(() => controller.done()).toThrow();
    expect(() => controller.reset()).toThrow();
    expect(() => controller.saveSettings(defaultSettings)).toThrow();
    finish();
    await scan;
    expect(controller.snapshot().stage).toBe('deposit');
  });
  it('marks failed movement unknown and requires reconnect without replay', async () => {
    const { controller, device } = setup();
    device.moveTo = vi.fn().mockRejectedValue(new Error('Movement failed'));
    await controller.connect();
    await controller.scan(image);
    expect(controller.snapshot()).toMatchObject({
      stage: 'error',
      connected: false,
      position: null,
    });
    controller.reset();
    await expect(controller.scan(image)).rejects.toThrow('Connect');
    await controller.connect();
    expect(device.moveTo).toHaveBeenCalledTimes(1);
  });
  it('times out a stalled device without offering deposit', async () => {
    vi.useFakeTimers();
    const { controller, device } = setup();
    device.moveTo = vi.fn().mockImplementation(() => new Promise(() => {}));
    await controller.connect();
    const scan = controller.scan(image);
    await vi.advanceTimersByTimeAsync(5001);
    await scan;
    expect(controller.snapshot()).toMatchObject({
      stage: 'error',
      connected: false,
      position: null,
      history: [],
    });
    expect(controller.snapshot().error).toContain('timed out');
  });
  it('validates calibration and protects state from external mutation', () => {
    const { controller } = setup();
    expect(() =>
      controller.saveSettings({
        ...defaultSettings,
        angles: { trash: -1, paper: 90, plastic: 160 },
      }),
    ).toThrow();
    const snapshot = controller.snapshot();
    snapshot.settings.angles.paper = 2;
    expect(controller.snapshot().settings.angles.paper).toBe(90);
    controller.saveSettings({ ...defaultSettings, angles: { trash: 15, paper: 80, plastic: 165 } });
    expect(controller.snapshot().settings.angles).toEqual({ trash: 15, paper: 80, plastic: 165 });
  });
});
describe('simulation adapters', () => {
  it('returns the selected outcome independently of the image', async () => {
    const classifier = new SimulatedClassifier(0);
    classifier.scenario = 'unknown';
    expect((await classifier.classify(image)).category).toBe('unknown');
    classifier.scenario = 'classification-error';
    await expect(classifier.classify(image)).rejects.toThrow('demo classifier');
  });
  it('disconnects after an injected movement failure', async () => {
    const device = new SimulatedDevice(0);
    await device.connect();
    device.failNextMove = true;
    await expect(device.moveTo('paper')).rejects.toThrow('Position is unknown');
    expect(device.connected).toBe(false);
  });
});

describe('Phase 2 mode and provenance', () => {
  it('migrates legacy settings without losing camera or angles', () => {
    const legacy = { cameraId: 'saved-camera', angles: { paper: 82, plastic: 150, trash: 12 } };
    expect(settingsSchema.parse(legacy)).toEqual({ ...defaultSettings, ...legacy });
  });
  it('requires credentials before selecting Gemini', () => {
    expect(() =>
      setup().controller.saveSettings({ ...defaultSettings, classificationMode: 'gemini' }),
    ).toThrow('GEMINI_API_KEY');
  });
  it('uses Gemini independently of the demo scenario and preserves source after mode changes', async () => {
    const { device } = setup();
    const demo = { classify: vi.fn().mockResolvedValue(paper) };
    const live = { classify: vi.fn().mockResolvedValue({ ...paper, category: 'unknown' }) };
    const controller = new SortController(
      demo,
      device,
      { ...defaultSettings, classificationMode: 'gemini' },
      15000,
      5000,
      live,
      { configured: true, model: 'test' },
    );
    await controller.connect();
    controller.configure('device-error');
    await controller.scan(image);
    expect(demo.classify).not.toHaveBeenCalled();
    expect(device.moveTo).not.toHaveBeenCalled();
    expect(() => controller.saveSettings(defaultSettings)).toThrow('Resolve');
    await controller.override('paper');
    controller.done();
    controller.saveSettings(defaultSettings);
    expect(controller.snapshot().history[0]).toMatchObject({ source: 'gemini', manual: true });
  });
  it.each(['cancel', 'timeout'])('aborts on %s and ignores late results', async (kind) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let finish!: (value: Classification) => void;
    const { controller, device } = setup(
      vi.fn().mockImplementation((_image, value) => {
        signal = value;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }),
    );
    await controller.connect();
    const scan = controller.scan(image);
    if (kind === 'cancel') controller.reset();
    else await vi.advanceTimersByTimeAsync(15001);
    expect(signal?.aborted).toBe(true);
    finish(paper);
    await scan;
    expect(device.moveTo).not.toHaveBeenCalled();
  });
});

describe('Arduino calibration and connection state', () => {
  it('requires calibration for sorting but allows explicit position tests without deposits', async () => {
    const { device } = setup();
    const classify = vi.fn().mockResolvedValue(paper);
    const controller = new SortController({ classify }, device, {
      ...defaultSettings,
      deviceMode: 'arduino',
    });
    await controller.connect();
    await expect(controller.scan(image)).rejects.toThrow('Test and confirm');
    expect(classify).not.toHaveBeenCalled();
    await controller.testPosition('paper');
    expect(device.moveTo).toHaveBeenCalledWith('paper');
    expect(controller.snapshot()).toMatchObject({
      stage: 'ready',
      position: 'paper',
      target: null,
      history: [],
    });
    controller.saveSettings({
      ...defaultSettings,
      deviceMode: 'arduino',
      hardwareCalibrated: true,
    });
    await controller.scan(image);
    controller.done();
    expect(controller.snapshot().history[0]).toMatchObject({ deviceMode: 'arduino' });
  });
  it('requires disconnect before switching mode or port', async () => {
    const { controller } = setup();
    await controller.connect();
    expect(() => controller.saveSettings({ ...defaultSettings, deviceMode: 'arduino' })).toThrow(
      'Disconnect',
    );
    expect(() => controller.saveSettings({ ...defaultSettings, serialPort: 'COM6' })).toThrow(
      'Disconnect',
    );
    await controller.disconnect();
    controller.saveSettings({ ...defaultSettings, deviceMode: 'arduino' });
    expect(controller.snapshot().connected).toBe(false);
  });
  it('invalidates an in-flight classification on USB loss', async () => {
    const { device } = setup();
    let unplug!: (message: string) => void;
    let finish!: (classification: Classification) => void;
    device.onDisconnect = (listener) => {
      unplug = listener;
      return () => {};
    };
    const controller = new SortController(
      {
        classify: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      device,
    );
    await controller.connect();
    const scan = controller.scan(image);
    unplug('USB disconnected');
    finish(paper);
    await scan;
    expect(controller.snapshot()).toMatchObject({
      stage: 'error',
      connected: false,
      position: null,
      history: [],
    });
    expect(device.moveTo).not.toHaveBeenCalled();
  });
  it('reports connect failure without leaving the app busy', async () => {
    const { controller, device } = setup();
    vi.mocked(device.connect).mockRejectedValueOnce(new Error('Wrong firmware'));
    await expect(controller.connect()).rejects.toThrow('Wrong firmware');
    expect(controller.snapshot()).toMatchObject({ stage: 'error', connected: false });
    await controller.connect();
    expect(controller.snapshot().stage).toBe('ready');
  });
});

describe('hardware calibration invalidation', () => {
  it('clears confirmation and position when angles change, and disables simulator-only failures', async () => {
    const { device } = setup();
    const controller = new SortController({ classify: vi.fn().mockResolvedValue(paper) }, device, {
      ...defaultSettings,
      deviceMode: 'arduino',
      hardwareCalibrated: true,
    });
    await controller.connect();
    await controller.testPosition('paper');
    controller.saveSettings({
      ...defaultSettings,
      deviceMode: 'arduino',
      hardwareCalibrated: true,
      angles: { ...defaultSettings.angles, paper: 85 },
    });
    expect(controller.snapshot()).toMatchObject({
      position: null,
      settings: { hardwareCalibrated: false },
    });
    await expect(controller.scan(image)).rejects.toThrow('Test and confirm');
    expect(() => controller.configure('device-error')).toThrow('simulated mechanism');
  });
});
