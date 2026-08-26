import type { ReactElement, ReactNode } from 'react';
import type { SystemMetrics, UiLocale, UpdateStatus } from '@rvn/ipc-contracts';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/csr/FileText';
import { FirstAidIcon as FirstAid } from '@phosphor-icons/react/dist/csr/FirstAid';
import { FolderOpenIcon as FolderOpen } from '@phosphor-icons/react/dist/csr/FolderOpen';
import { GearIcon as Gear } from '@phosphor-icons/react/dist/csr/Gear';
import { HouseIcon as House } from '@phosphor-icons/react/dist/csr/House';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/csr/Play';
import { PlugsConnectedIcon as PlugsConnected } from '@phosphor-icons/react/dist/csr/PlugsConnected';
import { QuestionIcon as Question } from '@phosphor-icons/react/dist/csr/Question';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { StopIcon as Stop } from '@phosphor-icons/react/dist/csr/Stop';
import { TerminalWindowIcon as TerminalWindow } from '@phosphor-icons/react/dist/csr/TerminalWindow';

export type Screen = 'home' | 'agentMcp' | 'ravenMcp' | 'tunnel' | 'security' | 'projects' | 'git' | 'worklog' | 'live' | 'settings' | 'doctor';

interface AppShellProps {
  readonly locale: UiLocale;
  readonly appVersion: string;
  readonly mcpRunning: boolean;
  readonly mcpBusy: boolean;
  readonly unrestricted: boolean;
  readonly mcpObservedSince: string | null;
  readonly systemMetrics: SystemMetrics | null;
  readonly updateStatus: UpdateStatus | null;
  readonly screen: Screen;
  readonly onNavigate: (screen: Screen) => void;
  readonly onUpdateAction: () => void;
  readonly onStartMcp: () => void;
  readonly onStopMcp: () => void;
  readonly children: ReactNode;
}

type NavIconName = 'home' | 'projects' | 'tunnel' | 'security' | 'worklog' | 'live' | 'settings' | 'doctor';

const navItems: ReadonlyArray<{ readonly id: string; readonly screen: Screen; readonly th: string; readonly en: string; readonly icon: NavIconName; readonly dividerAfter?: boolean }> = [
  { id: 'home', screen: 'home', th: 'หน้าหลัก', en: 'Home', icon: 'home' },
  { id: 'projects', screen: 'projects', th: 'โปรเจกต์', en: 'Projects', icon: 'projects' },
  { id: 'tunnel', screen: 'tunnel', th: 'Secure Tunnel', en: 'Secure Tunnel', icon: 'tunnel' },
  { id: 'security', screen: 'security', th: 'ความปลอดภัย', en: 'Security', icon: 'security', dividerAfter: true },
  { id: 'worklog', screen: 'worklog', th: 'บันทึกการทำงาน', en: 'Work Log', icon: 'worklog' },
  { id: 'live', screen: 'live', th: 'Live Logs', en: 'Live Logs', icon: 'live', dividerAfter: true },
  { id: 'settings', screen: 'settings', th: 'ตั้งค่า', en: 'Settings', icon: 'settings' },
  { id: 'doctor', screen: 'doctor', th: 'Doctor', en: 'Doctor', icon: 'doctor' },
];

