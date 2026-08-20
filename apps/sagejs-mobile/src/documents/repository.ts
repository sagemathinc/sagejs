import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  newDocument,
  parseWorksheet,
  serializeWorksheet,
  summarize,
  type WorksheetDocument,
  type WorksheetSummary,
} from './model';

const INDEX_KEY = '@sagejs-mobile/worksheet-index/v1';
const ACTIVE_KEY = '@sagejs-mobile/active-worksheet/v1';
const documentKey = (id: string) => `@sagejs-mobile/worksheet/v1/${id}`;

export interface WorksheetRepository {
  loadInitial(): Promise<{
    active: WorksheetDocument;
    recent: WorksheetSummary[];
  }>;
  load(id: string): Promise<WorksheetDocument>;
  save(document: WorksheetDocument): Promise<WorksheetSummary[]>;
  remove(id: string): Promise<WorksheetSummary[]>;
}

export class AsyncWorksheetRepository implements WorksheetRepository {
  async loadInitial() {
    const recent = await this.loadIndex();
    const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
    const candidateIds = [activeId, ...recent.map(item => item.id)].filter(
      (value): value is string => Boolean(value),
    );
    for (const id of candidateIds) {
      try {
        return { active: await this.load(id), recent };
      } catch {
        // Skip a damaged individual record and recover another recent document.
      }
    }
    const active = newDocument();
    return { active, recent: await this.save(active) };
  }

  async load(id: string): Promise<WorksheetDocument> {
    const text = await AsyncStorage.getItem(documentKey(id));
    if (text === null) throw new Error(`worksheet ${id} does not exist`);
    const document = parseWorksheet(text);
    await AsyncStorage.setItem(ACTIVE_KEY, document.id);
    return document;
  }

  async save(document: WorksheetDocument): Promise<WorksheetSummary[]> {
    const recent = await this.loadIndex();
    const summary = summarize(document);
    const next = [summary, ...recent.filter(item => item.id !== document.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 50);
    await Promise.all([
      AsyncStorage.setItem(
        documentKey(document.id),
        serializeWorksheet(document),
      ),
      AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next)),
      AsyncStorage.setItem(ACTIVE_KEY, document.id),
    ]);
    return next;
  }

  async remove(id: string): Promise<WorksheetSummary[]> {
    const next = (await this.loadIndex()).filter(item => item.id !== id);
    await AsyncStorage.removeItem(documentKey(id));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
    return next;
  }

  private async loadIndex(): Promise<WorksheetSummary[]> {
    const text = await AsyncStorage.getItem(INDEX_KEY);
    if (text === null) return [];
    try {
      const value: unknown = JSON.parse(text);
      if (!Array.isArray(value)) return [];
      return value.filter(isWorksheetSummary).slice(0, 50);
    } catch {
      return [];
    }
  }
}

function isWorksheetSummary(value: unknown): value is WorksheetSummary {
  if (typeof value !== 'object' || value === null) return false;
  const summary = value as Record<string, unknown>;
  return (
    typeof summary.id === 'string' &&
    typeof summary.title === 'string' &&
    typeof summary.updatedAt === 'string' &&
    Number.isSafeInteger(summary.revision)
  );
}
