import { describe, expect, it, vi } from 'vitest';
import { ok, type Result } from '@rvn/domain';
import type { AgentBusRepository } from '@rvn/storage';
import { ToolRegistry } from './tool-registry.js';

describe('Agent Bus role capability enforcement', () => {
  it('rejects research source mutation and code writes outside its owned worktree', async () => {
    const writeFile = vi.fn(async () => ok({ written: true }));
    const getAgent = vi.fn(async (input: { agentId: string }) => {
      if (input.agentId === 'research-1') return ok({ agentId: 'research-1', role: 'research', sessionId: null, status: 'online', capabilities: [], currentTaskId: null, lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 });
      return ok({ agentId: 'code-1', role: 'code', sessionId: null, status: 'online', capabilities: [], currentTaskId: null, lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 });
    });
    const bus = {
      getAgent,
      async listWorktrees(input) {
        return ok(input.agentId === 'code-1' ? [{ worktreeId: 'wt-1', workspaceId: 'workspace-1', taskId: 'task-1', agentId: 'code-1', branchName: 'agent/code-1/task-1', worktreePath: '.worktrees/code-1/task-1', baseRef: 'HEAD', status: 'allocated', createdAt: 1, updatedAt: 1, releasedAt: null }] : []);
      },
    } as unknown as AgentBusRepository;
    const researchRegistry = new ToolRegistry({ agentBus: bus, file: { writeFile } }, { clientId: 'research-1', clientName: 'research' });
    await expect(researchRegistry.invoke('write_file', { workspaceId: 'workspace-1', path: 'src/main.ts', content: 'blocked' })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'PERMISSION_DENIED' } } });
    expect(getAgent).toHaveBeenCalledWith({ agentId: 'research-1' });
    expect(writeFile).not.toHaveBeenCalled();

    const codeRegistry = new ToolRegistry({ agentBus: bus, file: { writeFile } }, { clientId: 'code-1', clientName: 'code' });
    await expect(codeRegistry.invoke('write_file', { workspaceId: 'workspace-1', path: 'src/main.ts', content: 'blocked' })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'PERMISSION_DENIED' } } });
    await expect(codeRegistry.invoke('write_file', { workspaceId: 'workspace-1', path: '.worktrees/code-1/task-1/src/main.ts', content: 'allowed' })).resolves.toMatchObject({ structuredContent: { written: true } });
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('keeps integration Git operations restricted to Main', async () => {
    const git = { async run(): Promise<Result<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>> { return ok({ exitCode: 0, stdout: '', stderr: '' }); } };
    const bus = { async getAgent() { return ok({ agentId: 'code-1', role: 'code', sessionId: null, status: 'online', capabilities: [], currentTaskId: null, lastHeartbeatAt: 1, createdAt: 1, updatedAt: 1 }); } } as unknown as AgentBusRepository;
    const registry = new ToolRegistry({ agentBus: bus, git }, { clientId: 'code-1', clientName: 'code' });
    await expect(registry.invoke('git', { workspaceId: 'workspace-1', args: ['merge', 'agent/code-1/task-1'], userConfirmed: true })).resolves.toMatchObject({ isError: true, structuredContent: { error: { code: 'PERMISSION_DENIED' } } });
  });
});
