import { describe, expect, it } from 'vitest';
import { ok } from '@rvn/domain';
import type { AgentBusRepository } from '@rvn/storage';
import { ToolRegistry } from '../tool-registry.js';

describe('Agent Bus MCP tools', () => {
  it('advertises and routes the durable coordination tools when the host provides Agent Bus', async () => {
    const calls: string[] = [];
    const bus = {
      async registerAgent(input) { calls.push(`register:${input.agentId}`); return ok({ agentId: input.agentId, role: input.role, status: 'online', capabilities: input.capabilities, lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 }); },
      async getAgent() { return ok({ agentId: 'agent-1', role: 'Main', sessionId: 'session-a', status: 'online', capabilities: ['planning'], currentTaskId: null, lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 }); },
      async listAgents() { calls.push('agents'); return ok([]); },
      async heartbeatAgent(input) { calls.push(`heartbeat:${input.agentId}`); return ok({ agentId: input.agentId, role: 'Code', status: 'busy', capabilities: [], lastHeartbeatAt: 2, createdAt: 1, updatedAt: 2 }); },
      async createTask() { calls.push('create'); return ok({ taskId: 'task-1', title: 'x', objective: 'x', status: 'queued', priority: 1, createdByAgentId: 'agent-1', acceptanceCriteria: [], fileScope: [], dependencies: [], readOnly: true, createdAt: 1, updatedAt: 1 }); },
      async getTask(input) { calls.push(`task-get:${input.taskId}`); return ok({ taskId: input.taskId, title: 'x', objective: 'x', status: 'queued', priority: 1, ownerAgentId: null, createdByAgentId: 'agent-1', acceptanceCriteria: [], fileScope: [], dependencies: [], readOnly: true, progress: null, result: null, createdAt: 1, updatedAt: 1, startedAt: null, completedAt: null }); },
      async listTasks() { calls.push('list'); return ok([]); },
      async claimTask() { calls.push('claim'); return ok({ taskId: 'task-1', title: 'x', objective: 'x', status: 'running', priority: 1, ownerAgentId: 'agent-1', createdByAgentId: 'agent-1', acceptanceCriteria: [], fileScope: [], dependencies: [], readOnly: true, createdAt: 1, updatedAt: 1 }); },
      async updateTask() { calls.push('update'); return ok({ taskId: 'task-1', title: 'x', objective: 'x', status: 'review', priority: 1, ownerAgentId: 'agent-1', createdByAgentId: 'agent-1', acceptanceCriteria: [], fileScope: [], dependencies: [], readOnly: true, createdAt: 1, updatedAt: 1 }); },
      async completeTask() { calls.push('complete'); return ok({ taskId: 'task-1', title: 'x', objective: 'x', status: 'completed', priority: 1, ownerAgentId: 'agent-1', createdByAgentId: 'agent-1', acceptanceCriteria: [], fileScope: [], dependencies: [], readOnly: true, createdAt: 1, updatedAt: 1 }); },
      async sendMessage() { calls.push('send'); return ok({ sequence: 1, messageId: 'message-1', fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'UPDATE', body: 'hello', metadata: {}, createdAt: 1 }); },
      async messageInbox() { calls.push('inbox'); return ok({ messages: [], nextSequence: 0 }); },
      async acknowledgeMessage(input) { calls.push(`ack:${input.messageId ?? input.sequence}`); return ok({ sequence: input.sequence ?? 1, messageId: input.messageId ?? 'message-1', fromAgentId: 'agent-1', toAgentId: 'agent-2', type: 'UPDATE', body: 'hello', metadata: {}, createdAt: 1, acknowledgedAt: 2 }); },
      async listEvents() { calls.push('events'); return ok({ events: [], nextSequence: 0 }); },
      async getSnapshot() { calls.push('snapshot'); return ok({ agents: { online: 1, busy: 0, idle: 0, blocked: 0, offline: 0 }, tasks: { queued: 0, assigned: 0, running: 0, blocked: 0, review: 0, completed: 0, failed: 0, cancelled: 0 }, latestMessageSequence: 0, latestEventSequence: 0, activeTasks: [], persistence: { backend: 'sqlite', durable: true, journalMode: 'WAL' } }); },
      async acquireLock(input) { calls.push(`lock-acquire:${input.resource}`); return ok({ resource: input.resource, lockType: input.lockType, ownerAgentId: input.agentId, taskId: null, expiresAt: 2, createdAt: 1, updatedAt: 1 }); },
      async releaseLock(input) { calls.push(`lock-release:${input.resource}`); return ok({ resource: input.resource, lockType: 'file', ownerAgentId: input.agentId, taskId: null, expiresAt: 2, createdAt: 1, updatedAt: 1 }); },
      async listLocks() { calls.push('locks'); return ok([]); },
      async addArtifact(input) { calls.push(`artifact-add:${input.pathOrReference}`); return ok({ artifactId: 'artifact-1', taskId: input.taskId ?? null, agentId: input.agentId, type: input.type, pathOrReference: input.pathOrReference, sha256: null, metadata: {}, createdAt: 1 }); },
      async getArtifact(input) { calls.push(`artifact-get:${input.artifactId}`); return ok({ artifactId: input.artifactId, taskId: null, agentId: 'agent-1', type: 'test_report', pathOrReference: 'report.json', sha256: null, metadata: {}, createdAt: 1 }); },
      async listArtifacts() { calls.push('artifacts'); return ok([]); },
      async allocateWorktree(input) { calls.push(`worktree-allocate:${input.taskId}`); return ok({ worktreeId: 'worktree-1', workspaceId: input.workspaceId, taskId: input.taskId, agentId: input.agentId, branchName: `agent/${input.agentId}/${input.taskId}`, worktreePath: `.worktrees/${input.agentId}/${input.taskId}`, baseRef: input.baseRef ?? 'HEAD', status: 'allocated', createdAt: 1, updatedAt: 1, releasedAt: null }); },
      async releaseWorktree(input) { calls.push(`worktree-release:${input.worktreeId}`); return ok({ worktreeId: input.worktreeId, workspaceId: 'workspace-1', taskId: 'task-1', agentId: input.agentId, branchName: 'agent/agent-1/task-1', worktreePath: '.worktrees/agent-1/task-1', baseRef: 'HEAD', status: 'released', createdAt: 1, updatedAt: 2, releasedAt: 2 }); },
      async listWorktrees() { calls.push('worktrees'); return ok([]); },
    } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus }, { clientId: 'client-1', clientName: 'test' });
    const agentBusNames = new Set(['agent_register', 'agent_get', 'agent_list', 'agent_heartbeat', 'task_create', 'task_get', 'task_list', 'task_claim', 'task_update', 'task_complete', 'message_send', 'message_inbox', 'message_ack', 'event_list', 'bus_snapshot', 'lock_acquire', 'lock_release', 'lock_list', 'artifact_add', 'artifact_get', 'artifact_list', 'worktree_allocate', 'worktree_release', 'worktree_list']);
    expect(registry.list().map((tool) => tool.name).filter((name) => agentBusNames.has(name))).toEqual([
      'agent_register', 'agent_get', 'agent_heartbeat', 'agent_list', 'task_create', 'task_get', 'task_list', 'task_claim', 'task_update', 'task_complete', 'message_send', 'message_inbox', 'message_ack', 'event_list', 'bus_snapshot', 'lock_acquire', 'lock_release', 'lock_list', 'artifact_add', 'artifact_get', 'artifact_list', 'worktree_allocate', 'worktree_release', 'worktree_list',
    ]);
    expect(registry.list().find((tool) => tool.name === 'task_list')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registry.list().find((tool) => tool.name === 'agent_get')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    await expect(registry.invoke('agent_register', { agent_id: 'agent-1', role: 'Main', capabilities: [] })).resolves.toMatchObject({ structuredContent: { agentId: 'agent-1' } });
    await expect(registry.invoke('agent_get', { agent_id: 'agent-1' })).resolves.toMatchObject({ structuredContent: { agentId: 'agent-1', sessionId: 'session-a', currentTaskId: null } });
    await expect(registry.invoke('agent_list', { limit: 10 })).resolves.toMatchObject({ structuredContent: { value: [] } });
    await expect(registry.invoke('task_get', { task_id: 'task-1' })).resolves.toMatchObject({ structuredContent: { taskId: 'task-1', ownerAgentId: null, progress: null, result: null, startedAt: null, completedAt: null } });
    await expect(registry.invoke('message_ack', { agent_id: 'agent-2', message_id: 'message-1' })).resolves.toMatchObject({ structuredContent: { messageId: 'message-1', acknowledgedAt: 2 } });
    await expect(registry.invoke('message_ack', { agent_id: 'agent-2' })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } });
    await expect(registry.invoke('event_list', { after_sequence: 0, limit: 10 })).resolves.toMatchObject({ structuredContent: { events: [], nextSequence: 0 } });
    await expect(registry.invoke('bus_snapshot', {})).resolves.toMatchObject({ structuredContent: { persistence: { backend: 'sqlite', durable: true, journalMode: 'WAL' } } });
    await expect(registry.invoke('lock_acquire', { agent_id: 'agent-1', resource: 'src/shared.ts', lock_type: 'file', ttl_seconds: 60 })).resolves.toMatchObject({ structuredContent: { resource: 'src/shared.ts', ownerAgentId: 'agent-1' } });
    await expect(registry.invoke('lock_release', { agent_id: 'agent-1', resource: 'src/shared.ts' })).resolves.toMatchObject({ structuredContent: { resource: 'src/shared.ts' } });
    await expect(registry.invoke('lock_list', { limit: 10 })).resolves.toMatchObject({ structuredContent: { value: [] } });
    await expect(registry.invoke('artifact_add', { agent_id: 'agent-1', task_id: 'task-1', type: 'test_report', path_or_reference: 'report.json' })).resolves.toMatchObject({ structuredContent: { artifactId: 'artifact-1' } });
    await expect(registry.invoke('artifact_add', { agent_id: 'agent-1', type: 'test_report', path_or_reference: 'report.json', metadata: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`field-${index}`, true])) })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } });
    await expect(registry.invoke('artifact_get', { artifact_id: 'artifact-1' })).resolves.toMatchObject({ structuredContent: { artifactId: 'artifact-1' } });
    await expect(registry.invoke('artifact_list', { limit: 10 })).resolves.toMatchObject({ structuredContent: { value: [] } });
    await expect(registry.invoke('worktree_allocate', { agent_id: 'agent-1', task_id: 'task-1', workspace_id: 'workspace-1' })).resolves.toMatchObject({ structuredContent: { worktreeId: 'worktree-1', branchName: 'agent/agent-1/task-1' } });
    await expect(registry.invoke('worktree_release', { agent_id: 'agent-1', worktree_id: 'worktree-1' })).resolves.toMatchObject({ structuredContent: { worktreeId: 'worktree-1', status: 'released' } });
    await expect(registry.invoke('worktree_list', { workspace_id: 'workspace-1', limit: 10 })).resolves.toMatchObject({ structuredContent: { value: [] } });
    await expect(registry.invoke('task_get', { task_id: 'x'.repeat(129) })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } });
    await expect(registry.invoke('agent_get', { agent_id: 'x'.repeat(129) })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } });
    expect(calls).toEqual(['register:agent-1', 'agents', 'task-get:task-1', 'ack:message-1', 'events', 'snapshot', 'lock-acquire:src/shared.ts', 'lock-release:src/shared.ts', 'locks', 'artifact-add:report.json', 'artifact-get:artifact-1', 'artifacts', 'worktree-allocate:task-1', 'worktree-release:worktree-1', 'worktrees']);
  });

  it('does not advertise Agent Bus tools when the host has no durable bus', () => {
    const registry = new ToolRegistry({}, { clientId: 'client-1', clientName: 'test' });
    expect(registry.list().some((tool) => tool.name === 'agent_register')).toBe(false);
  });

  it('advertises and routes the shared room contract with bounded cursors and no-bus compatibility', async () => {
    const calls: string[] = [];
    const bus = {
      async createRoom(input) { calls.push(`create-room:${input.name}`); return ok({ roomId: 'room-1', name: input.name, createdByAgentId: input.createdByAgentId ?? null, createdAt: 1, updatedAt: 1 }); },
      async joinRoom(input) { calls.push(`join-room:${input.agentId}`); return ok({ roomId: input.roomId, agentId: input.agentId, role: 'code', status: 'online', joinedAt: 1, leftAt: null }); },
      async leaveRoom(input) { calls.push(`leave-room:${input.agentId}`); return ok({ roomId: input.roomId, agentId: input.agentId, role: 'code', status: 'offline', joinedAt: 1, leftAt: 2 }); },
      async sendRoomMessage(input) { calls.push(`send-room:${input.target ?? '@all'}`); return ok({ sequence: 1, messageId: 'room-message-1', roomId: input.roomId, fromAgentId: input.fromAgentId ?? 'user', target: input.target ?? '@all', targetAgentIds: ['agent-1'], type: input.type, body: input.body, metadata: {}, createdAt: 1 }); },
      async roomInbox(input) { calls.push(`room-inbox:${input.agentId}`); return ok({ messages: [], nextSequence: input.afterSequence }); },
      async roomHistory(input) { calls.push(`room-history:${input.roomId}`); return ok([]); },
      async roomParticipants(input) { calls.push(`room-participants:${input.roomId}`); return ok([]); },
      async roomSnapshot(input) { calls.push(`room-snapshot:${input.roomId}`); return ok({ roomId: input.roomId, name: 'room', participants: [], latestSequence: 0 }); },
      async acknowledgeRoomMessage(input) { calls.push(`room-ack:${input.messageId ?? input.sequence}`); return ok({ sequence: input.sequence ?? 1, messageId: input.messageId ?? 'room-message-1', roomId: input.roomId, agentId: input.agentId, acknowledgedAt: 2 }); },
    } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus }, { clientId: 'client-1', clientName: 'test' });
    const roomNames = ['room_create', 'room_join', 'room_leave', 'room_send', 'room_inbox', 'room_history', 'room_participants', 'room_snapshot', 'room_ack'];
    expect(registry.list().map((tool) => tool.name).filter((name) => roomNames.includes(name))).toEqual(roomNames);
    expect(registry.list().find((tool) => tool.name === 'room_inbox')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registry.list().find((tool) => tool.name === 'room_send')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    await expect(registry.invoke('room_create', { name: 'Team', created_by_agent_id: 'agent-1', participant_agent_ids: [] })).resolves.toMatchObject({ structuredContent: { roomId: 'room-1' } });
    await expect(registry.invoke('room_send', { room_id: 'room-1', target: '@code', type: 'UPDATE', body: 'hello' })).resolves.toMatchObject({ structuredContent: { messageId: 'room-message-1', target: '@code' } });
    await expect(registry.invoke('room_inbox', { room_id: 'room-1', agent_id: 'agent-1', after_sequence: 0, limit: 10 })).resolves.toMatchObject({ structuredContent: { messages: [], nextSequence: 0 } });
    await expect(registry.invoke('room_send', { room_id: 'room-1', target: '@x'.repeat(65), type: 'UPDATE', body: 'invalid target' })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } });
    expect(calls).toEqual(['create-room:Team', 'send-room:@code', 'room-inbox:agent-1']);
    expect(new ToolRegistry({}, { clientId: 'client-1', clientName: 'test' }).list().some((tool) => roomNames.includes(tool.name))).toBe(false);
  });
});
