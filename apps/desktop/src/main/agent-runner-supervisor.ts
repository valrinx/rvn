import { appError, err, ok, type Result } from '@rvn/domain';
import type { CodexService, FileActor } from '@rvn/application';
import {
  AgentRunner,
  type AgentRunnerExecutionContext,
  type AgentRunnerExecutionResult,
  type WorkspaceScope,
} from '@rvn/mcp-server';
import type {
  AgentBusRepository,
  AgentRecord,
  AgentRoomMessageSummary,
} from '@rvn/storage';

export interface DesktopAgentRunnerSupervisorOptions {
  readonly getActiveWorkspace: () => Promise<WorkspaceScope | null>;
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly maxExecutionMs?: number;
}

export type DesktopAgentRunnerStatus = 'starting' | 'active' | 'unavailable' | 'stopped';

/**
 * Owns the desktop-side runner lifecycle. MCP registrations remain the source
 * of identity and session binding; this supervisor only activates a runner
 * when a room message is addressed to that durable agent.
 */
export class DesktopAgentRunnerSupervisor {
  private readonly runners = new Map<string, AgentRunner>();
  private readonly statuses = new Map<string, DesktopAgentRunnerStatus>();
  private readonly starts = new Map<string, Promise<Result<void>>>();

  public constructor(
    private readonly bus: AgentBusRepository,
    private readonly codex: CodexService,
    private readonly options: DesktopAgentRunnerSupervisorOptions,
  ) {}

  public async dispatch(message: AgentRoomMessageSummary): Promise<Result<void>> {
    const failures: string[] = [];
    for (const agentId of message.targetAgentIds) {
      const agent = await this.bus.getAgent({ agentId });
      if (!agent.ok) {
        failures.push(`${agentId}: ${agent.error.message}`);
        continue;
      }
      // Main is the coordinating UI identity. Worker responses are generated
      // by addressed worker runners and routed back to @main.
      if (agent.value.role.trim().toLowerCase() === 'main') continue;
      const started = await this.ensureAgentRecord(agent.value, message.roomId);
      if (!started.ok) {
        const reason = `${started.error.code}: ${started.error.message}`;
        const published = await this.bus.sendRoomMessage({ roomId: message.roomId, fromAgentId: agentId, target: '@main', type: 'BLOCKER', body: reason });
        if (!published.ok) failures.push(`${agentId}: ${started.error.message}; ${published.error.message}`);
      } else {
        const runner = this.runners.get(agentId);
        if (runner !== undefined) void runner.tick();
      }
    }
    return failures.length === 0 ? ok(undefined) : err(appError('INTERNAL_ERROR', failures.join('; '), true));
  }

  public async ensureAgent(agentId: string, roomId: string): Promise<Result<void>> {
    const agent = await this.bus.getAgent({ agentId });
    if (!agent.ok) return agent;
    return this.ensureAgentRecord(agent.value, roomId);
  }

  public status(agentId: string): DesktopAgentRunnerStatus | undefined {
    return this.statuses.get(agentId);
  }

  public async stopAgent(agentId: string): Promise<void> {
    const runner = this.runners.get(agentId);
    this.runners.delete(agentId);
    this.statuses.set(agentId, 'stopped');
    if (runner !== undefined) await runner.stop('desktop session stopped').catch(() => undefined);
  }

  public async close(): Promise<void> {
    const agentIds = [...this.runners.keys()];
    await Promise.all(agentIds.map((agentId) => this.stopAgent(agentId)));
  }

  private async ensureAgentRecord(agent: AgentRecord, roomId: string): Promise<Result<void>> {
    const existing = this.runners.get(agent.agentId);
    if (existing !== undefined) return ok(undefined);
    const pending = this.starts.get(agent.agentId);
    if (pending !== undefined) return pending;
    const sessionId = agent.sessionId;
    if (sessionId === null || sessionId.trim().length === 0) {
      this.statuses.set(agent.agentId, 'unavailable');
      return err(appError('INTERNAL_ERROR', `Agent "${agent.agentId}" has no bound protocol session`, true));
    }
    if (agent.status === 'offline') {
      this.statuses.set(agent.agentId, 'unavailable');
      return err(appError('INTERNAL_ERROR', `Agent "${agent.agentId}" is offline`, true));
    }
    this.statuses.set(agent.agentId, 'starting');
    const start = this.startAgent(agent, roomId, sessionId);
    this.starts.set(agent.agentId, start);
    try {
      return await start;
    } finally {
      this.starts.delete(agent.agentId);
    }
  }

