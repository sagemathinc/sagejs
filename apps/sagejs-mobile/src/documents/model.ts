export const WORKSHEET_FORMAT = 'sagejs.worksheet/v1' as const;

export interface WorksheetDocument {
  format: typeof WORKSHEET_FORMAT;
  id: string;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface WorksheetSummary {
  id: string;
  title: string;
  updatedAt: string;
  revision: number;
}

export function newDocument(
  title = 'Untitled worksheet',
  source = DEFAULT_SOURCE,
  now = new Date(),
): WorksheetDocument {
  const timestamp = now.toISOString();
  return {
    format: WORKSHEET_FORMAT,
    id: randomId(),
    title,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
  };
}

export function summarize(document: WorksheetDocument): WorksheetSummary {
  return {
    id: document.id,
    title: document.title,
    updatedAt: document.updatedAt,
    revision: document.revision,
  };
}

export function parseWorksheet(text: string): WorksheetDocument {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.format !== WORKSHEET_FORMAT) {
    throw new Error('not a Sage.js worksheet document');
  }
  for (const key of ['id', 'title', 'source', 'createdAt', 'updatedAt']) {
    if (typeof value[key] !== 'string') {
      throw new Error(`worksheet field ${key} must be a string`);
    }
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    throw new Error('worksheet revision must be a nonnegative integer');
  }
  if (String(value.source).length > 1024 * 1024) {
    throw new Error('worksheet source exceeds the 1 MiB mobile limit');
  }
  return value as unknown as WorksheetDocument;
}

export function serializeWorksheet(document: WorksheetDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function randomId(): string {
  const cryptoObject = (
    globalThis as unknown as {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `worksheet-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const DEFAULT_SOURCE = `E = EllipticCurve([1, -1, 0, -79, 289])
L = E.lseries()
plot(L, -0.1, 2, plot_points=180)
`;
