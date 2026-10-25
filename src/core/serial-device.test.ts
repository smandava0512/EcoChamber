import { describe, expect, it } from 'vitest';
import { SerialBinDevice, type SerialTransport } from './serial-device';
import { defaultSettings } from './types';

class FakeTransport implements SerialTransport {
  writes: Record<string, unknown>[] = [];
  data = new Set<(chunk: string) => void>();
  failures = new Set<(message: string) => void>();
  closed = false;
  hello = true;
  writeFailure?: Promise<void>;
  async open() {}
  async close() {
    this.closed = true;
  }
  onData(listener: (chunk: string) => void) {
    this.data.add(listener);
    return () => {
      this.data.delete(listener);
    };
  }
  onFailure(listener: (message: string) => void) {
    this.failures.add(listener);
    return () => {
      this.failures.delete(listener);
    };
  }
  async write(line: string) {
    const request = JSON.parse(line) as Record<string, unknown>;
    this.writes.push(request);
    if (request.type === 'hello' && this.hello)
      queueMicrotask(() =>
        this.emit({ id: request.id, type: 'ready', protocol: 1, servoPin: 5, busy: false }),
      );
    if (request.type === 'move' && this.writeFailure) await this.writeFailure;
  }
  chunk(chunk: string) {
    this.data.forEach((listener) => listener(chunk));
  }
  emit(message: unknown) {
    this.chunk(JSON.stringify(message) + '\n');
  }
  last() {
    return this.writes[this.writes.length - 1];
  }
  complete() {
    const request = this.last();
    this.emit({ id: request.id, type: 'ack' });
    this.emit({ ...request, type: 'done' });
  }
}
function fixture(timeout = 100) {
  const settings = structuredClone(defaultSettings);
  settings.angles.paper = 83;
  const transport = new FakeTransport();
  const device = new SerialBinDevice(
    () => transport,
    () => settings,
    0,
    timeout,
    timeout,
  );
  return { settings, transport, device };
}
describe('Arduino protocol', () => {
  it('connects using hello only and never moves during a handshake', async () => {
    const { device, transport } = fixture();
    await device.connect();
    expect(transport.writes.map((message) => message.type)).toEqual(['hello']);
    await device.disconnect();
    expect(transport.closed).toBe(true);
  });
  it('uses the saved category angle and waits for matching acknowledgement and completion', async () => {
    const { device, transport } = fixture();
    await device.connect();
    const moving = device.moveTo('paper');
    expect(transport.last()).toMatchObject({ type: 'move', category: 'paper', angle: 83 });
    let completed = false;
    void moving.then(() => {
      completed = true;
    });
    transport.emit({ id: transport.last().id, type: 'ack' });
    await Promise.resolve();
    expect(completed).toBe(false);
    const done = JSON.stringify({ ...transport.last(), type: 'done' }) + '\n';
    transport.chunk(done.slice(0, 7));
    transport.chunk(done.slice(7));
    await moving;
    expect(completed).toBe(true);
    await device.disconnect();
  });
  it('ignores unrelated IDs and garbage without completing the current request', async () => {
    const { device, transport } = fixture();
    await device.connect();
    const moving = device.moveTo('trash');
    transport.chunk('debug noise\n');
    transport.emit({ ...transport.last(), type: 'done', id: 'old-connection' });
    transport.complete();
    await moving;
    await device.disconnect();
  });
  it.each(['wrong-angle', 'no-ack', 'device-error'])(
    'rejects %s and requires reconnection',
    async (problem) => {
      const { device, transport } = fixture();
      await device.connect();
      const moving = device.moveTo('paper');
      const result = expect(moving).rejects.toThrow();
      if (problem === 'wrong-angle') {
        transport.emit({ id: transport.last().id, type: 'ack' });
        transport.emit({ ...transport.last(), type: 'done', angle: 2 });
      } else if (problem === 'device-error')
        transport.emit({ id: transport.last().id, type: 'error', code: 'BUSY' });
      else transport.emit({ ...transport.last(), type: 'done' });
      await result;
      await expect(device.moveTo('paper')).rejects.toThrow('Connect');
    },
  );
  it('times out incompatible firmware without issuing any move', async () => {
    const { device, transport } = fixture(20);
    transport.hello = false;
    await expect(device.connect()).rejects.toThrow('compatible EcoChamber firmware');
    expect(transport.writes.map((message) => message.type)).toEqual(['hello']);
  });
  it('rejects simultaneous movement commands and never retries movement', async () => {
    const { device, transport } = fixture(20);
    await device.connect();
    const first = device.moveTo('paper');
    const timedOut = expect(first).rejects.toThrow('timed out');
    await expect(device.moveTo('trash')).rejects.toThrow('active');
    await timedOut;
    expect(transport.writes.filter((message) => message.type === 'move')).toHaveLength(1);
  });
  it('reports idle unplug and board restart as lost position', async () => {
    const { device, transport } = fixture();
    const errors: string[] = [];
    device.onDisconnect((message) => errors.push(message));
    await device.connect();
    transport.emit({ type: 'boot', protocol: 1 });
    expect(errors[0]).toContain('restarted');
    await device.connect();
    transport.failures.forEach((listener) => listener('USB unplugged'));
    expect(errors).toContain('USB unplugged');
    await expect(device.moveTo('trash')).rejects.toThrow('Connect');
  });
  it('does not let an old write failure terminate a newer connection', async () => {
    const first = new FakeTransport();
    const second = new FakeTransport();
    let rejectWrite!: (error: Error) => void;
    first.writeFailure = new Promise((_, reject) => {
      rejectWrite = reject;
    });
    const transports = [first, second];
    const device = new SerialBinDevice(
      () => transports.shift()!,
      () => defaultSettings,
      0,
      100,
      100,
    );
    await device.connect();
    const oldMove = device.moveTo('paper');
    const failed = expect(oldMove).rejects.toThrow('lost');
    first.failures.forEach((listener) => listener('Connection lost'));
    await failed;
    await device.connect();
    rejectWrite(new Error('Late write error'));
    await Promise.resolve();
    await Promise.resolve();
    const newMove = device.moveTo('plastic');
    second.complete();
    await newMove;
    await device.disconnect();
  });
});
