import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const env = { ...process.env };
// Some development hosts omit Windows PowerShell from PATH; electron-builder needs it.
if (process.platform === 'win32') {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
  env[pathKey] = [
    env[pathKey],
    path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'),
  ]
    .filter(Boolean)
    .join(path.delimiter);
}
const builder = path.join(path.dirname(require.resolve('electron-builder/package.json')), 'cli.js');
const child = spawn(process.execPath, [builder, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
