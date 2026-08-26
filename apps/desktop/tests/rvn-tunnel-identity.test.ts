import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TunnelController } from '../src/main/tunnel-controller.js';
import { tunnelLockPath } from '../src/main/tunnel-lock.js';

describe('rvn tunnel identity', () => {
  it('uses profile, secret, log, and lock files that cannot collide with rvn', () => {
    const controller = new TunnelController({
      getClientPath: () => null,
      setClientPath: () => undefined,
      getDataPath: () => 'C:\\rvn-data',
    });
    const profileDirectory = controller.profileDirectory();

    expect(controller.profilePath()).toBe(path.join(profileDirectory, 'rvn.yaml'));
    expect(controller.secretPath()).toBe(path.join(profileDirectory, 'rvn.runtime.secret'));
    expect(controller.logPath()).toBe(path.join(profileDirectory, 'rvn-tunnel.log'));
    expect(tunnelLockPath(profileDirectory)).toBe(path.join(profileDirectory, 'rvn.tunnel.lock'));
  });
});
