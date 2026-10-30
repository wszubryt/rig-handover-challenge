import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(runsDir);
  return { runsDir, app: createApp({ adapter: 'shim', installed: 'now', beatEverySeconds: 60, runsDir }) };
}

describe('digest page', () => {
  it('renders sorted rows, warnings, missing values and bad lines in the layout', async () => {
    const { runsDir, app } = setup();
    const entry = (job: string, status: string, owner: string | null, error?: string) =>
      JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job, status, owner, error });
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      entry('zeta', 'fail', null, 'broken <pipe>'),
      entry('alpha', 'retry', 'alice'), entry('alpha', 'retry', 'alice'),
      entry('alpha', 'retry', 'alice'), entry('alpha', 'ok', 'alice'), 'bad',
    ].join('\n'));
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('no marker set');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('class="warn">3 ⚠');
    expect(html).toContain('class="warn">fail ⚠');
    expect(html).toContain('broken &lt;pipe&gt;');
    expect(html).toContain('>—</td>');
    expect(html).toContain('2026-10-28T08:00:00+01:00');
    expect(html).toContain('bad lines: 1');
  });

  it('handles empty and missing nights', async () => {
    const { runsDir, app } = setup();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const empty = await app.request('/digest/2026-10-28');
    expect(empty.status).toBe(200);
    expect(await empty.text()).toContain('nothing ran');
    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
  });
});
