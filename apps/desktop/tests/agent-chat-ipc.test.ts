import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createDesktopRuntime } from '../src/main/desktop-services.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Bus desktop chat bridge', () => {
  it('creates and disconnects an editable desktop session without deleting its durable record', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-session-edit-'));
    temporaryRoots.push(root);
    const runtime = createDesktopRuntime(root);
    try {
      const created = await runtime.services.createAgentSession({ agentId: 'research-edit', role: 'research' });
      expect(created).toMatchObject({ agentId: 'research-edit', role: 'research', status: 'online' });
      expect(created.sessionId).toMatch(/^desktop-/);

      const disconnected = await runtime.services.disconnectAgentSession({ agentId: 'research-edit' });
      expect(disconnected).toEqual({ disconnected: true });
      const record = await runtime.mcpServices.agentBus?.getAgent({ agentId: 'research-edit' });
      expect(record).toMatchObject({ ok: true, value: { status: 'offline', sessionId: null } });
    } finally {
      await runtime.close();
    }
  });

  it('persists a renderer message through the Agent Bus repository', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-chat-ipc-'));
    temporaryRoots.push(root);
    const runtime = createDesktopRuntime(root);
    try {
      const bus = runtime.mcpServices.agentBus;
      if (bus === undefined) throw new Error('Agent Bus service is unavailable');
      await bus.registerAgent({ agentId: 'main-chat', role: 'main', sessionId: 'chat-main', capabilities: [] });
      await bus.registerAgent({ agentId: 'code-chat', role: 'code', sessionId: 'chat-code', capabilities: [] });

      const sent = await runtime.services.sendAgentMessage({
        fromAgentId: 'main-chat',
        toAgentId: 'code-chat',
        type: 'UPDATE',
        body: 'Please report current progress',
      });

      expect(sent).toMatchObject({ fromAgentId: 'main-chat', toAgentId: 'code-chat', body: 'Please report current progress', type: 'UPDATE' });
      const inbox = await bus.messageInbox({ agentId: 'code-chat', afterSequence: 0, limit: 10 });
      expect(inbox.ok).toBe(true);
      if (!inbox.ok) throw new Error('inbox read failed');
      expect(inbox.value.messages).toEqual(expect.arrayContaining([expect.objectContaining({ messageId: sent.messageId, body: 'Please report current progress' })]));
    } finally {
      await runtime.close();
    }
  });

  it('keeps a durable bidirectional conversation available to the dashboard', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-chat-roundtrip-'));
    temporaryRoots.push(root);
    const runtime = createDesktopRuntime(root);
    try {
      const bus = runtime.mcpServices.agentBus;
      if (bus === undefined) throw new Error('Agent Bus service is unavailable');
      await bus.registerAgent({ agentId: 'main-roundtrip', role: 'main', sessionId: 'session-main', capabilities: [] });
      await bus.registerAgent({ agentId: 'worker-roundtrip', role: 'code', sessionId: 'session-worker', capabilities: [] });

      const request = await runtime.services.sendAgentMessage({
        fromAgentId: 'main-roundtrip',
        toAgentId: 'worker-roundtrip',
        type: 'UPDATE',
        body: 'Please reply from the worker session',
      });
      await runtime.services.sendAgentMessage({
        fromAgentId: 'worker-roundtrip',
        toAgentId: 'main-roundtrip',
        type: 'RESULT',
        body: 'Worker reply received',
      });

      const snapshot = await runtime.services.getDashboard();
      const messages = snapshot.agentBus.messages.filter((message) => message.sequence >= request.sequence);
      expect(messages.map((message) => message.sequence)).toEqual([...messages.map((message) => message.sequence)].sort((a, b) => a - b));
      expect(new Set(messages.map((message) => message.sequence)).size).toBe(messages.length);
      expect(messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ fromAgentId: 'main-roundtrip', toAgentId: 'worker-roundtrip', body: 'Please reply from the worker session' }),
        expect.objectContaining({ fromAgentId: 'worker-roundtrip', toAgentId: 'main-roundtrip', body: 'Worker reply received' }),
      ]));
    } finally {
      await runtime.close();
    }
  });

  it('routes messages through every registered worker role over independent MCP sessions', async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-chat-roles-data-'));
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-chat-roles-workspace-'));
    temporaryRoots.push(dataRoot, workspaceRoot);
    const runtime = createDesktopRuntime(dataRoot);
    const clients: Client[] = [];
    try {
      const workspace = await runtime.services.addWorkspace({ rootPath: workspaceRoot });
      const connection = await runtime.services.startMcp({ workspaceId: workspace.id });
      if (connection.url === null) throw new Error('MCP did not start');
      const connect = async (name: string): Promise<Client> => {
        const client = new Client({ name: `agent-chat-${name}`, version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(new URL(connection.url!)));
        clients.push(client);
        return client;
      };
      const main = await connect('main');
      const workers = await Promise.all([
        connect('code'),
        connect('research'),
        connect('test'),
        connect('review'),
      ]);
      await expectSuccessful(main.callTool({ name: 'agent_register', arguments: { agent_id: 'chat-main', role: 'main', capabilities: [] } }));
      const workerIds = ['chat-code', 'chat-research', 'chat-test', 'chat-review'] as const;
      await Promise.all(workers.map((worker, index) => expectSuccessful(worker.callTool({
        name: 'agent_register',
        arguments: { agent_id: workerIds[index], role: workerIds[index].replace('chat-', ''), capabilities: [] },
      }))));

      await Promise.all(workerIds.map((workerId, index) => expectSuccessful(main.callTool({
        name: 'message_send',
        arguments: { from_agent_id: 'chat-main', to_agent_id: workerId, type: 'UPDATE', body: `request-${index}` },
      }))));
      const workerReplies = await Promise.all(workers.map(async (worker, index) => {
        const inbox = messageRecords(await expectSuccessful(worker.callTool({ name: 'message_inbox', arguments: { agent_id: workerIds[index], after_sequence: 0, limit: 10 } })));
        expect(inbox).toHaveLength(1);
        expect(inbox[0]).toMatchObject({ toAgentId: workerIds[index], body: `request-${index}` });
        return expectSuccessful(worker.callTool({
          name: 'message_send',
          arguments: { from_agent_id: workerIds[index], to_agent_id: 'chat-main', type: 'RESULT', body: `reply-${index}` },
        }));
      }));
      expect(workerReplies).toHaveLength(workerIds.length);

      const mainInbox = messageRecords(await expectSuccessful(main.callTool({ name: 'message_inbox', arguments: { agent_id: 'chat-main', after_sequence: 0, limit: 20 } })));
      expect(mainInbox).toHaveLength(workerIds.length);
      expect(mainInbox.map((message) => message.sequence)).toEqual([...mainInbox.map((message) => message.sequence)].sort((a, b) => a - b));
      expect(mainInbox.map((message) => message.body).sort()).toEqual(['reply-0', 'reply-1', 'reply-2', 'reply-3']);
    } finally {
      await Promise.allSettled(clients.map((client) => client.close()));
      await runtime.close();
    }
  }, 90_000);

  it('sends a first-class user message through the durable shared room', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-room-ipc-'));
    temporaryRoots.push(root);
    const runtime = createDesktopRuntime(root);
    try {
      const bus = runtime.mcpServices.agentBus;
      if (bus === undefined) throw new Error('Agent Bus service is unavailable');
      await bus.registerAgent({ agentId: 'room-main', role: 'main', sessionId: 'room-main-session', capabilities: [] });
      await bus.registerAgent({ agentId: 'room-code', role: 'code', sessionId: 'room-code-session', capabilities: [] });

      const sent = await runtime.services.sendAgentRoomMessage({ target: '@room-code', type: 'UPDATE', body: 'Inspect the room task' });
      expect(sent).toMatchObject({ fromAgentId: 'user', roomId: 'rvn-main-room', target: '@room-code', type: 'UPDATE', body: 'Inspect the room task' });
      const snapshot = await runtime.services.getDashboard();
      expect(snapshot.agentBus.roomMessages).toEqual(expect.arrayContaining([expect.objectContaining({ messageId: sent.messageId, fromAgentId: 'user', target: '@room-code', body: 'Inspect the room task' })]));
    } finally {
      await runtime.close();
    }
  });
});

async function expectSuccessful(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  const result = await promise as { readonly isError?: boolean; readonly structuredContent?: unknown };
  expect(result.isError).not.toBe(true);
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

function messageRecords(payload: Record<string, unknown>): readonly Record<string, unknown>[] {
  return Array.isArray(payload.messages) ? payload.messages.filter((message): message is Record<string, unknown> => typeof message === 'object' && message !== null && !Array.isArray(message)) : [];
}
