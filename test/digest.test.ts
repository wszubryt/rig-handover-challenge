import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-01-01';
const at = '2026-01-01T01:00:00-05:00';
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-route-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function app() {
  return createApp({ adapter: 'shim', installed: at, beatEverySeconds: 60, runsDir });
}

function writeNight(contents: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

const entry = (job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

describe('digest routes', () => {
  it('renders the same sorted jobs and details in HTML and JSON', async () => {
    writeNight([
      entry('zeta-job', 'fail', 'Zoe', 'disk full'),
      entry('alpha-job', 'retry', null),
      entry('alpha-job', 'retry', null),
      entry('alpha-job', 'retry', null),
      entry('alpha-job', 'ok', null),
    ].join('\n'));
    const server = app();
    const [page, api] = await Promise.all([
      server.request(`/digest/${night}`), server.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.headers.get('content-type')).toContain('application/json');
    const html = await page.text();
    const digest = await api.json();
    expect(digest).toEqual({
      rows: [
        { job: 'alpha-job', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: null, firstAt: at, lastAt: at },
        { job: 'zeta-job', owner: 'Zoe', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full', firstAt: at, lastAt: at },
      ],
      badLines: 0,
    });
    expect(html).toContain('alpha-job');
    expect(html).toContain('zeta-job');
    expect(html.indexOf('alpha-job')).toBeLessThan(html.indexOf('zeta-job'));
    for (const detail of ['Zoe', 'disk full', 'fail', '—', at]) expect(html).toContain(detail);
  });

  it('returns 404 for a missing night on both routes', async () => {
    const server = app();
    expect((await server.request(`/digest/${night}`)).status).toBe(404);
    expect((await server.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns an empty digest', async () => {
    writeNight('');
    const server = app();
    const [page, api] = await Promise.all([
      server.request(`/digest/${night}`), server.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/nothing ran/i);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('keeps valid rows and counts a malformed line on both routes', async () => {
    writeNight([entry('surviving-job', 'ok', 'Lee'), '{not json', ''].join('\n'));
    const server = app();
    const [page, api] = await Promise.all([
      server.request(`/digest/${night}`), server.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('surviving-job');
    expect(html).toContain('Lee');
    expect(html).not.toContain('{not json');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({
      rows: [{ job: 'surviving-job', owner: 'Lee', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: at, lastAt: at }],
      badLines: 1,
    });
  });
});
