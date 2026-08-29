import { ok, type Result } from '@rvn/domain';
import type {
  AgentBusRepository,
  AgentRoomMessageSummary,
  AgentRunnerCheckpoint,
  AgentStatus,
  TaskRecord,
} from '@rvn/storage';

export interface AgentRunnerOptions {
  readonly agentId: string;
  readonly role: string;
  readonly sessionId?: string;
  readonly capabilities?: readonly string[];
  readonly roomId: string;
  readonly replyTarget?: string;
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly blockerLimit?: number;
  readonly autoStart?: boolean;
}

export interface AgentRunnerExecutionContext {
  readonly message: AgentRoomMessageSummary;
  readonly task: TaskRecord | undefined;
  readonly signal: AbortSignal;
}

export interface AgentRunnerExecutionResult {
  readonly type: 'UPDATE' | 'RESULT' | 'BLOCKER' | 'QUESTION' | 'REVIEW';
  readonly body: string;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type AgentRunnerTickStatus = 'idle' | 'processed' | 'blocked' | 'stopped';

export interface AgentRunnerTickSummary {
  readonly status: AgentRunnerTickStatus;
  readonly sequence: number;
  readonly messageId?: string;
  readonly taskId?: string;
}

export interface AgentRunnerState {
  readonly agentId: string;
  readonly roomId: string;
  readonly running: boolean;
  readonly checkpoint: AgentRunnerCheckpoint;
}

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_BLOCKER_LIMIT = 3;

/**
 * Server-owned bounded worker loop. It deliberately exposes a deterministic
 * tick() so hosts can drive it from a scheduler and tests can exercise the
 * exact same execution path without a real timer.
 */
export class AgentRunner {
  private readonly agentId: string;
  private readonly role: string;
  private readonly sessionId: string | undefined;
  private readonly capabilities: readonly string[];
  private readonly roomId: string;
  private readonly replyTarget: string;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly blockerLimit: number;
  private readonly autoStart: boolean;
  private readonly executor: (context: AgentRunnerExecutionContext) => Promise<AgentRunnerExecutionResult>;
  private running = false;
  private processing = false;
  private checkpoint: AgentRunnerCheckpoint | null = null;
  private blockerCount = 0;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private readonly abortController = new AbortController();

  public constructor(
    private readonly bus: AgentBusRepository,
    options: AgentRunnerOptions,
    executor: (context: AgentRunnerExecutionContext) => Promise<AgentRunnerExecutionResult>,
  ) {
    this.agentId = options.agentId.trim();
    this.role = options.role.trim();
    this.sessionId = options.sessionId?.trim();
    this.capabilities = options.capabilities ?? [];
    this.roomId = options.roomId.trim();
    this.replyTarget = options.replyTarget?.trim() || '@main';
    this.pollIntervalMs = positive(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    this.heartbeatIntervalMs = positive(options.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.blockerLimit = positiveInteger(options.blockerLimit, DEFAULT_BLOCKER_LIMIT);
    this.autoStart = options.autoStart === true;
    this.executor = executor;
  }

  public async start(): Promise<Result<AgentRunnerState>> {
    if (this.running && this.checkpoint !== null) return ok(this.state());
    const registered = await this.bus.registerAgent({
      agentId: this.agentId,
      role: this.role,
      ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }),
      capabilities: this.capabilities,
      status: 'idle',
    });
    if (!registered.ok) return registered;
    const joined = await this.bus.joinRoom({ roomId: this.roomId, agentId: this.agentId });
    if (!joined.ok) return joined;
    const persisted = await this.bus.getRunnerCheckpoint({ agentId: this.agentId, roomId: this.roomId });
    if (!persisted.ok) return persisted;
    this.checkpoint = persisted.value;
    if (this.checkpoint === null) {
      const created = await this.bus.saveRunnerCheckpoint({ agentId: this.agentId, roomId: this.roomId, lastSequence: 0, currentTaskId: null, lastError: null });
      if (!created.ok) return created;
      this.checkpoint = created.value;
    }
    this.running = true;
    await this.heartbeat(this.checkpoint.currentTaskId === null ? 'idle' : 'busy', this.checkpoint.currentTaskId);
    if (this.autoStart) this.schedule();
    return ok(this.state());
  }

