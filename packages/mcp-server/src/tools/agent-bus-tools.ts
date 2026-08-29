import { defineTool, missingService, type McpToolContext, type McpToolDefinition } from './tool-types.js';
import {
  agentGetSchema,
  agentListSchema,
  agentHeartbeatSchema,
  agentRegisterSchema,
  busSnapshotSchema,
  artifactAddSchema,
  artifactGetSchema,
  artifactListSchema,
  eventListSchema,
  lockAcquireSchema,
  lockListSchema,
  lockReleaseSchema,
  messageInboxSchema,
  messageAckSchema,
  messageSendSchema,
  roomAckSchema,
  roomCreateSchema,
  roomHistorySchema,
  roomInboxSchema,
  roomJoinSchema,
  roomLeaveSchema,
  roomParticipantsSchema,
  roomSendSchema,
  roomSnapshotSchema,
  taskClaimSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskGetSchema,
  taskListSchema,
  taskUpdateSchema,
  worktreeAllocateSchema,
  worktreeListSchema,
  worktreeReleaseSchema,
} from './schemas.js';

const readOnlyInspection = {
  permission: 'READ' as const,
  annotations: { readOnlyHint: true, destructiveHint: false },
};

const coordinationMutation = {
  permission: 'WRITE' as const,
  annotations: { readOnlyHint: false, destructiveHint: false },
};

