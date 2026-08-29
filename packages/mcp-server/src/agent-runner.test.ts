import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '@rvn/domain';
import type {
  AgentBusRepository,
  AgentMessageType,
  AgentRoomParticipantSummary,
  AgentRoomMessageSummary,
  AgentRunnerCheckpoint,
  AgentSummary,
  TaskRecord,
  TaskSummary,
} from '@rvn/storage';
import { AgentRunner, type AgentRunnerExecutionResult } from './agent-runner.js';

describe('AgentRunner', () => {
  it('registers, executes one addressed task, acknowledges it, and resumes from a durable cursor', async () => {
    const message: AgentRoomMessageSummary = {
      sequence: 1,
      messageId: 'room-message-1',
      roomId: 'room-1',
      fromAgentId: 'main',
      target: '@code',
      targetAgentIds: ['code'],
      type: 'TASK',
      body: 'Inspect the source',
      metadata: { taskId: 'task-1' },
      createdAt: 1,
    };
    const task: TaskRecord = {
      taskId: 'task-1',
      title: 'Inspect source',
      objective: 'Inspect the source',
      status: 'running',
      priority: 50,
      ownerAgentId: 'code',
      createdByAgentId: 'main',
      acceptanceCriteria: [],
      fileScope: [],
      dependencies: [],
      readOnly: true,
      progress: null,
      result: null,
      createdAt: 1,
      updatedAt: 1,
      startedAt: 1,
      completedAt: null,
    };
    const state: FakeRunnerState = { messages: [message], checkpoint: null, acknowledgements: [], sent: [], executed: 0 };
    const bus = fakeRepository(state, task);
    const executor = async (): Promise<AgentRunnerExecutionResult> => {
      state.executed += 1;
      return { type: 'RESULT', body: 'Inspection complete', result: { passed: true } };
    };
    const first = new AgentRunner(bus, { agentId: 'code', role: 'Code', sessionId: 'session-code', roomId: 'room-1', autoStart: false }, executor);

    await expect(first.start()).resolves.toMatchObject({ ok: true });
    await expect(first.tick()).resolves.toMatchObject({ ok: true, value: { status: 'processed', sequence: 1 } });
    expect(state.executed).toBe(1);
    expect(state.acknowledgements).toEqual(['room-message-1']);
    expect(state.sent).toEqual([{ target: '@main', type: 'RESULT', body: 'Inspection complete' }]);
    expect(state.checkpoint).toMatchObject({ agentId: 'code', roomId: 'room-1', lastSequence: 1, currentTaskId: null });

    const resumed = new AgentRunner(bus, { agentId: 'code', role: 'Code', sessionId: 'session-code', roomId: 'room-1', autoStart: false }, executor);
    await expect(resumed.start()).resolves.toMatchObject({ ok: true });
    await expect(resumed.tick()).resolves.toMatchObject({ ok: true, value: { status: 'idle', sequence: 1 } });
    expect(state.executed).toBe(1);
  });

  it('publishes a blocker and stops after repeated executor blockers', async () => {
    const messages = [1, 2].map((sequence): AgentRoomMessageSummary => ({
      sequence,
      messageId: `room-message-${sequence}`,
      roomId: 'room-1',
      fromAgentId: 'main',
      target: '@code',
      targetAgentIds: ['code'],
      type: 'TASK',
      body: 'Blocked task',
      metadata: { taskId: 'task-1' },
      createdAt: sequence,
    }));
    const task: TaskRecord = {
      taskId: 'task-1',
      title: 'Blocked task',
      objective: 'Blocked task',
      status: 'running',
      priority: 50,
      ownerAgentId: 'code',
      createdByAgentId: 'main',
      acceptanceCriteria: [],
      fileScope: [],
      dependencies: [],
      readOnly: true,
      progress: null,
      result: null,
      createdAt: 1,
      updatedAt: 1,
      startedAt: 1,
      completedAt: null,
    };
    const state: FakeRunnerState = { messages, checkpoint: null, acknowledgements: [], sent: [], executed: 0 };
    const bus = fakeRepository(state, task);
    const executor = async (): Promise<AgentRunnerExecutionResult> => ({ type: 'BLOCKER', body: 'Dependency is unavailable' });
    const runner = new AgentRunner(bus, { agentId: 'code', role: 'Code', sessionId: 'session-code', roomId: 'room-1', autoStart: false, blockerLimit: 2 }, executor);

    await runner.start();
    await expect(runner.tick()).resolves.toMatchObject({ ok: true, value: { status: 'blocked', sequence: 1 } });
    await expect(runner.tick()).resolves.toMatchObject({ ok: true, value: { status: 'stopped', sequence: 2 } });
    expect(state.sent).toEqual([
      { target: '@main', type: 'BLOCKER', body: 'Dependency is unavailable' },
      { target: '@main', type: 'BLOCKER', body: 'Dependency is unavailable (runner stopped after repeated blockers)' },
    ]);
  });

  it('continues a task already owned by the runner after reconnect without re-claiming it', async () => {
    const message: AgentRoomMessageSummary = {
      sequence: 1,
      messageId: 'room-message-preclaimed',
      roomId: 'room-1',
      fromAgentId: 'main',
      target: '@code',
      targetAgentIds: ['code'],
      type: 'TASK',
      body: 'Continue the owned task',
      metadata: { taskId: 'task-1' },
      createdAt: 1,
    };
    const task: TaskRecord = {
      taskId: 'task-1',
      title: 'Continue owned task',
      objective: 'Continue the owned task',
      status: 'running',
      priority: 50,
      ownerAgentId: 'code',
      createdByAgentId: 'main',
      acceptanceCriteria: [],
      fileScope: [],
      dependencies: [],
      readOnly: true,
      progress: null,
      result: null,
      createdAt: 1,
      updatedAt: 1,
      startedAt: 1,
      completedAt: null,
    };
    const state: FakeRunnerState = { messages: [message], checkpoint: null, acknowledgements: [], sent: [], executed: 0, rejectClaimWhenOwned: true, claimAttempts: 0 };
    const bus = fakeRepository(state, task);
    const runner = new AgentRunner(bus, { agentId: 'code', role: 'Code', sessionId: 'session-code', roomId: 'room-1', autoStart: false }, async () => {
      state.executed += 1;
      return { type: 'RESULT', body: 'Continued successfully', result: { resumed: true } };
    });

    await expect(runner.start()).resolves.toMatchObject({ ok: true });
    await expect(runner.tick()).resolves.toMatchObject({ ok: true, value: { status: 'processed', sequence: 1, taskId: 'task-1' } });
    expect(state.claimAttempts).toBe(0);
    expect(state.executed).toBe(1);
  });
});

