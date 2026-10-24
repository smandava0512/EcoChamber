import type { SortlyBridge } from './core/types';
declare global {
  interface Window {
    sortly: SortlyBridge;
  }
}
