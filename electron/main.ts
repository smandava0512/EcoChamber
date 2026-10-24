import { app, BrowserWindow, ipcMain, net, protocol, session } from 'electron';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SortController } from '../src/core/controller';
import { SimulatedClassifier, SimulatedDevice } from '../src/core/simulator';
import {
  defaultSettings,
  imageSchema,
  categorySchema,
  scenarioSchema,
  settingsSchema,
} from '../src/core/types';
import type { Settings } from '../src/core/types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
const dev = !app.isPackaged && process.env.SORTLY_DEV === '1';
if (process.env.SORTLY_TEST_DATA) app.setPath('userData', process.env.SORTLY_TEST_DATA);
let window: BrowserWindow | null = null;
function isOwnPage(url: string) {
  try {
    const parsed = new URL(url);
    return dev
      ? parsed.origin === 'http://127.0.0.1:5173'
      : parsed.protocol === 'app:' && parsed.hostname === 'sortly';
  } catch {
    return false;
  }
}
function loadSettings(): Settings {
  try {
    return settingsSchema.parse(
      JSON.parse(readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')),
    );
  } catch {
    return structuredClone(defaultSettings);
  }
}
function persist(settings: Settings) {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'settings.json');
  writeFileSync(file + '.tmp', JSON.stringify(settings, null, 2));
  renameSync(file + '.tmp', file);
}
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '../../dist');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const file = path.resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (url.hostname !== 'sortly' || !file.startsWith(root + path.sep))
      return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin, details) =>
      contents === window?.webContents &&
      isOwnPage(origin) &&
      permission === 'media' &&
      details.mediaType === 'video',
  );
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      contents === window?.webContents &&
        isOwnPage(details.requestingUrl) &&
        permission === 'media' &&
        'mediaTypes' in details &&
        details.mediaTypes?.every((type) => type === 'video') === true,
    );
  });
  const classifier = new SimulatedClassifier();
  const device = new SimulatedDevice();
  const controller = new SortController(classifier, device, loadSettings());
  await controller.connect();
  controller.subscribe((state) => {
    if (window && !window.isDestroyed()) window.webContents.send('sortly:state', state);
  });
  const handle = (name: string, fn: (value: unknown) => unknown) =>
    ipcMain.handle('sortly:' + name, (event, value: unknown) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== window?.webContents.mainFrame ||
        !isOwnPage(event.senderFrame?.url || '')
      )
        throw new Error('Untrusted app request.');
      return fn(value);
    });
  handle('getState', () => controller.snapshot());
  handle('scan', (value) => {
    if (controller.snapshot().stage !== 'ready')
      throw new Error('A sorting cycle is already active.');
    classifier.scenario = controller.snapshot().scenario;
    device.failNextMove = classifier.scenario === 'device-error';
    return controller.scan(imageSchema.parse(value));
  });
  handle('configure', (value) => controller.configure(scenarioSchema.parse(value)));
  handle('override', (value) => controller.override(categorySchema.parse(value)));
  handle('done', () => controller.done());
  handle('reset', () => controller.reset());
  handle('connect', () => controller.connect());
  handle('disconnect', () => controller.disconnect());
  handle('saveSettings', (value) => {
    const settings = settingsSchema.parse(value);
    const previous = controller.snapshot().settings;
    controller.saveSettings(settings);
    try {
      persist(settings);
    } catch {
      controller.saveSettings(previous);
      throw new Error('Settings could not be saved. Check disk access.');
    }
  });
  function createWindow() {
    window = new BrowserWindow({
      width: 1440,
      height: 980,
      minWidth: 980,
      minHeight: 740,
      backgroundColor: '#f5f5ef',
      title: 'Sortly',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (!isOwnPage(url)) event.preventDefault();
    });
    window.on('closed', () => {
      window = null;
    });
    if (dev) void window.loadURL('http://127.0.0.1:5173');
    else void window.loadURL('app://sortly/index.html');
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
