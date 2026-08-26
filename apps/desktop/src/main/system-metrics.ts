import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SystemMetrics } from '@rvn/ipc-contracts';

const execFileAsync = promisify(execFile);

export interface CpuSnapshot {
  readonly idle: number;
  readonly total: number;
}

export interface NetworkPerformanceSample {
  readonly downloadMbps: number;
  readonly uploadMbps: number;
}

export function readCpuSnapshot(): CpuSnapshot {
  return os.cpus().reduce<CpuSnapshot>((snapshot, cpu) => {
    const times = cpu.times;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: snapshot.idle + times.idle, total: snapshot.total + total };
  }, { idle: 0, total: 0 });
}

export function calculateCpuUsagePercent(previous: CpuSnapshot | null, current: CpuSnapshot): number | null {
  if (previous === null) return null;
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (!Number.isFinite(totalDelta) || !Number.isFinite(idleDelta) || totalDelta <= 0) return null;
  return Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100));
}

export function parseNetworkPerformanceJson(raw: string): NetworkPerformanceSample | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  let receivedBytesPerSecond = 0;
  let sentBytesPerSecond = 0;
  let found = false;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const received = Number((row as Record<string, unknown>).BytesReceivedPersec);
    const sent = Number((row as Record<string, unknown>).BytesSentPersec);
    if (!Number.isFinite(received) || !Number.isFinite(sent) || received < 0 || sent < 0) continue;
    receivedBytesPerSecond += received;
    sentBytesPerSecond += sent;
    found = true;
  }
  if (!found) return null;
  return {
    downloadMbps: receivedBytesPerSecond * 8 / 1_000_000,
    uploadMbps: sentBytesPerSecond * 8 / 1_000_000,
  };
}

async function readNetworkPerformance(): Promise<NetworkPerformanceSample | null> {
  if (process.platform !== 'win32') return null;
  try {
    const result = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "$items = @(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Select-Object BytesReceivedPersec,BytesSentPersec); if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }",
    ], { windowsHide: true, timeout: 1_500, maxBuffer: 64 * 1024, encoding: 'utf8' });
    return parseNetworkPerformanceJson(result.stdout);
  } catch {
    return null;
  }
}

export class SystemMetricsSampler {
  private previousCpu: CpuSnapshot | null = null;

  async sample(): Promise<SystemMetrics> {
    const currentCpu = readCpuSnapshot();
    const cpuUsagePercent = calculateCpuUsagePercent(this.previousCpu, currentCpu);
    this.previousCpu = currentCpu;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsagePercent = totalMemory > 0
      ? Math.min(100, Math.max(0, ((totalMemory - freeMemory) / totalMemory) * 100))
      : null;
    const network = await readNetworkPerformance();
    return {
      cpuUsagePercent,
      memoryUsagePercent,
      networkDownloadMbps: network?.downloadMbps ?? null,
      networkUploadMbps: network?.uploadMbps ?? null,
      sampledAt: new Date().toISOString(),
    };
  }
}
