import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
let app: ElectronApplication;
let page: Page;
test.beforeEach(async ({}, testInfo) => {
  const executable = process.env.SORTLY_EXECUTABLE;
  const env = { ...process.env, SORTLY_TEST_DATA: testInfo.outputPath('user-data') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: [
      ...(executable ? [] : ['.']),
      ...(testInfo.title.includes('camera denied') ? [] : ['--use-fake-ui-for-media-stream']),
      '--use-fake-device-for-media-stream',
    ],
    env,
  });
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Give waste a better way.' })).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
});
test('live capture, all three categories, and confirmed session history', async ({}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const scan = page.getByRole('button', { name: 'Scan item' });
  await expect(scan).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('station.png'), fullPage: true });
  for (const category of ['paper', 'plastic', 'trash']) {
    await page.getByLabel('Demo scenario').selectOption(category);
    await scan.click();
    await expect(page.getByRole('button', { name: 'Done — item deposited' })).toBeVisible();
    await page.getByRole('button', { name: 'Done — item deposited' }).click();
    await expect(scan).toBeEnabled();
  }
  await page.getByRole('button', { name: /Session history/ }).click();
  await expect(page.locator('.activity-full .activity-row')).toHaveCount(3);
  await expect(page.locator('.activity-full .count-pill')).toBeVisible();
  expect(errors).toEqual([]);
});
test('unknown requires review; explicit override is recorded', async () => {
  await page.getByLabel('Demo scenario').selectOption('unknown');
  await page.getByRole('button', { name: 'Scan item' }).click();
  await expect(page.getByRole('button', { name: 'Rescan item' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done — item deposited' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Override to Plastic' }).click();
  await page.getByRole('button', { name: 'Done — item deposited' }).click();
  await expect(page.getByText('Plastic · Manual override')).toBeVisible();
});
test('API and movement failures recover without silently completing a deposit', async () => {
  await page.getByLabel('Demo scenario').selectOption('classification-error');
  await page.getByRole('button', { name: 'Scan item' }).click();
  await page.getByRole('button', { name: 'Try another scan' }).click();
  await page.getByLabel('Demo scenario').selectOption('device-error');
  await page.getByRole('button', { name: 'Scan item' }).click();
  await expect(page.getByText('Movement did not complete.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done — item deposited' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Reconnect simulator' }).click();
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeEnabled();
  await expect(page.locator('.session-badge strong')).toHaveText('0');
});
test('settings persist across renderer reload and help is dismissible', async () => {
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('Paper angle', { exact: true }).fill('85');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('button', { name: 'Settings saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.getByLabel('Paper angle', { exact: true })).toHaveValue('85');
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('cancelled scan never moves a bin or counts a deposit', async () => {
  await page.getByRole('button', { name: 'Scan item' }).click();
  await page.getByRole('button', { name: 'Cancel scan' }).click();
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Done — item deposited' })).not.toBeVisible();
  await expect(page.locator('.session-badge strong')).toHaveText('0');
});

test('camera denied disables capture and offers recovery', async () => {
  await app.evaluate(({ session }) => {
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
  });
  await page.reload();
  await expect(page.getByText('Camera access is blocked.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Try camera again' })).toBeVisible();
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.getByLabel('Webcam', { exact: true })).toBeVisible();
});
