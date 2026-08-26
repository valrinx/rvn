import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../src/renderer/features/shell/AppShell.js';

describe('rvn desktop branding', () => {
  it('presents the Raven Ops Console identity without the upstream product name', () => {
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'en',
      appVersion: '4.10.0',
      mcpRunning: true,
      mcpBusy: false,
      unrestricted: true,
      mcpObservedSince: null,
      systemMetrics: null,
      updateStatus: null,
      screen: 'home',
      onNavigate: () => undefined,
      onUpdateAction: () => undefined,
      onStartMcp: () => undefined,
      onStopMcp: () => undefined,
      children: createElement('div'),
    }));

    expect(markup).toContain('Raven Ops Console');
    expect(markup).toContain('alt="rvn logo"');
    expect(markup).not.toMatch(new RegExp(['lnw', 'jud'].join(''), 'i'));
  });

  it('uses a question-mark help icon for the Doctor topbar action', () => {
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'en',
      appVersion: '4.10.0',
      mcpRunning: false,
      mcpBusy: false,
      unrestricted: true,
      mcpObservedSince: null,
      systemMetrics: null,
      updateStatus: null,
      screen: 'home',
      onNavigate: () => undefined,
      onUpdateAction: () => undefined,
      onStartMcp: () => undefined,
      onStopMcp: () => undefined,
      children: createElement('div'),
    }));

    expect(markup).toContain('aria-label="Doctor"');
    expect(markup).toContain('d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z');
  });

  it('uses the reference work-mode badge glyph and bullet separator', () => {
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'en',
      appVersion: '4.10.0',
      mcpRunning: true,
      mcpBusy: false,
      unrestricted: true,
      mcpObservedSince: null,
      systemMetrics: null,
      updateStatus: null,
      screen: 'home',
      onNavigate: () => undefined,
      onUpdateAction: () => undefined,
      onStartMcp: () => undefined,
      onStopMcp: () => undefined,
      children: createElement('div'),
    }));

    expect(markup).toMatch(/class="rvn-shield-mark"><svg/);
    expect(markup).toContain('class="rvn-work-dot">•</span>');
  });

  it('exposes the Projects route for active workspace management', () => {
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'th',
      appVersion: '4.10.0',
      mcpRunning: true,
      mcpBusy: false,
      unrestricted: false,
      mcpObservedSince: null,
      systemMetrics: null,
      updateStatus: null,
      screen: 'home',
      onNavigate: () => undefined,
      onUpdateAction: () => undefined,
      onStartMcp: () => undefined,
      onStopMcp: () => undefined,
      children: createElement('div'),
    }));

    expect(markup).toContain('โปรเจกต์');
  });

  it('renders live system metrics in the status bar when samples are available', () => {
    const markup = renderToStaticMarkup(createElement(AppShell, {
      locale: 'en',
      appVersion: '4.10.0',
      mcpRunning: true,
      mcpBusy: false,
      unrestricted: true,
      mcpObservedSince: null,
      systemMetrics: { cpuUsagePercent: 3, memoryUsagePercent: 31, networkDownloadMbps: 2.1, networkUploadMbps: 1.3, sampledAt: new Date(0).toISOString() },
      updateStatus: null,
      screen: 'home',
      onNavigate: () => undefined,
      onUpdateAction: () => undefined,
      onStartMcp: () => undefined,
      onStopMcp: () => undefined,
      children: createElement('div'),
    }));

    expect(markup).toContain('CPU</strong> 3%');
    expect(markup).toContain('RAM</strong> 31%');
    expect(markup).toContain('↓ 2.1 Mbps');
    expect(markup).toContain('↑ 1.3 Mbps');
  });
});
