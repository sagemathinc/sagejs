import {
  newDocument,
  parseWorksheet,
  serializeWorksheet,
  WORKSHEET_FORMAT,
} from '../src/documents/model';
import { AsyncWorksheetRepository } from '../src/documents/repository';

test('worksheet document serialization is data-only and versioned', () => {
  const document = newDocument(
    'BSD example',
    'EllipticCurve([0, 0, 1, -7, 6])',
  );
  expect(parseWorksheet(serializeWorksheet(document))).toEqual(document);
  expect(document.format).toBe(WORKSHEET_FORMAT);
});

test('repository recovers a persisted active worksheet', async () => {
  const repository = new AsyncWorksheetRepository();
  const document = newDocument('Saved', 'factor(2026)');
  await repository.save(document);
  const result = await repository.loadInitial();
  expect(result.active).toEqual(document);
  expect(result.recent[0]?.title).toBe('Saved');
});

test('rejects arbitrary JSON and excessive worksheet source', () => {
  expect(() => parseWorksheet('{}')).toThrow('not a Sage.js worksheet');
  expect(() =>
    parseWorksheet(
      JSON.stringify({
        format: WORKSHEET_FORMAT,
        id: 'x',
        title: 'x',
        source: 'x'.repeat(1024 * 1024 + 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 0,
      }),
    ),
  ).toThrow('exceeds');
});
