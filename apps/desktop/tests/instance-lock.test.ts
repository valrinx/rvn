import { describe, expect, it } from 'vitest';
import { shouldHoldSingleInstanceLock, wantsMcpStdio } from '../src/main/instance-lock.js';

describe('instance lock', () => {
  it('skips the single-instance lock for --mcp-stdio so tunnel can launch beside the dashboard', () => {
    expect(wantsMcpStdio(['rvn.exe', '--mcp-stdio'])).toBe(true);
    expect(shouldHoldSingleInstanceLock(['rvn.exe', '--mcp-stdio'])).toBe(false);
  });

  it('keeps the lock for the dashboard and log viewer', () => {
    expect(shouldHoldSingleInstanceLock(['rvn.exe'])).toBe(true);
    expect(shouldHoldSingleInstanceLock(['rvn.exe', '--log-viewer'])).toBe(true);
  });
});
