import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Raven Ops Console reference layout', () => {
  it('keeps the user-supplied shell navigation and branding contract', () => {
    const shell = readFileSync(new URL('../src/renderer/features/shell/AppShell.tsx', import.meta.url), 'utf8');
    expect(shell).not.toContain('src="./logo.png"');
    expect(shell).toContain('rvn-wordmark');
    for (const label of ['หน้าหลัก', 'โปรเจกต์', 'Secure Tunnel', 'ความปลอดภัย', 'บันทึกการทำงาน', 'Live Logs', 'ตั้งค่า', 'Doctor']) {
      expect(shell).toContain(label);
    }
    expect(shell).not.toContain("th: 'Agent & MCP'");
    expect(shell).not.toContain("th: 'Raven MCP'");
    for (const nonReferencePrimaryNav of ["th: 'Git'"]) {
      expect(shell).not.toContain(nonReferencePrimaryNav);
    }
    expect(shell).toContain('เริ่มงานกับ Agent');
    expect(shell).toContain('หยุด Agent');
    expect(shell).toContain('โหมด: WORK');
    expect(shell).toContain('ควบคุม');
    expect(shell).toContain('rvn-sidebar-clock');
    expect(shell).toContain('CPU');
    expect(shell).toContain('RAM');
    expect(shell).toContain('Network');
    expect(shell).toContain('MCP Uptime');
  });

  it('keeps the reference home information architecture with live log-derived health', () => {
    const home = readFileSync(new URL('../src/renderer/features/home/ControlCenterPage.tsx', import.meta.url), 'utf8');
    expect(home).toContain('สถานะภาพรวม');
    expect(home).toContain('Latency (avg)');
    expect(home).toContain('Throughput');
    expect(home).toContain('Error Rate');
    expect(home).toContain('rvn-health-line-chart');
    expect(home).toContain('เหตุการณ์ล่าสุด');
    expect(home).toContain('props.logLines');
  });

  it('pins the desktop reference proportions at the target viewport', () => {
    const css = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('grid-template-columns: 228px minmax(0, 1fr)');
    expect(css).toContain('grid-template-columns: minmax(330px, 0.89fr) minmax(480px, 1.32fr) minmax(340px, 1fr)');
    expect(css).toContain('grid-template-rows: 360px 225px 20px minmax(233px, 1fr)');
    expect(css).toContain('"access access tunnel"');
    expect(css).toContain('"events events tunnel"');
    expect(css).toContain('height: 60px');
    expect(css).toContain('height: 45px');
  });
});
