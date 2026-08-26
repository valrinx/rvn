import { useState, type ReactElement } from 'react';
import type { DashboardSnapshot, IncidentClassification, LogLine, LogSource, McpServerStatus, UiLocale, WorkspaceSummary } from '@rvn/ipc-contracts';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/csr/Check';
import { PlugsConnectedIcon as PlugsConnected } from '@phosphor-icons/react/dist/csr/PlugsConnected';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { createTranslator } from '../../i18n/index.js';

interface ControlCenterPageProps {
  readonly dashboard: DashboardSnapshot;
  readonly mcpServers?: readonly McpServerStatus[];
  readonly workspaces: readonly WorkspaceSummary[];
  readonly logLines?: readonly LogLine[];
  readonly locale: UiLocale;
  readonly mcpBusy: boolean;
  readonly tunnelBusy: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onStopMcp: () => Promise<void>;
  readonly onRestartMcp: () => Promise<void>;
  readonly onSelectWorkspace: (workspaceId: string) => Promise<void>;
  readonly onAddWorkspace: (rootPath: string) => Promise<void>;
  readonly onStartTunnel: () => Promise<void>;
  readonly onStopTunnel: () => Promise<void>;
  readonly onCaptureIncident: () => Promise<void>;
  readonly onOpenSettings?: () => void;
  readonly onOpenProjects?: () => void;
  readonly incidentBusy: boolean;
  readonly incidentClassification: IncidentClassification | null;
  readonly incidentCapturedAt: string | null;
  readonly incidentNotice: string | null;
}