export function agentBusTools(context: McpToolContext): McpToolDefinition[] {
  return [
    defineTool({
      name: 'agent_register',
      description: 'Register or refresh an agent session in the durable rvn Agent Bus.',
      ...coordinationMutation,
      inputSchema: agentRegisterSchema,
      handler: async (input) => {
        if (context.services.agentBus === undefined) return missingService();
        if (context.services.agentSessions !== undefined && context.actor.sessionId !== undefined) {
          return context.services.agentSessions.bind({ agentId: input.agent_id, role: input.role, sessionId: context.actor.sessionId, transport: context.sessionTransport ?? 'http', capabilities: input.capabilities });
        }
        return context.services.agentBus.registerAgent({
          agentId: input.agent_id,
          role: input.role,
          ...(context.actor.sessionId === undefined
            ? (input.session_id === undefined ? {} : { sessionId: input.session_id })
            : { sessionId: context.actor.sessionId }),
          capabilities: input.capabilities,
          ...(input.status === undefined ? {} : { status: input.status }),
        });
      },
    }),
    defineTool({
      name: 'agent_get',
      description: 'Read a durable Agent Bus agent record by agent ID.',
      ...readOnlyInspection,
      inputSchema: agentGetSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.getAgent({ agentId: input.agent_id }),
    }),
    defineTool({
      name: 'agent_heartbeat',
      description: 'Record an agent heartbeat and its current coordination status.',
      ...coordinationMutation,
      inputSchema: agentHeartbeatSchema,
      handler: async (input) => {
        if (context.services.agentBus === undefined) return missingService();
        if (context.services.agentSessions !== undefined && context.actor.sessionId !== undefined) {
          return context.services.agentSessions.heartbeat({ agentId: input.agent_id, sessionId: context.actor.sessionId, ...(input.status === undefined ? {} : { status: input.status }), ...(input.current_task_id === undefined ? {} : { currentTaskId: input.current_task_id }) });
        }
        return context.services.agentBus.heartbeatAgent({ agentId: input.agent_id, ...(input.status === undefined ? {} : { status: input.status }), ...(input.current_task_id === undefined ? {} : { currentTaskId: input.current_task_id }) });
      },
    }),
    defineTool({
      name: 'agent_list',
      description: 'List durable Agent Bus agent sessions with bounded results.',
      ...readOnlyInspection,
      inputSchema: agentListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listAgents({ limit: input.limit }),
    }),
    defineTool({
      name: 'task_create',
      description: 'Create a durable Agent Bus task with acceptance criteria, file scope, and dependencies.',
      ...coordinationMutation,
      inputSchema: taskCreateSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.createTask({ createdByAgentId: input.agent_id, title: input.title, objective: input.objective, acceptanceCriteria: input.acceptance_criteria, fileScope: input.file_scope, dependencies: input.dependencies, priority: input.priority, readOnly: input.read_only }),
    }),
    defineTool({
      name: 'task_get',
      description: 'Read a durable Agent Bus task record by task ID.',
      ...readOnlyInspection,
      inputSchema: taskGetSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.getTask({ taskId: input.task_id }),
    }),
    defineTool({
      name: 'task_list',
      description: 'List durable Agent Bus tasks ordered by priority and creation time.',
      ...readOnlyInspection,
      inputSchema: taskListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listTasks({ ...(input.statuses === undefined ? {} : { statuses: input.statuses }), ...(input.owner_agent_id === undefined ? {} : { ownerAgentId: input.owner_agent_id }) }),
    }),
    defineTool({
      name: 'task_claim',
      description: 'Atomically claim a queued task for an agent, respecting dependency readiness.',
      ...coordinationMutation,
      inputSchema: taskClaimSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.claimTask({ agentId: input.agent_id, ...(input.task_id === undefined ? {} : { taskId: input.task_id }) }),
    }),
    defineTool({
      name: 'task_update',
      description: 'Update the progress or valid lifecycle status of an owned Agent Bus task.',
      ...coordinationMutation,
      inputSchema: taskUpdateSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.updateTask({ agentId: input.agent_id, taskId: input.task_id, ...(input.status === undefined ? {} : { status: input.status }), ...(input.progress === undefined ? {} : { progress: input.progress }) }),
    }),
    defineTool({
      name: 'task_complete',
      description: 'Complete an owned Agent Bus task and persist its result.',
      ...coordinationMutation,
      inputSchema: taskCompleteSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.completeTask({ agentId: input.agent_id, taskId: input.task_id, result: input.result }),
    }),
    defineTool({
      name: 'message_send',
      description: 'Send a durable typed message to another registered Agent Bus participant.',
      ...coordinationMutation,
      inputSchema: messageSendSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.sendMessage({ fromAgentId: input.from_agent_id, toAgentId: input.to_agent_id, ...(input.task_id === undefined ? {} : { taskId: input.task_id }), type: input.type, body: input.body, ...(input.metadata === undefined ? {} : { metadata: input.metadata }) }),
    }),
    defineTool({
      name: 'message_inbox',
      description: 'Read durable messages addressed to an agent using a sequence cursor.',
      ...readOnlyInspection,
      inputSchema: messageInboxSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.messageInbox({ agentId: input.agent_id, afterSequence: input.after_sequence, limit: input.limit }),
    }),
    defineTool({
      name: 'message_ack',
      description: 'Acknowledge a durable Agent Bus message addressed to the agent.',
      ...coordinationMutation,
      inputSchema: messageAckSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.acknowledgeMessage({ agentId: input.agent_id, ...(input.message_id === undefined ? {} : { messageId: input.message_id }), ...(input.sequence === undefined ? {} : { sequence: input.sequence }) }),
    }),
    defineTool({
      name: 'event_list',
      description: 'Read durable Agent Bus event history using a monotonic sequence cursor.',
      ...readOnlyInspection,
      inputSchema: eventListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listEvents({ afterSequence: input.after_sequence, limit: input.limit, ...(input.task_id === undefined ? {} : { taskId: input.task_id }), ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }) }),
    }),
    defineTool({
      name: 'bus_snapshot',
      description: 'Read a compact durable Agent Bus snapshot for session resume.',
      ...readOnlyInspection,
      inputSchema: busSnapshotSchema,
      handler: async () => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.getSnapshot(),
    }),
    defineTool({
      name: 'room_create',
      description: 'Create a durable shared Agent Bus room and its initial participants.',
      ...coordinationMutation,
      inputSchema: roomCreateSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.createRoom({ name: input.name, ...(input.room_id === undefined ? {} : { roomId: input.room_id }), ...(input.created_by_agent_id === undefined ? {} : { createdByAgentId: input.created_by_agent_id }), participantAgentIds: input.participant_agent_ids }),
    }),
    defineTool({
      name: 'room_join',
      description: 'Join a durable shared Agent Bus room as an existing agent.',
      ...coordinationMutation,
      inputSchema: roomJoinSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.joinRoom({ roomId: input.room_id, agentId: input.agent_id }),
    }),
    defineTool({
      name: 'room_leave',
      description: 'Leave a durable shared Agent Bus room without deleting its history.',
      ...coordinationMutation,
      inputSchema: roomLeaveSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.leaveRoom({ roomId: input.room_id, agentId: input.agent_id }),
    }),
    defineTool({
      name: 'room_send',
      description: 'Send a durable typed message to a shared room using an @all, @role, or @agent target.',
      ...coordinationMutation,
      inputSchema: roomSendSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.sendRoomMessage({ roomId: input.room_id, ...(input.from_agent_id === undefined ? {} : { fromAgentId: input.from_agent_id }), target: input.target, type: input.type, body: input.body, ...(input.metadata === undefined ? {} : { metadata: input.metadata }) }),
    }),
    defineTool({
      name: 'room_inbox',
      description: 'Read new durable room messages for one participant using a monotonic sequence cursor.',
      ...readOnlyInspection,
      inputSchema: roomInboxSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.roomInbox({ roomId: input.room_id, agentId: input.agent_id, afterSequence: input.after_sequence, limit: input.limit }),
    }),
    defineTool({
      name: 'room_history',
      description: 'Read bounded durable history for a shared Agent Bus room.',
      ...readOnlyInspection,
      inputSchema: roomHistorySchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.roomHistory({ roomId: input.room_id, afterSequence: input.after_sequence, limit: input.limit }),
    }),
    defineTool({
      name: 'room_participants',
      description: 'List durable room participants and their current Agent Bus presence.',
      ...readOnlyInspection,
      inputSchema: roomParticipantsSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.roomParticipants({ roomId: input.room_id, ...(input.include_inactive === undefined ? {} : { includeInactive: input.include_inactive }), limit: input.limit }),
    }),
    defineTool({
      name: 'room_snapshot',
      description: 'Read a compact durable shared room snapshot for reconnect and resume.',
      ...readOnlyInspection,
      inputSchema: roomSnapshotSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.roomSnapshot({ roomId: input.room_id }),
    }),
    defineTool({
      name: 'room_ack',
      description: 'Acknowledge a durable room message for one participant.',
      ...coordinationMutation,
      inputSchema: roomAckSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.acknowledgeRoomMessage({ roomId: input.room_id, agentId: input.agent_id, ...(input.message_id === undefined ? {} : { messageId: input.message_id }), ...(input.sequence === undefined ? {} : { sequence: input.sequence }) }),
    }),
    defineTool({
      name: 'lock_acquire',
      description: 'Atomically acquire or renew a durable Agent Bus resource lock.',
      ...coordinationMutation,
      inputSchema: lockAcquireSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.acquireLock({ agentId: input.agent_id, resource: input.resource, lockType: input.lock_type, ...(input.task_id === undefined ? {} : { taskId: input.task_id }), ttlSeconds: input.ttl_seconds }),
    }),
    defineTool({
      name: 'lock_release',
      description: 'Release an owned Agent Bus resource lock, or force-release as Main.',
      ...coordinationMutation,
      inputSchema: lockReleaseSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.releaseLock({ agentId: input.agent_id, resource: input.resource, force: input.force }),
    }),
    defineTool({
      name: 'lock_list',
      description: 'List active durable Agent Bus locks with bounded filters.',
      ...readOnlyInspection,
      inputSchema: lockListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listLocks({ ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }), ...(input.task_id === undefined ? {} : { taskId: input.task_id }), limit: input.limit }),
    }),
    defineTool({
      name: 'artifact_add',
      description: 'Register a durable reference to an Agent Bus artifact without storing its content.',
      ...coordinationMutation,
      inputSchema: artifactAddSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.addArtifact({ agentId: input.agent_id, ...(input.task_id === undefined ? {} : { taskId: input.task_id }), type: input.type, pathOrReference: input.path_or_reference, ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }), ...(input.metadata === undefined ? {} : { metadata: input.metadata }) }),
    }),
    defineTool({
      name: 'artifact_get',
      description: 'Read a durable Agent Bus artifact reference by artifact ID.',
      ...readOnlyInspection,
      inputSchema: artifactGetSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.getArtifact({ artifactId: input.artifact_id }),
    }),
    defineTool({
      name: 'artifact_list',
      description: 'List durable Agent Bus artifact references with bounded filters.',
      ...readOnlyInspection,
      inputSchema: artifactListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listArtifacts({ ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }), ...(input.task_id === undefined ? {} : { taskId: input.task_id }), ...(input.type === undefined ? {} : { type: input.type }), limit: input.limit }),
    }),
    defineTool({
      name: 'worktree_allocate',
      description: 'Allocate a durable isolated worktree reference and deterministic task branch to its owner.',
      ...coordinationMutation,
      inputSchema: worktreeAllocateSchema,
      handler: async (input) => {
        if (context.services.agentBus === undefined) return missingService();
        const allocated = await context.services.agentBus.allocateWorktree({ agentId: input.agent_id, taskId: input.task_id, workspaceId: input.workspace_id, baseRef: input.base_ref, ...(input.worktree_path === undefined ? {} : { worktreePath: input.worktree_path }) });
        if (!allocated.ok || !input.materialize) return allocated;
        if (context.services.git === undefined) return { ok: true, value: { ...allocated.value, materialized: false, materializeReason: 'Git service is not configured' } };
        const result = await context.services.git.run(context.actor, { workspaceId: input.workspace_id, args: ['worktree', 'add', '-b', allocated.value.branchName, allocated.value.worktreePath, allocated.value.baseRef], userConfirmed: true });
        if (!result.ok) {
          await context.services.agentBus.releaseWorktree({ agentId: input.agent_id, worktreeId: allocated.value.worktreeId });
          return result;
        }
        return { ok: true, value: { ...allocated.value, materialized: true, git: result.value } };
      },
    }),
    defineTool({
      name: 'worktree_release',
      description: 'Release an owned durable worktree reference; Main may release stale worker ownership.',
      ...coordinationMutation,
      inputSchema: worktreeReleaseSchema,
      handler: async (input) => {
        if (context.services.agentBus === undefined) return missingService();
        if (input.materialize && context.services.git !== undefined) {
          const records = await context.services.agentBus.listWorktrees({ includeReleased: true, limit: 100 });
          if (!records.ok) return records;
          const record = records.value.find((candidate) => candidate.worktreeId === input.worktree_id && candidate.status === 'allocated');
          if (record !== undefined) {
            const result = await context.services.git.run(context.actor, { workspaceId: record.workspaceId, args: ['worktree', 'remove', record.worktreePath], userConfirmed: true });
            if (!result.ok) return result;
          }
        }
        return context.services.agentBus.releaseWorktree({ agentId: input.agent_id, worktreeId: input.worktree_id });
      },
    }),
    defineTool({
      name: 'worktree_list',
      description: 'List durable Agent Bus worktree ownership records with bounded filters.',
      ...readOnlyInspection,
      inputSchema: worktreeListSchema,
      handler: async (input) => context.services.agentBus === undefined
        ? missingService()
        : context.services.agentBus.listWorktrees({ ...(input.workspace_id === undefined ? {} : { workspaceId: input.workspace_id }), ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }), ...(input.task_id === undefined ? {} : { taskId: input.task_id }), includeReleased: input.include_released, limit: input.limit }),
    }),
  ];
}
