import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const children = [];
function run(file, args, env = {}) {
  const child = spawn(process.execPath, [file, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}
const cleanup = () => children.forEach((child) => child.kill());
process.on('SIGINT', () => {
  cleanup();
  process.exit();
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit();
});
process.on('exit', cleanup);
const compile = run(require.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.electron.json']);
const [code] = await once(compile, 'exit');
if (code !== 0) process.exit(code || 1);
const vite = run(path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), []);
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    if ((await fetch('http://127.0.0.1:5173')).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!ready) {
  console.error('Vite did not start. Check port 5173.');
  process.exit(1);
}
const electronPath = require('electron');
const electronEnv = { ...process.env, SORTLY_DEV: '1' };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const electron = spawn(electronPath, ['.'], { stdio: 'inherit', env: electronEnv });
children.push(electron);
electron.on('exit', (code) => process.exit(code || 0));
vite.on('exit', (code) => {
  if (code) process.exit(code);
});