export function AppShell(props: AppShellProps): ReactElement {
  const now = new Date();
  const observedStart = props.mcpObservedSince === null ? null : Date.parse(props.mcpObservedSince);
  const observedUptimeMs = props.mcpRunning && observedStart !== null && Number.isFinite(observedStart)
    ? Math.max(0, now.getTime() - observedStart)
    : 0;
  return (
    <div className="window-container rvn-console">
      <header className="custom-titlebar rvn-topbar">
        <div className="titlebar-drag-region">
          <div className="titlebar-brand rvn-brand-lockup">
            <img src="./rvn-logo.png" alt="rvn logo" className="rvn-wordmark-image" />
            <span className="rvn-brand-subtitle">Raven Ops Console</span>
          </div>
          <div className={`rvn-work-badge ${props.unrestricted ? 'unrestricted' : 'restricted'}`}>
            <span className="rvn-shield-mark"><ShieldCheck aria-hidden="true" /></span>
            <span>WORK MODE</span>
            <span className="rvn-work-dot">•</span>
            <strong>{props.unrestricted ? 'UNRESTRICTED' : 'RESTRICTED'}</strong>
          </div>
        </div>

        <div className="titlebar-actions rvn-top-actions">
          <button type="button" className="rvn-agent-button primary" disabled={props.mcpBusy || props.mcpRunning} onClick={props.onStartMcp} aria-label="Start Agent">
            <TopIcon name="play" /><span className="rvn-agent-label">{props.locale === 'th' ? 'เริ่มงานกับ Agent' : 'Start Agent'}</span>
          </button>
          <button type="button" className="rvn-agent-button" disabled={props.mcpBusy || !props.mcpRunning} onClick={props.onStopMcp} aria-label="Stop Agent">
            <TopIcon name="stop" /><span className="rvn-agent-label">{props.locale === 'th' ? 'หยุด Agent' : 'Stop Agent'}</span>
          </button>
          <button type="button" className="rvn-mode-button" onClick={() => props.onNavigate('settings')}>{props.locale === 'th' ? 'โหมด: WORK' : 'MODE: WORK'} <span aria-hidden="true">⌄</span></button>
          <button type="button" className="rvn-tool-button" onClick={() => props.onNavigate('live')} aria-label="Live Logs"><TopIcon name="terminal" /></button>
          <button type="button" className="rvn-tool-button" onClick={() => props.onNavigate('settings')} aria-label="Settings"><TopIcon name="settings" /></button>
          <button type="button" className="rvn-tool-button" onClick={() => props.onNavigate('doctor')} aria-label="Doctor"><TopIcon name="help" /></button>
        </div>
      </header>

      <div className="app-shell rvn-shell-grid">
        <aside className="sidebar rvn-sidebar" aria-label="Navigation">
          <div className="rvn-nav-section-label">{props.locale === 'th' ? 'ควบคุม' : 'CONTROL'}</div>
          <nav className="sidebar-nav rvn-nav">
            {navItems.map((item) => (
              <div key={item.id} className={`rvn-nav-slot${item.dividerAfter === true ? ' divider' : ''}`}>
                <button
                  type="button"
                  className={props.screen === item.screen ? 'nav-item active' : 'nav-item'}
                  onClick={() => props.onNavigate(item.screen)}
                >
                  <span className="rvn-nav-icon" aria-hidden="true"><NavIcon name={item.icon} /></span>
                  <span>{props.locale === 'th' ? item.th : item.en}</span>
                </button>
              </div>
            ))}
          </nav>
          <div className="sidebar-footer rvn-sidebar-status">
            <div className="rvn-footer-row"><span>Agent</span><strong className={props.mcpRunning ? 'status-online' : 'status-offline'}>{props.mcpRunning ? (props.locale === 'th' ? 'พร้อมทำงาน' : 'READY') : 'STOPPED'}</strong></div>
            <div className="rvn-footer-row"><span>{props.locale === 'th' ? 'เวอร์ชัน' : 'Version'}</span><strong>v{props.appVersion}</strong></div>
            <div className="rvn-footer-row"><span>MCP Gateway</span><strong className={props.mcpRunning ? 'status-online' : 'status-offline'}>{props.mcpRunning ? (props.locale === 'th' ? 'ออนไลน์' : 'ONLINE') : 'OFFLINE'}</strong></div>
          </div>
          <div className="rvn-sidebar-clock">
            <strong>{now.toLocaleTimeString('th-TH', { hour12: false })}</strong>
            <span>{now.toLocaleDateString(props.locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </aside>

        <div className="main-pane rvn-main-pane">
          <main className="main-content rvn-main-content">{props.children}</main>
        </div>
      </div>

      <footer className="rvn-statusbar">
        <div className="rvn-statusbar-left" data-testid="system-metrics" aria-label="System metrics">
          <span><strong>CPU</strong> {formatPercent(props.systemMetrics?.cpuUsagePercent)}</span>
          <span><strong>RAM</strong> {formatPercent(props.systemMetrics?.memoryUsagePercent)}</span>
          <span><strong>Network</strong> ↓ {formatMbps(props.systemMetrics?.networkDownloadMbps)} &nbsp; ↑ {formatMbps(props.systemMetrics?.networkUploadMbps)}</span>
        </div>
        <div className="rvn-statusbar-right">
          <span className="rvn-uptime"><i className={props.mcpRunning ? 'online' : ''} /> MCP Uptime&nbsp; {props.mcpRunning ? formatDuration(observedUptimeMs) : '—'}</span>
          <button type="button" className={`rvn-footer-version titlebar-version update-${props.updateStatus?.phase ?? 'idle'}`} onClick={props.onUpdateAction} title={props.updateStatus?.message ?? 'Check for updates'}>{versionBadgeText(props.appVersion, props.updateStatus, props.locale)}</button>
          <span className={props.mcpRunning ? 'status-online' : 'status-offline'}>MCP Gateway&nbsp; {props.mcpRunning ? (props.locale === 'th' ? 'ออนไลน์' : 'ONLINE') : 'OFFLINE'} <i className={props.mcpRunning ? 'rvn-online-dot' : ''} /></span>
        </div>
      </footer>
    </div>
  );
}
function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function TopIcon(props: { readonly name: 'play' | 'stop' | 'terminal' | 'settings' | 'help' }): ReactElement {
  if (props.name === 'play') return <Play aria-hidden="true" weight="fill" />;
  if (props.name === 'stop') return <Stop aria-hidden="true" weight="fill" />;
  if (props.name === 'terminal') return <TerminalWindow aria-hidden="true" />;
  if (props.name === 'settings') return <Gear aria-hidden="true" />;
  return <Question aria-hidden="true" />;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;
}

function formatMbps(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)} Mbps`;
}

function versionBadgeText(appVersion: string, status: UpdateStatus | null, locale: UiLocale): string {
  if (status === null) return `rvn v${appVersion}`;
  const next = status.availableVersion;
  if (status.phase === 'ready' && next !== null) return locale === 'th' ? `อัปเดต v${next}` : `Update v${next}`;
  if (status.phase === 'installing' && next !== null) return locale === 'th' ? `กำลังติดตั้ง v${next}` : `Installing v${next}`;
  if (status.phase === 'downloading') {
    const percent = status.progressPercent === null ? '' : ` ${Math.round(status.progressPercent)}%`;
    return `rvn v${appVersion} ↓${percent}`;
  }
  if (status.phase === 'available' && next !== null) return `rvn v${appVersion} → v${next}`;
  if (status.phase === 'checking') return locale === 'th' ? `rvn v${appVersion} • เช็ก…` : `rvn v${appVersion} • checking…`;
  if (status.phase === 'error') return `rvn v${appVersion} • !`;
  return `rvn v${appVersion}`;
}

function NavIcon(props: { readonly name: NavIconName }): ReactElement {
  if (props.name === 'home') return <House aria-hidden="true" weight="fill" />;
  if (props.name === 'projects') return <FolderOpen aria-hidden="true" />;
  if (props.name === 'tunnel') return <PlugsConnected aria-hidden="true" weight="fill" />;
  if (props.name === 'security') return <ShieldCheck aria-hidden="true" />;
  if (props.name === 'worklog') return <FileText aria-hidden="true" />;
  if (props.name === 'live') return <TerminalWindow aria-hidden="true" />;
  if (props.name === 'settings') return <Gear aria-hidden="true" />;
  return <FirstAid aria-hidden="true" />;
}
