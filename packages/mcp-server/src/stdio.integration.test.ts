import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixturePath = fileURLToPath(new URL('../tests/fixtures/stdio-server.mjs', import.meta.url));

describe('MCP stdio transport', () => {
  it('serves independent 2026-07-28 requests with protocol-only stdout', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fixturePath],
      stderr: 'pipe',
    });
    let diagnostics = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      diagnostics += chunk.toString('utf8');
    });
    const client = new Client(
      { name: 'rvn-stdio-test-client', version: '0.1.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );

    try {
      await client.connect(transport);
      const first = await client.listTools();
      const second = await client.listTools();

      expect(first.tools.map((tool) => tool.name)).toHaveLength(212);
      expect(first.tools.some((tool) => tool.name.startsWith('codex_'))).toBe(false);
      expect(second.tools.map((tool) => tool.name)).toEqual(first.tools.map((tool) => tool.name));
      expect(diagnostics).toContain('rvn-stdio-test-diagnostic');
    } finally {
      await client.close();
    }
  }, 30_000);

  it('serves 2025-era clients such as Claude Desktop', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fixturePath],
      stderr: 'pipe',
    });
    const client = new Client(
      { name: 'claude-desktop-compatible-client', version: '0.1.0' },
      { versionNegotiation: { mode: 'legacy' } },
    );

    try {
      await client.connect(transport);
      const listed = await client.listTools();

      expect(listed.tools).toHaveLength(212);
      expect(listed.tools.some((tool) => tool.name === 'mcp_list')).toBe(true);
    } finally {
      await client.close();
    }
  }, 30_000);
});
