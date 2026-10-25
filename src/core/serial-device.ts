import { z } from 'zod';
import type { BinDevice, Category, Settings } from './types';

/** The transport is injected so protocol tests never require a real USB device. */
export interface SerialTransport {
  open(): Promise<void>;
  write(line: string): Promise<void>;
  close(): Promise<void>;
  onData(listener: (chunk: string) => void): () => void;
  onFailure(listener: (message: string) => void): () => void;
}
const envelope = z.object({ id: z.string().max(64), type: z.string() });
const readySchema = z.object({
  id: z.string(),
  type: z.literal('ready'),
  protocol: z.literal(1),
  servoPin: z.literal(5),
  busy: z.literal(false),
});
interface Pending {
  id: string;
  kind: 'hello' | 'move';
  category?: Category;
  angle?: number;
  acknowledged: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
export class SerialBinDevice implements BinDevice {
  private transport?: SerialTransport;
  private pending?: Pending;
  private connected = false;
  private generation = 0;
  private buffer = '';
  private listeners = new Set<(message: string) => void>();
  private unsubscribe: (() => void)[] = [];
  constructor(
    private create: (path: string) => SerialTransport,
    private settings: () => Settings,
    private resetDelay = 1800,
    private handshakeTimeout = 4000,
    private movementTimeout = 4500,
  ) {}
  onDisconnect(listener: (message: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async connect() {
    await this.disconnect();
    const token = ++this.generation;
    const port = this.create(this.settings().serialPort);
    this.transport = port;
    this.unsubscribe = [
      port.onData((chunk) => {
        if (token === this.generation) this.receive(chunk);
      }),
      port.onFailure((message) => {
        if (token === this.generation) this.fail(message);
      }),
    ];
    try {
      await port.open();
      if (token !== this.generation) {
        await port.close();
        throw new Error('Arduino disconnected during connection.');
      }
      await new Promise((resolve) => setTimeout(resolve, this.resetDelay));
      if (token !== this.generation) throw new Error('Arduino disconnected during connection.');
      await this.command('hello');
      if (token !== this.generation) throw new Error('Arduino disconnected during handshake.');
      this.connected = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  async moveTo(category: Category) {
    if (!this.connected) throw new Error('Connect the Arduino before moving a bin.');
    const angle = this.settings().angles[category];
    if (!Number.isInteger(angle) || angle < 0 || angle > 180)
      throw new Error('Invalid servo angle.');
    await this.command('move', category, angle);
  }
  async disconnect() {
    ++this.generation;
    this.connected = false;
    this.buffer = '';
    this.rejectPending('Arduino disconnected. Position is unknown.');
    this.unsubscribe.forEach((fn) => fn());
    this.unsubscribe = [];
    const previous = this.transport;
    this.transport = undefined;
    await previous?.close().catch(() => {});
  }
  private command(kind: 'hello' | 'move', category?: Category, angle?: number) {
    if (this.pending) return Promise.reject(new Error('Another Arduino command is active.'));
    const transport = this.transport;
    if (!transport) return Promise.reject(new Error('Arduino is disconnected.'));
    const id = crypto.randomUUID();
    const timeout = kind === 'hello' ? this.handshakeTimeout : this.movementTimeout;
    const generation = this.generation;
    return new Promise<void>((resolve, reject) => {
      this.pending = {
        id,
        kind,
        category,
        angle,
        acknowledged: false,
        resolve,
        reject,
        timer: setTimeout(
          () =>
            this.fail(
              kind === 'hello'
                ? 'No compatible EcoChamber firmware replied. Upload firmware/ecochamber/ecochamber.ino, then reconnect.'
                : 'Arduino movement timed out. Position is unknown; reconnect before retrying.',
            ),
          timeout,
        ),
      };
      void transport
        .write(
          JSON.stringify({ id, type: kind, ...(kind === 'move' ? { category, angle } : {}) }) +
            '\n',
        )
        .catch(() => {
          if (generation === this.generation)
            this.fail('Could not send the command to Arduino. Reconnect the USB device.');
        });
    });
  }
  private receive(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 4096) {
      this.fail('Arduino sent an oversized response. Reconnect after checking firmware.');
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'boot') {
        if (this.connected)
          this.fail('Arduino restarted. Position is unknown; reconnect before sorting.');
        continue;
      }
      const parsed = envelope.safeParse(raw);
      if (!parsed.success || parsed.data.id !== this.pending?.id) continue;
      const pending = this.pending;
      if (!pending) continue;
      const message = raw as Record<string, unknown>;
      if (message.type === 'error') {
        this.fail(
          `Arduino rejected the command (${typeof message.code === 'string' && /^[A-Z_]{1,32}$/.test(message.code) ? message.code : 'INVALID_RESPONSE'}). Reconnect before retrying.`,
        );
      } else if (pending.kind === 'hello') {
        if (!readySchema.safeParse(raw).success)
          this.fail('Firmware handshake does not match EcoChamber protocol 1 on servo pin D5.');
        else this.finish();
      } else if (message.type === 'ack') {
        pending.acknowledged = true;
      } else if (
        message.type === 'done' &&
        pending.acknowledged &&
        message.category === pending.category &&
        message.angle === pending.angle
      ) {
        this.finish();
      } else this.fail('Arduino returned an unexpected movement response. Position is unknown.');
    }
  }
  private finish() {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = undefined;
    pending.resolve();
  }
  private rejectPending(message: string) {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = undefined;
    pending.reject(new Error(message));
  }
  private fail(message: string) {
    const hadConnection = this.connected;
    this.connected = false;
    this.rejectPending(message);
    void this.disconnect();
    if (hadConnection) this.listeners.forEach((listener) => listener(message));
  }
}