  public async tick(): Promise<Result<AgentRunnerTickSummary>> {
    if (!this.running || this.checkpoint === null) return ok({ status: 'stopped', sequence: this.checkpoint?.lastSequence ?? 0 });
    if (this.processing) return ok({ status: 'idle', sequence: this.checkpoint.lastSequence });
    this.processing = true;
    try {
      const inbox = await this.bus.roomInbox({ roomId: this.roomId, agentId: this.agentId, afterSequence: this.checkpoint.lastSequence, limit: 1 });
      if (!inbox.ok) return inbox;
      const message = inbox.value.messages[0];
      if (message === undefined) {
        await this.heartbeat(this.checkpoint.currentTaskId === null ? 'idle' : 'busy', this.checkpoint.currentTaskId);
        return ok({ status: 'idle', sequence: this.checkpoint.lastSequence });
      }
      await this.heartbeat('busy', this.checkpoint.currentTaskId);
      const taskId = readTaskId(message);
      const task = await this.loadTask(taskId);
      if (taskId !== undefined && task === undefined) return this.executionFailure(message, taskId, `Task "${taskId}" was not found`);
      if (taskId !== undefined && this.checkpoint.currentTaskId !== taskId && !isActiveOwner(task, this.agentId)) {
        const claimed = await this.bus.claimTask({ agentId: this.agentId, taskId });
        if (!claimed.ok) return this.executionFailure(message, taskId, claimed.error.message);
      }
      const execution = await this.execute(message, task);
      if (!execution.ok) return execution;
      const outcome = execution.value;
      if (outcome.type === 'RESULT' && taskId !== undefined) {
        const completed = await this.bus.completeTask({ agentId: this.agentId, taskId, result: outcome.result ?? {} });
        if (!completed.ok) return this.executionFailure(message, taskId, completed.error.message);
      } else if (outcome.type === 'UPDATE' && taskId !== undefined) {
        const updated = await this.bus.updateTask({ agentId: this.agentId, taskId, progress: outcome.body });
        if (!updated.ok) return this.executionFailure(message, taskId, updated.error.message);
      } else if (outcome.type === 'BLOCKER' && taskId !== undefined) {
        const blocked = await this.bus.updateTask({ agentId: this.agentId, taskId, status: 'blocked', progress: outcome.body });
        if (!blocked.ok) return this.executionFailure(message, taskId, blocked.error.message);
      }
      const repeatedBlocker = outcome.type === 'BLOCKER' && ++this.blockerCount >= this.blockerLimit;
      const body = repeatedBlocker
        ? `${outcome.body} (runner stopped after repeated blockers)`
        : outcome.body;
      const sent = await this.bus.sendRoomMessage({
        roomId: this.roomId,
        fromAgentId: this.agentId,
        target: this.replyTarget,
        type: outcome.type,
        body,
        ...(outcome.metadata === undefined ? {} : { metadata: outcome.metadata }),
      });
      if (!sent.ok) return sent;
      const acknowledged = await this.bus.acknowledgeRoomMessage({ roomId: this.roomId, agentId: this.agentId, messageId: message.messageId });
      if (!acknowledged.ok) return acknowledged;
      const nextTaskId = outcome.type === 'RESULT' ? null : (taskId ?? this.checkpoint.currentTaskId);
      const saved = await this.saveCheckpoint(message.sequence, nextTaskId, null);
      if (!saved.ok) return saved;
      if (repeatedBlocker) {
        await this.stop('repeated blockers', 'blocked');
        return ok({ status: 'stopped', sequence: message.sequence, messageId: message.messageId, ...(taskId === undefined ? {} : { taskId }) });
      }
      if (outcome.type === 'BLOCKER') return ok({ status: 'blocked', sequence: message.sequence, messageId: message.messageId, ...(taskId === undefined ? {} : { taskId }) });
      this.blockerCount = 0;
      return ok({ status: 'processed', sequence: message.sequence, messageId: message.messageId, ...(taskId === undefined ? {} : { taskId }) });
    } finally {
      this.processing = false;
    }
  }

