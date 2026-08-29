import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopRuntime } from '../src/main/desktop-services.js';
import { removeTemporaryDirectory } from '../../../scripts/electron-startup-cleanup.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map((root) => removeTemporaryDirectory(root)));
});

describe('Agent Bus dashboard snapshot', () => {
  it('projects durable agents, tasks, events, locks, and artifacts into the dashboard', async () => {
    vi.stubEnv('RVN_UNRESTRICTED', '1');
    const root = await mkdtemp(path.join(os.tmpdir(), 'rvn-agent-bus-dashboard-'));
    temporaryRoots.push(root);
    const runtime = createDesktopRuntime(root);
    try {
      const bus = runtime.mcpServices.agentBus;
      if (bus === undefined) throw new Error('Agent Bus service is unavailable');
      await bus.registerAgent({ agentId: 'main-dashboard', role: 'main', sessionId: 'http-main-dashboard', capabilities: [] });
      await bus.registerAgent({ agentId: 'code-dashboard', role: 'code', sessionId: 'http-code-dashboard', capabilities: [] });
      const task = await bus.createTask({ createdByAgentId: 'main-dashboard', title: 'Dashboard task', objective: 'Show durable state', acceptanceCriteria: [], fileScope: [], dependencies: [], priority: 50, readOnly: false });
      expect(task.ok).toBe(true);
      if (!task.ok) throw new Error('task creation failed');
      await bus.claimTask({ agentId: 'code-dashboard', taskId: task.value.taskId });
      const lock = await bus.acquireLock({ agentId: 'code-dashboard', taskId: task.value.taskId, resource: 'src/dashboard.ts', lockType: 'file', ttlSeconds: 60 });
      expect(lock.ok).toBe(true);
      const artifact = await bus.addArtifact({ agentId: 'code-dashboard', taskId: task.value.taskId, type: 'test_report', pathOrReference: 'artifacts/dashboard.json' });
      expect(artifact.ok).toBe(true);
      const sent = await bus.sendMessage({ fromAgentId: 'code-dashboard', toAgentId: 'main-dashboard', type: 'UPDATE', body: 'Dashboard task is in progress', taskId: task.value.taskId });
      expect(sent.ok).toBe(true);
      const activeCallId = await runtime.activityTracker.begin('write_file', { path: 'src/dashboard.ts' }, { sessionId: 'http-code-dashboard' });
      const activeDashboard = await runtime.services.getDashboard();
      expect(activeDashboard.agentBus.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: 'code-dashboard', activeToolName: 'write_file' }),
      ]));
      await runtime.activityTracker.end(activeCallId, 'SUCCESS', 1);
      const unboundCallId = await runtime.activityTracker.begin('git_diff', { path: 'src/dashboard.ts' }, { sessionId: 'unbound-session' });
      await runtime.activityTracker.end(unboundCallId, 'SUCCESS', 1);
      const dashboard = await runtime.services.getDashboard();
      expect(dashboard.agentBus.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: 'main-dashboard', role: 'main', sessionId: 'http-main-dashboard' }),
        expect.objectContaining({ agentId: 'code-dashboard', role: 'code', sessionId: 'http-code-dashboard', currentTaskId: task.value.taskId }),
        expect.objectContaining({ agentId: 'code-dashboard', activeToolName: null }),
        expect.objectContaining({ agentId: 'code-dashboard', lastActivityToolName: 'write_file' }),
        expect.objectContaining({ agentId: 'main-dashboard', lastActivityToolName: 'git_diff' }),
      ]));
      expect(dashboard.agentBus.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: task.value.taskId, status: 'running', ownerAgentId: 'code-dashboard' })]));
      expect(dashboard.agentBus.locks).toEqual([expect.objectContaining({ resource: 'src/dashboard.ts', ownerAgentId: 'code-dashboard' })]);
      expect(dashboard.agentBus.artifacts).toEqual([expect.objectContaining({ taskId: task.value.taskId, type: 'test_report' })]);
      expect(dashboard.agentBus.messages).toEqual(expect.arrayContaining([expect.objectContaining({ fromAgentId: 'code-dashboard', toAgentId: 'main-dashboard', body: 'Dashboard task is in progress', taskId: task.value.taskId })]));
      expect(dashboard.agentBus.messages.find((message) => message.body === 'Dashboard task is in progress')).toMatchObject({ sequence: sent.ok ? sent.value.sequence : -1, messageId: sent.ok ? sent.value.messageId : '' });
      expect(dashboard.agentBus.events).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'TASK_CLAIMED' }), expect.objectContaining({ eventType: 'LOCK_ACQUIRED' }), expect.objectContaining({ eventType: 'ARTIFACT_ADDED' })]));
    } finally {
      await runtime.close();
    }
  }, 30_000);
});
