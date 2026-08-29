import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopRuntime } from '../src/main/desktop-services.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Bus live MCP acceptance', () => {
  it('keeps ownership, UPDATE delivery, completion, and cursors correct across three MCP sessions and reconnect', async () => {
    vi.stubEnv('RVN_UNRESTRICTED', '1');
    const dataRoot = await makeTemporaryRoot('rvn-agent-bus-live-data-');
    const workspaceRoot = await makeTemporaryRoot('rvn-agent-bus-live-workspace-');
    const runtime = createDesktopRuntime(dataRoot, { hostMutationApprovalProvider: async () => true });
    const clients = new Map<string, Client>();
    try {
      const workspace = await runtime.services.addWorkspace({ rootPath: workspaceRoot });
      const connection = await runtime.services.startMcp({ workspaceId: workspace.id });
      expect(connection.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      if (connection.url === null) throw new Error('MCP did not start');

      const main = await connectClient('main', connection.url, clients);
      const workerA = await connectClient('worker-a', connection.url, clients);
      const workerB = await connectClient('worker-b', connection.url, clients);
      const listed = await main.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names.length).toBe(new Set(names).size);
      expect(names).toEqual(expect.arrayContaining([
        'agent_register', 'agent_heartbeat', 'task_create', 'task_list', 'task_claim', 'task_update', 'task_complete', 'message_send', 'message_inbox',
      ]));

      await expectSuccessful(main.callTool({ name: 'agent_register', arguments: { agent_id: 'live-main', role: 'main', session_id: 'live-session-main', capabilities: ['rvn_read'] } }));
      await expectSuccessful(workerA.callTool({ name: 'agent_register', arguments: { agent_id: 'live-worker-a', role: 'code', session_id: 'live-session-a', capabilities: ['rvn_read'] } }));
      await expectSuccessful(workerB.callTool({ name: 'agent_register', arguments: { agent_id: 'live-worker-b', role: 'test', session_id: 'live-session-b', capabilities: ['rvn_read'] } }));

      const created = await expectSuccessful(main.callTool({ name: 'task_create', arguments: {
        agent_id: 'live-main',
        title: 'Live Agent Bus acceptance',
        objective: 'Prove two worker sessions share durable state',
        priority: 90,
        acceptance_criteria: ['Worker A owns the task', 'Worker B is rejected', 'Main receives UPDATE', 'completion survives reconnect'],
        file_scope: [],
        dependencies: [],
        read_only: true,
      } }));
      const taskId = stringField(created, 'taskId');
      expect(taskId).toBeTruthy();

      const claimed = await expectSuccessful(workerA.callTool({ name: 'task_claim', arguments: { agent_id: 'live-worker-a', task_id: taskId } }));
      expect(claimed).toMatchObject({ taskId, status: 'running', ownerAgentId: 'live-worker-a' });
      const rejected = await workerB.callTool({ name: 'task_claim', arguments: { agent_id: 'live-worker-b', task_id: taskId } });
      expect(rejected.isError).toBe(true);
      expect(errorCode(rejected)).toBe('TASK_ALREADY_CLAIMED');

      await expectSuccessful(workerA.callTool({ name: 'task_update', arguments: { agent_id: 'live-worker-a', task_id: taskId, progress: 'Worker A completed the live progress checkpoint.' } }));
      const sent = await expectSuccessful(workerA.callTool({ name: 'message_send', arguments: { from_agent_id: 'live-worker-a', to_agent_id: 'live-main', task_id: taskId, type: 'UPDATE', body: 'Worker A progress is durable.' } }));
      expect(sent).toMatchObject({ fromAgentId: 'live-worker-a', toAgentId: 'live-main', taskId, type: 'UPDATE' });

      const inbox = await expectSuccessful(main.callTool({ name: 'message_inbox', arguments: { agent_id: 'live-main', after_sequence: 0, limit: 50 } }));
      expect(inbox.messages).toHaveLength(1);
      expect(inbox.messages[0]).toMatchObject({ sequence: expect.any(Number), body: 'Worker A progress is durable.', taskId });
      const nextSequence = numberField(inbox, 'nextSequence');
      expect(nextSequence).toBe(numberField(inbox.messages[0] as Record<string, unknown>, 'sequence'));
      const emptyInbox = await expectSuccessful(main.callTool({ name: 'message_inbox', arguments: { agent_id: 'live-main', after_sequence: nextSequence, limit: 50 } }));
      expect(emptyInbox.messages).toEqual([]);
      expect(emptyInbox.nextSequence).toBe(nextSequence);

      const completed = await expectSuccessful(workerA.callTool({ name: 'task_complete', arguments: { agent_id: 'live-worker-a', task_id: taskId, result: { verification: 'live-mcp', passed: true } } }));
      expect(completed).toMatchObject({ taskId, status: 'completed', result: { verification: 'live-mcp', passed: true } });

      await main.close();
      clients.delete('main');
      const reconnectedMain = await connectClient('main-reconnected', connection.url, clients);
      await expectSuccessful(reconnectedMain.callTool({ name: 'agent_register', arguments: { agent_id: 'live-main', role: 'main', session_id: 'live-session-main-reconnected', capabilities: ['rvn_read'] } }));
      const completedTasksResponse = await expectSuccessful(reconnectedMain.callTool({ name: 'task_list', arguments: { statuses: ['completed'] } }));
      const completedTasks = completedTasksResponse.value;
      expect(Array.isArray(completedTasks) ? completedTasks : []).toEqual(expect.arrayContaining([expect.objectContaining({ taskId, status: 'completed', result: { verification: 'live-mcp', passed: true } })]));
      const replayedInbox = await expectSuccessful(reconnectedMain.callTool({ name: 'message_inbox', arguments: { agent_id: 'live-main', after_sequence: 0, limit: 50 } }));
      expect(replayedInbox.messages).toHaveLength(1);
      expect(replayedInbox.messages[0]).toMatchObject({ sequence: nextSequence, body: 'Worker A progress is durable.' });
      const noDuplicateAfterReconnect = await expectSuccessful(reconnectedMain.callTool({ name: 'message_inbox', arguments: { agent_id: 'live-main', after_sequence: nextSequence, limit: 50 } }));
      expect(noDuplicateAfterReconnect.messages).toEqual([]);
      expect(noDuplicateAfterReconnect.nextSequence).toBe(nextSequence);
    } finally {
      await Promise.allSettled([...clients.values()].map((client) => client.close()));
      await runtime.close();
    }
  }, 90_000);
});

async function connectClient(name: string, url: string, clients: Map<string, Client>): Promise<Client> {
  const client = new Client({ name: `agent-bus-${name}`, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  clients.set(name, client);
  return client;
}

async function expectSuccessful(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  const result = await promise as { readonly isError?: boolean; readonly structuredContent?: unknown };
  expect(result.isError).not.toBe(true);
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

function errorCode(result: { readonly structuredContent?: unknown }): unknown {
  const structured = (result.structuredContent ?? {}) as Record<string, unknown>;
  return (structured.error as Record<string, unknown> | undefined)?.code;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing string field ${key}`);
  return value;
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number') throw new Error(`Missing number field ${key}`);
  return value;
}

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const raw = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(raw);
  return realpath(raw);
}
