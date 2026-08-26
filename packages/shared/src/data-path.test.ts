import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRvnDataPath } from './data-path.js';

describe('resolveRvnDataPath', () => {
  it('uses the same explicit override for Desktop and MCP', () => {
    expect(resolveRvnDataPath({ RVN_DATA_PATH: 'D:\\agent-data', APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })).toBe(path.resolve('D:\\agent-data'));
  });

  it('defaults to the per-user roaming AppData rvn directory', () => {
    expect(resolveRvnDataPath({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })).toBe(path.resolve('C:\\Users\\u\\AppData\\Roaming\\rvn'));
  });

  it('accepts Electron appData as a fallback without embedding a build-machine profile', () => {
    expect(resolveRvnDataPath({}, 'C:\\Users\\end-user\\AppData\\Roaming')).toBe(path.resolve('C:\\Users\\end-user\\AppData\\Roaming\\rvn'));
  });
});
