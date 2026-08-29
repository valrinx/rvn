import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '@rvn/ipc-contracts';
import { ControlCenterPage } from '../src/renderer/features/home/ControlCenterPage.js';

const dashboard: DashboardSnapshot = {
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
  stdioAllowedRoots: [],
  backups: [],
  connectionModes: { httpUrl: null, stdioCommand: 'rvn-mcp-stdio.cmd' },
  workLog: [],
  inFlight: [],
  tunnel: { state: 'stopped', source: 'desktop', hasApiKey: false, clientPath: null, profileExists: false, message: null, logPath: null },
  appVersion: '5.0.2',
};

describe('Agent Work Flow session UI', () => {
  it('removes the workflow panel without removing the overview surface', () => {
    const markup = renderToStaticMarkup(createElement(ControlCenterPage, {
      dashboard,
      locale: 'en',
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

    expect(markup).not.toContain('Agent Work Flow');
    expect(markup).not.toContain('rvn-multi-agent-panel');
    expect(markup).not.toContain('agent-session-card-grid');
    expect(markup).toContain('MCP Health');
    expect(markup).toContain('Access &amp; Workspace');
  });
});
