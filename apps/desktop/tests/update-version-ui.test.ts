import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@rvn/ipc-contracts';
import { AppShell } from '../src/renderer/features/shell/AppShell.js';

describe('status bar update notification', () => {
  it('presents a ready update as the install action', () => {
    const updateStatus: UpdateStatus = {
      phase: 'ready',
      currentVersion: '4.10.0',
      availableVersion: '4.11.0',
      progressPercent: 100,
      lastCheckedAt: null,
      message: 'Version 4.11.0 is ready',
      canInstall: true,
    };
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'en', appVersion: '4.10.0', mcpRunning: true, mcpBusy: false,
      unrestricted: true, mcpObservedSince: null, systemMetrics: null, updateStatus, screen: 'home',
      onNavigate: vi.fn(), onUpdateAction: vi.fn(), onStartMcp: vi.fn(), onStopMcp: vi.fn(),
      children: createElement('div'),
    }));

    expect(markup).toContain('update-ready');
    expect(markup).toContain('Update v4.11.0');
    expect(markup).toContain('title="Version 4.11.0 is ready"');
  });
});
