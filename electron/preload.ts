import { contextBridge, ipcRenderer } from 'electron';
import type { SortlyBridge, SortState } from '../src/core/types';
const bridge: SortlyBridge = {
  getState: () => ipcRenderer.invoke('sortly:getState'),
  scan: (image) => ipcRenderer.invoke('sortly:scan', image),
  configure: (scenario) => ipcRenderer.invoke('sortly:configure', scenario),
  override: (category) => ipcRenderer.invoke('sortly:override', category),
  done: () => ipcRenderer.invoke('sortly:done'),
  reset: () => ipcRenderer.invoke('sortly:reset'),
  connect: () => ipcRenderer.invoke('sortly:connect'),
  disconnect: () => ipcRenderer.invoke('sortly:disconnect'),
  saveSettings: (settings) => ipcRenderer.invoke('sortly:saveSettings', settings),
  listPorts: () => ipcRenderer.invoke('sortly:listPorts'),
  testPosition: (category) => ipcRenderer.invoke('sortly:testPosition', category),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SortState) => listener(state);
    ipcRenderer.on('sortly:state', handler);
    return () => {
      ipcRenderer.removeListener('sortly:state', handler);
    };
  },
};
contextBridge.exposeInMainWorld('sortly', bridge);
