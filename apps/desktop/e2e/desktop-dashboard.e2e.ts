import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type Page } from '@playwright/test';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainEntry = path.join(desktopRoot, 'dist', 'main', 'main.js');
const electronExecutable = path.join(desktopRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedExecutable = process.env.RVN_PACKAGED_EXECUTABLE;

test('control center auto-starts MCP and supports project + doctor journey', async () => {
  test.setTimeout(90_000);
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-dashboard-'));
  const fixtureRealRoot = await realpath(fixtureRoot);
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-dashboard-data-'));
  const gitCeilingDirectories = [path.dirname(fixtureRoot), path.dirname(fixtureRealRoot)].filter((value, index, values) => values.indexOf(value) === index).join(path.delimiter);
  await writeFile(path.join(fixtureRoot, '.env'), 'SECRET_NOT_FOR_UI=do-not-display\n', 'utf8');
  const devToolsPort = await findEphemeralPort();
  const launchExecutable = packagedExecutable ?? electronExecutable;
  const launchArguments = packagedExecutable === undefined
    ? [`--remote-debugging-port=${devToolsPort}`, `--user-data-dir=${dataRoot}`, mainEntry]
    : [`--remote-debugging-port=${devToolsPort}`, `--user-data-dir=${dataRoot}`];
  const electronProcess = spawn(launchExecutable, launchArguments, {
    cwd: desktopRoot,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      RVN_DATA_PATH: dataRoot,
      RVN_WORKSPACE: fixtureRoot,
      RVN_UNRESTRICTED: '1',
      RVN_E2E_FIXTURE: '1',
      RVN_E2E_NODE_PATH: process.execPath,
      GIT_CEILING_DIRECTORIES: gitCeilingDirectories,
    },
  });
  const stderr: string[] = [];
  electronProcess.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

  try {
    await waitForDevTools(devToolsPort, electronProcess, stderr);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${devToolsPort}`);
    const context = browser.contexts()[0];
    if (context === undefined) throw new Error('Electron did not create a browser context');
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    if (page === undefined) throw new Error('Electron did not create a renderer page');
    const runtimeErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    const navigation = page.getByLabel('Navigation');

    await expect(page.getByRole('heading', { name: 'สถานะภาพรวม' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.getByTestId('system-metrics').innerText()).toMatch(/CPU \d+%/);
    await expect.poll(() => page.getByTestId('system-metrics').innerText()).toMatch(/RAM \d+%/);
    await expect(page.getByTestId('mcp-status')).toHaveText(/Agent พร้อมทำงาน|Agent ready/, { timeout: 30_000 });
    await expect(page.getByTestId('mcp-endpoint')).toContainText('http://127.0.0.1:', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'รายการ MCP', exact: true })).toBeVisible();
    await expect(page.getByTestId('mcp-server-list')).toBeVisible();
    await expect.poll(async () => page.locator('.rvn-mcp-server-row').count()).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => page.locator('.rvn-mcp-server-status.online, .rvn-mcp-server-status.offline').count()).toBe(
      await page.locator('.rvn-mcp-server-row').count(),
    );
    await expect(page.locator('body')).not.toContainText('Raven Roblox Client');
    await expect(page.locator('body')).not.toContainText('RobloxStudioBeta.exe');
    await expect.poll(async () => page.locator('.rvn-security-card h2').evaluate((element) => element.textContent?.replace('◇', '').trim())).toBe('ความปลอดภัย');
    await expect(page.locator('.rvn-security-card .rvn-security-row').first()).toContainText('โหมดการทำงาน');
    await expect(page.locator('.rvn-security-card .rvn-security-row').first()).toContainText('WORK · Unrestricted');
    await expect(page.locator('.rvn-dashboard-page .rvn-heading-actions')).toBeHidden();
    await expect(page.getByTestId('active-project-summary')).toBeVisible();
    await expect(page.getByTestId('manage-workspaces')).toBeVisible();
    await page.setViewportSize({ width: 1488, height: 1058 });
    await expect.poll(async () => Math.round(await page.locator('.rvn-brand-subtitle').evaluate((element) => {
      const logo = element.parentElement?.querySelector('.rvn-wordmark-image');
      return logo instanceof HTMLElement ? element.getBoundingClientRect().left - logo.getBoundingClientRect().right : -1;
    }))).toBeGreaterThan(30);
    await expect.poll(async () => Math.round(await page.locator('.rvn-work-badge').evaluate((element) => element.getBoundingClientRect().width))).toBeGreaterThan(245);
    await expect.poll(async () => Math.round(await page.locator('.rvn-work-badge').evaluate((element) => element.getBoundingClientRect().left))).toBe(320);
    await expect.poll(async () => Math.round(await page.locator('.rvn-top-actions').evaluate((element) => element.getBoundingClientRect().right))).toBeGreaterThan(1380);
    await expect.poll(async () => Math.round(await page.locator('.rvn-security-card').evaluate((element) => element.getBoundingClientRect().width))).toBe(360);
    // The durable Multi-Agent panel makes the main pane scrollable at the reference viewport;
    // the seven-pixel custom scrollbar is therefore part of the expected geometry.
    await expect.poll(async () => Math.round(await page.locator('.rvn-security-card .rvn-security-row').first().locator('strong').evaluate((element) => element.getBoundingClientRect().left))).toBe(1266);
    await expect.poll(async () => Math.round(await page.locator('.rvn-security-card .security-warning').evaluate((element) => element.getBoundingClientRect().height))).toBeGreaterThan(110);
    await expect.poll(async () => Math.round(await page.locator('.rvn-dashboard-grid').evaluate((element) => element.getBoundingClientRect().right))).toBe(1461);
    await expect.poll(async () => Math.round(await page.locator('.rvn-nav-slot').first().evaluate((element) => {
      const slot = element.getBoundingClientRect();
      const button = element.querySelector('button')?.getBoundingClientRect();
      return button === undefined ? -1 : slot.width - button.width;
    }))).toBe(0);
     await page.setViewportSize({ width: 800, height: 600 });
     await expectNoHorizontalOverflow(page);
     for (const width of [640, 320]) {
       await page.setViewportSize({ width, height: 600 });
       await expectNoHorizontalOverflow(page);
     }
     await page.setViewportSize({ width: 800, height: 600 });

    await page.getByRole('button', { name: 'คัดลอก' }).first().click();
    await expect(page.getByTestId('mcp-copy-status')).toHaveText(/คัดลอกแล้ว|Copied/);

    await navigation.getByRole('button', { name: 'โปรเจกต์', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'โปรเจกต์', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'โปรเจกต์ที่ใช้งานอยู่' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มโปรเจกต์', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'หน้าหลัก', exact: true }).click();

    await expect(navigation.getByRole('button', { name: 'Agent & MCP', exact: true })).toHaveCount(0);
    await expect(navigation.getByRole('button', { name: 'Raven MCP', exact: true })).toHaveCount(0);

    await navigation.getByRole('button', { name: 'Secure Tunnel', exact: true }).click();
    await expect(page.locator('.page-heading h1')).toHaveText('Secure Tunnel');
    await expect(page.locator('.settings-section-header h2')).toHaveText('Secure Tunnel');
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'ความปลอดภัย', exact: true }).click();
    await expect(page.locator('.page-heading h1')).toHaveText('ความปลอดภัย');
    await expect(page.locator('.settings-section-header h2')).toHaveText('ความปลอดภัย');
    await page.getByLabel('Permission profile', { exact: true }).selectOption('balanced');
    await expect(page.getByLabel('Permission profile', { exact: true })).toHaveValue('balanced');
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'บันทึกการทำงาน', exact: true }).click();
    await expect(page.getByTestId('work-log')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'Live Logs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Live Logs' })).toBeVisible();
    const liveTabs = page.getByRole('tab');
    await expect(liveTabs).toHaveCount(3);
    for (const tabName of ['Tunnel', 'MCP activity', 'Processes']) {
      const liveTab = page.getByRole('tab', { name: tabName, exact: true });
      await liveTab.click();
      await expect(liveTab).toHaveAttribute('aria-selected', 'true');
      await expectNoHorizontalOverflow(page);
    }
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'หน้าหลัก', exact: true }).click();
    await expect(page.getByTestId('workspace-real-root')).toHaveText(fixtureRealRoot, { timeout: 30_000 });

    await navigation.getByRole('button', { name: 'ตั้งค่า', exact: true }).click();
    await expect(page.locator('.settings-section-header h2')).toHaveText('ทั่วไป');
    const settingsSections: ReadonlyArray<readonly [RegExp, string]> = [
      [/^ความปลอดภัย/, 'ความปลอดภัย'],
      [/^Tools/, 'Tools'],
      [/^MCP & Extensions/, 'MCP & Extensions'],
      [/^Secure Tunnel/, 'Secure Tunnel'],
      [/^กู้คืนข้อมูล/, 'กู้คืนข้อมูล'],
      [/^ทั่วไป/, 'ทั่วไป'],
    ];
    for (const [buttonName, heading] of settingsSections) {
      await page.locator('.settings-subnav').getByRole('button', { name: buttonName }).click();
      await expect(page.locator('.settings-section-header h2')).toHaveText(heading);
      await expectNoHorizontalOverflow(page);
    }
    await page.locator('.settings-subnav').getByRole('button', { name: /^Tools/ }).click();
    const codexSwitch = page.getByRole('switch', { name: /codex_\*/ });
    await expect(codexSwitch).toHaveAttribute('aria-checked', 'false');
    await codexSwitch.click();
    await expect(codexSwitch).toHaveAttribute('aria-checked', 'true');
    await expectNoHorizontalOverflow(page);

    await navigation.getByRole('button', { name: 'Doctor', exact: true }).click();
    await page.getByRole('button', { name: /รัน Doctor|Run doctor/ }).click();
    await expect(page.getByTestId('doctor-check-os')).toBeVisible();
    await expect(page.getByTestId('doctor-check-database')).toBeVisible();
    await expect(page.getByTestId('doctor-check-workspaces')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('do-not-display');
    expect(runtimeErrors).toEqual([]);
    await browser.close();
  } finally {
    await terminateProcessTree(electronProcess);
    await Promise.all([
      removeTemporaryRoot(fixtureRoot),
      removeTemporaryRoot(dataRoot),
    ]);
  }
});

async function findEphemeralPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  if (address === null || typeof address === 'string') throw new Error('Could not allocate ephemeral port');
  return address.port;
}

async function waitForDevTools(port: number, child: ChildProcess, stderr: string[]): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron exited early: ${stderr.join('')}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Electron DevTools: ${stderr.join('')}`);
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true });
  }
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    setTimeout(() => resolve(), 5_000);
  });
}

async function removeTemporaryRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
}
