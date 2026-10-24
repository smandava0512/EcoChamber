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
  const env = {
    ...process.env,
    SORTLY_TEST_DATA: testInfo.outputPath('user-data'),
    GEMINI_API_KEY: testInfo.title.includes('missing key') ? '' : 'mock-key-never-sent',
    GEMINI_MODEL: 'gemini-3.8-flash',
  };
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
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const scan = page.getByRole('button', { name: 'Scan item' });
  await expect(scan).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('station.png'), fullPage: true });
  for (const category of ['paper', 'plastic', 'trash']) {
    await page.getByLabel('Demo scenario').selectOption(category);
    await scan.click();
    await expect(page.getByRole('button', { name: /Done .* item deposited/ })).toBeVisible();
    await page.getByRole('button', { name: /Done .* item deposited/ }).click();
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
  await expect(page.getByRole('button', { name: /Done .* item deposited/ })).not.toBeVisible();
  await page.getByRole('button', { name: 'Override to Plastic' }).click();
  await page.getByRole('button', { name: /Done .* item deposited/ }).click();
  await expect(page.getByText('Plastic - Manual override')).toBeVisible();
});
test('API and movement failures recover without silently completing a deposit', async () => {
  await page.getByLabel('Demo scenario').selectOption('classification-error');
  await page.getByRole('button', { name: 'Scan item' }).click();
  await page.getByRole('button', { name: 'Try another scan' }).click();
  await page.getByLabel('Demo scenario').selectOption('device-error');
  await page.getByRole('button', { name: 'Scan item' }).click();
  await expect(page.getByText('Movement did not complete.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Done .* item deposited/ })).not.toBeVisible();
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
  await expect(page.getByRole('button', { name: /Done .* item deposited/ })).not.toBeVisible();
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

test('Gemini mock cycle keeps movement simulated, locks modes and records source', async () => {
  await app.evaluate(() => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      category: 'paper',
                      itemName: 'Mock paper',
                      reason: 'Clean dry paper.',
                    }),
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
  });
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('Classification mode').selectOption('gemini');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await expect(page.getByLabel('Demo scenario')).not.toBeVisible();
  await expect(
    page.getByText('Clicking Scan item sends one captured image', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Scan item' }).click();
  await expect(page.getByRole('button', { name: /Done .* item deposited/ })).toBeVisible();
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.getByLabel('Classification mode')).toBeDisabled();
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await page.getByRole('button', { name: /Done .* item deposited/ }).click();
  await expect(page.getByText('Paper - Gemini result')).toBeVisible();
  const state = await page.evaluate(() => window.sortly.getState());
  expect(JSON.stringify(state)).not.toContain('mock-key');
  expect(state.history[0].source).toBe('gemini');
});
test('missing key disables Gemini but allows Demo', async () => {
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(
    page.getByLabel('Classification mode').locator('option[value="gemini"]'),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeEnabled();
});

test('Gemini errors stay in Gemini mode without moving or exposing provider details', async () => {
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('Classification mode').selectOption('gemini');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  for (const status of [429, 200]) {
    await app.evaluate((_electron, status) => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify(
            status === 429
              ? {
                  error: {
                    code: 429,
                    message: 'sensitive-provider-details',
                    status: 'RESOURCE_EXHAUSTED',
                  },
                }
              : {
                  candidates: [
                    {
                      content: { role: 'model', parts: [{ text: '{"category":"metal"}' }] },
                      finishReason: 'STOP',
                    },
                  ],
                },
          ),
          { status, headers: { 'Content-Type': 'application/json' } },
        );
    }, status);
    await page.getByRole('button', { name: 'Scan item' }).click();
    await expect(page.getByRole('button', { name: 'Try another scan' })).toBeVisible();
    const state = await page.evaluate(() => window.sortly.getState());
    expect(state).toMatchObject({
      stage: 'error',
      position: null,
      target: null,
      history: [],
      settings: { classificationMode: 'gemini' },
    });
    expect(JSON.stringify(state)).not.toMatch(/sensitive-provider-details|mock-key/);
    await expect(page.getByRole('button', { name: /Done .* item deposited/ })).not.toBeVisible();
    await page.getByRole('button', { name: 'Try another scan' }).click();
  }
});

test('hardware mode requires explicit connection and calibration', async () => {
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('Mechanism mode', { exact: true }).selectOption('arduino');
  await expect(page.getByLabel('USB serial port')).toHaveValue('COM5');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('button', { name: 'Connect Arduino', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test Paper position' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeDisabled();
  await expect(
    page.getByText('The selected demo outcome moves your physical prototype.', { exact: false }),
  ).toBeVisible();
});

test('position tests are not counted as deposits', async () => {
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Test Paper position' }).click();
  await expect(page.getByRole('button', { name: 'Test Paper position' })).toBeEnabled();
  await expect(page.locator('.session-badge strong')).toHaveText('0');
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await expect(page.getByRole('button', { name: /Done .* item deposited/ })).not.toBeVisible();
});

test('real COM5 handshake sends no movement commands', async ({}, testInfo) => {
  test.skip(process.env.SORTLY_HARDWARE_TEST !== '1', 'Explicit hardware opt-in required');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('Mechanism mode', { exact: true }).selectOption('arduino');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Connect Arduino', exact: true }).click();
  await expect(page.getByText('Connected · D5 positional servo', { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await page.getByRole('button', { name: 'Sort station', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calibrate positions' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('arduino-station.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Scan item' })).toBeDisabled();
});
