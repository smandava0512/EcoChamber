import { describe, it, expect, vi, afterEach } from 'vitest';
import { SortController } from './controller';
import { SimulatedClassifier, SimulatedDevice } from './simulator';
import { defaultSettings, type BinDevice, type Classification, type Classifier } from './types';
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
