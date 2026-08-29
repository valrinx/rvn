import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ok, type Result } from '@rvn/domain';
import { SqliteAgentBusRepository, SqliteDatabase, type AgentBusRepository, type AgentSummary } from '@rvn/storage';
import { AgentSessionManager } from './agent-session-manager.js';

describe('AgentSessionManager', () => {
  it('rejects duplicate active bindings, supports explicit disconnect/rebind, and preserves role presence', async () => {
    const records = new Map<string, AgentSummary>();
    const bus = fakeBus(records);
    const manager = new AgentSessionManager(bus);

    await expect(manager.bind({ agentId: 'main', role: 'Main', sessionId: 'protocol-a', transport: 'http', capabilities: ['plan'] })).resolves.toMatchObject({ ok: true, value: { agentId: 'main', sessionId: 'protocol-a', status: 'online' } });
    await expect(manager.bind({ agentId: 'code', role: 'Code', sessionId: 'protocol-a', transport: 'http', capabilities: [] })).resolves.toMatchObject({ ok: false, error: { code: 'SESSION_ALREADY_BOUND' } });
    await expect(manager.bind({ agentId: 'main', role: 'Main', sessionId: 'protocol-b', transport: 'http', capabilities: ['plan'] })).resolves.toMatchObject({ ok: true, value: { sessionId: 'protocol-b', status: 'online' } });
    await expect(manager.disconnect({ agentId: 'main', sessionId: 'protocol-a' })).resolves.toMatchObject({ ok: false, error: { code: 'AGENT_SESSION_MISMATCH' } });
    await expect(manager.disconnect({ agentId: 'main', sessionId: 'protocol-b' })).resolves.toMatchObject({ ok: true, value: { status: 'offline', sessionId: undefined } });
    await expect(manager.bind({ agentId: 'main', role: 'Main', sessionId: 'protocol-c', transport: 'http', capabilities: ['plan'] })).resolves.toMatchObject({ ok: true, value: { sessionId: 'protocol-c', status: 'online' } });
    await expect(manager.heartbeat({ agentId: 'main', sessionId: 'protocol-c', status: 'busy', currentTaskId: 'task-1' })).resolves.toMatchObject({ ok: true, value: { status: 'busy', currentTaskId: 'task-1' } });
    await expect(manager.listPresence(10)).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ agentId: 'main', role: 'Main', sessionId: 'protocol-c', status: 'busy' })] });
  });

  it('reads durable presence from the SQLite Agent Bus after a manager reconnect', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-session-manager-'));
    const filename = path.join(root, 'rvn.sqlite');
    const firstDatabase = new SqliteDatabase(filename);
    const first = new AgentSessionManager(new SqliteAgentBusRepository(firstDatabase));
    await expect(first.bind({ agentId: 'research', role: 'Research', sessionId: 'protocol-research', transport: 'http', capabilities: ['search'] })).resolves.toMatchObject({ ok: true, value: { agentId: 'research', sessionId: 'protocol-research', status: 'online' } });
    firstDatabase.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnect = new AgentSessionManager(new SqliteAgentBusRepository(reconnectDatabase));
    await expect(reconnect.listPresence(10)).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ agentId: 'research', role: 'Research', sessionId: 'protocol-research', status: 'online' })] });
    reconnectDatabase.close();
  });
});

function fakeBus(records: Map<string, AgentSummary>): AgentBusRepository {
  return {
    async getAgent(input): Promise<Result<AgentSummary & { currentTaskId: string | null }>> {
      const found = records.get(input.agentId);
      return found === undefined ? { ok: false, error: { code: 'AGENT_NOT_FOUND', message: 'missing', recoverable: false } } : ok({ ...found, currentTaskId: found.currentTaskId ?? null });
    },
    async listAgents(): Promise<Result<readonly AgentSummary[]>> { return ok([...records.values()]); },
    async registerAgent(input): Promise<Result<AgentSummary>> {
      const now = Date.now();
      const next: AgentSummary = { agentId: input.agentId, role: input.role, sessionId: input.sessionId, status: input.status ?? 'online', capabilities: input.capabilities, lastHeartbeatAt: now, createdAt: records.get(input.agentId)?.createdAt ?? now, updatedAt: now };
      records.set(input.agentId, next);
      return ok(next);
    },
    async heartbeatAgent(input): Promise<Result<AgentSummary>> {
      const existing = records.get(input.agentId);
      if (existing === undefined) return { ok: false, error: { code: 'AGENT_NOT_FOUND', message: 'missing', recoverable: false } };
      const next = { ...existing, status: input.status ?? existing.status, currentTaskId: input.currentTaskId === undefined ? existing.currentTaskId : input.currentTaskId ?? undefined, updatedAt: Date.now(), lastHeartbeatAt: Date.now() };
      records.set(input.agentId, next);
      return ok(next);
    },
    async disconnectAgent(input): Promise<Result<AgentSummary>> {
      const existing = records.get(input.agentId);
      if (existing === undefined) return { ok: false, error: { code: 'AGENT_NOT_FOUND', message: 'missing', recoverable: false } };
      const next = { ...existing, sessionId: undefined, status: 'offline' as const, currentTaskId: undefined, updatedAt: Date.now() };
      records.set(input.agentId, next);
      return ok(next);
    },
  } as unknown as AgentBusRepository;
}
