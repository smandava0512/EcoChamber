import { SerialPort } from 'serialport';
import { SerialBinDevice, type SerialTransport } from '../src/core/serial-device';
import { SimulatedDevice } from '../src/core/simulator';
import type { BinDevice, Category, SerialPortInfo, Settings } from '../src/core/types';

function createTransport(path: string): SerialTransport {
  const port = new SerialPort({ path, baudRate: 115200, autoOpen: false });
  const failures = new Set<(message: string) => void>();
  let intentional = false;
  const fail = () =>
    failures.forEach((listener) =>
      listener(`USB connection to ${path} was lost. Reconnect the Arduino.`),
    );
  // Keep the error listener installed even after close, so late native errors are handled.
  port.on('error', fail);
  port.on('close', () => {
    if (!intentional) fail();
  });
  return {
    open: () =>
      new Promise((resolve, reject) =>
        port.open((error) =>
          error
            ? reject(
                new Error(
                  `Could not open ${path}. Check the USB cable and close Arduino Serial Monitor.`,
                ),
              )
            : resolve(),
        ),
      ),
    write: (line) =>
      new Promise((resolve, reject) =>
        port.write(line, (error) => {
          if (error) {
            reject(error);
            return;
          }
          port.drain((error) => (error ? reject(error) : resolve()));
        }),
      ),
    close: () => {
      intentional = true;
      return new Promise((resolve) => {
        if (!port.isOpen) {
          resolve();
          return;
        }
        port.close(() => resolve());
      });
    },
    onData: (listener) => {
      const handler = (chunk: Buffer) => listener(chunk.toString('utf8'));
      port.on('data', handler);
      return () => {
        port.off('data', handler);
      };
    },
    onFailure: (listener) => {
      failures.add(listener);
      return () => {
        failures.delete(listener);
      };
    },
  };
}
export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  return (await SerialPort.list()).map(({ path, manufacturer, serialNumber }) => ({
    path,
    manufacturer,
    serialNumber,
  }));
}
export class AppDevice implements BinDevice {
  private serial: SerialBinDevice;
  private active?: BinDevice;
  private listeners = new Set<(message: string) => void>();
  readonly simulation = new SimulatedDevice();
  constructor(private settings: () => Settings) {
    this.serial = new SerialBinDevice(createTransport, settings);
    this.serial.onDisconnect((message) => {
      if (this.active === this.serial) this.listeners.forEach((listener) => listener(message));
    });
  }
  onDisconnect(listener: (message: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async connect() {
    await this.disconnect();
    this.active = this.settings().deviceMode === 'arduino' ? this.serial : this.simulation;
    await this.active.connect();
  }
  async disconnect() {
    const device = this.active;
    this.active = undefined;
    await device?.disconnect();
  }
  async moveTo(category: Category) {
    if (!this.active) throw new Error('Connect the mechanism first.');
    await this.active.moveTo(category);
  }
}
