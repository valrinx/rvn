import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { chromium, expect, test } from '@playwright/test';
import { promisify } from 'node:util';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainEntry = path.join(desktopRoot, 'dist', 'main', 'main.js');
const electronExecutable = path.join(desktopRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedExecutable = process.env.RVN_PACKAGED_EXECUTABLE;
const execFileAsync = promisify(execFile);

test('installed desktop returns a durable worker response for a routed room message', async () => {
  test.setTimeout(180_000);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-runner-workspace-'));
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-runner-data-'));
  await writeFile(path.join(workspaceRoot, 'README.md'), '# RVN runner acceptance\n', 'utf8');
  await execFileAsync('git', ['init', '--quiet'], { cwd: workspaceRoot, windowsHide: true });
  await execFileAsync('git', ['config', 'user.email', 'rvn-runner@example.invalid'], { cwd: workspaceRoot, windowsHide: true });
  await execFileAsync('git', ['config', 'user.name', 'rvn runner acceptance'], { cwd: workspaceRoot, windowsHide: true });
  await execFileAsync('git', ['add', 'README.md'], { cwd: workspaceRoot, windowsHide: true });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: workspaceRoot, windowsHide: true });
  const devToolsPort = await findEphemeralPort();
  let electronProcess: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  const clients: Client[] = [];
  try {
    const launchExecutable = packagedExecutable ?? electronExecutable;
    const launchArguments = packagedExecutable === undefined
      ? [`--remote-debugging-port=${devToolsPort}`, `--user-data-dir=${dataRoot}`, mainEntry]
      : [`--remote-debugging-port=${devToolsPort}`, `--user-data-dir=${dataRoot}`];
    electronProcess = spawn(launchExecutable, launchArguments, {
      cwd: desktopRoot,
      shell: false,
      windowsHide: true,
      env: { ...process.env, RVN_DATA_PATH: dataRoot, RVN_WORKSPACE: workspaceRoot, RVN_UNRESTRICTED: '1', RVN_E2E_NODE_PATH: process.execPath },
    });
    const stderr: string[] = [];
    electronProcess.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    await waitForDevTools(devToolsPort, electronProcess, stderr);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${devToolsPort}`);
    const context = browser.contexts()[0];
    if (context === undefined) throw new Error('Electron did not create a browser context');
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    if (page === undefined) throw new Error('Electron did not create a renderer page');
    await expect(page.getByRole('heading', { name: 'สถานะภาพรวม' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Agent Work Flow' })).toHaveCount(0);
    await expect(page.getByTestId('agent-message-composer')).toHaveCount(0);
    await expect(page.getByText('COORDINATION', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('mcp-endpoint')).toContainText('http://127.0.0.1:', { timeout: 30_000 });
    const endpoint = new URL((await page.getByTestId('mcp-endpoint').textContent())?.trim() ?? '');

    const main = await connectClient(endpoint, clients);
    const code = await connectClient(endpoint, clients);
    await expectSuccessful(main.callTool({ name: 'agent_register', arguments: { agent_id: 'ui-main', role: 'main', capabilities: [] } }));
    await expectSuccessful(code.callTool({ name: 'agent_register', arguments: { agent_id: 'ui-code', role: 'code', capabilities: [] } }));
    await expect(page.locator('[data-agent-id="ui-code"]')).toHaveCount(0);
    const registered = await expectSuccessful(code.callTool({ name: 'agent_get', arguments: { agent_id: 'ui-code' } }));
    expect(registered).toMatchObject({ agentId: 'ui-code', role: 'code', sessionId: expect.any(String) });
    await expect(page.locator('[data-agent-id="ui-code"]')).toHaveCount(0);

    const sent = await page.evaluate(() => window.rvn.sendAgentRoomMessage({ target: '@ui-code', type: 'UPDATE', body: 'Reply exactly RVN_AGENT_PING and do not edit files.' }));
    expect(sent.targetAgentIds).toContain('ui-code');
    let reply: Awaited<ReturnType<typeof waitForResult>>;
    try {
      reply = await waitForResult(main, code, 120_000);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nstderr=${stderr.join('').slice(-16_000)}`);
    }
    expect(reply).toMatchObject({ fromAgentId: 'ui-code', type: 'RESULT', target: '@main' });
    expect(reply.body).toContain('RVN_AGENT_PING');
  } finally {
    await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
    if (browser !== undefined) await browser.close().catch(() => undefined);
    if (electronProcess !== undefined) await terminateProcessTree(electronProcess);
    await Promise.all([removeTemporaryRoot(workspaceRoot), removeTemporaryRoot(dataRoot)]);
  }
});

async function connectClient(endpoint: URL, clients: Client[]): Promise<Client> {
  const client = new Client({ name: `rvn-runner-${clients.length}`, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  clients.push(client);
  return client;
}

async function expectSuccessful(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  const result = await promise as { readonly isError?: boolean; readonly structuredContent?: unknown };
  expect(result.isError).not.toBe(true);
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

async function waitForResult(client: Client, worker: Client, timeoutMs: number): Promise<{ readonly fromAgentId: string; readonly type: string; readonly target: string; readonly body: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastHistory = 'none';
  let lastAgent = 'none';
  while (Date.now() < deadline) {
    const result = await client.callTool({ name: 'room_history', arguments: { room_id: 'rvn-main-room', after_sequence: 0, limit: 100 } }) as { readonly structuredContent?: unknown };
    lastHistory = JSON.stringify(result.structuredContent);
    const agent = await worker.callTool({ name: 'agent_get', arguments: { agent_id: 'ui-code' } }) as { readonly structuredContent?: unknown };
    lastAgent = JSON.stringify(agent.structuredContent);
    const content = result.structuredContent as { readonly value?: unknown } | undefined;
    const records = Array.isArray(content?.value) ? content.value : [];
    const blocker = records.find((item): item is { fromAgentId: string; type: string; target: string; body: string } => isRecord(item) && item.type === 'BLOCKER' && item.fromAgentId === 'ui-code');
    if (blocker !== undefined) throw new Error(`Worker returned durable BLOCKER: ${blocker.body}`);
    const reply = records.find((item): item is { fromAgentId: string; type: string; target: string; body: string } => isRecord(item) && item.type === 'RESULT' && item.fromAgentId === 'ui-code');
    if (reply !== undefined) return reply;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for durable worker RESULT; agent=${lastAgent}; history=${lastHistory}`);
}

async function findEphemeralPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0 }, () => resolve()); });
  const address = server.address();
  await new Promise<void>((resolve, reject) => { server.close((error) => error === undefined ? resolve() : reject(error)); });
  if (address === null || typeof address === 'string') throw new Error('Could not allocate ephemeral port');
  return address.port;
}

async function waitForDevTools(port: number, child: ChildProcess, stderr: readonly string[]): Promise<void> {
  await expect.poll(async () => {
    if (child.exitCode !== null) throw new Error(`Electron exited with ${child.exitCode}: ${stderr.join('')}`);
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true });
  await new Promise<void>((resolve) => { killer.once('error', () => resolve()); killer.once('close', () => resolve()); });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function removeTemporaryRoot(root: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await rm(root, { recursive: true, force: true });
}
