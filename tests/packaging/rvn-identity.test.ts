import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_NAME as IPC_APP_NAME } from '../../packages/ipc-contracts/src/index.js';
import { resolveRvnDataPath } from '../../packages/shared/src/data-path.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const desktopRoot = path.join(repositoryRoot, 'apps', 'desktop');

describe('rvn desktop identity', () => {
  it('uses an independent application and Windows installer identity', async () => {
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as { name?: unknown };
    const desktopPackage = JSON.parse(await readFile(path.join(desktopRoot, 'package.json'), 'utf8')) as { name?: unknown };
    const builderConfig = await readFile(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');
    const installerScript = await readFile(path.join(desktopRoot, 'build', 'installer.nsh'), 'utf8');

    expect(rootPackage.name).toBe('rvn');
    expect(desktopPackage.name).toBe('@rvn/desktop');
    expect(IPC_APP_NAME).toBe('rvn');
    expect(builderConfig).toContain('appId: com.rvn.desktop');
    expect(builderConfig).toContain('productName: rvn');
    expect(builderConfig).toContain('artifactName: rvn-Setup-${version}.${ext}');
    expect(installerScript).toContain('CreateShortCut "$SMPROGRAMS\\rvn.lnk" "$INSTDIR\\rvn.exe"');
    expect(installerScript).not.toContain('$SMPROGRAMS\\rvn.lnk');
  });

  it('cannot receive releases from the upstream rvn update channel', async () => {
    const builderConfig = await readFile(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');

    expect(builderConfig).not.toMatch(/owner:\s*engasnm111[\s\S]*repo:\s*rvn/);
  });

  it('stores personal state outside the upstream rvn profile', () => {
    expect(resolveRvnDataPath({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })).toBe(
      path.resolve('C:\\Users\\u\\AppData\\Roaming\\rvn'),
    );
    expect(resolveRvnDataPath({}, 'C:\\Users\\end-user\\AppData\\Roaming')).toBe(
      path.resolve('C:\\Users\\end-user\\AppData\\Roaming\\rvn'),
    );
  });
});
