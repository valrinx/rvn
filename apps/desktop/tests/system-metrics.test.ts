import { describe, expect, it } from 'vitest';
import { calculateCpuUsagePercent, parseNetworkPerformanceJson } from '../src/main/system-metrics.js';

describe('system metrics sampling', () => {
  it('calculates CPU utilization from two cumulative snapshots', () => {
    expect(calculateCpuUsagePercent(
      { idle: 100, total: 1_000 },
      { idle: 150, total: 1_200 },
    )).toBeCloseTo(75, 5);
  });

  it('aggregates Windows network counters and converts bytes per second to Mbps', () => {
    expect(parseNetworkPerformanceJson(JSON.stringify([
      { BytesReceivedPersec: 125_000, BytesSentPersec: 62_500 },
      { BytesReceivedPersec: 125_000, BytesSentPersec: 62_500 },
    ]))).toEqual({ downloadMbps: 2, uploadMbps: 1 });
  });
});
