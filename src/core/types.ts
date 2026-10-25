import { z } from 'zod';
export const categories = ['trash', 'paper', 'plastic'] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;
export const scenarios = [
  'paper',
  'plastic',
  'trash',
  'unknown',
  'classification-error',
  'device-error',
] as const;
export const scenarioSchema = z.enum(scenarios);
export type Scenario = z.infer<typeof scenarioSchema>;
export const classificationSchema = z
  .object({
    category: z.enum(['trash', 'paper', 'plastic', 'unknown']),
    itemName: z.string().min(1).max(100),
    reason: z.string().min(1).max(300),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
export const imageSchema = z
  .object({
    base64: z
      .string()
      .min(4)
      .max(2_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    mimeType: z.literal('image/jpeg'),
  })
  .strict();
export type ImageInput = z.infer<typeof imageSchema>;
export const settingsSchema = z
  .object({
    angles: z
      .object({
        trash: z.number().int().min(0).max(180),
        paper: z.number().int().min(0).max(180),
        plastic: z.number().int().min(0).max(180),
      })
      .strict(),
    cameraId: z.string().max(300),
    classificationMode: z.enum(['demo', 'gemini']).default('demo'),
    deviceMode: z.enum(['simulated', 'arduino']).default('simulated'),
    serialPort: z
      .string()
      .regex(/^COM[1-9]\d{0,3}$/i)
      .default('COM5'),
    hardwareCalibrated: z.boolean().default(false),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  angles: { trash: 20, paper: 90, plastic: 160 },
  cameraId: '',
  classificationMode: 'demo',
  deviceMode: 'simulated',
  serialPort: 'COM5',
  hardwareCalibrated: false,
};
export interface Classifier {
  classify(image: ImageInput, signal?: AbortSignal): Promise<Classification>;
}
export interface BinDevice {
  connect(): Promise<void>;
  moveTo(category: Category): Promise<void>;
  disconnect(): Promise<void>;
  onDisconnect?(listener: (message: string) => void): () => void;
}
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}
export type Stage =
  | 'ready'
  | 'capturing'
  | 'identifying'
  | 'moving'
  | 'deposit'
  | 'review'
  | 'error';
export type ClassificationMode = 'demo' | 'gemini';
export interface ClassifierStatus {
  configured: boolean;
  model: string;
}
export interface HistoryEntry {
  source: ClassificationMode;
  id: string;
  category: Category;
  itemName: string;
  manual: boolean;
  at: string;
  deviceMode: Settings['deviceMode'];
}
export interface SortState {
  classifierStatus: ClassifierStatus;
  source: ClassificationMode;
  stage: Stage;
  scenario: Scenario;
  connected: boolean;
  position: Category | null;
  target: Category | null;
  classification: Classification | null;
  manual: boolean;
  error: string | null;
  settings: Settings;
  history: HistoryEntry[];
}
export interface EcoChamberBridge {
  getState(): Promise<SortState>;
  scan(image: ImageInput): Promise<void>;
  configure(scenario: Scenario): Promise<void>;
  override(category: Category): Promise<void>;
  done(): Promise<void>;
  reset(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  listPorts(): Promise<SerialPortInfo[]>;
  testPosition(category: Category): Promise<void>;
  onState(listener: (state: SortState) => void): () => void;
}
