import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type LogEntry = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

function parseEntry(line: string): LogEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(entry.at) ||
    !Number.isFinite(Date.parse(entry.at)) ||
    typeof entry.job !== 'string' || !entry.job.trim() ||
    (entry.status !== 'ok' && entry.status !== 'retry' && entry.status !== 'fail') ||
    (entry.owner !== null && (typeof entry.owner !== 'string' || !entry.owner.trim())) ||
    (entry.error !== undefined && typeof entry.error !== 'string')
  ) return null;
  return entry as LogEntry;
}

// Log order defines first/last; retain the most recent reported error after recovery.
export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing runs directory is a configuration/I/O error, not a missing night.
      statSync(runsDir);
      return null;
    }
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = contents.split('\n');
  // A final newline terminates the preceding line; it isn't another record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const entry = parseEntry(line);
    if (!entry) {
      badLines++;
      continue;
    }
    const row = rows.get(entry.job);
    if (!row) {
      rows.set(entry.job, {
        job: entry.job, owner: entry.owner, runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status, lastError: entry.error ?? null,
        firstAt: entry.at, lastAt: entry.at,
      });
    } else {
      row.owner = entry.owner;
      row.runs++;
      if (entry.status === 'retry') row.retries++;
      row.lastStatus = entry.status;
      if (entry.error !== undefined) row.lastError = entry.error;
      row.lastAt = entry.at;
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0), badLines };
};
