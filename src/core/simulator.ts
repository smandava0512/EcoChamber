import type {
  BinDevice,
  Category,
  Classification,
  Classifier,
  ImageInput,
  Scenario,
} from './types';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class SimulatedClassifier implements Classifier {
  scenario: Scenario = 'paper';
  constructor(private latency = 1400) {}
  async classify(_image: ImageInput, signal?: AbortSignal): Promise<Classification> {
    const selected = this.scenario;
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(new Error('Scan cancelled.'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      }, this.latency);
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
    });
    if (selected === 'classification-error')
      throw new Error(
        'The demo classifier could not finish. Select another scenario and try again.',
      );
    const examples: Record<string, Classification> = {
      paper: {
        category: 'paper',
        itemName: 'Paper sheet',
        reason: 'Clean, dry paper belongs in the paper recycling bin.',
      },
      plastic: {
        category: 'plastic',
        itemName: 'Plastic bottle',
        reason: 'An empty rigid plastic bottle belongs in the plastic recycling bin.',
      },
      trash: {
        category: 'trash',
        itemName: 'Used tissue',
        reason: 'Used tissues cannot be recycled with clean paper.',
      },
      unknown: {
        category: 'unknown',
        itemName: 'Needs a closer look',
        reason:
          'The demo represents an unclear image. Show one item clearly and rescan, or choose a bin yourself.',
      },
    };
    return examples[selected === 'device-error' ? 'plastic' : selected];
  }
}
export class SimulatedDevice implements BinDevice {
  connected = false;
  failNextMove = false;
  constructor(private latency = 1700) {}
  async connect() {
    await delay(250);
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async moveTo(_category: Category) {
    if (!this.connected)
      throw new Error('The simulated device is disconnected. Reconnect to continue.');
    const fail = this.failNextMove;
    this.failNextMove = false;
    await delay(this.latency);
    if (!this.connected || fail) {
      this.connected = false;
      throw new Error(
        'Movement did not complete. Position is unknown. Reconnect the simulated device before trying again.',
      );
    }
  }
}
