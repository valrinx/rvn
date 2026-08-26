import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type {
  DashboardSnapshot,
  DestructiveDeletePolicy,
  DoctorReport,
  LogLine,
  LogSource,
  PermissionProfileName,
  UiLocale,
  UpdateStatus,
  UserSettings,
  IncidentClassification,
  McpServerStatus,
  SystemMetrics,
  WorkspaceSummary,
} from '@rvn/ipc-contracts';
import { AppShell, type Screen } from './features/shell/AppShell.js';
import { ControlCenterPage } from './features/home/ControlCenterPage.js';
import { McpPanel } from './features/mcp/McpPanel.js';
import { ProjectsPage } from './features/projects/ProjectsPage.js';
import { GitPage } from './features/git/GitPage.js';
import { WorkLogPage } from './features/worklog/WorkLogPage.js';
import { LiveLogsPage } from './features/live/LiveLogsPage.js';
import type { LogScopeSelection } from './features/live/LogStreamPanel.js';
import { applyLogSnapshot } from './features/live/log-buffer.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { DoctorPanel } from './features/doctor/DoctorPanel.js';
import { createTranslator } from './i18n/index.js';

const MAX_CLIENT_LOG_LINES = 4_000;

export function App(): ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [locale, setLocale] = useState<UiLocale>('th');
  const [logLines, setLogLines] = useState<readonly LogLine[]>([]);
  const [tunnelLogPath, setTunnelLogPath] = useState<string | null>(null);
  const [tunnelLogExists, setTunnelLogExists] = useState(false);
  const [incidentClassification, setIncidentClassification] = useState<IncidentClassification | null>(null);
  const [incidentCapturedAt, setIncidentCapturedAt] = useState<string | null>(null);
  const [incidentNotice, setIncidentNotice] = useState<string | null>(null);
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [mcpServers, setMcpServers] = useState<readonly McpServerStatus[]>([]);
  const incidentBusyRef = useRef(false);
  const logIds = useRef<Set<number>>(new Set());

  const t = createTranslator(locale);
  const activeWorkspaces = workspaces.filter((workspace) => workspace.archivedAt === undefined || workspace.archivedAt === null);
  const mcpObservedSince = logLines.find((line) => line.source === 'mcp')?.timestamp ?? null;

  const appendLogLine = useCallback((line: LogLine): void => {
    if (logIds.current.has(line.id)) return;
    logIds.current.add(line.id);
    setLogLines((previous) => [...previous.slice(-(MAX_CLIENT_LOG_LINES - 1)), line]);
  }, []);

  useEffect(() => {
    let disposed = false;
    void window.rvn.getUpdateStatus().then((status) => {
      if (!disposed) setUpdateStatus(status);
    }).catch(() => undefined);
    const unsubscribe = window.rvn.onUpdateStatus((status) => {
      if (!disposed) setUpdateStatus(status);
    });
    return (): void => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const refreshMcpServers = async (): Promise<void> => {
      try {
        const nextServers = await window.rvn.listMcpServers();
        if (!disposed) setMcpServers(nextServers);
      } catch {
        // Keep the last known list when the extension discovery service is unavailable.
      }
    };
    void refreshMcpServers();
    const interval = window.setInterval(() => { void refreshMcpServers(); }, 2_000);
    return (): void => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const refreshMetrics = async (): Promise<void> => {
      try {
        const nextMetrics = await window.rvn.getSystemMetrics();
        if (!disposed) setSystemMetrics(nextMetrics);
      } catch {
        // Keep the last known values; the shell renders a dash until the first valid sample.
      }
    };
    void refreshMetrics();
    const interval = window.setInterval(() => { void refreshMetrics(); }, 2_000);
    return (): void => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void window.rvn.getLogSnapshot().then((snapshot) => {
      if (disposed) return;
      setLogLines((previous) => {
        const merged = applyLogSnapshot(previous, logIds.current, snapshot.lines);
        logIds.current = merged.ids;
        return merged.lines;
      });
      setTunnelLogPath(snapshot.tunnelLogPath);
      setTunnelLogExists(snapshot.tunnelLogExists);
    }).catch(() => undefined);
    const unsubscribe = window.rvn.onLogEvent((line) => {
      appendLogLine(line);
      if (line.source === 'tunnel') setTunnelLogExists(true);
    });
    return (): void => {
      disposed = true;
      unsubscribe();
    };
  }, [appendLogLine]);

  async function clearLogSource(source: LogSource, scope: LogScopeSelection): Promise<void> {
    try {
      await window.rvn.clearLogBuffer({
        source,
        ...(scope.workspaceId === null ? {} : { workspaceId: scope.workspaceId }),
        ...(scope.sessionId === null ? {} : { sessionId: scope.sessionId }),
      });
      setLogLines((previous) => previous.filter((line) => line.source !== source || !lineMatchesScope(line, scope)));
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.logBufferClear')));
    }
  }

  async function clearAllLogs(): Promise<void> {
    try {
      await Promise.all((['tunnel', 'mcp', 'process'] as const).map((source) => window.rvn.clearLogBuffer({ source })));
      logIds.current = new Set();
      setLogLines([]);
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.logBufferClear')));
    }
  }

  async function exportLogSource(source: LogSource, scope: LogScopeSelection, query: string): Promise<void> {
    try {
      await window.rvn.exportLogs({
        source,
        filePath: '',
        ...(scope.workspaceId === null ? {} : { workspaceId: scope.workspaceId }),
        ...(scope.sessionId === null ? {} : { sessionId: scope.sessionId }),
        ...(query.trim().length === 0 ? {} : { query: query.trim() }),
      });
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.logExport')));
    }
  }

  async function popOutLogViewer(): Promise<void> {
    try {
      await window.rvn.openLogViewer();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.logViewerOpen')));
    }
  }

  async function captureIncident(): Promise<void> {
    if (incidentBusyRef.current) return;
    incidentBusyRef.current = true;
    setIncidentBusy(true);
    try {
      const result = await window.rvn.captureIncident();
      if (result.exported && !result.cancelled) {
        setIncidentClassification(result.classification);
        setIncidentCapturedAt(result.capturedAt);
        setIncidentNotice(null);
      } else {
        setIncidentNotice(t('live.incident.cancelled'));
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.logExport')));
    } finally {
      incidentBusyRef.current = false;
      setIncidentBusy(false);
    }
  }

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextDashboard, nextWorkspaces] = await Promise.all([
        window.rvn.getDashboard(),
        window.rvn.listWorkspaces(),
      ]);
      setDashboard(nextDashboard);
      setWorkspaces(nextWorkspaces);
      setLocale(nextDashboard.locale);

    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : createTranslator(locale)('error.desktopService'));
    }
  }, [locale]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 1_000);
    return (): void => { window.clearInterval(interval); };
  }, [refresh]);

  async function handleUpdateAction(): Promise<void> {
    try {
      if (updateStatus?.canInstall === true) {
        const result = await window.rvn.installUpdate();
        setUpdateStatus(result.status);
        return;
      }
      setUpdateStatus(await window.rvn.checkForUpdates());
    } catch (cause: unknown) {
      setError(errorMessage(cause, locale === 'th' ? 'ไม่สามารถตรวจอัปเดตได้' : 'Unable to check for updates'));
    }
  }

  async function addWorkspace(rootPath: string): Promise<void> {
    setError(null);
    try {
      await window.rvn.addWorkspace({ rootPath });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.workspaceAdd')));
    }
  }

  async function selectWorkspace(workspaceId: string): Promise<void> {
    try {
      setMcpBusy(true);
      await window.rvn.selectWorkspace({ workspaceId });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.workspaceSelect')));
    } finally {
      setMcpBusy(false);
    }
  }

  async function setWorkspaceArchived(workspaceId: string, archived: boolean): Promise<void> {
    setError(null);
    try {
      await window.rvn.setWorkspaceArchived({ workspaceId, archived });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.workspaceArchive')));
      throw cause;
    }
  }

  async function deleteWorkspace(workspaceId: string): Promise<void> {
    setError(null);
    try {
      await window.rvn.deleteWorkspace({ workspaceId, userConfirmed: true });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.workspaceDelete')));
      throw cause;
    }
  }

  async function setPermissionProfile(profile: PermissionProfileName): Promise<void> {
    try {
      await window.rvn.setPermissionProfile({ profile });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.permissionProfileChange')));
    }
  }

  async function setUnrestrictedMode(enabled: boolean): Promise<boolean> {
    try {
      const result = await window.rvn.setUnrestrictedMode({ enabled });
      await refresh();
      return result.restartRequired;
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.unrestrictedModeChange')));
      return true;
    }
  }

  async function setDestructiveDeletePolicy(policy: DestructiveDeletePolicy): Promise<void> {
    try {
      await window.rvn.setAiDeletePolicy({ policy });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, propsText(locale, 'ไม่สามารถเปลี่ยนนโยบายการลบได้', 'Could not change destructive-action policy')));
    }
  }

  async function setStdioPolicy(profile: PermissionProfileName, strictRoots: boolean, allowedRoots: readonly string[]): Promise<boolean> {
    try {
      const result = await window.rvn.setStdioPolicy({ profile, strictRoots, allowedRoots });
      await refresh();
      return result.restartRequired;
    } catch (cause: unknown) {
      setError(errorMessage(cause, propsText(locale, 'ไม่สามารถบันทึก STDIO policy ได้', 'Could not save STDIO policy')));
      throw cause;
    }
  }

  async function stopMcp(): Promise<void> {
    try {
      setMcpBusy(true);
      await window.rvn.stopMcp();
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.mcpStop')));
    } finally {
      setMcpBusy(false);
    }
  }

  async function restartMcp(): Promise<void> {
    try {
      setMcpBusy(true);
      await window.rvn.restartMcp();
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.mcpRestart')));
    } finally {
      setMcpBusy(false);
    }
  }

  async function clearWorkLog(scope: LogScopeSelection): Promise<void> {
    try {
      await window.rvn.clearWorkLog({
        ...(scope.workspaceId === null ? {} : { workspaceId: scope.workspaceId }),
        ...(scope.sessionId === null ? {} : { sessionId: scope.sessionId }),
      });
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.workLogClear')));
    }
  }

  async function startTunnel(): Promise<void> {
    try {
      setTunnelBusy(true);
      await window.rvn.startTunnel();
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.tunnelStart')));
    } finally {
      setTunnelBusy(false);
    }
  }

  async function stopTunnel(): Promise<void> {
    try {
      setTunnelBusy(true);
      await window.rvn.stopTunnel();
      await refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.tunnelStop')));
    } finally {
      setTunnelBusy(false);
    }
  }

  async function createBackup(): Promise<void> {
    await window.rvn.createBackup();
    await refresh();
  }

  async function scheduleRestoreBackup(backupId: string): Promise<boolean> {
    const result = await window.rvn.scheduleRestoreBackup({ backupId });
    await refresh();
    return result.restartRequired;
  }

  async function restoreRecoveryItem(workspaceId: string, recoveryId: string): Promise<void> {
    await window.rvn.restoreRecoveryItem({ workspaceId, recoveryId });
    await refresh();
  }

  async function restoreCheckpoint(workspaceId: string, checkpointId: string): Promise<void> {
    await window.rvn.restoreCheckpoint({ workspaceId, checkpointId });
    await refresh();
  }

  async function saveTunnelApiKey(apiKey: string): Promise<void> {
    await window.rvn.saveTunnelApiKey({ apiKey });
    await refresh();
  }

  async function setTunnelClientPath(clientPath: string): Promise<void> {
    await window.rvn.setTunnelClientPath({ clientPath });
    await refresh();
  }

  async function changeLocale(next: UiLocale): Promise<void> {
    await window.rvn.setLocale({ locale: next });
    setLocale(next);
    await refresh();
  }

  async function setUserSettings(settings: UserSettings): Promise<boolean> {
    try {
      const result = await window.rvn.setUserSettings({ settings });
      await refresh();
      return result.restartRequired;
    } catch (cause: unknown) {
      setError(errorMessage(cause, propsText(locale, 'ไม่สามารถบันทึกการตั้งค่าได้', 'Could not save settings')));
      throw cause;
    }
  }

  async function chooseTunnelClientPath(): Promise<string | null> {
    const result = await window.rvn.chooseTunnelClientPath();
    return result.clientPath;
  }

  async function configureTunnelProfile(tunnelId: string): Promise<string> {
    const result = await window.rvn.configureTunnelProfile({ tunnelId });
    await refresh();
    return result.profilePath;
  }

  async function runDoctor(): Promise<void> {
    try {
      setDoctor(await window.rvn.runDoctor());
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('error.doctorRun')));
    }
  }

  if (dashboard === null) {
    return <div className="boot-screen">{t('app.loading')}</div>;
  }

  return (
    <AppShell
      locale={locale}
      appVersion={dashboard.appVersion}
      mcpRunning={dashboard.mcp.running}
      mcpBusy={mcpBusy}
      unrestricted={dashboard.unrestricted}
      mcpObservedSince={mcpObservedSince}
      systemMetrics={systemMetrics}
      updateStatus={updateStatus}
      screen={screen}
      onNavigate={(nextScreen) => {
        setError(null);
        setScreen(nextScreen);
      }}
      onUpdateAction={() => { void handleUpdateAction(); }}
      onStartMcp={() => { void restartMcp(); }}
      onStopMcp={() => { void stopMcp(); }}
    >
      {error === null ? null : <div className="error-banner" role="alert">{error}</div>}
      {screen === 'home' ? (
        <ControlCenterPage
          dashboard={dashboard}
          mcpServers={mcpServers}
          workspaces={activeWorkspaces}
          logLines={logLines}
          locale={locale}
          mcpBusy={mcpBusy}
          tunnelBusy={tunnelBusy}
          onRefresh={refresh}
          onStopMcp={stopMcp}
          onRestartMcp={restartMcp}
          onSelectWorkspace={selectWorkspace}
          onAddWorkspace={addWorkspace}
          onStartTunnel={startTunnel}
          onStopTunnel={stopTunnel}
          onCaptureIncident={captureIncident}
          onOpenSettings={() => setScreen('settings')}
          onOpenProjects={() => setScreen('projects')}
          incidentBusy={incidentBusy}
          incidentClassification={incidentClassification}
          incidentCapturedAt={incidentCapturedAt}
          incidentNotice={incidentNotice}
        />
      ) : null}
      {screen === 'agentMcp' ? (
        <div className="page-content agent-mcp-page">
          <div className="page-heading">
            <div>
              <h1>Agent & MCP</h1>
              <p className="page-subtitle">{locale === 'th' ? 'ควบคุม Agent และการเชื่อมต่อ MCP ภายในเครื่อง' : 'Control the Agent and local MCP connection'}</p>
            </div>
          </div>
          <McpPanel
            status={dashboard.mcp}
            selectedWorkspace={dashboard.selectedWorkspace}
            onStart={restartMcp}
            onStop={stopMcp}
            busy={mcpBusy}
          />
        </div>
      ) : null}
      {screen === 'projects' ? (
        <ProjectsPage
          locale={locale}
          workspaces={workspaces}
          selectedWorkspaceId={dashboard.selectedWorkspace?.id ?? null}
          onSelectWorkspace={selectWorkspace}
          onAddWorkspace={addWorkspace}
          onSetWorkspaceArchived={setWorkspaceArchived}
          onDeleteWorkspace={deleteWorkspace}
        />
      ) : null}
      {screen === 'git' ? (
        <GitPage
          locale={locale}
          gitSummary={dashboard.gitSummary}
          selectedWorkspace={dashboard.selectedWorkspace}
          workspaces={activeWorkspaces}
          onSelectWorkspace={selectWorkspace}
          onRefresh={refresh}
        />
      ) : null}
      {screen === 'worklog' ? (
        <WorkLogPage locale={locale} dashboard={dashboard} workspaces={workspaces} onClearWorkLog={clearWorkLog} />
      ) : null}
      {screen === 'live' ? (
        <LiveLogsPage
          locale={locale}
          lines={logLines}
          tunnelLogPath={tunnelLogPath}
          tunnelLogExists={tunnelLogExists}
          onClear={clearLogSource}
          onClearAll={clearAllLogs}
          onExport={exportLogSource}
          onPopOut={popOutLogViewer}
          onCaptureIncident={captureIncident}
          incidentBusy={incidentBusy}
          incidentClassification={incidentClassification}
          incidentCapturedAt={incidentCapturedAt}
          incidentNotice={incidentNotice}
          workspaces={workspaces}
        />
      ) : null}
      {screen === 'settings' || screen === 'ravenMcp' || screen === 'tunnel' || screen === 'security' ? (
        <SettingsPage
          key={screen}
          locale={locale}
          dashboard={dashboard}
          initialSection={screen === 'ravenMcp' ? 'mcp' : screen === 'tunnel' ? 'tunnel' : screen === 'security' ? 'security' : 'general'}
          onLocaleChange={changeLocale}
          onPermissionProfileChange={setPermissionProfile}
          onUnrestrictedChange={setUnrestrictedMode}
          onDestructiveDeletePolicyChange={setDestructiveDeletePolicy}
          onStdioPolicyChange={setStdioPolicy}
          onCreateBackup={createBackup}
          onScheduleRestoreBackup={scheduleRestoreBackup}
          onRestoreRecoveryItem={restoreRecoveryItem}
          onRestoreCheckpoint={restoreCheckpoint}
          onSaveTunnelApiKey={saveTunnelApiKey}
          onSetTunnelClientPath={setTunnelClientPath}
          onUserSettingsChange={setUserSettings}
          onChooseTunnelClientPath={chooseTunnelClientPath}
          onConfigureTunnelProfile={configureTunnelProfile}
          pageTitle={screen === 'ravenMcp'
            ? 'Raven MCP'
            : screen === 'tunnel'
              ? 'Secure Tunnel'
              : screen === 'security'
                ? (locale === 'th' ? 'ความปลอดภัย' : 'Security')
                : undefined}
        />
      ) : null}
      {screen === 'doctor' ? (
        <div className="page-content doctor-page">
          <div className="page-heading">
            <div>
              <h1>{t('doctor.title')}</h1>
              <p className="page-subtitle">{locale === 'th' ? 'ตรวจสอบความพร้อมของระบบ, Workspace และการเชื่อมต่อ' : 'Verify system, workspace, and connection readiness'}</p>
            </div>
          </div>
          <DoctorPanel locale={locale} report={doctor} onRunDoctor={runDoctor} />
        </div>
      ) : null}
    </AppShell>
  );
}

function propsText(locale: UiLocale, th: string, en: string): string {
  return locale === 'th' ? th : en;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim().length > 0 ? cause.message : fallback;
}

function lineMatchesScope(line: Pick<LogLine, 'workspaceId' | 'sessionId'>, scope: LogScopeSelection): boolean {
  if (scope.workspaceId !== null && line.workspaceId !== scope.workspaceId) return false;
  if (scope.sessionId !== null && line.sessionId !== scope.sessionId) return false;
  return true;
}
