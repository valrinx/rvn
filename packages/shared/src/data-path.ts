import os from 'node:os';
import path from 'node:path';

export interface DataPathEnvironment {
  readonly RVN_DATA_PATH?: string;
  readonly APPDATA?: string;
  readonly USERPROFILE?: string;
  readonly HOME?: string;
}

/** Resolve the per-user rvn data directory without embedding a developer profile path. */
export function resolveRvnDataPath(
  environment: DataPathEnvironment = process.env,
  roamingAppDataFallback?: string,
): string {
  const configured = environment.RVN_DATA_PATH?.trim();
  if (configured) return path.resolve(configured);

  const appData = firstNonEmpty(
    environment.APPDATA,
    roamingAppDataFallback,
    environment.USERPROFILE ? path.join(environment.USERPROFILE, 'AppData', 'Roaming') : undefined,
    environment.HOME ? path.join(environment.HOME, 'AppData', 'Roaming') : undefined,
    path.join(os.homedir(), 'AppData', 'Roaming'),
  );
  return path.resolve(appData, 'rvn');
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return path.join(os.homedir(), 'AppData', 'Roaming');
}
