import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appError, err, ok } from '@rvn/domain';
import type { CodexService } from '@rvn/application';
import { SqliteAgentBusRepository, SqliteDatabase } from '@rvn/storage';
import { DesktopAgentRunnerSupervisor } from '../src/main/agent-runner-supervisor.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('desktop Agent Runner supervisor', () => {
  it('wakes a live runner for a routed room message and persists the Codex reply', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-runner-supervisor-'));
    roots.push(root);
    const database = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const bus = new SqliteAgentBusRepository(database);
    await seedRoom(bus);
    let runs = 0;
    const codex = fakeCodex({
      run: async (): Promise<ReturnType<CodexService['run']> extends Promise<infer T> ? T : never> => {
        runs += 1;
        return ok({ codexTaskId: 'codex-task', processId: 'codex-process' });
      },
      output: 'PONG from configured Codex executor',
    });
    const supervisor = new DesktopAgentRunnerSupervisor(bus, codex, {
      getActiveWorkspace: async (): Promise<{ readonly workspaceId: string; readonly rootPath: string }> => ({ workspaceId: 'workspace-1', rootPath: root }),
      pollIntervalMs: 5,
      heartbeatIntervalMs: 1_000,
      maxExecutionMs: 1_000,
    });
    try {
      const sent = await bus.sendRoomMessage({ roomId: 'room-1', target: '@code', type: 'UPDATE', body: 'ping' });
      expect(sent.ok).toBe(true);
      if (!sent.ok) throw new Error('room message did not send');
      await expect(supervisor.dispatch(sent.value)).resolves.toMatchObject({ ok: true });
      const reply = await waitForRoomMessage(bus, 'RESULT');
      expect(reply).toMatchObject({ fromAgentId: 'code-agent', target: '@main', body: 'PONG from configured Codex executor' });
      expect(runs).toBe(1);
    } finally {
      await supervisor.close();
      database.close();
    }
  });

  it('publishes a durable blocker when the configured executor is unavailable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-runner-unavailable-'));
    roots.push(root);
    const database = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const bus = new SqliteAgentBusRepository(database);
    await seedRoom(bus);
    const codex = fakeCodex({
      run: async (): Promise<ReturnType<CodexService['run']> extends Promise<infer T> ? T : never> => err(appError('CODEX_NOT_AVAILABLE', 'Codex is not configured', true)),
      output: '',
    });
    const supervisor = new DesktopAgentRunnerSupervisor(bus, codex, {
      getActiveWorkspace: async (): Promise<{ readonly workspaceId: string; readonly rootPath: string }> => ({ workspaceId: 'workspace-1', rootPath: root }),
      pollIntervalMs: 5,
      heartbeatIntervalMs: 1_000,
      maxExecutionMs: 1_000,
    });
    try {
      const sent = await bus.sendRoomMessage({ roomId: 'room-1', target: '@code', type: 'UPDATE', body: 'ping' });
      expect(sent.ok).toBe(true);
      if (!sent.ok) throw new Error('room message did not send');
      await expect(supervisor.dispatch(sent.value)).resolves.toMatchObject({ ok: true });
      const blocker = await waitForRoomMessage(bus, 'BLOCKER');
      expect(blocker).toMatchObject({ fromAgentId: 'code-agent', target: '@main' });
      expect(blocker.body).toContain('Codex is not configured');
    } finally {
      await supervisor.close();
      database.close();
    }
  });
});

async function seedRoom(bus: SqliteAgentBusRepository): Promise<void> {
  await bus.registerAgent({ agentId: 'main-agent', role: 'main', sessionId: 'session-main', capabilities: [] });
  await bus.registerAgent({ agentId: 'code-agent', role: 'code', sessionId: 'session-code', capabilities: [] });
  const room = await bus.createRoom({ roomId: 'room-1', name: 'Runner room', createdByAgentId: 'main-agent', participantAgentIds: ['main-agent', 'code-agent'] });
  if (!room.ok) throw new Error('room setup failed');
}

function fakeCodex(input: {
  readonly run: CodexService['run'];
  readonly output: string;
}): CodexService {
  return {
    run: input.run,
    taskStatus: async () => ok({ processId: 'codex-process', executable: 'codex', args: [], cwd: 'C:\\workspace', state: 'exited', startedAt: new Date(0).toISOString(), exitCode: 0 }),
    taskLogs: async () => ok({ entries: input.output.length === 0 ? [] : [{ sequence: 1, stream: 'stdout' as const, text: input.output }], truncated: false, nextSequence: 2 }),
    stop: async () => ok(undefined),
    status: async () => ok({ installed: true, version: 'test', executablePath: 'codex', capabilities: [] }),
    list: async () => ok([]),
  } as unknown as CodexService;
}

async function waitForRoomMessage(bus: SqliteAgentBusRepository, type: 'RESULT' | 'BLOCKER'): Promise<{ readonly fromAgentId: string; readonly target: string; readonly body: string }> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const history = await bus.roomHistory({ roomId: 'room-1', afterSequence: 0, limit: 20 });
    if (history.ok) {
      const message = history.value.find((candidate) => candidate.type === type);
      if (message !== undefined) return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${type}`);
}
