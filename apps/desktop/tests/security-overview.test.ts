import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '@rvn/ipc-contracts';
import { ControlCenterPage } from '../src/renderer/features/home/ControlCenterPage.js';

const baseDashboard: DashboardSnapshot = {
  selectedWorkspace: null,
  gitSummary: { branch: null, changedFiles: 0, stagedFiles: 0, message: '' },
  mcp: { running: false, url: null, workspaceId: null },
  codex: { installed: false, version: null },
  managedProcessCount: 0,
  auditEventCount: 0,
  recentAuditEvents: [],
  permissionProfile: 'balanced',
  capabilities: [],
  agentState: 'idle',
  mode: 'WORK',
  locale: 'en',
  unrestricted: false,
  allowAiDelete: false,
  stdioPermissionProfile: 'balanced',
  stdioStrictRoots: true,
  stdioAllowedRoots: ['C:\\workspace'],
  backups: [],
  connectionModes: { httpUrl: null, stdioCommand: 'rvn-mcp-stdio.cmd' },
  workLog: [],
  inFlight: [],
  tunnel: { state: 'stopped', source: 'desktop', hasApiKey: false, clientPath: null, profileExists: false, message: null, logPath: null },
  appVersion: '4.6.1',
};

function render(dashboard: DashboardSnapshot, locale: 'th' | 'en' = 'en'): string {
  return renderToStaticMarkup(createElement(ControlCenterPage, {
    dashboard,
    locale,
    workspaces: [],
    mcpBusy: false,
    tunnelBusy: false,
    onRefresh: async () => undefined,
    onStopMcp: async () => undefined,
    onRestartMcp: async () => undefined,
    onSelectWorkspace: async () => undefined,
    onAddWorkspace: async () => undefined,
    onStartTunnel: async () => undefined,
    onStopTunnel: async () => undefined,
    onCaptureIncident: async () => undefined,
    incidentBusy: false,
    incidentClassification: null,
    incidentCapturedAt: null,
    incidentNotice: null,
  }));
}