interface FakeRunnerState {
  messages: AgentRoomMessageSummary[];
  checkpoint: AgentRunnerCheckpoint | null;
  acknowledgements: string[];
  sent: Array<{ target: string; type: AgentMessageType; body: string }>;
  executed: number;
  rejectClaimWhenOwned?: boolean;
  claimAttempts?: number;
}

function fakeRepository(state: FakeRunnerState, task: TaskRecord): AgentBusRepository {
  const agent: AgentSummary = { agentId: 'code', role: 'Code', sessionId: 'session-code', status: 'idle', capabilities: [], lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 };
  return {
    async registerAgent(): Promise<Result<AgentSummary>> { return ok(agent); },
    async heartbeatAgent(): Promise<Result<AgentSummary>> { return ok(agent); },
    async joinRoom(): Promise<Result<AgentRoomParticipantSummary>> { return ok({ roomId: 'room-1', agentId: 'code', role: 'Code', status: 'idle', joinedAt: 1, leftAt: null }); },
    async getRunnerCheckpoint(): Promise<Result<AgentRunnerCheckpoint | null>> { return ok(state.checkpoint); },
    async saveRunnerCheckpoint(input): Promise<Result<AgentRunnerCheckpoint>> {
      state.checkpoint = { ...input, updatedAt: 2 };
      return ok(state.checkpoint);
    },
    async roomInbox(input): Promise<Result<{ readonly messages: readonly AgentRoomMessageSummary[]; readonly nextSequence: number }>> {
      const next = state.messages.find((entry) => entry.sequence > input.afterSequence && !state.acknowledgements.includes(entry.messageId));
      return ok({ messages: next === undefined ? [] : [next], nextSequence: next?.sequence ?? input.afterSequence });
    },
    async getTask(): Promise<Result<TaskRecord>> { return ok(task); },
    async claimTask(): Promise<Result<TaskSummary>> {
      state.claimAttempts = (state.claimAttempts ?? 0) + 1;
      if (state.rejectClaimWhenOwned === true && task.ownerAgentId === 'code' && task.status === 'running') return err({ code: 'TASK_ALREADY_CLAIMED', message: 'Task is already claimed' });
      return ok(task);
    },
    async updateTask(): Promise<Result<TaskSummary>> { return ok(task); },
    async completeTask(): Promise<Result<TaskSummary>> { return ok({ ...task, status: 'completed', result: { passed: true } }); },
    async acknowledgeRoomMessage(input): Promise<Result<AgentRoomMessageSummary>> {
      state.acknowledgements.push(input.messageId ?? '');
      const message = state.messages.find((entry) => entry.messageId === input.messageId);
      return message === undefined ? err({ code: 'ROOM_MESSAGE_NOT_FOUND', message: 'Room message was not found' }) : ok(message);
    },
    async sendRoomMessage(input): Promise<Result<AgentRoomMessageSummary>> {
      state.sent.push({ target: input.target ?? '', type: input.type, body: input.body });
      return ok({ sequence: 0, messageId: 'sent-message', roomId: input.roomId, fromAgentId: input.fromAgentId ?? 'code', target: input.target ?? '@main', targetAgentIds: [], type: input.type, body: input.body, metadata: input.metadata ?? {}, createdAt: 1 });
    },
  } as unknown as AgentBusRepository;
}
