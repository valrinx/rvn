import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const desktopRoot = path.join(repositoryRoot, 'apps', 'desktop');

function section(config: string, start: string, end: string): string {
  const startIndex = config.indexOf(`${start}:`);
  const endIndex = config.indexOf(`\n${end}:`, startIndex + start.length + 1);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return config.slice(startIndex, endIndex);
}

describe('Secure Tunnel packaged stdio layout', () => {
  it('ships the complete stdio runtime both beside rvn.exe and under resources', async () => {
    const config = await readFile(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');
    const resources = section(config, 'extraResources', 'extraFiles');
    const files = section(config, 'extraFiles', 'win');

    for (const artifact of ['rvn-mcp-stdio.cmd', 'rvn-mcp-stdio.cjs', 'rvn-node.exe']) {
      expect(resources).toContain(`to: ${artifact}`);
      expect(files).toContain(`to: ${artifact}`);
    }
  });

  it('keeps the stdio launcher self-contained instead of depending on a developer machine path or system Node', async () => {
    const launcher = await readFile(path.join(desktopRoot, 'build', 'rvn-mcp-stdio.cmd'), 'utf8');
    expect(launcher).toContain('set "BASE=%~dp0"');
    expect(launcher).toContain('set "NODE_EXE=%BASE%rvn-node.exe"');
    expect(launcher).toContain('set "SCRIPT=%BASE%rvn-mcp-stdio.cjs"');
    expect(launcher).toContain('resources\\rvn-node.exe');
    expect(launcher).toContain('resources\\rvn-mcp-stdio.cjs');
    expect(launcher).not.toMatch(/[A-Z]:\\(?:Users|rvn|src|projects)\\/i);
    expect(launcher).not.toContain('set "NODE_EXE=node"');
  });
});
