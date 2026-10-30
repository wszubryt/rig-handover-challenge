import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('readNight', () => {
  it('reads the sample night, including the malformed line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
      lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing, empty and malformed lines', () => {
    const dir = tempDir();
    expect(readNight(dir, '2026-01-01')).toBeNull();
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ rows: [], badLines: 0 });
    const good = { at: '2026-01-01T01:00:00-05:00', job: 'a', status: 'retry', owner: null };
    writeFileSync(join(dir, '2026-01-01.jsonl'), [JSON.stringify(good), '', 'null', '{}', JSON.stringify({ ...good, status: 'other' }), JSON.stringify({ ...good, at: 'yesterday' }), JSON.stringify({ ...good, owner: 42 }), JSON.stringify({ ...good, error: null }), '{', ''].join('\n'));
    expect(readNight(dir, '2026-01-01')).toEqual({ rows: [{ job: 'a', owner: null, runs: 1, retries: 1, lastStatus: 'retry', lastError: null, firstAt: good.at, lastAt: good.at }], badLines: 8 });
  });

  it('rejects traversal and propagates other I/O errors', () => {
    const dir = tempDir();
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-01-01/../../secret')).toBeNull();
    expect(() => readNight(join(dir, 'missing'), '2026-01-01')).toThrow();
    mkdirSync(join(dir, '2026-01-01.jsonl'));
    expect(() => readNight(dir, '2026-01-01')).toThrow();
  });
});
