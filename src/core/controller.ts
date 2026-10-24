import {
  classificationSchema,
  defaultSettings,
  imageSchema,
  settingsSchema,
  scenarioSchema,
  categorySchema,
} from './types';
import type {
  BinDevice,
  Category,
  Classifier,
  ImageInput,
  Scenario,
  Settings,
  SortState,
} from './types';
export class SortController {
  private epoch = 0;
  private listeners = new Set<(state: SortState) => void>();
  private connectionBusy = false;
  private state: SortState;
  constructor(
    private classifier: Classifier,
    private device: BinDevice,
    settings: Settings = defaultSettings,
    private requestTimeout = 15000,
    private moveTimeout = 5000,
  ) {
    this.state = {
      stage: 'ready',
      scenario: 'paper',
      connected: false,
      position: null,
      target: null,
      classification: null,
      manual: false,
      error: null,
      settings: structuredClone(settings),
      history: [],
    };
  }
  snapshot(): SortState {
    return structuredClone(this.state);
  }
  subscribe(fn: (state: SortState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private patch(change: Partial<SortState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((fn) => fn(this.snapshot()));
  }
  private assertIdle() {
    if (
      ['capturing', 'identifying', 'moving', 'deposit'].includes(this.state.stage) ||
      this.connectionBusy
    )
      throw new Error('Finish the current cycle first.');
  }
  private async deadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  configure(value: Scenario) {
    this.assertIdle();
    this.patch({ scenario: scenarioSchema.parse(value) });
  }
  saveSettings(value: Settings) {
    this.assertIdle();
    this.patch({ settings: settingsSchema.parse(value) });
  }
  async connect() {
    this.assertIdle();
    this.connectionBusy = true;
    try {
      await this.device.connect();
      this.patch({
        connected: true,
        position: null,
        error: null,
        stage: 'ready',
        classification: null,
        target: null,
      });
    } finally {
      this.connectionBusy = false;
    }
  }
  async disconnect() {
    this.assertIdle();
    await this.device.disconnect();
    this.patch({ connected: false, position: null });
  }
  async scan(input: ImageInput) {
    if (this.state.stage !== 'ready' || this.connectionBusy)
      throw new Error('A sorting cycle is already active.');
    if (!this.state.connected) throw new Error('Connect the simulated device first.');
    const image = imageSchema.parse(input);
    const token = ++this.epoch;
    this.patch({
      stage: 'capturing',
      classification: null,
      target: null,
      manual: false,
      error: null,
    });
    try {
      this.patch({ stage: 'identifying' });
      const result = classificationSchema.parse(
        await this.deadline(
          this.classifier.classify(image),
          this.requestTimeout,
          'Classification timed out. Try scanning again.',
        ),
      );
      if (token !== this.epoch) return;
      this.patch({ classification: result });
      if (result.category === 'unknown') {
        this.patch({ stage: 'review' });
        return;
      }
      await this.move(result.category, token);
    } catch (error) {
      if (token === this.epoch) this.patch({ stage: 'error', error: this.message(error) });
    }
  }
  async override(value: Category) {
    if (this.state.stage !== 'review')
      throw new Error('Manual selection is available after an unclear result.');
    if (!this.state.connected) throw new Error('Reconnect the device first.');
    const category = categorySchema.parse(value);
    this.patch({ manual: true });
    await this.move(category, ++this.epoch);
  }
  private async move(category: Category, token: number) {
    this.patch({ stage: 'moving', target: category });
    try {
      await this.deadline(
        this.device.moveTo(category),
        this.moveTimeout,
        'Movement timed out. Reconnect before trying again.',
      );
      if (token === this.epoch) this.patch({ stage: 'deposit', position: category });
    } catch (error) {
      if (token === this.epoch) {
        await this.device.disconnect().catch(() => {});
        this.patch({
          stage: 'error',
          connected: false,
          position: null,
          target: null,
          error: this.message(error),
        });
      }
    }
  }
  done() {
    if (this.state.stage !== 'deposit' || !this.state.target)
      throw new Error('Wait until the bin is ready.');
    const entry = {
      id: crypto.randomUUID(),
      category: this.state.target,
      itemName: this.state.classification?.itemName || 'Item',
      manual: this.state.manual,
      at: new Date().toISOString(),
    };
    this.patch({
      stage: 'ready',
      history: [...this.state.history, entry],
      classification: null,
      target: null,
      manual: false,
      error: null,
    });
  }
  reset() {
    if (!['identifying', 'review', 'error'].includes(this.state.stage))
      throw new Error('This cycle cannot be reset yet.');
    ++this.epoch;
    this.patch({ stage: 'ready', classification: null, target: null, manual: false, error: null });
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong. Try again.';
  }
}