  private async startAgent(agent: AgentRecord, roomId: string, sessionId: string): Promise<Result<void>> {
    const runner = new AgentRunner(this.bus, {
      agentId: agent.agentId,
      role: agent.role,
      sessionId,
      capabilities: agent.capabilities,
      roomId,
      autoStart: true,
      ...(this.options.pollIntervalMs === undefined ? {} : { pollIntervalMs: this.options.pollIntervalMs }),
      ...(this.options.heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs: this.options.heartbeatIntervalMs }),
    }, (context) => this.execute(agent, context));
    const started = await runner.start();
    if (!started.ok) {
      this.statuses.set(agent.agentId, 'unavailable');
      return started;
    }
    this.runners.set(agent.agentId, runner);
    this.statuses.set(agent.agentId, 'active');
    return ok(undefined);
  }

  private async execute(agent: AgentRecord, context: AgentRunnerExecutionContext): Promise<AgentRunnerExecutionResult> {
    const workspace = await this.options.getActiveWorkspace();
    if (workspace === null) return blocker('Agent executor unavailable: no active workspace is configured');
    const actor: FileActor = {
      clientId: agent.agentId,
      clientName: `RVN ${agent.role} agent`,
      sessionId: agent.sessionId ?? agent.agentId,
    };
    const instruction = buildInstruction(agent, context);
    const started = await this.codex.run(actor, workspace.workspaceId, instruction, context.signal, true);
    if (!started.ok) return blocker(`${started.error.code}: ${started.error.message}`);
    const deadline = Date.now() + positive(this.options.maxExecutionMs, 120_000);
    let output = '';
    while (Date.now() <= deadline) {
      if (context.signal.aborted) {
        await this.codex.stop(actor, workspace.workspaceId, started.value.codexTaskId, true).catch(() => undefined);
        return blocker('Agent executor was stopped before it produced a response');
      }
      const logs = await this.codex.taskLogs(actor, workspace.workspaceId, started.value.codexTaskId, { tailLines: 200 });
      if (logs.ok) output = collectOutput(logs.value.entries.map((entry) => entry.text).join(''));
      const status = await this.codex.taskStatus(actor, workspace.workspaceId, started.value.codexTaskId);
      if (!status.ok) return blocker(`${status.error.code}: ${status.error.message}`);
      if (isTerminal(status.value.state)) {
        if (status.value.state === 'exited' && (status.value.exitCode === undefined || status.value.exitCode === 0)) {
          return { type: 'RESULT', body: output || 'Agent completed without a textual response', result: { executor: 'codex', codexTaskId: started.value.codexTaskId, processId: started.value.processId } };
        }
        return blocker(output || `Codex executor ended with state ${status.value.state}`);
      }
      await delay(50, context.signal);
    }
    await this.codex.stop(actor, workspace.workspaceId, started.value.codexTaskId, true).catch(() => undefined);
    return blocker(`Codex executor timed out after ${positive(this.options.maxExecutionMs, 120_000)}ms`);
  }
}

function buildInstruction(agent: AgentRecord, context: AgentRunnerExecutionContext): string {
  const task = context.task === undefined ? 'No task is attached.' : `Task: ${context.task.title}\nObjective: ${context.task.objective}`;
  return [
    `You are the RVN ${agent.role} worker agent (${agent.agentId}).`,
    'Respond to the room message below with a concise plain-text answer for the Main agent.',
    'Do not describe hidden reasoning. Do not modify files unless the message explicitly requests a change.',
    task,
    `Message type: ${context.message.type}`,
    `Message from: ${context.message.fromAgentId}`,
    `Message body:\n${context.message.body}`,
  ].join('\n\n');
}

function blocker(body: string): AgentRunnerExecutionResult {
  return { type: 'BLOCKER', body };
}

function collectOutput(value: string): string {
  // ANSI escape sequences are intentionally stripped from subprocess output.
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim().slice(-16_000);
}

function isTerminal(state: string): boolean {
  return state === 'exited' || state === 'failed' || state === 'stopped' || state === 'timed_out' || state === 'termination_unverified';
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    if (signal.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
