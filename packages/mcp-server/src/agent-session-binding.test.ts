import { describe, expect, it } from 'vitest';
import { ok } from '@rvn/domain';
import type { AgentBusRepository } from '@rvn/storage';
import { ToolRegistry } from './tool-registry.js';

const agentRecord = {
  agentId: 'worker-a',
  role: 'code',
  sessionId: 'http-session-a',
  status: 'online' as const,
  capabilities: [],
  currentTaskId: null,
  lastHeartbeatAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe('Agent Bus MCP protocol session binding', () => {
  it('rejects Agent Bus ownership operations from a different protocol session', async () => {
    const calls: string[] = [];
    const bus = {
      async getAgent() { return ok(agentRecord); },
      async claimTask() { calls.push('claim'); return ok({ taskId: 'task-1' }); },
    } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus }, {
      clientId: 'desktop-mcp-http',
      clientName: 'desktop',
      sessionId: 'http-session-b',
    });

    await expect(registry.invoke('task_claim', { agent_id: 'worker-a', task_id: 'task-1' })).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'AGENT_SESSION_MISMATCH' } },
    });
    expect(calls).toEqual([]);
  });

  it('allows the bound protocol session to perform the ownership operation', async () => {
    const calls: string[] = [];
    const bus = {
      async getAgent() { return ok(agentRecord); },
      async claimTask() { calls.push('claim'); return ok({ taskId: 'task-1' }); },
    } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus }, {
      clientId: 'desktop-mcp-http',
      clientName: 'desktop',
      sessionId: 'http-session-a',
    });

    await expect(registry.invoke('task_claim', { agent_id: 'worker-a', task_id: 'task-1' })).resolves.toMatchObject({
      structuredContent: { taskId: 'task-1' },
    });
    expect(calls).toEqual(['claim']);
  });

  it('uses the server protocol session instead of a client-supplied session id when registering', async () => {
    let registeredSessionId: string | undefined;
    const bus = {
      async registerAgent(input) {
        registeredSessionId = input.sessionId;
        return ok({ ...agentRecord, agentId: input.agentId, role: input.role, capabilities: input.capabilities, sessionId: input.sessionId ?? null });
      },
    } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus }, {
      clientId: 'desktop-mcp-http',
      clientName: 'desktop',
      sessionId: 'http-session-b',
    });

    await expect(registry.invoke('agent_register', {
      agent_id: 'worker-a',
      role: 'code',
      session_id: 'spoofed-client-session',
      capabilities: [],
    })).resolves.toMatchObject({ structuredContent: { agentId: 'worker-a', sessionId: 'http-session-b' } });
    expect(registeredSessionId).toBe('http-session-b');
  });

  it('routes registration and heartbeat through the session manager when configured', async () => {
    const calls: string[] = [];
    const bus = {
      async getAgent() { return ok({ ...agentRecord, sessionId: 'http-session-b' }); },
    } as unknown as AgentBusRepository;
    const manager = {
      async bind(input: { agentId: string; role: string; sessionId: string; transport: string; capabilities: readonly string[] }) {
        calls.push(`bind:${input.agentId}:${input.sessionId}:${input.transport}`);
        return ok({ ...agentRecord, agentId: input.agentId, role: input.role, sessionId: input.sessionId, capabilities: input.capabilities });
      },
      async heartbeat(input: { agentId: string; sessionId: string }) {
        calls.push(`heartbeat:${input.agentId}:${input.sessionId}`);
        return ok(agentRecord);
      },
    } as never;
    const registry = new ToolRegistry({ agentBus: bus, agentSessions: manager }, {
      clientId: 'desktop-mcp-http',
      clientName: 'desktop',
      sessionId: 'http-session-b',
      sessionTransport: 'http',
    });

    await expect(registry.invoke('agent_register', { agent_id: 'worker-a', role: 'code', capabilities: [] })).resolves.toMatchObject({ structuredContent: { agentId: 'worker-a', sessionId: 'http-session-b' } });
    await expect(registry.invoke('agent_heartbeat', { agent_id: 'worker-a', status: 'busy' })).resolves.toMatchObject({ structuredContent: { agentId: 'worker-a' } });
    expect(calls).toEqual(['bind:worker-a:http-session-b:http', 'heartbeat:worker-a:http-session-b']);
  });
});
