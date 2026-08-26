import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultMcpClientFactory } from './mcp-session-manager.js';

describe('defaultMcpClientFactory', () => {
  it('connects to a 2025-era MCP server', async () => {
    const fixture = fileURLToPath(new URL('./fixtures/legacy-mcp-server.mjs', import.meta.url));
    const session = await defaultMcpClientFactory.connect({
      command: process.execPath,
      args: [fixture],
    });

    try {
      await expect(session.listTools()).resolves.toEqual([
        { name: 'ping', description: 'Legacy ping', inputSchema: { type: 'object' } },
      ]);
    } finally {
      await session.close();
    }
  });
});
