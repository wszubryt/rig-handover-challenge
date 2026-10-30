import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links nights with counts of jobs by their last status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
    try {
      const entry = (job: string, status: string) => JSON.stringify({ at: '2026-01-01T01:00:00Z', job, status, owner: null });
      writeFileSync(join(dir, '2026-01-01.jsonl'), [entry('a', 'retry'), entry('a', 'ok'), entry('b', 'retry'), entry('c', 'fail'), 'bad'].join('\n'));
      writeFileSync(join(dir, '2026-01-02.jsonl'), '');
      writeFileSync(join(dir, 'not-a-night.jsonl'), '');
      const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
      expect(html).toContain('href="/digest/2026-01-01"');
      expect(html).toContain('jobs: 1 ok / 1 retry / 1 fail');
      expect(html).toContain('href="/digest/2026-01-02"');
      expect(html).toContain('jobs: 0 ok / 0 retry / 0 fail');
      expect(html.indexOf('/digest/2026-01-02')).toBeLessThan(html.indexOf('/digest/2026-01-01'));
      expect(html).not.toContain('not-a-night');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
