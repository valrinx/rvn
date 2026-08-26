import type { RvnApi } from '@rvn/ipc-contracts';

declare global {
  interface Window {
    readonly rvn: RvnApi;
  }
}

export {};