describe('Security Overview', () => {
  it('shows a restricted posture when STDIO uses strict roots and risky switches are off', () => {
    const markup = render(baseDashboard);
    expect(markup).toContain('Security');
    expect(markup).toContain('Restricted scope');
    expect(markup).toContain('BALANCED');
    expect(markup).toContain('Allowed Roots');
    expect(markup).toContain('class="rvn-check-icon"');
    expect(markup).not.toContain('>OK<');
    expect(markup).not.toContain('registered machine roots may be visible');
  });

  it('uses green connected and red disconnected classes for MCP status', () => {
    const online = render({ ...baseDashboard, mcp: { running: true, url: 'http://127.0.0.1:18765/mcp', workspaceId: null }, connectionModes: { httpUrl: 'http://127.0.0.1:18765/mcp', stdioCommand: 'rvn-mcp-stdio.cmd' } });
    expect(online).toContain('rvn-state-pill healthy');
    expect(online).toContain('rvn-connected-chip online');

    const offline = render(baseDashboard);
    expect(offline).toContain('rvn-state-pill offline');
    expect(offline).toContain('rvn-connected-chip offline');
  });

  it('renders a dynamic MCP list with only names and real connection states', () => {
    const markup = renderToStaticMarkup(createElement(ControlCenterPage, {
      dashboard: { ...baseDashboard, mcp: { running: true, url: 'http://127.0.0.1:18765/mcp', workspaceId: null } },
      mcpServers: [
        { name: 'filesystem', enabled: true, connected: true, excluded: false },
        { name: 'github', enabled: true, connected: false, excluded: false },
      ],
      locale: 'th',
      workspaces: [],
      mcpBusy: false,
      tunnelBusy: false,
      onRefresh: async () => undefined,
      onStopMcp: async () => undefined,
      onRestartMcp: async () => undefined,
      onSelectWorkspace: async () => undefined,
      onAddWorkspace: async () => undefined,
      onStartTunnel: async () => undefined,
      onStopTunnel: async () => undefined,
      onCaptureIncident: async () => undefined,
      incidentBusy: false,
      incidentClassification: null,
      incidentCapturedAt: null,
      incidentNotice: null,
    }));

    expect(markup).toContain('รายการ MCP');
    expect(markup).toContain('filesystem');
    expect(markup).toContain('github');
    expect(markup).toContain('rvn-mcp-server-status online');
    expect(markup).toContain('rvn-mcp-server-status offline');
    expect(markup).not.toContain('Raven Roblox Client');
    expect(markup).not.toContain('RobloxStudioBeta.exe');
  });

  it('warns when standalone/headless STDIO has broad full access without Strict Roots', () => {
    const markup = render({
      ...baseDashboard,
      stdioPermissionProfile: 'full',
      stdioStrictRoots: false,
      stdioAllowedRoots: [],
      unrestricted: true,
      allowAiDelete: true,
    });
    expect(markup).toContain('Broad access');
    expect(markup).toContain('registered machine roots may be visible');
    expect(markup).toContain('AI File Delete');
    expect(markup).toContain('class="warning-mark"');
    expect(markup).toContain('class="rvn-warning-icon"');
    expect(markup).not.toContain('WARN:');
  });

  it('keeps the safety chip green when only standalone STDIO is broad', () => {
    const markup = render({
      ...baseDashboard,
      stdioPermissionProfile: 'full',
      stdioStrictRoots: false,
      stdioAllowedRoots: [],
      tunnel: { ...baseDashboard.tunnel, hasApiKey: true, profileExists: true },
    });
    expect(markup).toContain('Restricted scope');
    expect(markup).not.toContain('Broad access');
    expect(markup).toContain('registered machine roots may be visible');
    expect(markup).not.toContain('class="rvn-check warn"');
  });

  it('keeps Secure Tunnel detail rows free of security status icons', () => {
    const markup = render(baseDashboard);
    const tunnelCard = markup.slice(markup.indexOf('rvn-tunnel-card'));
    expect(tunnelCard).toContain('Secure Tunnel');
    expect(tunnelCard).not.toContain('rvn-check-icon');
    expect(tunnelCard).not.toContain('rvn-warning-icon');
  });

  it('localizes the security summary to Thai', () => {
    const markup = render({ ...baseDashboard, locale: 'th' }, 'th');
    expect(markup).toContain('ความปลอดภัย');
    expect(markup).toContain('จำกัดขอบเขตแล้ว');
    expect(markup).toContain('Strict Roots จำกัด standalone/headless STDIO');
  });

  it('shows the active project path and a direct workspace management action', () => {
    const dashboard = {
      ...baseDashboard,
      selectedWorkspace: {
        id: 'workspace-1',
        displayName: 'rvn-source',
        rootPath: 'C:\\Users\\teens\\Documents\\rvn-source',
        realRootPath: 'C:\\Users\\teens\\Documents\\rvn-source',
        createdAt: '2026-08-26T00:00:00.000Z',
        kind: 'project' as const,
        archivedAt: null,
      },
    };
    const markup = renderToStaticMarkup(createElement(ControlCenterPage, {
      dashboard,
      locale: 'th',
      workspaces: [dashboard.selectedWorkspace],
      mcpBusy: false,
      tunnelBusy: false,
      onRefresh: async () => undefined,
      onStopMcp: async () => undefined,
      onRestartMcp: async () => undefined,
      onSelectWorkspace: async () => undefined,
      onAddWorkspace: async () => undefined,
      onStartTunnel: async () => undefined,
      onStopTunnel: async () => undefined,
      onCaptureIncident: async () => undefined,
      onOpenProjects: () => undefined,
      incidentBusy: false,
      incidentClassification: null,
      incidentCapturedAt: null,
      incidentNotice: null,
    }));

    expect(markup).toContain('data-testid="active-project-summary"');
    expect(markup).toContain('rvn-source');
    expect(markup).toContain('C:\\Users\\teens\\Documents\\rvn-source');
    expect(markup).toContain('data-testid="manage-workspaces"');
    expect(markup).toContain('จัดการ Workspace');
  });
});
