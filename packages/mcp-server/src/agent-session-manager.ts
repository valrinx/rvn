import { appError, ok, type Result } from '@rvn/domain';
import type { AgentBusRepository, AgentStatus, AgentSummary } from '@rvn/storage';

export type AgentSessionTransport = 'http' | 'stdio';

export interface AgentSessionBindInput {
  readonly agentId: string;
  readonly role: string;
  readonly sessionId: string;
  readonly transport: AgentSessionTransport;
  readonly capabilities: readonly string[];
}

export interface AgentSessionHeartbeatInput {
  readonly agentId: string;
  readonly sessionId: string;
  readonly status?: AgentStatus;
  readonly currentTaskId?: string | null;
}

/**
 * Durable session boundary for Agent Bus identities. The repository's agent
 * row is the source of truth; this manager adds the explicit conflict and
 * reconnect rules around that row and never accepts a client conversation ID.
 */
export class AgentSessionManager {
  public constructor(private readonly bus: AgentBusRepository) {}

  public async bind(input: AgentSessionBindInput): Promise<Result<AgentSummary>> {
    const agentId = input.agentId.trim();
    const sessionId = input.sessionId.trim();
    if (agentId.length === 0 || sessionId.length === 0) return { ok: false, error: appError('INVALID_INPUT', 'Agent and protocol session IDs are required') };
    // A new bind for the same agent is an explicit reconnect/rebind. The
    // repository row moves to the latest trusted server session, which also
    // invalidates the old session for subsequent ownership calls.
    const listed = await this.bus.listAgents({ limit: 100 });
    if (!listed.ok) return listed;
    const duplicate = listed.value.find((candidate) => candidate.agentId !== agentId && isActive(candidate.status) && candidate.sessionId === sessionId);
    if (duplicate !== undefined) return { ok: false, error: appError('SESSION_ALREADY_BOUND', `Protocol session is already bound to agent "${duplicate.agentId}"`) };
    return this.bus.registerAgent({ agentId, role: input.role.trim(), sessionId, capabilities: input.capabilities, status: 'online' });
  }

  public async heartbeat(input: AgentSessionHeartbeatInput): Promise<Result<AgentSummary>> {
    const bound = await this.requireBound(input.agentId, input.sessionId);
    if (!bound.ok) return bound;
    return this.bus.heartbeatAgent({ agentId: input.agentId, ...(input.status === undefined ? {} : { status: input.status }), ...(input.currentTaskId === undefined ? {} : { currentTaskId: input.currentTaskId }) });
  }

  public async disconnect(input: { readonly agentId: string; readonly sessionId: string }): Promise<Result<AgentSummary>> {
    const bound = await this.requireBound(input.agentId, input.sessionId);
    if (!bound.ok) return bound;
    return this.bus.disconnectAgent({ agentId: input.agentId });
  }

  public async disconnectSession(sessionId: string): Promise<Result<number>> {
    const normalized = sessionId.trim();
    if (normalized.length === 0) return { ok: false, error: appError('INVALID_INPUT', 'Protocol session ID is required') };
    const listed = await this.bus.listAgents({ limit: 100 });
    if (!listed.ok) return listed;
    let disconnected = 0;
    for (const agent of listed.value) {
      if (!isActive(agent.status) || agent.sessionId !== normalized) continue;
      const result = await this.bus.disconnectAgent({ agentId: agent.agentId });
      if (!result.ok) return result;
      disconnected += 1;
    }
    return ok(disconnected);
  }

  public listPresence(limit = 100): Promise<Result<readonly AgentSummary[]>> {
    return this.bus.listAgents({ limit });
  }

  private async requireBound(agentId: string, sessionId: string): Promise<Result<AgentSummary>> {
    const bound = await this.bus.getAgent({ agentId });
    if (!bound.ok) return bound;
    if (bound.value.sessionId !== sessionId.trim()) return { ok: false, error: appError('AGENT_SESSION_MISMATCH', `Agent "${agentId}" is bound to a different MCP protocol session`) };
    const { sessionId: storedSessionId, currentTaskId, ...summary } = bound.value;
    return ok({ ...summary, ...(storedSessionId === null ? {} : { sessionId: storedSessionId }), ...(currentTaskId === null ? {} : { currentTaskId }) });
  }
}

function isActive(status: AgentStatus): boolean {
  return status !== 'offline';
}
