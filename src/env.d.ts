import type { EcoChamberBridge } from './core/types';
declare global {
  interface Window {
    ecochamber: EcoChamberBridge;
  }
}
