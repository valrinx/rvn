import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteDatabase } from './database.js';
import { SqliteAgentBusRepository } from './agent-bus-repository.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SqliteAgentBusRepository', () => {
  it('allocates isolated deterministic worktrees with durable ownership and safe release', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-worktrees-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const firstDatabase = new SqliteDatabase(filename);
    const secondDatabase = new SqliteDatabase(filename);
    const first = new SqliteAgentBusRepository(firstDatabase);
    const second = new SqliteAgentBusRepository(secondDatabase);
    await first.registerAgent({ agentId: 'agent-main', role: 'main', capabilities: [] });
    await first.registerAgent({ agentId: 'code-a', role: 'code', capabilities: ['git_worktree'] });
    await first.registerAgent({ agentId: 'code-b', role: 'code', capabilities: ['git_worktree'] });
    const taskA = await first.createTask({ createdByAgentId: 'agent-main', title: 'A', objective: 'A', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: false });
    const taskB = await first.createTask({ createdByAgentId: 'agent-main', title: 'B', objective: 'B', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: false });
    expect(taskA.ok && taskB.ok).toBe(true);
    if (!taskA.ok || !taskB.ok) throw new Error('task creation failed');
    await first.claimTask({ agentId: 'code-a', taskId: taskA.value.taskId });
    await first.claimTask({ agentId: 'code-b', taskId: taskB.value.taskId });
    const allocate = (first as unknown as { allocateWorktree?: (input: { agentId: string; taskId: string; workspaceId: string; baseRef?: string; worktreePath?: string }) => Promise<unknown> }).allocateWorktree;
    if (typeof allocate !== 'function') {
      firstDatabase.close();
      secondDatabase.close();
      expect(allocate).toBeTypeOf('function');
      return;
    }
    const [allocatedA, allocatedB] = await Promise.all([
      first.allocateWorktree({ agentId: 'code-a', taskId: taskA.value.taskId, workspaceId: 'workspace-1', baseRef: 'HEAD' }),
      second.allocateWorktree({ agentId: 'code-b', taskId: taskB.value.taskId, workspaceId: 'workspace-1', baseRef: 'HEAD' }),
    ]);
    expect(allocatedA).toMatchObject({ ok: true, value: { agentId: 'code-a', taskId: taskA.value.taskId, branchName: `agent/code-a/${taskA.value.taskId}`, worktreePath: `.worktrees/code-a/${taskA.value.taskId}`, status: 'allocated' } });
    expect(allocatedB).toMatchObject({ ok: true, value: { agentId: 'code-b', taskId: taskB.value.taskId, branchName: `agent/code-b/${taskB.value.taskId}`, worktreePath: `.worktrees/code-b/${taskB.value.taskId}`, status: 'allocated' } });
    await expect(second.allocateWorktree({ agentId: 'code-b', taskId: taskB.value.taskId, workspaceId: 'workspace-1', worktreePath: `.worktrees/code-a/${taskA.value.taskId}` })).resolves.toMatchObject({ ok: false, error: { code: 'WORKTREE_CONFLICT' } });
    await expect(first.releaseWorktree({ agentId: 'code-b', worktreeId: (allocatedA as { ok: true; value: { worktreeId: string } }).value.worktreeId })).resolves.toMatchObject({ ok: false, error: { code: 'WORKTREE_SCOPE_VIOLATION' } });
    const worktreeId = (allocatedA as { ok: true; value: { worktreeId: string } }).value.worktreeId;
    await expect(first.releaseWorktree({ agentId: 'code-a', worktreeId })).resolves.toMatchObject({ ok: true, value: { status: 'released', worktreeId } });
    await expect(second.listWorktrees({ workspaceId: 'workspace-1', includeReleased: false, limit: 10 })).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ worktreeId: expect.any(String), agentId: 'code-b', status: 'allocated' })] });
    firstDatabase.close();
    secondDatabase.close();
    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.listWorktrees({ workspaceId: 'workspace-1', includeReleased: true, limit: 10 })).resolves.toMatchObject({ ok: true, value: expect.arrayContaining([
      expect.objectContaining({ worktreeId, status: 'released', agentId: 'code-a' }),
      expect.objectContaining({ agentId: 'code-b', status: 'allocated' }),
    ]) });
    await expect(reconnectRepository.listEvents({ afterSequence: 0, limit: 200 })).resolves.toMatchObject({ ok: true, value: { events: expect.arrayContaining([
      expect.objectContaining({ eventType: 'WORKTREE_ALLOCATED', agentId: 'code-a', taskId: taskA.value.taskId }),
      expect.objectContaining({ eventType: 'WORKTREE_RELEASED', agentId: 'code-a', taskId: taskA.value.taskId }),
    ]) } });
    reconnectDatabase.close();
  }, 30_000);

  it('persists artifact references and supports durable lookup/list filters', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-artifacts-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'main', capabilities: [] });
    const task = await repository.createTask({ createdByAgentId: 'agent-main', title: 'Artifact task', objective: 'Track a test report', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: true });
    expect(task.ok).toBe(true);
    if (!task.ok) throw new Error('task creation failed');
    const addArtifact = (repository as unknown as { addArtifact?: (input: { agentId: string; taskId?: string; type: 'test_report'; pathOrReference: string; sha256?: string; metadata?: Readonly<Record<string, unknown>> }) => Promise<unknown> }).addArtifact;
    if (typeof addArtifact !== 'function') {
      database.close();
      expect(addArtifact).toBeTypeOf('function');
      return;
    }
    const added = await addArtifact.call(repository, { agentId: 'agent-main', taskId: task.value.taskId, type: 'test_report', pathOrReference: 'artifacts/test-report.json', sha256: 'abc123', metadata: { command: 'targeted' } });
    expect(added).toMatchObject({ ok: true, value: { artifactId: expect.any(String), taskId: task.value.taskId, agentId: 'agent-main', type: 'test_report', pathOrReference: 'artifacts/test-report.json', sha256: 'abc123', metadata: { command: 'targeted' }, createdAt: expect.any(Number) } });
    if (!('ok' in added) || added.ok !== true) throw new Error('artifact add failed');
    await expect(repository.getArtifact({ artifactId: added.value.artifactId })).resolves.toMatchObject({ ok: true, value: { artifactId: added.value.artifactId, taskId: task.value.taskId } });
    await expect(repository.listArtifacts({ taskId: task.value.taskId, limit: 10 })).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ artifactId: added.value.artifactId })] });
    await expect(repository.getArtifact({ artifactId: 'missing-artifact' })).resolves.toMatchObject({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND' } });
    database.close();
    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.listArtifacts({ agentId: 'agent-main', limit: 10 })).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ pathOrReference: 'artifacts/test-report.json', sha256: 'abc123' })] });
    await expect(reconnectRepository.listEvents({ afterSequence: 0, limit: 100 })).resolves.toMatchObject({ ok: true, value: { events: expect.arrayContaining([expect.objectContaining({ eventType: 'ARTIFACT_ADDED', taskId: task.value.taskId, agentId: 'agent-main' })]) } });
    reconnectDatabase.close();
  });

  it('enforces atomic durable locks with owner release, Main force release, TTL reclaim, and reconnect', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-locks-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const firstDatabase = new SqliteDatabase(filename);
    const secondDatabase = new SqliteDatabase(filename);
    const first = new SqliteAgentBusRepository(firstDatabase);
    const second = new SqliteAgentBusRepository(secondDatabase);
    await first.registerAgent({ agentId: 'agent-main', role: 'main', capabilities: [] });
    await first.registerAgent({ agentId: 'agent-a', role: 'code', capabilities: [] });
    await first.registerAgent({ agentId: 'agent-b', role: 'code', capabilities: [] });
    const acquire = (first as unknown as { acquireLock?: (input: { agentId: string; resource: string; lockType: 'file'; ttlSeconds: number }) => Promise<unknown> }).acquireLock;
    if (typeof acquire !== 'function') {
      firstDatabase.close();
      secondDatabase.close();
      expect(acquire).toBeTypeOf('function');
      return;
    }
    const [claimed, rejected] = await Promise.all([
      first.acquireLock({ agentId: 'agent-a', resource: 'src/shared.ts', lockType: 'file', ttlSeconds: 60 }),
      second.acquireLock({ agentId: 'agent-b', resource: 'src/shared.ts', lockType: 'file', ttlSeconds: 60 }),
    ]);
    expect([claimed, rejected].filter((result) => result.ok)).toHaveLength(1);
    expect([claimed, rejected].find((result) => !result.ok)).toMatchObject({ ok: false, error: { code: 'LOCK_CONFLICT' } });
    await expect(first.releaseLock({ agentId: 'agent-b', resource: 'src/shared.ts' })).resolves.toMatchObject({ ok: false, error: { code: 'LOCK_SCOPE_VIOLATION' } });
    await expect(first.releaseLock({ agentId: 'agent-a', resource: 'src/shared.ts' })).resolves.toMatchObject({ ok: true, value: { resource: 'src/shared.ts' } });
    await expect(second.acquireLock({ agentId: 'agent-b', resource: 'src/shared.ts', lockType: 'file', ttlSeconds: 1 })).resolves.toMatchObject({ ok: true, value: { ownerAgentId: 'agent-b' } });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(first.acquireLock({ agentId: 'agent-a', resource: 'src/shared.ts', lockType: 'file', ttlSeconds: 60 })).resolves.toMatchObject({ ok: true, value: { ownerAgentId: 'agent-a' } });
    await expect(first.listEvents({ afterSequence: 0, limit: 100 })).resolves.toMatchObject({ ok: true, value: { events: expect.arrayContaining([
      expect.objectContaining({ eventType: 'LOCK_ACQUIRED', agentId: 'agent-a' }),
      expect.objectContaining({ eventType: 'LOCK_RELEASED' }),
    ]) } });
    await expect(first.releaseLock({ agentId: 'agent-main', resource: 'src/shared.ts', force: true })).resolves.toMatchObject({ ok: true, value: { resource: 'src/shared.ts' } });
    await expect(second.listLocks({ limit: 10 })).resolves.toMatchObject({ ok: true, value: [] });
    firstDatabase.close();
    secondDatabase.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.listLocks({ limit: 10 })).resolves.toMatchObject({ ok: true, value: [] });
    reconnectDatabase.close();
  });

  it('returns a compact durable bus snapshot with counts, cursors, and active tasks', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-snapshot-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'Main', capabilities: [] });
    await repository.registerAgent({ agentId: 'agent-worker', role: 'Worker', capabilities: [] });
    const created = await repository.createTask({ createdByAgentId: 'agent-main', title: 'Snapshot task', objective: 'Keep this task visible', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 60, readOnly: true });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('task creation failed');
    await expect(repository.claimTask({ agentId: 'agent-worker', taskId: created.value.taskId })).resolves.toMatchObject({ ok: true });
    const sent = await repository.sendMessage({ fromAgentId: 'agent-main', toAgentId: 'agent-worker', taskId: created.value.taskId, type: 'TASK', body: 'start' });
    expect(sent.ok).toBe(true);

    const snapshot = await repository.getSnapshot();
    expect(snapshot).toMatchObject({
      ok: true,
      value: {
        agents: { online: 1, busy: 1, idle: 0, blocked: 0, offline: 0 },
        tasks: expect.objectContaining({ queued: 0, running: 1 }),
        latestMessageSequence: expect.any(Number),
        latestEventSequence: expect.any(Number),
        activeTasks: [expect.objectContaining({ taskId: created.value.taskId, status: 'running' })],
        persistence: { backend: 'sqlite', durable: true, journalMode: 'WAL' },
      },
    });
    database.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.getSnapshot()).resolves.toMatchObject({ ok: true, value: { activeTasks: [expect.objectContaining({ taskId: created.value.taskId, status: 'running' })], latestMessageSequence: sent.ok ? sent.value.sequence : expect.any(Number) } });
    reconnectDatabase.close();
  });

  it('persists monotonic event history with bounded cursors and filters', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-events-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'Main', capabilities: [] });
    await repository.registerAgent({ agentId: 'agent-worker', role: 'Worker', capabilities: [] });
    await repository.heartbeatAgent({ agentId: 'agent-worker', status: 'idle' });
    const created = await repository.createTask({ createdByAgentId: 'agent-main', title: 'Event task', objective: 'Exercise event history', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: true });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('task creation failed');
    await expect(repository.claimTask({ agentId: 'agent-worker', taskId: created.value.taskId })).resolves.toMatchObject({ ok: true });
    await expect(repository.updateTask({ agentId: 'agent-worker', taskId: created.value.taskId, progress: 'halfway' })).resolves.toMatchObject({ ok: true });
    const sent = await repository.sendMessage({ fromAgentId: 'agent-main', toAgentId: 'agent-worker', taskId: created.value.taskId, type: 'UPDATE', body: 'halfway' });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error('message send failed');
    await expect(repository.acknowledgeMessage({ agentId: 'agent-worker', messageId: sent.value.messageId })).resolves.toMatchObject({ ok: true });
    await expect(repository.completeTask({ agentId: 'agent-worker', taskId: created.value.taskId, result: { passed: true } })).resolves.toMatchObject({ ok: true });

    const history = await repository.listEvents({ afterSequence: 0, limit: 100 });
    expect(history).toMatchObject({ ok: true, value: { events: expect.arrayContaining([
      expect.objectContaining({ eventType: 'AGENT_REGISTERED' }),
      expect.objectContaining({ eventType: 'AGENT_HEARTBEAT' }),
      expect.objectContaining({ eventType: 'TASK_CREATED', taskId: created.value.taskId }),
      expect.objectContaining({ eventType: 'TASK_CLAIMED', taskId: created.value.taskId, agentId: 'agent-worker' }),
      expect.objectContaining({ eventType: 'TASK_UPDATED', taskId: created.value.taskId }),
      expect.objectContaining({ eventType: 'MESSAGE_SENT', taskId: created.value.taskId }),
      expect.objectContaining({ eventType: 'MESSAGE_ACKNOWLEDGED', taskId: created.value.taskId }),
      expect.objectContaining({ eventType: 'TASK_COMPLETED', taskId: created.value.taskId }),
    ]) } });
    if (!('ok' in history) || history.ok !== true) throw new Error('event history failed');
    const events = history.value.events as readonly { sequence: number }[];
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(events.map((event) => event.sequence)).toEqual([...events].sort((a, b) => a.sequence - b.sequence).map((event) => event.sequence));
    expect(history.value.nextSequence).toBe(events.at(-1)?.sequence);
    await expect(repository.listEvents({ afterSequence: events[0].sequence, limit: 2, taskId: created.value.taskId })).resolves.toMatchObject({ ok: true, value: { events: expect.any(Array), nextSequence: expect.any(Number) } });
    database.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.listEvents({ afterSequence: 0, limit: 100 })).resolves.toMatchObject({ ok: true, value: { events: expect.arrayContaining([expect.objectContaining({ eventType: 'TASK_COMPLETED', taskId: created.value.taskId })]) } });
    reconnectDatabase.close();
  });

  it('lists durable messages with their message sequence rather than event sequence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-message-list-'));
    temporaryRoots.push(root);
    const database = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'message-main', role: 'main', capabilities: [] });
    await repository.registerAgent({ agentId: 'message-worker', role: 'code', capabilities: [] });
    const sent = await repository.sendMessage({ fromAgentId: 'message-main', toAgentId: 'message-worker', type: 'UPDATE', body: 'message sequence' });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error('message send failed');
    const messages = await repository.listMessages({ afterSequence: 0, limit: 10 });
    expect(messages).toMatchObject({ ok: true, value: [expect.objectContaining({ messageId: sent.value.messageId, sequence: sent.value.sequence })] });
    const events = await repository.listEvents({ afterSequence: 0, limit: 20 });
    expect(events).toMatchObject({ ok: true, value: { events: expect.arrayContaining([expect.objectContaining({ eventType: 'MESSAGE_SENT' })] ) } });
    if (!events.ok) throw new Error('event list failed');
    const messageEvent = events.value.events.find((event) => event.eventType === 'MESSAGE_SENT');
    expect(messageEvent?.sequence).not.toBe(sent.value.sequence);
    database.close();
  });

  it('acknowledges a message durably and idempotently for its recipient only', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-ack-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'Main', capabilities: [] });
    await repository.registerAgent({ agentId: 'agent-worker', role: 'Worker', capabilities: [] });
    const sent = await repository.sendMessage({ fromAgentId: 'agent-main', toAgentId: 'agent-worker', type: 'UPDATE', body: 'progress' });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error('message send failed');
    const acknowledged = await repository.acknowledgeMessage({ agentId: 'agent-worker', messageId: sent.value.messageId });
    expect(acknowledged).toMatchObject({ ok: true, value: { messageId: sent.value.messageId, acknowledgedAt: expect.any(Number) } });
    if (!acknowledged.ok) throw new Error('message acknowledgement failed');
    const acknowledgedAt = acknowledged.value.acknowledgedAt;
    await expect(repository.acknowledgeMessage({ agentId: 'agent-worker', sequence: sent.value.sequence })).resolves.toMatchObject({ ok: true, value: { messageId: sent.value.messageId, acknowledgedAt } });
    await expect(repository.acknowledgeMessage({ agentId: 'agent-main', messageId: sent.value.messageId })).resolves.toMatchObject({ ok: false, error: { code: 'MESSAGE_SCOPE_VIOLATION' } });
    database.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.messageInbox({ agentId: 'agent-worker', afterSequence: 0, limit: 10 })).resolves.toMatchObject({ ok: true, value: { messages: [expect.objectContaining({ messageId: sent.value.messageId, acknowledgedAt })] } });
    await expect(reconnectRepository.acknowledgeMessage({ agentId: 'agent-worker', messageId: 'missing-message' })).resolves.toMatchObject({ ok: false, error: { code: 'MESSAGE_NOT_FOUND' } });
    reconnectDatabase.close();
  });

  it('returns a durable task record with consistent nullable fields and a not-found result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-task-get-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'Main', capabilities: [] });
    const created = await repository.createTask({
      createdByAgentId: 'agent-main',
      title: 'Lookup task',
      objective: 'Read this task after reconnect',
      acceptanceCriteria: ['The complete record is returned'],
      fileScope: ['packages/storage'],
      dependencies: [],
      priority: 70,
      readOnly: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('task creation failed');
    database.close();
    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.getTask({ taskId: created.value.taskId })).resolves.toMatchObject({
      ok: true,
      value: {
        taskId: created.value.taskId,
        title: 'Lookup task',
        objective: 'Read this task after reconnect',
        status: 'queued',
        priority: 70,
        ownerAgentId: null,
        createdByAgentId: 'agent-main',
        acceptanceCriteria: ['The complete record is returned'],
        fileScope: ['packages/storage'],
        dependencies: [],
        readOnly: true,
        progress: null,
        result: null,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        startedAt: null,
        completedAt: null,
      },
    });
    await expect(reconnectRepository.getTask({ taskId: 'missing-task' })).resolves.toMatchObject({ ok: false, error: { code: 'TASK_NOT_FOUND' } });
    reconnectDatabase.close();
  });

  it('returns a durable agent record and a structured not-found result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-get-'));
    temporaryRoots.push(root);
    const database = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-main', role: 'Main', sessionId: 'session-a', capabilities: ['planning'] });
    database.close();
    const reconnectDatabase = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);

    await expect(reconnectRepository.getAgent({ agentId: 'agent-main' })).resolves.toMatchObject({
      ok: true,
      value: {
        agentId: 'agent-main',
        role: 'Main',
        sessionId: 'session-a',
        status: 'online',
        capabilities: ['planning'],
        currentTaskId: null,
        lastHeartbeatAt: expect.any(Number),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    });
    await expect(reconnectRepository.getAgent({ agentId: 'missing-agent' })).resolves.toMatchObject({ ok: false, error: { code: 'AGENT_NOT_FOUND' } });
    reconnectDatabase.close();
  });

  it('persists agents, tasks, and messages across reconnects', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const firstDatabase = new SqliteDatabase(filename);
    const first = new SqliteAgentBusRepository(firstDatabase);

    await expect(first.registerAgent({ agentId: 'agent-main', role: 'Main', sessionId: 'session-a', capabilities: ['planning'] })).resolves.toMatchObject({ ok: true });
    const created = await first.createTask({
      createdByAgentId: 'agent-main',
      title: 'Durable task',
      objective: 'Persist this task',
      acceptanceCriteria: ['It is still listed after reconnect'],
      fileScope: ['packages/storage'],
      dependencies: [],
      priority: 80,
      readOnly: true,
    });
    expect(created).toMatchObject({ ok: true, value: { status: 'queued', title: 'Durable task' } });
    if (!created.ok) throw new Error('task creation failed');
    await expect(first.sendMessage({ fromAgentId: 'agent-main', toAgentId: 'agent-main', taskId: created.value.taskId, type: 'UPDATE', body: 'created' })).resolves.toMatchObject({ ok: true });
    firstDatabase.close();

    const secondDatabase = new SqliteDatabase(filename);
    const second = new SqliteAgentBusRepository(secondDatabase);
    await expect(second.listTasks({})).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ taskId: created.value.taskId, status: 'queued' })] });
    await expect(second.messageInbox({ agentId: 'agent-main', afterSequence: 0, limit: 10 })).resolves.toMatchObject({ ok: true, value: { messages: [expect.objectContaining({ body: 'created', taskId: created.value.taskId })] } });
    secondDatabase.close();
  });

  it('claims a task atomically so a second agent cannot claim it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-claim-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const firstDatabase = new SqliteDatabase(filename);
    const secondDatabase = new SqliteDatabase(filename);
    const first = new SqliteAgentBusRepository(firstDatabase);
    const second = new SqliteAgentBusRepository(secondDatabase);
    await first.registerAgent({ agentId: 'agent-a', role: 'Code', capabilities: [] });
    await first.registerAgent({ agentId: 'agent-b', role: 'Test', capabilities: [] });
    const created = await first.createTask({ createdByAgentId: 'agent-a', title: 'Claim me', objective: 'Only one owner', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: false });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('task creation failed');

    const [claimed, rejected] = await Promise.all([
      first.claimTask({ agentId: 'agent-a', taskId: created.value.taskId }),
      second.claimTask({ agentId: 'agent-b', taskId: created.value.taskId }),
    ]);
    expect([claimed, rejected].filter((result) => result.ok)).toHaveLength(1);
    expect([claimed, rejected].find((result) => !result.ok)).toMatchObject({ ok: false, error: { code: 'TASK_ALREADY_CLAIMED' } });
    firstDatabase.close();
    secondDatabase.close();
  });

  it('enforces task ownership and dependency readiness', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-rules-'));
    temporaryRoots.push(root);
    const database = new SqliteDatabase(path.join(root, 'rvn.sqlite'));
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'agent-a', role: 'Code', capabilities: [] });
    await repository.registerAgent({ agentId: 'agent-b', role: 'Review', capabilities: [] });
    const dependency = await repository.createTask({ createdByAgentId: 'agent-a', title: 'Dependency', objective: 'Complete first', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: false });
    expect(dependency.ok).toBe(true);
    if (!dependency.ok) throw new Error('dependency creation failed');
    const dependent = await repository.createTask({ createdByAgentId: 'agent-a', title: 'Dependent', objective: 'Wait for dependency', acceptanceCriteria: [], fileScope: [], dependencies: [dependency.value.taskId], priority: 50, readOnly: false });
    expect(dependent.ok).toBe(true);
    if (!dependent.ok) throw new Error('dependent creation failed');
    await expect(repository.claimTask({ agentId: 'agent-b', taskId: dependent.value.taskId })).resolves.toMatchObject({ ok: false, error: { code: 'DEPENDENCY_NOT_READY' } });
    await expect(repository.claimTask({ agentId: 'agent-a', taskId: dependency.value.taskId })).resolves.toMatchObject({ ok: true, value: { status: 'running', ownerAgentId: 'agent-a' } });
    await expect(repository.updateTask({ agentId: 'agent-a', taskId: dependency.value.taskId, status: 'completed', progress: 'done' })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_TRANSITION' } });
    await expect(repository.completeTask({ agentId: 'agent-a', taskId: dependency.value.taskId, result: { passed: true } })).resolves.toMatchObject({ ok: true, value: { status: 'completed' } });
    await expect(repository.claimTask({ agentId: 'agent-b', taskId: dependent.value.taskId })).resolves.toMatchObject({ ok: true, value: { status: 'running', ownerAgentId: 'agent-b' } });
    await expect(repository.updateTask({ agentId: 'agent-a', taskId: dependent.value.taskId, progress: 'not mine' })).resolves.toMatchObject({ ok: false, error: { code: 'TASK_SCOPE_VIOLATION' } });
    database.close();
  });

  it('persists a shared room with targeted delivery, acknowledgement, and reconnect-safe history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-room-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'room-main', role: 'main', capabilities: [] });
    await repository.registerAgent({ agentId: 'room-code', role: 'code', capabilities: [] });
    await repository.registerAgent({ agentId: 'room-test', role: 'test', capabilities: [] });

    const roomApi = repository as unknown as {
      createRoom?: (input: { name: string; createdByAgentId: string; participantAgentIds: readonly string[] }) => Promise<unknown>;
      joinRoom?: (input: { roomId: string; agentId: string }) => Promise<unknown>;
      leaveRoom?: (input: { roomId: string; agentId: string }) => Promise<unknown>;
      sendRoomMessage?: (input: { roomId: string; fromAgentId: string; target?: string; type: 'TASK' | 'UPDATE'; body: string }) => Promise<unknown>;
      roomInbox?: (input: { roomId: string; agentId: string; afterSequence: number; limit: number }) => Promise<unknown>;
      roomHistory?: (input: { roomId: string; afterSequence: number; limit: number }) => Promise<unknown>;
      acknowledgeRoomMessage?: (input: { roomId: string; agentId: string; messageId: string }) => Promise<unknown>;
      roomParticipants?: (input: { roomId: string; includeInactive?: boolean; limit: number }) => Promise<unknown>;
      roomSnapshot?: (input: { roomId: string }) => Promise<unknown>;
    };
    const roomMethods = [roomApi.createRoom, roomApi.joinRoom, roomApi.leaveRoom, roomApi.sendRoomMessage, roomApi.roomInbox, roomApi.roomHistory, roomApi.acknowledgeRoomMessage, roomApi.roomParticipants, roomApi.roomSnapshot];
    if (!roomMethods.every((method) => typeof method === 'function')) {
      database.close();
      expect(roomApi.createRoom).toBeTypeOf('function');
      return;
    }

    const created = await roomApi.createRoom!({ name: 'RVN Team', createdByAgentId: 'room-main', participantAgentIds: ['room-code', 'room-test'] });
    expect(created).toMatchObject({ ok: true, value: { name: 'RVN Team', createdByAgentId: 'room-main' } });
    if (!('ok' in created) || created.ok !== true) throw new Error('room creation failed');
    const roomId = (created.value as { roomId: string }).roomId;

    const broadcast = await roomApi.sendRoomMessage!({ roomId, fromAgentId: 'room-main', target: '@all', type: 'TASK', body: 'start together' });
    expect(broadcast).toMatchObject({ ok: true, value: { roomId, target: '@all', body: 'start together', targetAgentIds: ['room-code', 'room-main', 'room-test'] } });
    if (!('ok' in broadcast) || broadcast.ok !== true) throw new Error('broadcast failed');
    const broadcastSequence = (broadcast.value as { sequence: number }).sequence;

    const codeInbox = await roomApi.roomInbox!({ roomId, agentId: 'room-code', afterSequence: 0, limit: 10 });
    expect(codeInbox).toMatchObject({ ok: true, value: { messages: [expect.objectContaining({ sequence: broadcastSequence, body: 'start together' })], nextSequence: broadcastSequence } });

    const targeted = await roomApi.sendRoomMessage!({ roomId, fromAgentId: 'room-main', target: '@code', type: 'UPDATE', body: 'code only' });
    expect(targeted).toMatchObject({ ok: true, value: { roomId, target: '@code', targetAgentIds: ['room-code'], body: 'code only' } });
    if (!('ok' in targeted) || targeted.ok !== true) throw new Error('targeted room message failed');
    const targetedMessage = targeted.value as { messageId: string; sequence: number };
    await expect(roomApi.acknowledgeRoomMessage!({ roomId, agentId: 'room-code', messageId: targetedMessage.messageId })).resolves.toMatchObject({ ok: true, value: { acknowledgedAt: expect.any(Number) } });
    await expect(roomApi.roomInbox!({ roomId, agentId: 'room-test', afterSequence: broadcastSequence, limit: 10 })).resolves.toMatchObject({ ok: true, value: { messages: [], nextSequence: broadcastSequence } });
    await expect(roomApi.leaveRoom!({ roomId, agentId: 'room-test' })).resolves.toMatchObject({ ok: true, value: { agentId: 'room-test', leftAt: expect.any(Number) } });
    await expect(roomApi.roomParticipants!({ roomId, includeInactive: false, limit: 10 })).resolves.toMatchObject({ ok: true, value: expect.not.arrayContaining([expect.objectContaining({ agentId: 'room-test' })]) });
    await expect(roomApi.joinRoom!({ roomId, agentId: 'room-test' })).resolves.toMatchObject({ ok: true, value: { agentId: 'room-test', leftAt: null } });
    await expect(roomApi.roomParticipants!({ roomId, includeInactive: false, limit: 10 })).resolves.toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ agentId: 'room-code', status: 'online' })]) });
    await expect(roomApi.roomHistory!({ roomId, afterSequence: 0, limit: 10 })).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ sequence: broadcastSequence }), expect.objectContaining({ sequence: targetedMessage.sequence, acknowledgedAt: expect.any(Number) })] });
    await expect(roomApi.roomSnapshot!({ roomId })).resolves.toMatchObject({ ok: true, value: { room: { roomId }, latestSequence: targetedMessage.sequence, messageCount: 2 } });

    database.close();
    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase) as unknown as typeof roomApi;
    await expect(reconnectRepository.roomHistory!({ roomId, afterSequence: 0, limit: 10 })).resolves.toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ body: 'start together' }), expect.objectContaining({ body: 'code only' })]) });
    await expect(reconnectRepository.roomInbox!({ roomId, agentId: 'room-code', afterSequence: broadcastSequence, limit: 10 })).resolves.toMatchObject({ ok: true, value: { messages: [expect.objectContaining({ body: 'code only', acknowledgedAt: expect.any(Number) })], nextSequence: targetedMessage.sequence } });
    reconnectDatabase.close();
  });

  it('persists an Agent Runner checkpoint and restores its cursor after reconnect', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-runner-'));
    temporaryRoots.push(root);
    const filename = path.join(root, 'rvn.sqlite');
    const database = new SqliteDatabase(filename);
    const repository = new SqliteAgentBusRepository(database);
    await repository.registerAgent({ agentId: 'runner-code', role: 'Code', sessionId: 'session-code', capabilities: [] });
    const room = await repository.createRoom({ roomId: 'runner-room', name: 'Runner Room', createdByAgentId: 'runner-code', participantAgentIds: [] });
    expect(room.ok).toBe(true);
    await expect(repository.getRunnerCheckpoint({ agentId: 'runner-code', roomId: 'runner-room' })).resolves.toMatchObject({ ok: true, value: null });
    await expect(repository.saveRunnerCheckpoint({ agentId: 'runner-code', roomId: 'runner-room', lastSequence: 12, currentTaskId: 'task-1', lastError: null })).resolves.toMatchObject({ ok: true, value: { lastSequence: 12, currentTaskId: 'task-1' } });
    database.close();

    const reconnectDatabase = new SqliteDatabase(filename);
    const reconnectRepository = new SqliteAgentBusRepository(reconnectDatabase);
    await expect(reconnectRepository.getRunnerCheckpoint({ agentId: 'runner-code', roomId: 'runner-room' })).resolves.toMatchObject({ ok: true, value: { agentId: 'runner-code', roomId: 'runner-room', lastSequence: 12, currentTaskId: 'task-1', lastError: null, updatedAt: expect.any(Number) } });
    reconnectDatabase.close();
  });
});
