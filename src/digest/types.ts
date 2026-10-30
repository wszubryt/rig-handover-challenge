export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  // Rows are sorted by job so the page and JSON share an order.
  rows: DigestRow[];
  badLines: number;
};

// Returns null for a missing night; an empty file returns an empty digest.
// Other I/O errors propagate. Times retain their original offsets.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
