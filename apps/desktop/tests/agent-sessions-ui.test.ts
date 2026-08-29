import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Agent Work Flow session UI', () => {
  it('renders the horizontal session workspace from the selected mockup', () => {
    const home = readFileSync(new URL('../src/renderer/features/home/ControlCenterPage.tsx', import.meta.url), 'utf8');
    expect(home).toContain('data-testid="agent-session-card-grid"');
    expect(home).not.toContain('data-testid="agent-message-composer"');
    expect(home).toContain('data-testid="agent-alert-stack"');
    expect(home).not.toContain('>File<');
    expect(home).toContain('agent-edit-menu');
    expect(home).toContain('agent-view-menu');
    expect(home).toContain('agent-profile-menu');
    expect(home).toContain('window.rvn.createAgentSession');
    expect(home).toContain('window.rvn.disconnectAgentSession');
    expect(home).toContain('agent-profile-name');
    expect(home).toContain('agent-profile-avatar');
    expect(home).toContain('updateAgentProfile');
    expect(home).toContain('rvn-session-card');
    expect(home).toContain('RoleAvatar');
    expect(home).toContain('agent.sessionId');
    expect(home).toContain('rvn-workflow-stage');
    expect(home).toContain('rvn-workflow-activity');
    expect(home).toContain('resolveAgentWorkflowStage');
    expect(home).not.toContain('rvn-agent-message-feed');
    expect(home).toContain('CORE_AGENT_ROLES');
    expect(home).toContain('isAgentWorking');
    expect(home).toContain('alerts.length === 0');
    expect(home).toContain('if (working === 0) return alerts;');
  });

  it('uses one target selector and renders the user identity separately', () => {
    const home = readFileSync(new URL('../src/renderer/features/home/ControlCenterPage.tsx', import.meta.url), 'utf8');
    expect(home.match(/aria-label="Message from agent"/g) ?? []).toHaveLength(0);
    expect(home).not.toContain('localUserMessages');
    expect(home).not.toContain('AGENT_USER_MESSAGE_STORAGE_KEY');
    expect(home).not.toContain('readUserMessageKeys');
    expect(home).not.toContain('agent-user-message');
    expect(home).not.toContain('data-sender={isUserMessage ?');
    expect(home).toContain('agent.activeToolName !== null');
    expect(home).not.toContain("return agent.status === 'busy' || agent.currentTaskId !== null;");
    expect(home).not.toContain('Chat with agent');
    expect(home).not.toContain('<select aria-label="Chat with agent"');
    expect(home).not.toContain('resolveChatMention');
    expect(home).not.toContain('agent-mentions');
    expect(home).not.toContain('พิมพ์ @agent');
    expect(home).not.toContain('chatMessageLegacyKey');
    expect(home).toContain('useEffect');
  });

  it('keeps durable Agent Bus data out of the desktop chat surface', () => {
    const home = readFileSync(new URL('../src/renderer/features/home/ControlCenterPage.tsx', import.meta.url), 'utf8');
    expect(home).not.toContain('data-testid="agent-room-timeline"');
    expect(home).not.toContain('agentBus.roomMessages');
    expect(home).not.toContain('sendAgentRoomMessage');
    expect(home).toContain('agent-session-card-grid');
  });

  it('reports the current AI workflow step from durable agent and task state', async () => {
    const { resolveAgentWorkflowStage } = await import('../src/renderer/features/home/ControlCenterPage.tsx');
    const agent = { agentId: 'code', role: 'code', sessionId: 'code-session', status: 'busy', currentTaskId: 'task-1', activeToolName: 'write_file', lastHeartbeatAt: 1 } as const;
    const tasks = [{ taskId: 'task-1', title: 'Implement feature', status: 'running', ownerAgentId: 'code', dependencies: [] }] as const;
    expect(resolveAgentWorkflowStage(agent, tasks, 'th')).toMatchObject({ stage: 'writing', label: 'กำลังเขียน', taskId: 'task-1', taskTitle: 'Implement feature' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'main', currentTaskId: null, activeToolName: 'task_create' }, [], 'th')).toMatchObject({ stage: 'analyzing', label: 'กำลังวิเคราะห์' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'code', currentTaskId: null, activeToolName: 'write_file' }, [], 'th')).toMatchObject({ stage: 'writing', label: 'กำลังเขียน' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'code', currentTaskId: null, activeToolName: 'git_status' }, [], 'th')).toMatchObject({ stage: 'working', label: 'กำลังทำงาน' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'research', currentTaskId: null, activeToolName: 'search_text' }, [], 'th')).toMatchObject({ stage: 'researching', label: 'กำลังค้นคว้า' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'test', currentTaskId: null, activeToolName: 'project_test' }, [], 'th')).toMatchObject({ stage: 'testing', label: 'กำลังทดสอบ' });
    expect(resolveAgentWorkflowStage({ ...agent, role: 'review', currentTaskId: null, activeToolName: 'git_diff' }, [], 'th')).toMatchObject({ stage: 'reviewing', label: 'กำลังตรวจทาน' });
    expect(resolveAgentWorkflowStage({ ...agent, status: 'busy', currentTaskId: null, activeToolName: null }, [], 'th')).toMatchObject({ stage: 'waiting', label: 'รอรับงาน' });
    expect(resolveAgentWorkflowStage({ ...agent, status: 'idle', currentTaskId: null, activeToolName: null, lastActivityToolName: 'git_diff' }, [], 'th')).toMatchObject({ stage: 'waiting', label: 'รอรับงาน', lastActivityToolName: 'git_diff' });
    expect(resolveAgentWorkflowStage({ ...agent, status: 'offline', sessionId: null }, [], 'th')).toMatchObject({ stage: 'offline', label: 'ออฟไลน์' });
  });
});
