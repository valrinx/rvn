import { randomUUID } from 'node:crypto';
import { appError, err, ok, type Result } from '@rvn/domain';
import type { SqliteDatabase } from './database.js';

export type AgentStatus = 'online' | 'busy' | 'idle' | 'blocked' | 'offline';
export type TaskStatus = 'queued' | 'assigned' | 'running' | 'blocked' | 'review' | 'completed' | 'failed' | 'cancelled';
export type AgentMessageType = 'TASK' | 'UPDATE' | 'RESULT' | 'BLOCKER' | 'QUESTION' | 'REVIEW' | 'ACK' | 'CANCEL';
export type AgentBusEventType = 'AGENT_REGISTERED' | 'AGENT_HEARTBEAT' | 'TASK_CREATED' | 'TASK_CLAIMED' | 'TASK_UPDATED' | 'TASK_COMPLETED' | 'MESSAGE_SENT' | 'MESSAGE_ACKNOWLEDGED' | 'ROOM_CREATED' | 'ROOM_JOINED' | 'ROOM_LEFT' | 'ROOM_MESSAGE_SENT' | 'ROOM_MESSAGE_ACKNOWLEDGED' | 'LOCK_ACQUIRED' | 'LOCK_RELEASED' | 'LOCK_RENEWED' | 'ARTIFACT_ADDED' | 'WORKTREE_ALLOCATED' | 'WORKTREE_RELEASED';
export type AgentBusLockType = 'file' | 'directory' | 'integration' | 'runtime';
export type AgentBusArtifactType = 'diff' | 'test_report' | 'runtime_capture' | 'screenshot' | 'analysis_summary' | 'commit' | 'patch' | 'benchmark';
export type AgentBusWorktreeStatus = 'allocated' | 'released';
const ROOM_MESSAGE_RECIPIENT_PREFIX = '__rvn_room__:';