export function ControlCenterPage(props: ControlCenterPageProps): ReactElement {
  const t = createTranslator(props.locale);
  const { dashboard } = props;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [eventLevel, setEventLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [eventSource, setEventSource] = useState<'all' | LogSource>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logs = props.logLines ?? [];
  const mcpServers = props.mcpServers ?? [];
  const health = deriveMcpHealth(logs);
  const recentEvents = logs
    .filter((line) => (eventLevel === 'all' || line.level === eventLevel) && (eventSource === 'all' || line.source === eventSource))
    .slice(-7)
    .reverse();

  const tunnelLabel = dashboard.tunnel.state === 'running'
    ? dashboard.tunnel.source === 'external'
      ? t('tunnel.runningExternal')
      : t('tunnel.running')
    : dashboard.tunnel.state === 'starting'
      ? t('tunnel.starting')
      : dashboard.tunnel.state === 'error'
        ? t('tunnel.error')
        : t('tunnel.stopped');

  const stdioBroad = dashboard.stdioPermissionProfile === 'full' && !dashboard.stdioStrictRoots;
  const broadAccess = dashboard.unrestricted || dashboard.allowAiDelete;
  const onOff = (enabled: boolean): string => enabled ? t('security.enabled') : t('security.disabled');
  const workspaceScope = dashboard.stdioStrictRoots
    ? `${dashboard.stdioAllowedRoots.length} ${t('security.allowedRoots')}`
    : t('security.machineRoots');

  async function copyText(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopyStatus(t('mcp.copied'));
  }

  return (
    <div className="page-content rvn-dashboard-page">
      <div className="page-heading rvn-overview-heading">
        <div>
          <h1>{props.locale === 'th' ? 'สถานะภาพรวม' : 'Overview Status'}</h1>
          <p className="page-subtitle">Raven Ops Console</p>
        </div>
        <div className="heading-actions rvn-heading-actions">
          <button type="button" onClick={() => { void props.onRefresh(); }}>{t('action.refresh')}</button>
          <button type="button" disabled={props.incidentBusy} onClick={() => { void props.onCaptureIncident(); }}>{t('live.captureIncident')}</button>
        </div>
      </div>
      {!props.incidentBusy && props.incidentNotice === null && props.incidentClassification === null ? null : <p role="status" className="hint">{props.incidentBusy ? t('live.incident.capturing') : props.incidentNotice ?? `${incidentLabel(t, props.incidentClassification!)} - ${props.incidentCapturedAt ?? ''}`}</p>}

      <div className="rvn-dashboard-grid">
        <section className="panel rvn-client-card rvn-mcp-list-card" aria-label={props.locale === 'th' ? 'รายการ MCP' : 'MCP list'}>
          <div className="rvn-card-header">
            <h2><span className="rvn-card-title-icon mcp" aria-hidden="true"><PlugsConnected weight="fill" /></span>{props.locale === 'th' ? 'รายการ MCP' : 'MCP list'}</h2>
          </div>
          <div className="rvn-mcp-list" data-testid="mcp-server-list">
            {mcpServers.length === 0 ? (
              <div className="rvn-mcp-empty">{props.locale === 'th' ? 'ยังไม่มี MCP ที่ลงทะเบียน' : 'No MCP servers registered'}</div>
            ) : mcpServers.map((server) => {
              const connected = server.connected && server.enabled && !server.excluded;
              return (
                <div className="rvn-mcp-server-row" key={server.name}>
                  <strong className="rvn-mcp-server-name">{server.name}</strong>
                  <span className={`rvn-mcp-server-status ${connected ? 'online' : 'offline'}`}>
                    {connected ? (props.locale === 'th' ? 'เชื่อมต่อแล้ว' : 'Connected') : (props.locale === 'th' ? 'ไม่ได้เชื่อมต่อ' : 'Not connected')}
                  </span>
                </div>
              );
            })}
          </div>
          <span data-testid="mcp-status" hidden>{dashboard.agentState === 'idle' ? t('agent.ready') : dashboard.agentState === 'busy' ? t('agent.busy') : t('agent.stopped')}</span>
          <span data-testid="agent-state" hidden>{dashboard.agentState}</span>
          <span data-testid="workspace-real-root" hidden>{dashboard.selectedWorkspace?.realRootPath ?? ''}</span>
          <span data-testid="workspace-id" hidden>{dashboard.selectedWorkspace?.id ?? ''}</span>
        </section>

        <section className="panel rvn-health-card">
          <div className="rvn-card-header">
            <h2><span className="rvn-card-title-icon health" aria-hidden="true">♥</span>MCP Health</h2>
            <span className={`rvn-state-pill ${dashboard.mcp.running ? 'healthy' : 'offline'}`}>{dashboard.mcp.running ? '♡ HEALTHY' : 'OFFLINE'}</span>
          </div>
          <div className="rvn-health-metrics">
            <div><span>Latency (avg)</span><strong>{health.averageLatencyMs === null ? '—' : `${Math.round(health.averageLatencyMs)} ms`}</strong></div>
            <div><span>Throughput</span><strong>{health.throughput === null ? '—' : `${health.throughput.toFixed(1)} req/s`}</strong></div>
            <div><span>Error Rate</span><strong>{health.errorRate === null ? '—' : `${health.errorRate.toFixed(2)}%`}</strong></div>
          </div>
          <div className="rvn-health-chart-shell" aria-label="MCP latency history from observed logs">
            <div className="rvn-chart-y-axis"><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span></div>
            <div className="rvn-health-line-chart">
              <svg viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="rvnHealthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57dc82" stopOpacity="0.34" /><stop offset="100%" stopColor="#57dc82" stopOpacity="0" /></linearGradient></defs>
                <polygon className="rvn-health-area" points={`0,120 ${health.chartPoints} 600,120`} />
                <polyline className="rvn-health-line" points={health.chartPoints} />
              </svg>
              <div className="rvn-chart-x-axis">{health.axisLabels.map((label) => <span key={label}>{label}</span>)}</div>
            </div>
          </div>
          <div className="rvn-endpoint-row">
            <div>
              <span>MCP URL (local)</span>
              <code data-testid="mcp-endpoint" className="endpoint">{dashboard.connectionModes.httpUrl ?? '-'}</code>
            </div>
            <span className={`rvn-connected-chip ${dashboard.mcp.running ? 'online' : 'offline'}`}>{dashboard.mcp.running ? (props.locale === 'th' ? 'เชื่อมต่อแล้ว' : 'Connected') : (props.locale === 'th' ? 'ไม่ได้เชื่อมต่อ' : 'Not connected')}</span>
            <button type="button" disabled={dashboard.connectionModes.httpUrl === null} onClick={() => { if (dashboard.connectionModes.httpUrl !== null) void copyText(dashboard.connectionModes.httpUrl); }}>{t('mcp.copy')}</button>
          </div>
          {copyStatus === null ? null : <span data-testid="mcp-copy-status" role="status" className="rvn-copy-status">{copyStatus}</span>}
        </section>

        <section className={`panel security-overview rvn-security-card ${broadAccess ? 'security-risk-broad' : 'security-risk-restricted'}`} aria-label={t('security.title')}>
          <div className="rvn-card-header">
            <h2><span className="rvn-card-title-icon security" aria-hidden="true">◇</span>{t('security.title')}</h2>
            <span className={`security-summary-chip ${broadAccess ? 'broad' : 'restricted'}`} data-testid="security-summary">{broadAccess ? t('security.summaryBroad') : t('security.summaryRestricted')}</span>
          </div>
          <p className="rvn-visually-hidden">{t('security.strictHint')}</p>
          <div className="rvn-security-list">
            <SecurityRow
              label={props.locale === 'th' ? 'โหมดการทำงาน' : 'Work mode'}
              value={dashboard.unrestricted ? 'WORK · Unrestricted' : 'WORK · Restricted'}
              ok
            />
            <SecurityRow label={t('security.stdioProfile')} value={dashboard.stdioPermissionProfile.toUpperCase()} ok />
            <SecurityRow label={t('security.strictRoots')} value={onOff(dashboard.stdioStrictRoots)} ok />
            <SecurityRow label={t('security.aiDelete')} value={onOff(dashboard.allowAiDelete)} ok={!dashboard.allowAiDelete} />
            <SecurityRow label={t('security.unrestricted')} value={onOff(dashboard.unrestricted)} ok={!dashboard.unrestricted} />
            <SecurityRow label={t('security.workspaceScope')} value={workspaceScope} ok />
            <SecurityRow label={t('security.tunnelAccess')} value={tunnelLabel} ok={dashboard.tunnel.state !== 'error'} />
            <SecurityRow label={t('security.registeredWorkspaces')} value={String(props.workspaces.length)} ok />
          </div>
          {stdioBroad ? (
            <div className="security-warning" role="status">
              <span className="warning-mark" aria-hidden="true"><Warning className="security-warning-icon" weight="bold" /></span>
              <span>{t('security.warningBroad')}</span>
            </div>
          ) : null}
        </section>

        <section className="panel rvn-access-card">
          <div className="rvn-card-header"><h2>{props.locale === 'th' ? 'การเข้าถึง & Workspace' : 'Access & Workspace'}</h2></div>
          <div className="security-overview-grid rvn-access-grid">
            <SecurityMetric label={t('security.desktopProfile')} value={dashboard.permissionProfile.toUpperCase()} />
            <SecurityMetric label={t('security.stdioProfile')} value={dashboard.stdioPermissionProfile.toUpperCase()} />
            <SecurityMetric label={t('security.strictRoots')} value={onOff(dashboard.stdioStrictRoots)} state={dashboard.stdioStrictRoots ? 'safe' : 'warn'} />
            <SecurityMetric label={t('security.aiDelete')} value={onOff(dashboard.allowAiDelete)} state={dashboard.allowAiDelete ? 'warn' : 'safe'} />
            <SecurityMetric label={t('security.unrestricted')} value={onOff(dashboard.unrestricted)} state={dashboard.unrestricted ? 'warn' : 'safe'} />
            <SecurityMetric label={t('security.workspaceScope')} value={workspaceScope} state={dashboard.stdioStrictRoots ? 'safe' : 'warn'} />
            <SecurityMetric label={t('security.registeredWorkspaces')} value={String(props.workspaces.length)} />
            <SecurityMetric label={t('project.active')} value={dashboard.selectedWorkspace?.displayName ?? '-'} />
          </div>
          <div className="rvn-active-project-summary" data-testid="active-project-summary">
            <div className="rvn-active-project-copy">
              <span>{t('project.active')}</span>
              <strong>{dashboard.selectedWorkspace?.displayName ?? t('project.emptyActive')}</strong>
              <small>{dashboard.selectedWorkspace?.realRootPath ?? (props.locale === 'th' ? 'ยังไม่ได้เลือก Workspace' : 'No workspace selected')}</small>
            </div>
            <button type="button" data-testid="manage-workspaces" onClick={() => props.onOpenProjects?.()}>{t('project.manage')}</button>
          </div>
        </section>

        <section className="panel rvn-events-card">
          <div className="rvn-card-header rvn-events-header">
            <h2>{props.locale === 'th' ? 'เหตุการณ์ล่าสุด' : 'Recent Events'}</h2>
            <div className="rvn-event-controls">
              <select aria-label="Event source" value={eventSource} onChange={(event) => setEventSource(event.target.value as 'all' | LogSource)}>
                <option value="all">{props.locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
                <option value="mcp">MCP</option><option value="tunnel">Tunnel</option><option value="process">Process</option>
              </select>
              <select aria-label="Event level" value={eventLevel} onChange={(event) => setEventLevel(event.target.value as 'all' | 'info' | 'warn' | 'error')}>
                <option value="all">{props.locale === 'th' ? 'ระดับ: ทั้งหมด' : 'Level: All'}</option>
                <option value="info">INFO</option><option value="warn">WARN</option><option value="error">ERROR</option>
              </select>
              <label className="rvn-auto-scroll"><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /><span /> Auto Scroll</label>
            </div>
          </div>
          <div className="rvn-event-table">
            <div className="rvn-event-head"><span>{props.locale === 'th' ? 'เวลา' : 'Time'}</span><span>{props.locale === 'th' ? 'ระดับ' : 'Level'}</span><span>{props.locale === 'th' ? 'เหตุการณ์' : 'Event'}</span><span>{props.locale === 'th' ? 'รายละเอียด' : 'Details'}</span></div>
            {recentEvents.length === 0 ? <div className="rvn-event-empty">{props.locale === 'th' ? 'ยังไม่มีเหตุการณ์ในตัวกรองนี้' : 'No events for this filter'}</div> : recentEvents.map((line) => (
              <div key={line.id} className={`rvn-event-row level-${line.level}`}>
                <time>{formatLogTime(line.timestamp)}</time>
                <span>{line.level.toUpperCase()}</span>
                <strong>{eventTitle(line)}</strong>
                <em>{line.text}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel rvn-tunnel-card">
          <div className="rvn-card-header">
            <h2><span className="rvn-card-title-icon tunnel" aria-hidden="true">◇</span>Secure Tunnel</h2>
            <span className={`rvn-state-pill ${dashboard.tunnel.state === 'running' ? 'healthy' : 'offline'}`} data-testid="tunnel-status">{tunnelLabel}</span>
          </div>
          <div className="rvn-security-list compact">
            <TunnelRow label={props.locale === 'th' ? 'สถานะ' : 'State'} value={dashboard.tunnel.state.toUpperCase()} />
            <TunnelRow label="Endpoint" value={dashboard.tunnel.endpoint ?? '—'} />
            <TunnelRow label={props.locale === 'th' ? 'เชื่อมต่อเมื่อ' : 'Connected'} value={formatTunnelTimestamp(dashboard.tunnel.connectedAt, props.locale)} />
            <TunnelRow label="Last Keepalive" value={formatTunnelTimestamp(dashboard.tunnel.lastKeepaliveAt, props.locale)} />
            <TunnelRow label={props.locale === 'th' ? 'เตรียม Runtime API key' : 'Runtime API key'} value={dashboard.tunnel.hasApiKey ? (props.locale === 'th' ? 'บันทึกแล้ว' : 'Saved') : (props.locale === 'th' ? 'ยังไม่มี' : 'Missing')} />
            <TunnelRow label={props.locale === 'th' ? 'ตั้งค่าไฟล์' : 'Config file'} value={dashboard.tunnel.profileExists ? 'rvn.yaml' : '—'} />
          </div>
          {dashboard.tunnel.message ? <p className="hint error-text">{dashboard.tunnel.message}</p> : null}
          <div className="inline-actions">
            <button type="button" disabled={props.tunnelBusy || !dashboard.tunnel.hasApiKey || dashboard.tunnel.state === 'running'} onClick={() => { void props.onStartTunnel(); }}>{t('tunnel.start')}</button>
            <button type="button" disabled={props.tunnelBusy || dashboard.tunnel.state === 'stopped'} onClick={() => { void props.onStopTunnel(); }}>{t('tunnel.stop')}</button>
          </div>
          <button type="button" className="rvn-secondary-action" onClick={() => props.onOpenSettings?.()}>{props.locale === 'th' ? 'จัดการคีย์ & โทเคน' : 'Manage key & token'}</button>
        </section>
      </div>
    </div>
  );
}

interface McpHealthSummary {
  readonly averageLatencyMs: number | null;
  readonly throughput: number | null;
  readonly errorRate: number | null;
  readonly chartPoints: string;
  readonly axisLabels: readonly string[];
}

function deriveMcpHealth(lines: readonly LogLine[]): McpHealthSummary {
  const starts = new Map<string, number>();
  const latencies: number[] = [];
  let completed = 0;
  let failed = 0;
  let completedLastMinute = 0;
  const now = Date.now();

  for (const line of lines) {
    if (line.source !== 'mcp' || line.correlation?.kind !== 'mcp') continue;
    const timestamp = Date.parse(line.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    if (line.correlation.phase === 'started') {
      starts.set(line.correlation.callId, timestamp);
      continue;
    }
    completed += 1;
    if (now - timestamp <= 60_000) completedLastMinute += 1;
    if (line.correlation.resultCode !== null && line.correlation.resultCode !== 'SUCCESS') failed += 1;
    const startedAt = starts.get(line.correlation.callId);
    if (startedAt !== undefined && timestamp >= startedAt) latencies.push(timestamp - startedAt);
  }

  const samples = latencies.slice(-24);
  const averageLatencyMs = samples.length === 0 ? null : samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const throughput = completed === 0 ? null : completedLastMinute / 60;
  const errorRate = completed === 0 ? null : (failed / completed) * 100;
  const plot = samples.length === 0 ? [0, 0] : samples;
  const chartPoints = plot.map((value, index) => {
    const x = plot.length === 1 ? 300 : (index / (plot.length - 1)) * 600;
    const y = 112 - (Math.min(200, Math.max(0, value)) / 200) * 104;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const axisLabels = [5, 4, 3, 2, 1, 0].map((minutesAgo) => new Date(now - minutesAgo * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return { averageLatencyMs, throughput, errorRate, chartPoints, axisLabels };
}

function eventTitle(line: LogLine): string {
  if (line.correlation?.kind === 'mcp') return line.correlation.toolName;
  if (line.source === 'tunnel') return 'Secure Tunnel';
  if (line.source === 'process') return 'Process';
  return 'MCP Request';
}

function formatLogTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? '--:--:--' : parsed.toLocaleTimeString([], { hour12: false });
}

function formatTunnelTimestamp(timestamp: string | null | undefined, locale: UiLocale): string {
  if (timestamp === null || timestamp === undefined) return '—';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hourCycle: 'h23',
  });
}

function SecurityRow(props: { readonly label: string; readonly value: string; readonly ok: boolean }): ReactElement {
  return (
    <div className="rvn-security-row">
      <span className={props.ok ? 'rvn-check ok' : 'rvn-check warn'}>
        {props.ok ? <Check className="rvn-check-icon" weight="bold" aria-hidden="true" /> : <WarningCircle className="rvn-warning-icon" weight="bold" aria-hidden="true" />}
      </span>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function TunnelRow(props: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="rvn-security-row rvn-tunnel-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SecurityMetric(props: { readonly label: string; readonly value: string; readonly state?: 'safe' | 'warn' | 'active' | 'neutral' }): ReactElement {
  return (
    <article className={`security-metric ${props.state ?? 'neutral'}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function incidentLabel(t: ReturnType<typeof createTranslator>, classification: IncidentClassification): string {
  if (classification === 'local_tool_failed') return t('live.incident.localToolFailed');
  if (classification === 'tunnel_disconnected') return t('live.incident.tunnelDisconnected');
  if (classification === 'remote_turn_stopped') return t('live.incident.remoteTurnStopped');
  return t('live.incident.healthyOrInconclusive');
}