  public async stop(reason = 'stopped', status: Extract<AgentStatus, 'offline' | 'blocked'> = 'offline'): Promise<Result<void>> {
    this.running = false;
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.pollTimer = undefined;
    this.heartbeatTimer = undefined;
    if (this.checkpoint !== null) {
      const saved = await this.saveCheckpoint(this.checkpoint.lastSequence, this.checkpoint.currentTaskId, reason);
      if (!saved.ok) return saved;
    }
    const heartbeat = await this.bus.heartbeatAgent({ agentId: this.agentId, status, currentTaskId: this.checkpoint?.currentTaskId ?? null });
    if (!heartbeat.ok) return heartbeat;
    return ok(undefined);
  }

  public state(): AgentRunnerState {
    if (this.checkpoint === null) throw new Error('Agent runner has not started');
    return { agentId: this.agentId, roomId: this.roomId, running: this.running, checkpoint: this.checkpoint };
  }

  private schedule(): void {
    this.pollTimer = setInterval(() => { void this.tick(); }, this.pollIntervalMs);
    this.heartbeatTimer = setInterval(() => {
      if (this.running && this.checkpoint !== null) void this.heartbeat(this.checkpoint.currentTaskId === null ? 'idle' : 'busy', this.checkpoint.currentTaskId);
    }, this.heartbeatIntervalMs);
  }

  private async execute(message: AgentRoomMessageSummary, task: TaskRecord | undefined): Promise<Result<AgentRunnerExecutionResult>> {
    try {
      return ok(await this.executor({ message, task, signal: this.abortController.signal }));
    } catch (error) {
      return ok({ type: 'BLOCKER', body: `Runner execution failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  private async loadTask(taskId: string | undefined): Promise<TaskRecord | undefined> {
    if (taskId === undefined) return undefined;
    const result = await this.bus.getTask({ taskId });
    return result.ok ? result.value : undefined;
  }

  private async executionFailure(message: AgentRoomMessageSummary, taskId: string | undefined, reason: string): Promise<Result<AgentRunnerTickSummary>> {
    const sent = await this.bus.sendRoomMessage({ roomId: this.roomId, fromAgentId: this.agentId, target: this.replyTarget, type: 'BLOCKER', body: reason });
    if (!sent.ok) return sent;
    const acknowledged = await this.bus.acknowledgeRoomMessage({ roomId: this.roomId, agentId: this.agentId, messageId: message.messageId });
    if (!acknowledged.ok) return acknowledged;
    const saved = await this.saveCheckpoint(message.sequence, taskId ?? this.checkpoint?.currentTaskId ?? null, reason);
    if (!saved.ok) return saved;
    return ok({ status: 'blocked', sequence: message.sequence, messageId: message.messageId, ...(taskId === undefined ? {} : { taskId }) });
  }

  private async saveCheckpoint(lastSequence: number, currentTaskId: string | null, lastError: string | null): Promise<Result<AgentRunnerCheckpoint>> {
    const saved = await this.bus.saveRunnerCheckpoint({ agentId: this.agentId, roomId: this.roomId, lastSequence, currentTaskId, lastError });
    if (saved.ok) this.checkpoint = saved.value;
    return saved;
  }

  private async heartbeat(status: AgentStatus, currentTaskId: string | null): Promise<void> {
    await this.bus.heartbeatAgent({ agentId: this.agentId, status, currentTaskId });
  }
}

function readTaskId(message: AgentRoomMessageSummary): string | undefined {
  const taskId = message.metadata.taskId ?? message.metadata.task_id;
  return typeof taskId === 'string' && taskId.trim().length > 0 ? taskId.trim() : undefined;
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const normalized = positive(value, fallback);
  return Number.isInteger(normalized) ? normalized : fallback;
}

function isActiveOwner(task: TaskRecord | undefined, agentId: string): boolean {
  return task?.ownerAgentId === agentId && (task.status === 'running' || task.status === 'review' || task.status === 'blocked');
}