export interface AgentSummary {
  readonly agentId: string;
  readonly role: string;
  readonly sessionId?: string;
  readonly status: AgentStatus;
  readonly capabilities: readonly string[];
  readonly currentTaskId?: string;
  readonly lastHeartbeatAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type AgentRecord = Omit<AgentSummary, 'sessionId' | 'currentTaskId'> & {
  readonly sessionId: string | null;
  readonly currentTaskId: string | null;
};

export interface TaskSummary {
  readonly taskId: string;
  readonly title: string;
  readonly objective: string;
  readonly status: TaskStatus;
  readonly priority: number;
  readonly ownerAgentId?: string;
  readonly createdByAgentId: string;
  readonly acceptanceCriteria: readonly string[];
  readonly fileScope: readonly string[];
  readonly dependencies: readonly string[];
  readonly readOnly: boolean;
  readonly progress?: string;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export type TaskRecord = Omit<TaskSummary, 'ownerAgentId' | 'progress' | 'result' | 'startedAt' | 'completedAt'> & {
  readonly ownerAgentId: string | null;
  readonly progress: string | null;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
};

export interface AgentMessageSummary {
  readonly sequence: number;
  readonly messageId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly taskId?: string;
  readonly type: AgentMessageType;
  readonly body: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly acknowledgedAt?: number;
}

export interface AgentRegisterInput {
  readonly agentId: string;
  readonly role: string;
  readonly sessionId?: string;
  readonly capabilities: readonly string[];
  readonly status?: AgentStatus;
}

export interface AgentGetInput {
  readonly agentId: string;
}

export interface AgentListInput {
  readonly limit: number;
}

export interface AgentHeartbeatInput {
  readonly agentId: string;
  readonly status?: AgentStatus;
  readonly currentTaskId?: string | null;
}

export interface TaskCreateInput {
  readonly createdByAgentId: string;
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly fileScope: readonly string[];
  readonly dependencies: readonly string[];
  readonly priority: number;
  readonly readOnly: boolean;
}

export interface TaskListInput {
  readonly statuses?: readonly TaskStatus[];
  readonly ownerAgentId?: string;
}

export interface TaskGetInput {
  readonly taskId: string;
}

export interface TaskClaimInput {
  readonly agentId: string;
  readonly taskId?: string;
}

export interface TaskUpdateInput {
  readonly agentId: string;
  readonly taskId: string;
  readonly status?: TaskStatus;
  readonly progress?: string;
}

export interface TaskCompleteInput {
  readonly agentId: string;
  readonly taskId: string;
  readonly result: Readonly<Record<string, unknown>>;
}

export interface MessageSendInput {
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly taskId?: string;
  readonly type: AgentMessageType;
  readonly body: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MessageAckInput {
  readonly agentId: string;
  readonly messageId?: string;
  readonly sequence?: number;
}

export interface MessageInboxInput {
  readonly agentId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

export interface MessageInboxSummary {
  readonly messages: readonly AgentMessageSummary[];
  readonly nextSequence: number;
}

export interface AgentMessageListInput {
  readonly afterSequence: number;
  readonly limit: number;
}

export interface AgentBusEventSummary {
  readonly sequence: number;
  readonly eventId: string;
  readonly eventType: AgentBusEventType;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export interface EventListInput {
  readonly afterSequence: number;
  readonly limit: number;
  readonly taskId?: string;
  readonly agentId?: string;
}

export interface EventListSummary {
  readonly events: readonly AgentBusEventSummary[];
  readonly nextSequence: number;
}

export interface AgentBusLockSummary {
  readonly resource: string;
  readonly lockType: AgentBusLockType;
  readonly ownerAgentId: string;
  readonly taskId: string | null;
  readonly expiresAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LockAcquireInput {
  readonly agentId: string;
  readonly resource: string;
  readonly lockType: AgentBusLockType;
  readonly taskId?: string;
  readonly ttlSeconds: number;
}

export interface LockReleaseInput {
  readonly agentId: string;
  readonly resource: string;
  readonly force?: boolean;
}

export interface LockListInput {
  readonly agentId?: string;
  readonly taskId?: string;
  readonly limit: number;
}

export interface AgentBusArtifactSummary {
  readonly artifactId: string;
  readonly taskId: string | null;
  readonly agentId: string;
  readonly type: AgentBusArtifactType;
  readonly pathOrReference: string;
  readonly sha256: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export interface AgentBusWorktreeSummary {
  readonly worktreeId: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly branchName: string;
  readonly worktreePath: string;
  readonly baseRef: string;
  readonly status: AgentBusWorktreeStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly releasedAt: number | null;
}

export interface AgentRoomSummary {
  readonly roomId: string;
  readonly name: string;
  readonly createdByAgentId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AgentRoomParticipantSummary {
  readonly roomId: string;
  readonly agentId: string;
  readonly role: string;
  readonly status: AgentStatus;
  readonly joinedAt: number;
  readonly leftAt: number | null;
}

export interface AgentRoomMessageSummary {
  readonly sequence: number;
  readonly messageId: string;
  readonly roomId: string;
  readonly fromAgentId: string;
  readonly target: string;
  readonly targetAgentIds: readonly string[];
  readonly type: AgentMessageType;
  readonly body: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly acknowledgedAt?: number;
}

export interface RoomCreateInput {
  readonly roomId?: string;
  readonly name: string;
  readonly createdByAgentId?: string;
  readonly participantAgentIds: readonly string[];
}

export interface RoomJoinInput {
  readonly roomId: string;
  readonly agentId: string;
}

export interface RoomLeaveInput {
  readonly roomId: string;
  readonly agentId: string;
}

export interface RoomSendMessageInput {
  readonly roomId: string;
  readonly fromAgentId?: string;
  readonly target?: string;
  readonly type: AgentMessageType;
  readonly body: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RoomInboxInput {
  readonly roomId: string;
  readonly agentId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

export interface RoomHistoryInput {
  readonly roomId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

export interface RoomParticipantsInput {
  readonly roomId: string;
  readonly includeInactive?: boolean;
  readonly limit: number;
}

export interface RoomSnapshot {
  readonly room: AgentRoomSummary;
  readonly participants: readonly AgentRoomParticipantSummary[];
  readonly latestSequence: number;
  readonly messageCount: number;
}

export interface RoomMessageAckInput {
  readonly roomId: string;
  readonly agentId: string;
  readonly messageId?: string;
  readonly sequence?: number;
}

export interface AgentRunnerCheckpoint {
  readonly agentId: string;
  readonly roomId: string;
  readonly lastSequence: number;
  readonly currentTaskId: string | null;
  readonly lastError: string | null;
  readonly updatedAt: number;
}

export interface RunnerCheckpointInput {
  readonly agentId: string;
  readonly roomId: string;
  readonly lastSequence: number;
  readonly currentTaskId?: string | null;
  readonly lastError?: string | null;
}

export interface WorktreeAllocateInput {
  readonly agentId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly baseRef?: string;
  readonly worktreePath?: string;
}

export interface WorktreeReleaseInput {
  readonly agentId: string;
  readonly worktreeId: string;
}

export interface WorktreeListInput {
  readonly workspaceId?: string;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly includeReleased?: boolean;
  readonly limit: number;
}

export interface ArtifactAddInput {
  readonly agentId: string;
  readonly taskId?: string;
  readonly type: AgentBusArtifactType;
  readonly pathOrReference: string;
  readonly sha256?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactGetInput {
  readonly artifactId: string;
}

export interface ArtifactListInput {
  readonly agentId?: string;
  readonly taskId?: string;
  readonly type?: AgentBusArtifactType;
  readonly limit: number;
}

export interface AgentBusSnapshot {
  readonly agents: Readonly<Record<AgentStatus, number>>;
  readonly tasks: Readonly<Record<TaskStatus, number>>;
  readonly latestMessageSequence: number;
  readonly latestEventSequence: number;
  readonly activeTasks: readonly TaskRecord[];
  readonly persistence: {
    readonly backend: 'sqlite';
    readonly durable: true;
    readonly journalMode: 'WAL';
  };
}

interface RecordEventInput {
  readonly eventType: AgentBusEventType;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface AgentBusRepository {
  registerAgent(input: AgentRegisterInput): Promise<Result<AgentSummary>>;
  disconnectAgent(input: { readonly agentId: string }): Promise<Result<AgentSummary>>;
  getAgent(input: AgentGetInput): Promise<Result<AgentRecord>>;
  listAgents(input: AgentListInput): Promise<Result<readonly AgentSummary[]>>;
  heartbeatAgent(input: AgentHeartbeatInput): Promise<Result<AgentSummary>>;
  createTask(input: TaskCreateInput): Promise<Result<TaskSummary>>;
  getTask(input: TaskGetInput): Promise<Result<TaskRecord>>;
  listTasks(input: TaskListInput): Promise<Result<readonly TaskSummary[]>>;
  claimTask(input: TaskClaimInput): Promise<Result<TaskSummary>>;
  updateTask(input: TaskUpdateInput): Promise<Result<TaskSummary>>;
  completeTask(input: TaskCompleteInput): Promise<Result<TaskSummary>>;
  sendMessage(input: MessageSendInput): Promise<Result<AgentMessageSummary>>;
  acknowledgeMessage(input: MessageAckInput): Promise<Result<AgentMessageSummary>>;
  messageInbox(input: MessageInboxInput): Promise<Result<MessageInboxSummary>>;
  listMessages(input: AgentMessageListInput): Promise<Result<readonly AgentMessageSummary[]>>;
  listEvents(input: EventListInput): Promise<Result<EventListSummary>>;
  getSnapshot(): Promise<Result<AgentBusSnapshot>>;
  acquireLock(input: LockAcquireInput): Promise<Result<AgentBusLockSummary>>;
  releaseLock(input: LockReleaseInput): Promise<Result<AgentBusLockSummary>>;
  listLocks(input: LockListInput): Promise<Result<readonly AgentBusLockSummary[]>>;
  addArtifact(input: ArtifactAddInput): Promise<Result<AgentBusArtifactSummary>>;
  getArtifact(input: ArtifactGetInput): Promise<Result<AgentBusArtifactSummary>>;
  listArtifacts(input: ArtifactListInput): Promise<Result<readonly AgentBusArtifactSummary[]>>;
  allocateWorktree(input: WorktreeAllocateInput): Promise<Result<AgentBusWorktreeSummary>>;
  releaseWorktree(input: WorktreeReleaseInput): Promise<Result<AgentBusWorktreeSummary>>;
  listWorktrees(input: WorktreeListInput): Promise<Result<readonly AgentBusWorktreeSummary[]>>;
  createRoom(input: RoomCreateInput): Promise<Result<AgentRoomSummary>>;
  joinRoom(input: RoomJoinInput): Promise<Result<AgentRoomParticipantSummary>>;
  leaveRoom(input: RoomLeaveInput): Promise<Result<AgentRoomParticipantSummary>>;
  sendRoomMessage(input: RoomSendMessageInput): Promise<Result<AgentRoomMessageSummary>>;
  roomInbox(input: RoomInboxInput): Promise<Result<{ readonly messages: readonly AgentRoomMessageSummary[]; readonly nextSequence: number }>>;
  roomHistory(input: RoomHistoryInput): Promise<Result<readonly AgentRoomMessageSummary[]>>;
  roomParticipants(input: RoomParticipantsInput): Promise<Result<readonly AgentRoomParticipantSummary[]>>;
  roomSnapshot(input: { readonly roomId: string }): Promise<Result<RoomSnapshot>>;
  acknowledgeRoomMessage(input: RoomMessageAckInput): Promise<Result<AgentRoomMessageSummary>>;
  getRunnerCheckpoint(input: { readonly agentId: string; readonly roomId: string }): Promise<Result<AgentRunnerCheckpoint | null>>;
  saveRunnerCheckpoint(input: RunnerCheckpointInput): Promise<Result<AgentRunnerCheckpoint>>;
}

type DatabaseRow = Record<string, unknown>;

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ['assigned', 'cancelled'],
  assigned: ['running', 'cancelled'],
  running: ['blocked', 'review', 'failed'],
  blocked: ['running', 'review', 'cancelled'],
  review: ['running', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class SqliteAgentBusRepository implements AgentBusRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public async registerAgent(input: AgentRegisterInput): Promise<Result<AgentSummary>> {
    try {
      const now = Date.now();
      const existing = this.getAgentRow(input.agentId);
      const currentTaskId = existing?.current_task_id === null || existing?.current_task_id === undefined
        ? undefined
        : asString(existing.current_task_id);
      const status = input.status ?? (currentTaskId === undefined ? 'online' : 'busy');
      if (existing === undefined) {
        this.database.connection.prepare(`INSERT INTO agent_bus_agents
          (agent_id, role, session_id, status, capabilities_json, current_task_id, last_heartbeat_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          input.agentId, input.role, input.sessionId ?? null, status, stringify(input.capabilities), currentTaskId ?? null, now, now, now,
        );
      } else {
        this.database.connection.prepare(`UPDATE agent_bus_agents SET role = ?, session_id = ?, status = ?, capabilities_json = ?, last_heartbeat_at = ?, updated_at = ? WHERE agent_id = ?`).run(
          input.role, input.sessionId ?? null, status, stringify(input.capabilities), now, now, input.agentId,
        );
      }
      this.recordEvent({ eventType: 'AGENT_REGISTERED', agentId: input.agentId, payload: { role: input.role, status } });
      return ok(this.requireAgent(input.agentId));
    } catch {
      return failure('INTERNAL_ERROR', 'Agent registration failed', true);
    }
  }

  public async disconnectAgent(input: { readonly agentId: string }): Promise<Result<AgentSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const now = Date.now();
      this.database.connection.prepare('UPDATE agent_bus_agents SET session_id = NULL, status = \'offline\', current_task_id = NULL, updated_at = ? WHERE agent_id = ?').run(now, input.agentId);
      this.recordEvent({ eventType: 'AGENT_HEARTBEAT', agentId: input.agentId, payload: { status: 'offline', currentTaskId: null, sessionId: null } });
      return ok(this.requireAgent(input.agentId));
    } catch {
      return failure('INTERNAL_ERROR', 'Agent disconnection failed', true);
    }
  }

  public async getAgent(input: AgentGetInput): Promise<Result<AgentRecord>> {
    try {
      const row = this.getAgentRow(input.agentId);
      if (row === undefined) return failure('AGENT_NOT_FOUND', `Agent "${input.agentId}" was not found`);
      return ok(toAgentRecord(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Agent lookup failed', true);
    }
  }

  public async listAgents(input: AgentListInput): Promise<Result<readonly AgentSummary[]>> {
    try {
      const rows = this.database.connection.prepare('SELECT * FROM agent_bus_agents ORDER BY updated_at DESC, agent_id ASC LIMIT ?').all(input.limit) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toAgentSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Agent listing failed', true);
    }
  }

  public async heartbeatAgent(input: AgentHeartbeatInput): Promise<Result<AgentSummary>> {
    try {
      const existing = this.getAgentRow(input.agentId);
      if (existing === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const now = Date.now();
      const currentTaskId = input.currentTaskId === undefined
        ? optionalString(existing.current_task_id)
        : input.currentTaskId ?? undefined;
      const nextStatus = input.status ?? (currentTaskId === undefined ? 'idle' : 'busy');
      this.database.connection.prepare('UPDATE agent_bus_agents SET status = ?, current_task_id = ?, last_heartbeat_at = ?, updated_at = ? WHERE agent_id = ?')
        .run(nextStatus, currentTaskId ?? null, now, now, input.agentId);
      this.recordEvent({ eventType: 'AGENT_HEARTBEAT', agentId: input.agentId, payload: { status: nextStatus, currentTaskId: currentTaskId ?? null } });
      return ok(this.requireAgent(input.agentId));
    } catch {
      return failure('INTERNAL_ERROR', 'Agent heartbeat failed', true);
    }
  }

  public async createTask(input: TaskCreateInput): Promise<Result<TaskSummary>> {
    try {
      if (this.getAgentRow(input.createdByAgentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.createdByAgentId}" is not registered`);
      const now = Date.now();
      const taskId = randomUUID();
      this.database.connection.prepare(`INSERT INTO agent_bus_tasks
        (task_id, title, objective, status, priority, owner_agent_id, created_by_agent_id, acceptance_json, file_scope_json, dependencies_json, read_only, progress, result_json, created_at, updated_at, started_at, completed_at)
        VALUES (?, ?, ?, 'queued', ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`).run(
        taskId, input.title, input.objective, input.priority, input.createdByAgentId,
        stringify(input.acceptanceCriteria), stringify(input.fileScope), stringify(input.dependencies), input.readOnly ? 1 : 0, now, now,
      );
      this.recordEvent({ eventType: 'TASK_CREATED', taskId, agentId: input.createdByAgentId, payload: { title: input.title, status: 'queued' } });
      return ok(this.requireTask(taskId));
    } catch {
      return failure('INTERNAL_ERROR', 'Task creation failed', true);
    }
  }

  public async getTask(input: TaskGetInput): Promise<Result<TaskRecord>> {
    try {
      const row = this.getTaskRow(input.taskId);
      if (row === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      return ok(toTaskRecord(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Task lookup failed', true);
    }
  }

  public async listTasks(input: TaskListInput): Promise<Result<readonly TaskSummary[]>> {
    try {
      const clauses: string[] = [];
      const parameters: string[] = [];
      if (input.statuses !== undefined && input.statuses.length > 0) {
        clauses.push(`status IN (${input.statuses.map(() => '?').join(', ')})`);
        parameters.push(...input.statuses);
      }
      if (input.ownerAgentId !== undefined) {
        clauses.push('owner_agent_id = ?');
        parameters.push(input.ownerAgentId);
      }
      const query = `SELECT * FROM agent_bus_tasks${clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`} ORDER BY priority DESC, created_at ASC, task_id ASC`;
      const rows = this.database.connection.prepare(query).all(...parameters) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toTaskSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Task listing failed', true);
    }
  }

  public async claimTask(input: TaskClaimInput): Promise<Result<TaskSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      this.database.connection.exec('BEGIN IMMEDIATE;');
      try {
        const selected = input.taskId === undefined ? this.findClaimableTask() : this.getTaskRow(input.taskId);
        if (selected === undefined) {
          this.database.connection.exec('ROLLBACK;');
          return failure('TASK_NOT_FOUND', 'No claimable task was found');
        }
        const status = asTaskStatus(selected.status);
        const owner = optionalString(selected.owner_agent_id);
        if (owner !== undefined && owner !== input.agentId) {
          this.database.connection.exec('ROLLBACK;');
          return failure('TASK_ALREADY_CLAIMED', `Task "${asString(selected.task_id)}" is already claimed`);
        }
        if (status !== 'queued' && status !== 'assigned') {
          this.database.connection.exec('ROLLBACK;');
          return failure('TASK_ALREADY_CLAIMED', `Task "${asString(selected.task_id)}" is not available for claiming`);
        }
        if (!this.dependenciesReady(selected)) {
          this.database.connection.exec('ROLLBACK;');
          return failure('DEPENDENCY_NOT_READY', `Task "${asString(selected.task_id)}" has incomplete dependencies`);
        }
        const now = Date.now();
        const taskId = asString(selected.task_id);
        this.database.connection.prepare(`UPDATE agent_bus_tasks SET status = 'running', owner_agent_id = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE task_id = ? AND (owner_agent_id IS NULL OR owner_agent_id = ?) AND status IN ('queued', 'assigned')`).run(input.agentId, now, now, taskId, input.agentId);
        const changed = this.database.connection.prepare('SELECT changes() AS count').get() as unknown as DatabaseRow;
        if (asNumber(changed.count) !== 1) {
          this.database.connection.exec('ROLLBACK;');
          return failure('TASK_ALREADY_CLAIMED', `Task "${taskId}" is already claimed`);
        }
        this.database.connection.prepare('UPDATE agent_bus_agents SET status = \'busy\', current_task_id = ?, updated_at = ? WHERE agent_id = ?').run(taskId, now, input.agentId);
        this.recordEvent({ eventType: 'TASK_CLAIMED', taskId, agentId: input.agentId, payload: { status: 'running' } });
        this.database.connection.exec('COMMIT;');
        return ok(this.requireTask(taskId));
      } catch (error) {
        try { this.database.connection.exec('ROLLBACK;'); } catch { /* preserve the original failure */ }
        throw error;
      }
    } catch {
      return failure('INTERNAL_ERROR', 'Task claim failed', true);
    }
  }

  public async updateTask(input: TaskUpdateInput): Promise<Result<TaskSummary>> {
    try {
      const row = this.getTaskRow(input.taskId);
      if (row === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      if (optionalString(row.owner_agent_id) !== input.agentId) return failure('TASK_SCOPE_VIOLATION', `Agent "${input.agentId}" does not own task "${input.taskId}"`);
      const current = asTaskStatus(row.status);
      if (input.status !== undefined && input.status !== current && !taskTransitions[current].includes(input.status)) {
        return failure('INVALID_TRANSITION', `Task cannot transition from ${current} to ${input.status}`);
      }
      if (input.status === undefined && input.progress === undefined) return failure('INVALID_INPUT', 'Task update requires status or progress');
      const status = input.status ?? current;
      const now = Date.now();
      this.database.connection.prepare('UPDATE agent_bus_tasks SET status = ?, progress = COALESCE(?, progress), updated_at = ? WHERE task_id = ?').run(status, input.progress ?? null, now, input.taskId);
      this.syncAgentAfterTaskUpdate(input.agentId, input.taskId, status, now);
      this.recordEvent({ eventType: 'TASK_UPDATED', taskId: input.taskId, agentId: input.agentId, payload: { status, ...(input.progress === undefined ? {} : { progress: input.progress }) } });
      return ok(this.requireTask(input.taskId));
    } catch {
      return failure('INTERNAL_ERROR', 'Task update failed', true);
    }
  }

  public async completeTask(input: TaskCompleteInput): Promise<Result<TaskSummary>> {
    try {
      const row = this.getTaskRow(input.taskId);
      if (row === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      if (optionalString(row.owner_agent_id) !== input.agentId) return failure('TASK_SCOPE_VIOLATION', `Agent "${input.agentId}" does not own task "${input.taskId}"`);
      const current = asTaskStatus(row.status);
      if (current !== 'running' && current !== 'review' && current !== 'blocked') return failure('INVALID_TRANSITION', `Task cannot complete from ${current}`);
      const now = Date.now();
      this.database.connection.prepare('UPDATE agent_bus_tasks SET status = \'completed\', result_json = ?, progress = COALESCE(progress, \'completed\'), completed_at = ?, updated_at = ? WHERE task_id = ?').run(stringify(input.result), now, now, input.taskId);
      this.database.connection.prepare('UPDATE agent_bus_agents SET status = \'idle\', current_task_id = NULL, updated_at = ? WHERE agent_id = ? AND current_task_id = ?').run(now, input.agentId, input.taskId);
      this.recordEvent({ eventType: 'TASK_COMPLETED', taskId: input.taskId, agentId: input.agentId, payload: { result: input.result } });
      return ok(this.requireTask(input.taskId));
    } catch {
      return failure('INTERNAL_ERROR', 'Task completion failed', true);
    }
  }

  public async sendMessage(input: MessageSendInput): Promise<Result<AgentMessageSummary>> {
    try {
      if (this.getAgentRow(input.fromAgentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.fromAgentId}" is not registered`);
      if (this.getAgentRow(input.toAgentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.toAgentId}" is not registered`);
      if (input.taskId !== undefined && this.getTaskRow(input.taskId) === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      const now = Date.now();
      const messageId = randomUUID();
      this.database.connection.prepare(`INSERT INTO agent_bus_messages
        (message_id, from_agent_id, to_agent_id, task_id, type, body, metadata_json, created_at, acknowledged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(
        messageId, input.fromAgentId, input.toAgentId, input.taskId ?? null, input.type, input.body, stringify(input.metadata ?? {}), now,
      );
        this.recordEvent({ eventType: 'MESSAGE_SENT', agentId: input.fromAgentId, ...(input.taskId === undefined ? {} : { taskId: input.taskId }), payload: { messageId, toAgentId: input.toAgentId, type: input.type, body: input.body } });
      const row = this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE message_id = ?').get(messageId) as unknown as DatabaseRow;
      return ok(toMessageSummary(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Message send failed', true);
    }
  }

  public async acknowledgeMessage(input: MessageAckInput): Promise<Result<AgentMessageSummary>> {
    try {
      if ((input.messageId === undefined) === (input.sequence === undefined)) {
        return failure('INVALID_INPUT', 'Message acknowledgement requires exactly one message_id or sequence');
      }
      const row = input.messageId === undefined
        ? this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE sequence = ?').get(input.sequence as number) as unknown as DatabaseRow | undefined
        : this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE message_id = ?').get(input.messageId) as unknown as DatabaseRow | undefined;
      if (row === undefined) return failure('MESSAGE_NOT_FOUND', 'Message was not found');
      if (asString(row.to_agent_id) !== input.agentId) return failure('MESSAGE_SCOPE_VIOLATION', `Agent "${input.agentId}" cannot acknowledge this message`);
      if (row.acknowledged_at === null || row.acknowledged_at === undefined) {
        this.database.connection.prepare('UPDATE agent_bus_messages SET acknowledged_at = ? WHERE sequence = ? AND acknowledged_at IS NULL').run(Date.now(), asNumber(row.sequence));
        const taskId = optionalString(row.task_id);
        this.recordEvent({ eventType: 'MESSAGE_ACKNOWLEDGED', agentId: input.agentId, ...(taskId === undefined ? {} : { taskId }), payload: { messageId: asString(row.message_id), sequence: asNumber(row.sequence) } });
      }
      const acknowledged = this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE sequence = ?').get(asNumber(row.sequence)) as unknown as DatabaseRow | undefined;
      if (acknowledged === undefined) return failure('INTERNAL_ERROR', 'Acknowledged message disappeared', true);
      return ok(toMessageSummary(acknowledged));
    } catch {
      return failure('INTERNAL_ERROR', 'Message acknowledgement failed', true);
    }
  }

  public async messageInbox(input: MessageInboxInput): Promise<Result<MessageInboxSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const rows = this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE to_agent_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?').all(input.agentId, input.afterSequence, input.limit) as unknown as DatabaseRow[];
      const messages = rows.map((row) => toMessageSummary(row));
      return ok({ messages, nextSequence: messages.at(-1)?.sequence ?? input.afterSequence });
    } catch {
      return failure('INTERNAL_ERROR', 'Message inbox failed', true);
    }
  }

  public async listMessages(input: AgentMessageListInput): Promise<Result<readonly AgentMessageSummary[]>> {
    try {
      const rows = this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE room_id IS NULL AND sequence > ? ORDER BY sequence ASC LIMIT ?').all(input.afterSequence, input.limit) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toMessageSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Message listing failed', true);
    }
  }

  public async createRoom(input: RoomCreateInput): Promise<Result<AgentRoomSummary>> {
    try {
      const name = input.name.trim();
      const roomId = (input.roomId ?? randomUUID()).trim();
      if (name.length === 0 || name.length > 128 || roomId.length === 0 || roomId.length > 128 || roomId.includes('\0')) return failure('INVALID_INPUT', 'Room name or ID is invalid');
      const creator = input.createdByAgentId?.trim();
      if (creator !== undefined && creator.length === 0) return failure('INVALID_INPUT', 'Room creator is invalid');
      if (creator !== undefined && this.getAgentRow(creator) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${creator}" is not registered`);
      const participantIds = [...new Set([...(creator === undefined ? [] : [creator]), ...input.participantAgentIds.map((agentId) => agentId.trim())])];
      if (participantIds.some((agentId) => agentId.length === 0 || agentId.length > 128 || agentId.includes('\0'))) return failure('INVALID_INPUT', 'Room participant ID is invalid');
      for (const agentId of participantIds) {
        if (this.getAgentRow(agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${agentId}" is not registered`);
      }
      if (this.getRoomRow(roomId) !== undefined) return failure('ROOM_ALREADY_EXISTS', `Room "${roomId}" already exists`);
      const now = Date.now();
      this.database.connection.exec('BEGIN IMMEDIATE;');
      try {
        this.database.connection.prepare(`INSERT INTO agent_bus_rooms (room_id, name, created_by_agent_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`).run(roomId, name, creator ?? null, now, now);
        for (const agentId of participantIds) {
          this.database.connection.prepare(`INSERT INTO agent_bus_room_participants (room_id, agent_id, joined_at, left_at)
            VALUES (?, ?, ?, NULL)`).run(roomId, agentId, now);
        }
        this.recordEvent({ eventType: 'ROOM_CREATED', ...(creator === undefined ? {} : { agentId: creator }), payload: { roomId, name, participantCount: participantIds.length } });
        this.database.connection.exec('COMMIT;');
        return ok(this.requireRoom(roomId));
      } catch (error) {
        try { this.database.connection.exec('ROLLBACK;'); } catch { /* preserve the original failure */ }
        throw error;
      }
    } catch {
      return failure('INTERNAL_ERROR', 'Room creation failed', true);
    }
  }

  public async joinRoom(input: RoomJoinInput): Promise<Result<AgentRoomParticipantSummary>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const existing = this.getRoomParticipantRow(input.roomId, input.agentId);
      const now = Date.now();
      if (existing === undefined) {
        this.database.connection.prepare(`INSERT INTO agent_bus_room_participants (room_id, agent_id, joined_at, left_at)
          VALUES (?, ?, ?, NULL)`).run(input.roomId, input.agentId, now);
      } else if (existing.left_at !== null && existing.left_at !== undefined) {
        this.database.connection.prepare('UPDATE agent_bus_room_participants SET left_at = NULL WHERE room_id = ? AND agent_id = ?').run(input.roomId, input.agentId);
      } else {
        return ok(this.requireRoomParticipant(input.roomId, input.agentId));
      }
      this.database.connection.prepare('UPDATE agent_bus_rooms SET updated_at = ? WHERE room_id = ?').run(now, input.roomId);
      this.recordEvent({ eventType: 'ROOM_JOINED', agentId: input.agentId, payload: { roomId: input.roomId } });
      return ok(this.requireRoomParticipant(input.roomId, input.agentId));
    } catch {
      return failure('INTERNAL_ERROR', 'Room join failed', true);
    }
  }

  public async leaveRoom(input: RoomLeaveInput): Promise<Result<AgentRoomParticipantSummary>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const existing = this.getRoomParticipantRow(input.roomId, input.agentId);
      if (existing === undefined) return failure('ROOM_PARTICIPANT_NOT_FOUND', `Agent "${input.agentId}" is not a participant in room "${input.roomId}"`);
      if (existing.left_at === null || existing.left_at === undefined) {
        const now = Date.now();
        this.database.connection.prepare('UPDATE agent_bus_room_participants SET left_at = ? WHERE room_id = ? AND agent_id = ?').run(now, input.roomId, input.agentId);
        this.database.connection.prepare('UPDATE agent_bus_rooms SET updated_at = ? WHERE room_id = ?').run(now, input.roomId);
        this.recordEvent({ eventType: 'ROOM_LEFT', agentId: input.agentId, payload: { roomId: input.roomId } });
      }
      return ok(this.requireRoomParticipant(input.roomId, input.agentId));
    } catch {
      return failure('INTERNAL_ERROR', 'Room leave failed', true);
    }
  }

  public async sendRoomMessage(input: RoomSendMessageInput): Promise<Result<AgentRoomMessageSummary>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      const fromAgentId = input.fromAgentId?.trim() || 'user';
      if (input.fromAgentId !== undefined) {
        if (this.getAgentRow(fromAgentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${fromAgentId}" is not registered`);
        if (!this.isActiveRoomParticipant(input.roomId, fromAgentId)) return failure('ROOM_PARTICIPANT_REQUIRED', `Agent "${fromAgentId}" must join room "${input.roomId}" before sending`);
      }
      const target = (input.target ?? '@all').trim();
      if (!target.startsWith('@') || target.length < 2 || target.length > 128) return failure('INVALID_INPUT', 'Room target must be an @mention');
      const participants = this.database.connection.prepare(`SELECT p.agent_id, a.role FROM agent_bus_room_participants p
        INNER JOIN agent_bus_agents a ON a.agent_id = p.agent_id
        WHERE p.room_id = ? AND p.left_at IS NULL ORDER BY p.agent_id ASC`).all(input.roomId) as unknown as DatabaseRow[];
      const normalizedTarget = target.slice(1).trim().toLowerCase();
      const targetAgentIds = normalizedTarget === 'all'
        ? participants.map((row) => asString(row.agent_id))
        : participants.filter((row) => asString(row.agent_id).toLowerCase() === normalizedTarget || asString(row.role).toLowerCase() === normalizedTarget).map((row) => asString(row.agent_id));
      if (normalizedTarget !== 'all' && targetAgentIds.length === 0) return failure('ROOM_TARGET_NOT_FOUND', `Room target "${target}" was not found`);
      const now = Date.now();
      const messageId = randomUUID();
      this.database.connection.exec('BEGIN IMMEDIATE;');
      try {
        this.database.connection.prepare(`INSERT INTO agent_bus_messages
          (message_id, from_agent_id, to_agent_id, task_id, type, body, metadata_json, created_at, acknowledged_at, room_id, room_broadcast, room_target)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(
          messageId, fromAgentId, `${ROOM_MESSAGE_RECIPIENT_PREFIX}${input.roomId}`, input.type, input.body, stringify(input.metadata ?? {}), now, input.roomId, normalizedTarget === 'all' ? 1 : 0, target,
        );
        for (const agentId of targetAgentIds) {
          this.database.connection.prepare(`INSERT INTO agent_bus_room_message_targets (room_id, message_id, agent_id)
            VALUES (?, ?, ?)`).run(input.roomId, messageId, agentId);
        }
        this.recordEvent({ eventType: 'ROOM_MESSAGE_SENT', ...(input.fromAgentId === undefined ? {} : { agentId: fromAgentId }), payload: { roomId: input.roomId, messageId, target, type: input.type } });
        this.database.connection.exec('COMMIT;');
      } catch (error) {
        try { this.database.connection.exec('ROLLBACK;'); } catch { /* preserve the original failure */ }
        throw error;
      }
      const row = this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE message_id = ?').get(messageId) as unknown as DatabaseRow | undefined;
      if (row === undefined) return failure('INTERNAL_ERROR', 'Room message disappeared during send', true);
      return ok(toRoomMessageSummary(row, targetAgentIds));
    } catch {
      return failure('INTERNAL_ERROR', 'Room message send failed', true);
    }
  }

  public async roomInbox(input: RoomInboxInput): Promise<Result<{ readonly messages: readonly AgentRoomMessageSummary[]; readonly nextSequence: number }>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      if (input.agentId !== 'user' && !this.isActiveRoomParticipant(input.roomId, input.agentId)) return failure('ROOM_PARTICIPANT_REQUIRED', `Agent "${input.agentId}" must join room "${input.roomId}" before reading`);
      const rows = this.database.connection.prepare(`SELECT m.*, a.acknowledged_at AS room_acknowledged_at
        FROM agent_bus_messages m
        LEFT JOIN agent_bus_room_message_acks a ON a.message_id = m.message_id AND a.agent_id = ?
        WHERE m.room_id = ? AND m.sequence > ? AND (EXISTS (
          SELECT 1 FROM agent_bus_room_message_targets t WHERE t.message_id = m.message_id AND t.agent_id = ?
        ) OR (? = 'user' AND m.from_agent_id = 'user')) ORDER BY m.sequence ASC LIMIT ?`).all(input.agentId, input.roomId, input.afterSequence, input.agentId, input.agentId, input.limit) as unknown as DatabaseRow[];
      const messages = rows.map((row) => toRoomMessageSummary(row, this.roomTargetAgentIds(asString(row.message_id)), optionalNumber(row.room_acknowledged_at)));
      return ok({ messages, nextSequence: messages.at(-1)?.sequence ?? input.afterSequence });
    } catch {
      return failure('INTERNAL_ERROR', 'Room inbox failed', true);
    }
  }

  public async roomHistory(input: RoomHistoryInput): Promise<Result<readonly AgentRoomMessageSummary[]>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      const rows = this.database.connection.prepare(`SELECT m.*, MAX(a.acknowledged_at) AS room_acknowledged_at
        FROM agent_bus_messages m
        LEFT JOIN agent_bus_room_message_acks a ON a.message_id = m.message_id
        WHERE m.room_id = ? AND m.sequence > ? GROUP BY m.sequence ORDER BY m.sequence ASC LIMIT ?`).all(input.roomId, input.afterSequence, input.limit) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toRoomMessageSummary(row, this.roomTargetAgentIds(asString(row.message_id)), optionalNumber(row.room_acknowledged_at))));
    } catch {
      return failure('INTERNAL_ERROR', 'Room history listing failed', true);
    }
  }

  public async roomParticipants(input: RoomParticipantsInput): Promise<Result<readonly AgentRoomParticipantSummary[]>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      const rows = this.database.connection.prepare(`SELECT p.*, a.role, a.status FROM agent_bus_room_participants p
        INNER JOIN agent_bus_agents a ON a.agent_id = p.agent_id
        WHERE p.room_id = ? ${input.includeInactive === true ? '' : 'AND p.left_at IS NULL'}
        ORDER BY p.joined_at ASC, p.agent_id ASC LIMIT ?`).all(input.roomId, input.limit) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toRoomParticipantSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Room participant listing failed', true);
    }
  }

  public async roomSnapshot(input: { readonly roomId: string }): Promise<Result<RoomSnapshot>> {
    try {
      const room = this.getRoomRow(input.roomId);
      if (room === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      const participants = await this.roomParticipants({ roomId: input.roomId, includeInactive: false, limit: 100 });
      if (!participants.ok) return participants;
      const latest = this.database.connection.prepare('SELECT MAX(sequence) AS sequence, COUNT(*) AS count FROM agent_bus_messages WHERE room_id = ?').get(input.roomId) as unknown as DatabaseRow | undefined;
      return ok({ room: toRoomSummary(room), participants: participants.value, latestSequence: asNumber(latest?.sequence), messageCount: asNumber(latest?.count) });
    } catch {
      return failure('INTERNAL_ERROR', 'Room snapshot failed', true);
    }
  }

  public async acknowledgeRoomMessage(input: RoomMessageAckInput): Promise<Result<AgentRoomMessageSummary>> {
    try {
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      if (!this.isActiveRoomParticipant(input.roomId, input.agentId)) return failure('ROOM_PARTICIPANT_REQUIRED', `Agent "${input.agentId}" must join room "${input.roomId}" before acknowledging`);
      if ((input.messageId === undefined) === (input.sequence === undefined)) return failure('INVALID_INPUT', 'Room acknowledgement requires exactly one message_id or sequence');
      const row = input.messageId === undefined
        ? this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE room_id = ? AND sequence = ?').get(input.roomId, input.sequence as number) as unknown as DatabaseRow | undefined
        : this.database.connection.prepare('SELECT * FROM agent_bus_messages WHERE room_id = ? AND message_id = ?').get(input.roomId, input.messageId) as unknown as DatabaseRow | undefined;
      if (row === undefined) return failure('ROOM_MESSAGE_NOT_FOUND', 'Room message was not found');
      const messageId = asString(row.message_id);
      if (this.database.connection.prepare('SELECT 1 FROM agent_bus_room_message_targets WHERE message_id = ? AND agent_id = ?').get(messageId, input.agentId) === undefined) return failure('ROOM_MESSAGE_SCOPE_VIOLATION', `Agent "${input.agentId}" cannot acknowledge this room message`);
      const now = Date.now();
      this.database.connection.prepare(`INSERT INTO agent_bus_room_message_acks (room_id, message_id, agent_id, acknowledged_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(message_id, agent_id) DO UPDATE SET acknowledged_at = excluded.acknowledged_at`).run(input.roomId, messageId, input.agentId, now);
      this.recordEvent({ eventType: 'ROOM_MESSAGE_ACKNOWLEDGED', agentId: input.agentId, payload: { roomId: input.roomId, messageId, sequence: asNumber(row.sequence) } });
      return ok(toRoomMessageSummary(row, this.roomTargetAgentIds(messageId), now));
    } catch {
      return failure('INTERNAL_ERROR', 'Room message acknowledgement failed', true);
    }
  }

  public async getRunnerCheckpoint(input: { readonly agentId: string; readonly roomId: string }): Promise<Result<AgentRunnerCheckpoint | null>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      const row = this.database.connection.prepare('SELECT * FROM agent_bus_runner_checkpoints WHERE agent_id = ? AND room_id = ?').get(input.agentId, input.roomId) as unknown as DatabaseRow | undefined;
      return ok(row === undefined ? null : toRunnerCheckpoint(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Runner checkpoint lookup failed', true);
    }
  }

  public async saveRunnerCheckpoint(input: RunnerCheckpointInput): Promise<Result<AgentRunnerCheckpoint>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      if (this.getRoomRow(input.roomId) === undefined) return failure('ROOM_NOT_FOUND', `Room "${input.roomId}" was not found`);
      if (!Number.isInteger(input.lastSequence) || input.lastSequence < 0) return failure('INVALID_INPUT', 'Runner checkpoint sequence is invalid');
      const now = Date.now();
      this.database.connection.prepare(`INSERT INTO agent_bus_runner_checkpoints
        (agent_id, room_id, last_sequence, current_task_id, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, room_id) DO UPDATE SET
          last_sequence = excluded.last_sequence,
          current_task_id = excluded.current_task_id,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`).run(
        input.agentId, input.roomId, input.lastSequence, input.currentTaskId ?? null, input.lastError ?? null, now,
      );
      const row = this.database.connection.prepare('SELECT * FROM agent_bus_runner_checkpoints WHERE agent_id = ? AND room_id = ?').get(input.agentId, input.roomId) as unknown as DatabaseRow | undefined;
      if (row === undefined) return failure('INTERNAL_ERROR', 'Runner checkpoint disappeared', true);
      return ok(toRunnerCheckpoint(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Runner checkpoint save failed', true);
    }
  }

  public async listEvents(input: EventListInput): Promise<Result<EventListSummary>> {
    try {
      const clauses = ['sequence > ?'];
      const parameters: Array<number | string> = [input.afterSequence];
      if (input.taskId !== undefined) {
        clauses.push('task_id = ?');
        parameters.push(input.taskId);
      }
      if (input.agentId !== undefined) {
        clauses.push('agent_id = ?');
        parameters.push(input.agentId);
      }
      const query = `SELECT * FROM agent_bus_events WHERE ${clauses.join(' AND ')} ORDER BY sequence ASC LIMIT ?`;
      parameters.push(input.limit);
      const rows = this.database.connection.prepare(query).all(...parameters) as unknown as DatabaseRow[];
      const events = rows.map((row) => toEventSummary(row));
      return ok({ events, nextSequence: events.at(-1)?.sequence ?? input.afterSequence });
    } catch {
      return failure('INTERNAL_ERROR', 'Event history listing failed', true);
    }
  }

  public async getSnapshot(): Promise<Result<AgentBusSnapshot>> {
    try {
      const agents: Record<AgentStatus, number> = { online: 0, busy: 0, idle: 0, blocked: 0, offline: 0 };
      const agentRows = this.database.connection.prepare('SELECT status, COUNT(*) AS count FROM agent_bus_agents GROUP BY status').all() as unknown as DatabaseRow[];
      for (const row of agentRows) {
        const status = row.status;
        if (isAgentStatus(status)) agents[status] = asNumber(row.count);
      }
      const tasks: Record<TaskStatus, number> = { queued: 0, assigned: 0, running: 0, blocked: 0, review: 0, completed: 0, failed: 0, cancelled: 0 };
      const taskRows = this.database.connection.prepare('SELECT status, COUNT(*) AS count FROM agent_bus_tasks GROUP BY status').all() as unknown as DatabaseRow[];
      for (const row of taskRows) {
        const status = row.status;
        if (isTaskStatus(status)) tasks[status] = asNumber(row.count);
      }
      const latestMessage = this.database.connection.prepare('SELECT MAX(sequence) AS sequence FROM agent_bus_messages').get() as unknown as DatabaseRow | undefined;
      const latestEvent = this.database.connection.prepare('SELECT MAX(sequence) AS sequence FROM agent_bus_events').get() as unknown as DatabaseRow | undefined;
      const activeRows = this.database.connection.prepare(`SELECT * FROM agent_bus_tasks
        WHERE status IN ('running', 'blocked', 'review') ORDER BY updated_at DESC, task_id ASC LIMIT 20`).all() as unknown as DatabaseRow[];
      return ok({
        agents,
        tasks,
        latestMessageSequence: asNumber(latestMessage?.sequence),
        latestEventSequence: asNumber(latestEvent?.sequence),
        activeTasks: activeRows.map((row) => toTaskRecord(row)),
        persistence: { backend: 'sqlite', durable: true, journalMode: 'WAL' },
      });
    } catch {
      return failure('INTERNAL_ERROR', 'Bus snapshot failed', true);
    }
  }

  public async acquireLock(input: LockAcquireInput): Promise<Result<AgentBusLockSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      if (!isLockType(input.lockType) || !Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 86_400) return failure('INVALID_INPUT', 'Lock type or TTL is invalid');
      if (input.taskId !== undefined && this.getTaskRow(input.taskId) === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      const now = Date.now();
      const expiresAt = now + input.ttlSeconds * 1_000;
      this.database.connection.exec('BEGIN IMMEDIATE;');
      try {
        let existing = this.getLockRow(input.resource);
        if (existing !== undefined && asNumber(existing.expires_at) <= now) {
          this.database.connection.prepare('DELETE FROM agent_bus_locks WHERE resource = ?').run(input.resource);
          const staleTaskId = optionalString(existing.task_id);
          this.recordEvent({ eventType: 'LOCK_RELEASED', agentId: asString(existing.owner_agent_id), ...(staleTaskId === undefined ? {} : { taskId: staleTaskId }), payload: { resource: input.resource, reason: 'expired' } });
          existing = undefined;
        }
        if (existing !== undefined) {
          const ownerAgentId = asString(existing.owner_agent_id);
          if (ownerAgentId !== input.agentId) {
            this.database.connection.exec('ROLLBACK;');
            return failure('LOCK_CONFLICT', `Resource "${input.resource}" is locked by "${ownerAgentId}"`);
          }
          const existingTaskId = optionalString(existing.task_id);
          this.database.connection.prepare('UPDATE agent_bus_locks SET lock_type = ?, task_id = ?, expires_at = ?, updated_at = ? WHERE resource = ?').run(input.lockType, input.taskId ?? existingTaskId ?? null, expiresAt, now, input.resource);
          this.recordEvent({ eventType: 'LOCK_RENEWED', agentId: input.agentId, ...(input.taskId === undefined ? (existingTaskId === undefined ? {} : { taskId: existingTaskId }) : { taskId: input.taskId }), payload: { resource: input.resource, expiresAt } });
          this.database.connection.exec('COMMIT;');
          return ok(this.requireLock(input.resource));
        }
        this.database.connection.prepare(`INSERT INTO agent_bus_locks
          (resource, lock_type, owner_agent_id, task_id, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.resource, input.lockType, input.agentId, input.taskId ?? null, expiresAt, now, now);
        this.recordEvent({ eventType: 'LOCK_ACQUIRED', agentId: input.agentId, ...(input.taskId === undefined ? {} : { taskId: input.taskId }), payload: { resource: input.resource, lockType: input.lockType, expiresAt } });
        this.database.connection.exec('COMMIT;');
        return ok(this.requireLock(input.resource));
      } catch (error) {
        try { this.database.connection.exec('ROLLBACK;'); } catch { /* preserve the original failure */ }
        throw error;
      }
    } catch {
      return failure('INTERNAL_ERROR', 'Lock acquisition failed', true);
    }
  }

  public async releaseLock(input: LockReleaseInput): Promise<Result<AgentBusLockSummary>> {
    try {
      const agent = this.getAgentRow(input.agentId);
      if (agent === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const lock = this.getLockRow(input.resource);
      if (lock === undefined) return failure('LOCK_NOT_FOUND', `Lock "${input.resource}" was not found`);
      const ownerAgentId = asString(lock.owner_agent_id);
      const forceAuthorized = input.force === true && asString(agent.role).toLowerCase() === 'main';
      if (ownerAgentId !== input.agentId && !forceAuthorized) return failure('LOCK_SCOPE_VIOLATION', `Agent "${input.agentId}" cannot release lock "${input.resource}"`);
      const taskId = optionalString(lock.task_id);
      this.database.connection.prepare('DELETE FROM agent_bus_locks WHERE resource = ?').run(input.resource);
      this.recordEvent({ eventType: 'LOCK_RELEASED', agentId: input.agentId, ...(taskId === undefined ? {} : { taskId }), payload: { resource: input.resource, forced: ownerAgentId !== input.agentId } });
      return ok(toLockSummary(lock));
    } catch {
      return failure('INTERNAL_ERROR', 'Lock release failed', true);
    }
  }

  public async listLocks(input: LockListInput): Promise<Result<readonly AgentBusLockSummary[]>> {
    try {
      this.pruneExpiredLocks(Date.now());
      const clauses = ['expires_at > ?'];
      const parameters: Array<number | string> = [Date.now()];
      if (input.agentId !== undefined) {
        clauses.push('owner_agent_id = ?');
        parameters.push(input.agentId);
      }
      if (input.taskId !== undefined) {
        clauses.push('task_id = ?');
        parameters.push(input.taskId);
      }
      parameters.push(input.limit);
      const rows = this.database.connection.prepare(`SELECT * FROM agent_bus_locks WHERE ${clauses.join(' AND ')} ORDER BY expires_at ASC, resource ASC LIMIT ?`).all(...parameters) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toLockSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Lock listing failed', true);
    }
  }

  public async addArtifact(input: ArtifactAddInput): Promise<Result<AgentBusArtifactSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      if (input.taskId !== undefined && this.getTaskRow(input.taskId) === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      if (!isArtifactType(input.type) || input.pathOrReference.trim().length === 0 || input.pathOrReference.length > 4_096) return failure('INVALID_INPUT', 'Artifact type or reference is invalid');
      const artifactId = randomUUID();
      const now = Date.now();
      this.database.connection.prepare(`INSERT INTO agent_bus_artifacts
        (artifact_id, task_id, agent_id, type, path_or_reference, sha256, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        artifactId, input.taskId ?? null, input.agentId, input.type, input.pathOrReference, input.sha256 ?? null, stringify(input.metadata ?? {}), now,
      );
      this.recordEvent({ eventType: 'ARTIFACT_ADDED', agentId: input.agentId, ...(input.taskId === undefined ? {} : { taskId: input.taskId }), payload: { artifactId, type: input.type, pathOrReference: input.pathOrReference } });
      return ok(this.requireArtifact(artifactId));
    } catch {
      return failure('INTERNAL_ERROR', 'Artifact registration failed', true);
    }
  }

  public async getArtifact(input: ArtifactGetInput): Promise<Result<AgentBusArtifactSummary>> {
    try {
      const row = this.getArtifactRow(input.artifactId);
      if (row === undefined) return failure('ARTIFACT_NOT_FOUND', `Artifact "${input.artifactId}" was not found`);
      return ok(toArtifactSummary(row));
    } catch {
      return failure('INTERNAL_ERROR', 'Artifact lookup failed', true);
    }
  }

  public async listArtifacts(input: ArtifactListInput): Promise<Result<readonly AgentBusArtifactSummary[]>> {
    try {
      const clauses: string[] = [];
      const parameters: Array<number | string> = [];
      if (input.agentId !== undefined) {
        clauses.push('agent_id = ?');
        parameters.push(input.agentId);
      }
      if (input.taskId !== undefined) {
        clauses.push('task_id = ?');
        parameters.push(input.taskId);
      }
      if (input.type !== undefined) {
        clauses.push('type = ?');
        parameters.push(input.type);
      }
      parameters.push(input.limit);
      const query = `SELECT * FROM agent_bus_artifacts${clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`} ORDER BY created_at ASC, artifact_id ASC LIMIT ?`;
      const rows = this.database.connection.prepare(query).all(...parameters) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toArtifactSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Artifact listing failed', true);
    }
  }

  public async allocateWorktree(input: WorktreeAllocateInput): Promise<Result<AgentBusWorktreeSummary>> {
    try {
      if (this.getAgentRow(input.agentId) === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const task = this.getTaskRow(input.taskId);
      if (task === undefined) return failure('TASK_NOT_FOUND', `Task "${input.taskId}" was not found`);
      if (optionalString(task.owner_agent_id) !== input.agentId) return failure('TASK_SCOPE_VIOLATION', `Agent "${input.agentId}" does not own task "${input.taskId}"`);
      const workspaceId = input.workspaceId.trim();
      const baseRef = (input.baseRef ?? 'HEAD').trim();
      if (workspaceId.length === 0 || workspaceId.length > 256 || baseRef.length === 0 || baseRef.length > 256 || baseRef.includes('\0')) return failure('INVALID_INPUT', 'Worktree workspace or base ref is invalid');
      const branchName = `agent/${worktreeSlug(input.agentId)}/${worktreeSlug(input.taskId)}`;
      const worktreePath = normalizeWorktreePath(input.worktreePath ?? `.worktrees/${worktreeSlug(input.agentId)}/${worktreeSlug(input.taskId)}`);
      if (worktreePath === undefined) return failure('INVALID_INPUT', 'Worktree path must remain under .worktrees or .rvn/worktrees');
      const now = Date.now();
      this.database.connection.exec('BEGIN IMMEDIATE;');
      try {
        const activeTask = this.database.connection.prepare('SELECT * FROM agent_bus_worktrees WHERE workspace_id = ? AND task_id = ? AND status = \'allocated\'').get(workspaceId, input.taskId) as unknown as DatabaseRow | undefined;
        if (activeTask !== undefined) {
          const owner = asString(activeTask.agent_id);
          if (owner !== input.agentId) {
            this.database.connection.exec('ROLLBACK;');
            return failure('WORKTREE_CONFLICT', `Task "${input.taskId}" already has a worktree owned by "${owner}"`);
          }
          if (asString(activeTask.worktree_path) !== worktreePath) {
            this.database.connection.exec('ROLLBACK;');
            return failure('WORKTREE_CONFLICT', `Task "${input.taskId}" already uses worktree path "${asString(activeTask.worktree_path)}"`);
          }
          this.database.connection.exec('COMMIT;');
          return ok(toWorktreeSummary(activeTask));
        }
        const activePath = this.database.connection.prepare('SELECT * FROM agent_bus_worktrees WHERE workspace_id = ? AND worktree_path = ? AND status = \'allocated\'').get(workspaceId, worktreePath) as unknown as DatabaseRow | undefined;
        if (activePath !== undefined) {
          this.database.connection.exec('ROLLBACK;');
          return failure('WORKTREE_CONFLICT', `Worktree path "${worktreePath}" is already owned by "${asString(activePath.agent_id)}"`);
        }
        const worktreeId = randomUUID();
        this.database.connection.prepare(`INSERT INTO agent_bus_worktrees
          (worktree_id, workspace_id, task_id, agent_id, branch_name, worktree_path, base_ref, status, created_at, updated_at, released_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'allocated', ?, ?, NULL)`).run(worktreeId, workspaceId, input.taskId, input.agentId, branchName, worktreePath, baseRef, now, now);
        this.recordEvent({ eventType: 'WORKTREE_ALLOCATED', taskId: input.taskId, agentId: input.agentId, payload: { worktreeId, workspaceId, branchName, worktreePath, baseRef } });
        this.database.connection.exec('COMMIT;');
        return ok(this.requireWorktree(worktreeId));
      } catch (error) {
        try { this.database.connection.exec('ROLLBACK;'); } catch { /* preserve the original failure */ }
        throw error;
      }
    } catch {
      return failure('INTERNAL_ERROR', 'Worktree allocation failed', true);
    }
  }

  public async releaseWorktree(input: WorktreeReleaseInput): Promise<Result<AgentBusWorktreeSummary>> {
    try {
      const agent = this.getAgentRow(input.agentId);
      if (agent === undefined) return failure('AGENT_NOT_REGISTERED', `Agent "${input.agentId}" is not registered`);
      const row = this.getWorktreeRow(input.worktreeId);
      if (row === undefined) return failure('WORKTREE_NOT_FOUND', `Worktree "${input.worktreeId}" was not found`);
      const owner = asString(row.agent_id);
      if (asString(row.status) === 'released') return ok(toWorktreeSummary(row));
      const isMain = asString(agent.role).toLowerCase() === 'main';
      if (owner !== input.agentId && !isMain) return failure('WORKTREE_SCOPE_VIOLATION', `Agent "${input.agentId}" cannot release worktree "${input.worktreeId}"`);
      const now = Date.now();
      this.database.connection.prepare('UPDATE agent_bus_worktrees SET status = \'released\', updated_at = ?, released_at = ? WHERE worktree_id = ? AND status = \'allocated\'').run(now, now, input.worktreeId);
      this.recordEvent({ eventType: 'WORKTREE_RELEASED', taskId: asString(row.task_id), agentId: input.agentId, payload: { worktreeId: input.worktreeId, workspaceId: asString(row.workspace_id), worktreePath: asString(row.worktree_path), forced: owner !== input.agentId } });
      return ok(this.requireWorktree(input.worktreeId));
    } catch {
      return failure('INTERNAL_ERROR', 'Worktree release failed', true);
    }
  }

  public async listWorktrees(input: WorktreeListInput): Promise<Result<readonly AgentBusWorktreeSummary[]>> {
    try {
      const clauses: string[] = [];
      const parameters: Array<number | string> = [];
      if (input.workspaceId !== undefined) { clauses.push('workspace_id = ?'); parameters.push(input.workspaceId); }
      if (input.agentId !== undefined) { clauses.push('agent_id = ?'); parameters.push(input.agentId); }
      if (input.taskId !== undefined) { clauses.push('task_id = ?'); parameters.push(input.taskId); }
      if (input.includeReleased !== true) clauses.push("status = 'allocated'");
      parameters.push(input.limit);
      const query = `SELECT * FROM agent_bus_worktrees${clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`} ORDER BY updated_at DESC, worktree_id ASC LIMIT ?`;
      const rows = this.database.connection.prepare(query).all(...parameters) as unknown as DatabaseRow[];
      return ok(rows.map((row) => toWorktreeSummary(row)));
    } catch {
      return failure('INTERNAL_ERROR', 'Worktree listing failed', true);
    }
  }

  private recordEvent(input: RecordEventInput): void {
    this.database.connection.prepare(`INSERT INTO agent_bus_events
      (event_id, event_type, task_id, agent_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), input.eventType, input.taskId ?? null, input.agentId ?? null, stringify(input.payload ?? {}), Date.now(),
    );
  }

  private getAgentRow(agentId: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_agents WHERE agent_id = ?').get(agentId) as unknown as DatabaseRow | undefined;
  }

  private getRoomRow(roomId: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_rooms WHERE room_id = ?').get(roomId) as unknown as DatabaseRow | undefined;
  }

  private getRoomParticipantRow(roomId: string, agentId: string): DatabaseRow | undefined {
    return this.database.connection.prepare(`SELECT p.*, a.role, a.status FROM agent_bus_room_participants p
      INNER JOIN agent_bus_agents a ON a.agent_id = p.agent_id WHERE p.room_id = ? AND p.agent_id = ?`).get(roomId, agentId) as unknown as DatabaseRow | undefined;
  }

  private isActiveRoomParticipant(roomId: string, agentId: string): boolean {
    const row = this.database.connection.prepare('SELECT 1 FROM agent_bus_room_participants WHERE room_id = ? AND agent_id = ? AND left_at IS NULL').get(roomId, agentId);
    return row !== undefined;
  }

  private requireRoom(roomId: string): AgentRoomSummary {
    const row = this.getRoomRow(roomId);
    if (row === undefined) throw new Error('Room disappeared during operation');
    return toRoomSummary(row);
  }

  private requireRoomParticipant(roomId: string, agentId: string): AgentRoomParticipantSummary {
    const row = this.getRoomParticipantRow(roomId, agentId);
    if (row === undefined) throw new Error('Room participant disappeared during operation');
    return toRoomParticipantSummary(row);
  }

  private roomTargetAgentIds(messageId: string): string[] {
    const rows = this.database.connection.prepare('SELECT agent_id FROM agent_bus_room_message_targets WHERE message_id = ? ORDER BY agent_id ASC').all(messageId) as unknown as DatabaseRow[];
    return rows.map((row) => asString(row.agent_id));
  }

  private requireAgent(agentId: string): AgentSummary {
    const row = this.getAgentRow(agentId);
    if (row === undefined) throw new Error('Agent disappeared during operation');
    return toAgentSummary(row);
  }

  private getTaskRow(taskId: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_tasks WHERE task_id = ?').get(taskId) as unknown as DatabaseRow | undefined;
  }

  private getLockRow(resource: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_locks WHERE resource = ?').get(resource) as unknown as DatabaseRow | undefined;
  }

  private requireLock(resource: string): AgentBusLockSummary {
    const row = this.getLockRow(resource);
    if (row === undefined) throw new Error('Lock disappeared during operation');
    return toLockSummary(row);
  }

  private pruneExpiredLocks(now: number): void {
    const rows = this.database.connection.prepare('SELECT * FROM agent_bus_locks WHERE expires_at <= ?').all(now) as unknown as DatabaseRow[];
    for (const row of rows) {
      this.database.connection.prepare('DELETE FROM agent_bus_locks WHERE resource = ? AND expires_at <= ?').run(asString(row.resource), now);
      const taskId = optionalString(row.task_id);
      this.recordEvent({ eventType: 'LOCK_RELEASED', agentId: asString(row.owner_agent_id), ...(taskId === undefined ? {} : { taskId }), payload: { resource: asString(row.resource), reason: 'expired' } });
    }
  }

  private getArtifactRow(artifactId: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_artifacts WHERE artifact_id = ?').get(artifactId) as unknown as DatabaseRow | undefined;
  }

  private requireArtifact(artifactId: string): AgentBusArtifactSummary {
    const row = this.getArtifactRow(artifactId);
    if (row === undefined) throw new Error('Artifact disappeared during operation');
    return toArtifactSummary(row);
  }

  private getWorktreeRow(worktreeId: string): DatabaseRow | undefined {
    return this.database.connection.prepare('SELECT * FROM agent_bus_worktrees WHERE worktree_id = ?').get(worktreeId) as unknown as DatabaseRow | undefined;
  }

  private requireWorktree(worktreeId: string): AgentBusWorktreeSummary {
    const row = this.getWorktreeRow(worktreeId);
    if (row === undefined) throw new Error('Worktree disappeared during operation');
    return toWorktreeSummary(row);
  }

  private requireTask(taskId: string): TaskSummary {
    const row = this.getTaskRow(taskId);
    if (row === undefined) throw new Error('Task disappeared during operation');
    return toTaskSummary(row);
  }

  private findClaimableTask(): DatabaseRow | undefined {
    const rows = this.database.connection.prepare(`SELECT * FROM agent_bus_tasks WHERE status IN ('queued', 'assigned') AND owner_agent_id IS NULL ORDER BY priority DESC, created_at ASC, task_id ASC`).all() as unknown as DatabaseRow[];
    return rows.find((row) => this.dependenciesReady(row));
  }

  private dependenciesReady(row: DatabaseRow): boolean {
    return parseStringArray(row.dependencies_json).every((dependencyId) => this.getTaskRow(dependencyId)?.status === 'completed');
  }

  private syncAgentAfterTaskUpdate(agentId: string, taskId: string, status: TaskStatus, now: number): void {
    if (status === 'blocked') {
      this.database.connection.prepare('UPDATE agent_bus_agents SET status = \'blocked\', updated_at = ? WHERE agent_id = ? AND current_task_id = ?').run(now, agentId, taskId);
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.database.connection.prepare('UPDATE agent_bus_agents SET status = \'idle\', current_task_id = NULL, updated_at = ? WHERE agent_id = ? AND current_task_id = ?').run(now, agentId, taskId);
    } else {
      this.database.connection.prepare('UPDATE agent_bus_agents SET status = \'busy\', current_task_id = ?, updated_at = ? WHERE agent_id = ?').run(taskId, now, agentId);
    }
  }
}

function toAgentSummary(row: DatabaseRow): AgentSummary {
  const sessionId = optionalString(row.session_id);
  const currentTaskId = optionalString(row.current_task_id);
  return {
    agentId: asString(row.agent_id),
    role: asString(row.role),
    ...(sessionId === undefined ? {} : { sessionId }),
    status: asAgentStatus(row.status),
    capabilities: parseStringArray(row.capabilities_json),
    ...(currentTaskId === undefined ? {} : { currentTaskId }),
    lastHeartbeatAt: asNumber(row.last_heartbeat_at),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function toAgentRecord(row: DatabaseRow): AgentRecord {
  const summary = toAgentSummary(row);
  return {
    ...summary,
    sessionId: summary.sessionId ?? null,
    currentTaskId: summary.currentTaskId ?? null,
  };
}

function toTaskSummary(row: DatabaseRow): TaskSummary {
  const ownerAgentId = optionalString(row.owner_agent_id);
  const progress = optionalString(row.progress);
  const result = parseRecord(row.result_json);
  const startedAt = optionalNumber(row.started_at);
  const completedAt = optionalNumber(row.completed_at);
  return {
    taskId: asString(row.task_id),
    title: asString(row.title),
    objective: asString(row.objective),
    status: asTaskStatus(row.status),
    priority: asNumber(row.priority),
    ...(ownerAgentId === undefined ? {} : { ownerAgentId }),
    createdByAgentId: asString(row.created_by_agent_id),
    acceptanceCriteria: parseStringArray(row.acceptance_json),
    fileScope: parseStringArray(row.file_scope_json),
    dependencies: parseStringArray(row.dependencies_json),
    readOnly: asNumber(row.read_only) === 1,
    ...(progress === undefined ? {} : { progress }),
    ...(result === undefined ? {} : { result }),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function toTaskRecord(row: DatabaseRow): TaskRecord {
  const summary = toTaskSummary(row);
  return {
    ...summary,
    ownerAgentId: summary.ownerAgentId ?? null,
    progress: summary.progress ?? null,
    result: summary.result ?? null,
    startedAt: summary.startedAt ?? null,
    completedAt: summary.completedAt ?? null,
  };
}

function toMessageSummary(row: DatabaseRow): AgentMessageSummary {
  const taskId = optionalString(row.task_id);
  const acknowledgedAt = optionalNumber(row.acknowledged_at);
  return {
    sequence: asNumber(row.sequence),
    messageId: asString(row.message_id),
    fromAgentId: asString(row.from_agent_id),
    toAgentId: asString(row.to_agent_id),
    ...(taskId === undefined ? {} : { taskId }),
    type: asMessageType(row.type),
    body: asString(row.body),
    metadata: parseRecord(row.metadata_json) ?? {},
    createdAt: asNumber(row.created_at),
    ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
  };
}

function toRoomSummary(row: DatabaseRow): AgentRoomSummary {
  return {
    roomId: asString(row.room_id),
    name: asString(row.name),
    createdByAgentId: optionalString(row.created_by_agent_id) ?? null,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function toRoomParticipantSummary(row: DatabaseRow): AgentRoomParticipantSummary {
  return {
    roomId: asString(row.room_id),
    agentId: asString(row.agent_id),
    role: asString(row.role),
    status: asAgentStatus(row.status),
    joinedAt: asNumber(row.joined_at),
    leftAt: optionalNumber(row.left_at) ?? null,
  };
}

function toRoomMessageSummary(row: DatabaseRow, targetAgentIds: readonly string[], acknowledgedAt?: number): AgentRoomMessageSummary {
  return {
    sequence: asNumber(row.sequence),
    messageId: asString(row.message_id),
    roomId: asString(row.room_id),
    fromAgentId: asString(row.from_agent_id),
    target: optionalString(row.room_target) ?? '@all',
    targetAgentIds,
    type: asMessageType(row.type),
    body: asString(row.body),
    metadata: parseRecord(row.metadata_json) ?? {},
    createdAt: asNumber(row.created_at),
    ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
  };
}

function toRunnerCheckpoint(row: DatabaseRow): AgentRunnerCheckpoint {
  return {
    agentId: asString(row.agent_id),
    roomId: asString(row.room_id),
    lastSequence: asNumber(row.last_sequence),
    currentTaskId: optionalString(row.current_task_id) ?? null,
    lastError: optionalString(row.last_error) ?? null,
    updatedAt: asNumber(row.updated_at),
  };
}

function toEventSummary(row: DatabaseRow): AgentBusEventSummary {
  const taskId = optionalString(row.task_id);
  const agentId = optionalString(row.agent_id);
  return {
    sequence: asNumber(row.sequence),
    eventId: asString(row.event_id),
    eventType: asAgentBusEventType(row.event_type),
    ...(taskId === undefined ? {} : { taskId }),
    ...(agentId === undefined ? {} : { agentId }),
    payload: parseRecord(row.payload_json) ?? {},
    createdAt: asNumber(row.created_at),
  };
}

function toLockSummary(row: DatabaseRow): AgentBusLockSummary {
  return {
    resource: asString(row.resource),
    lockType: asLockType(row.lock_type),
    ownerAgentId: asString(row.owner_agent_id),
    taskId: optionalString(row.task_id) ?? null,
    expiresAt: asNumber(row.expires_at),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function toArtifactSummary(row: DatabaseRow): AgentBusArtifactSummary {
  return {
    artifactId: asString(row.artifact_id),
    taskId: optionalString(row.task_id) ?? null,
    agentId: asString(row.agent_id),
    type: asArtifactType(row.type),
    pathOrReference: asString(row.path_or_reference),
    sha256: optionalString(row.sha256) ?? null,
    metadata: parseRecord(row.metadata_json) ?? {},
    createdAt: asNumber(row.created_at),
  };
}

function toWorktreeSummary(row: DatabaseRow): AgentBusWorktreeSummary {
  return {
    worktreeId: asString(row.worktree_id),
    workspaceId: asString(row.workspace_id),
    taskId: asString(row.task_id),
    agentId: asString(row.agent_id),
    branchName: asString(row.branch_name),
    worktreePath: asString(row.worktree_path),
    baseRef: asString(row.base_ref),
    status: isWorktreeStatus(row.status) ? row.status : 'released',
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    releasedAt: optionalNumber(row.released_at) ?? null,
  };
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value) ?? '{}';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function optionalString(value: unknown): string | undefined {
  const result = asString(value);
  return result.length === 0 ? undefined : result;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : asNumber(value);
}

function asAgentStatus(value: unknown): AgentStatus {
  return isAgentStatus(value) ? value : 'offline';
}

function asTaskStatus(value: unknown): TaskStatus {
  return isTaskStatus(value) ? value : 'queued';
}

function asMessageType(value: unknown): AgentMessageType {
  return isMessageType(value) ? value : 'UPDATE';
}

function asAgentBusEventType(value: unknown): AgentBusEventType {
  return isAgentBusEventType(value) ? value : 'TASK_UPDATED';
}

function asLockType(value: unknown): AgentBusLockType {
  return isLockType(value) ? value : 'file';
}

function asArtifactType(value: unknown): AgentBusArtifactType {
  return isArtifactType(value) ? value : 'analysis_summary';
}

function isAgentStatus(value: unknown): value is AgentStatus {
  return value === 'online' || value === 'busy' || value === 'idle' || value === 'blocked' || value === 'offline';
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'queued' || value === 'assigned' || value === 'running' || value === 'blocked' || value === 'review' || value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isMessageType(value: unknown): value is AgentMessageType {
  return value === 'TASK' || value === 'UPDATE' || value === 'RESULT' || value === 'BLOCKER' || value === 'QUESTION' || value === 'REVIEW' || value === 'ACK' || value === 'CANCEL';
}

function isAgentBusEventType(value: unknown): value is AgentBusEventType {
  return value === 'AGENT_REGISTERED' || value === 'AGENT_HEARTBEAT' || value === 'TASK_CREATED' || value === 'TASK_CLAIMED' || value === 'TASK_UPDATED' || value === 'TASK_COMPLETED' || value === 'MESSAGE_SENT' || value === 'MESSAGE_ACKNOWLEDGED' || value === 'ROOM_CREATED' || value === 'ROOM_JOINED' || value === 'ROOM_LEFT' || value === 'ROOM_MESSAGE_SENT' || value === 'ROOM_MESSAGE_ACKNOWLEDGED' || value === 'LOCK_ACQUIRED' || value === 'LOCK_RELEASED' || value === 'LOCK_RENEWED' || value === 'ARTIFACT_ADDED' || value === 'WORKTREE_ALLOCATED' || value === 'WORKTREE_RELEASED';
}

function isLockType(value: unknown): value is AgentBusLockType {
  return value === 'file' || value === 'directory' || value === 'integration' || value === 'runtime';
}

function isArtifactType(value: unknown): value is AgentBusArtifactType {
  return value === 'diff' || value === 'test_report' || value === 'runtime_capture' || value === 'screenshot' || value === 'analysis_summary' || value === 'commit' || value === 'patch' || value === 'benchmark';
}

function isWorktreeStatus(value: unknown): value is AgentBusWorktreeStatus {
  return value === 'allocated' || value === 'released';
}

function worktreeSlug(value: string): string {
  const slug = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length === 0 ? 'agent' : slug.slice(0, 128);
}

function normalizeWorktreePath(value: string): string | undefined {
  const normalized = value.trim().replaceAll('\\', '/');
  if (normalized.length === 0 || normalized.length > 4_096 || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return undefined;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part.length === 0)) return undefined;
  if (!(normalized.startsWith('.worktrees/') || normalized.startsWith('.rvn/worktrees/'))) return undefined;
  return normalized;
}

function failure<T = never>(code: Parameters<typeof appError>[0], message: string, recoverable = false): Result<T> {
  return err(appError(code, message, recoverable));
}
