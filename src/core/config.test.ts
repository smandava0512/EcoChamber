import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGeminiConfig } from '../../electron/config';
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function directory() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sortly-config-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, '.env'), 'GEMINI_API_KEY=file-key\nGEMINI_MODEL=file-model');
  return dir;
}
describe('main process configuration', () => {
  it.each([false, true])('loads development or unpacked config (packaged=%s)', (packaged) => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GEMINI_MODEL', undefined);
    vi.stubEnv('PORTABLE_EXECUTABLE_DIR', undefined);
    const dir = directory();
    expect(loadGeminiConfig(packaged, path.join(dir, 'Sortly.exe'), dir)).toEqual({
      apiKey: 'file-key',
      model: 'file-model',
    });
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });
  it('uses portable directory while retaining inherited environment precedence', () => {
    const dir = directory();
    vi.stubEnv('PORTABLE_EXECUTABLE_DIR', dir);
    vi.stubEnv('GEMINI_API_KEY', 'inherited');
    vi.stubEnv('GEMINI_MODEL', '');
    expect(loadGeminiConfig(true, '/unused/Sortly.exe', '/archive')).toEqual({
      apiKey: 'inherited',
      model: 'gemini-3.8-flash',
    });
  });
});
