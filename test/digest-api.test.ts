import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-api-'));
  dirs.push(runsDir);
  return { runsDir, app: createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }) };
}

describe('digest JSON', () => {
  it('returns the reader rows in job order even with a bad line', async () => {
    const { runsDir, app } = setup();
    const entry = { at: '2026-10-28T01:00:00+01:00', status: 'ok', owner: null };
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ ...entry, job: 'z' }), '{', JSON.stringify({ ...entry, job: 'a' }),
    ].join('\n'));
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(runsDir, '2026-10-28')?.rows);
    expect(readNight(runsDir, '2026-10-28')?.rows.map((row) => row.job)).toEqual(['a', 'z']);
  });

  it('returns an empty array for an empty night and 404 for a missing night', async () => {
    const { runsDir, app } = setup();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const empty = await app.request('/api/digest/2026-10-28');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });
});
