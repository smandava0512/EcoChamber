import { contextBridge, ipcRenderer } from 'electron';
import type { EcoChamberBridge, SortState } from '../src/core/types';
const bridge: EcoChamberBridge = {
  getState: () => ipcRenderer.invoke('ecochamber:getState'),
  scan: (image) => ipcRenderer.invoke('ecochamber:scan', image),
  configure: (scenario) => ipcRenderer.invoke('ecochamber:configure', scenario),
  override: (category) => ipcRenderer.invoke('ecochamber:override', category),
  done: () => ipcRenderer.invoke('ecochamber:done'),
  reset: () => ipcRenderer.invoke('ecochamber:reset'),
  connect: () => ipcRenderer.invoke('ecochamber:connect'),
  disconnect: () => ipcRenderer.invoke('ecochamber:disconnect'),
  saveSettings: (settings) => ipcRenderer.invoke('ecochamber:saveSettings', settings),
  listPorts: () => ipcRenderer.invoke('ecochamber:listPorts'),
  testPosition: (category) => ipcRenderer.invoke('ecochamber:testPosition', category),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SortState) => listener(state);
    ipcRenderer.on('ecochamber:state', handler);
    return () => {
      ipcRenderer.removeListener('ecochamber:state', handler);
    };
  },
};
contextBridge.exposeInMainWorld('ecochamber', bridge);
