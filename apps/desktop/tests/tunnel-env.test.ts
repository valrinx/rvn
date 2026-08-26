import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildTunnelInitArgs, tunnelClientEnv, windowsPowerShellEnv } from '../src/main/tunnel-controller.js';

describe('Secure Tunnel Desktop HTTP wiring', () => {
  it('passes only tunnel-client runtime state and does not leak headless rvn scope switches', () => {
    const env = tunnelClientEnv('key', 'C:/Users/me/AppData/Roaming/tunnel-client');
    expect(env.CONTROL_PLANE_API_KEY).toBe('key');
    expect(env.TUNNEL_CLIENT_PROFILE).toBe('rvn');
    expect(env.TUNNEL_CLIENT_PROFILE_DIR).toBe('C:/Users/me/AppData/Roaming/tunnel-client');
    expect(env.RVN_DATA_PATH).toBeUndefined();
    expect(env.RVN_UNRESTRICTED).toBeUndefined();
    expect(env.MCP_CONNECTION_MAX_TTL).toBe('168h0m0s');
  });

  it('isolates Windows PowerShell modules from a parent pwsh runtime', () => {
    const env = windowsPowerShellEnv({
      SystemRoot: 'C:\\Windows',
      PSModulePath: 'C:\\foreign-pwsh\\Modules',
    });

    expect(env.PSModulePath).toBe(path.win32.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'));
    expect(env.PSModulePath).not.toContain('foreign-pwsh');
  });

  it('materializes a replaceable no-auth HTTP profile with a secret reference, never a stdio child', () => {
    const args = buildTunnelInitArgs(
      'tunnel_0123456789abcdef0123456789abcdef',
      'http://127.0.0.1:18765/mcp',
      'C:/Users/me/AppData/Roaming/tunnel-client',
    );
    expect(args).toEqual(expect.arrayContaining([
      'init',
      '--force',
      'sample_mcp_remote_no_auth',
      '--control-plane-api-key-ref',
      'env:CONTROL_PLANE_API_KEY',
      '--health-listen-addr',
      '127.0.0.1:0',
      '--mcp-server-url',
      'http://127.0.0.1:18765/mcp',
    ]));
    expect(args).not.toContain('--mcp-command');
    expect(args.join(' ')).not.toContain('rvn-mcp-stdio');
  });
});
