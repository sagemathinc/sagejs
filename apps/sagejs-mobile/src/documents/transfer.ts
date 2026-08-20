import { Share } from 'react-native';
import {
  keepLocalCopy,
  pick,
  saveDocuments,
  types,
} from '@react-native-documents/picker';
import {
  readFile,
  TemporaryDirectoryPath,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';

import {
  newDocument,
  parseWorksheet,
  serializeWorksheet,
  type WorksheetDocument,
} from './model';

const SAGE_MIME = 'text/x-sage';
const WORKSHEET_MIME = 'application/vnd.sagejs.worksheet+json';

export async function importWorksheet(): Promise<WorksheetDocument> {
  const [picked] = await pick({
    type: [types.json, types.plainText],
    mode: 'import',
    allowMultiSelection: false,
    presentationStyle: 'pageSheet',
  });
  return importWorksheetFromUri(picked.uri, picked.name ?? 'Imported.sage');
}

export async function importWorksheetFromUri(
  uri: string,
  name = 'Imported.sage',
): Promise<WorksheetDocument> {
  const [copy] = await keepLocalCopy({
    files: [{ uri, fileName: name }],
    destination: 'cachesDirectory',
  });
  if (copy.status !== 'success') {
    throw new Error(copy.copyError || 'could not import worksheet');
  }
  const text = await readFile(stripFileScheme(copy.localUri), 'utf8');
  if (name.endsWith('.sagejs')) return parseWorksheet(text);
  if (text.length > 1024 * 1024) {
    throw new Error('imported Sage source exceeds the 1 MiB mobile limit');
  }
  const title = name.replace(/\.(sage|py)$/i, '');
  return newDocument(title, text);
}

export async function exportWorksheet(
  document: WorksheetDocument,
): Promise<void> {
  const filename = `${safeFilename(document.title)}.sagejs`;
  const path = `${TemporaryDirectoryPath}/${filename}`;
  await writeFile(path, serializeWorksheet(document), 'utf8');
  try {
    await saveDocuments({
      sourceUris: [`file://${path}`],
      mimeType: WORKSHEET_MIME,
      fileName: filename,
      copy: true,
    });
  } finally {
    await unlink(path).catch(() => {});
  }
}

export async function shareSource(document: WorksheetDocument): Promise<void> {
  await Share.share({
    title: document.title,
    message: document.source,
  });
}

export async function shareRuntimeContent(
  suggestedName: string,
  content: string,
  kind: 'sage-source' | 'plot-json' | 'data-json',
): Promise<void> {
  const extension = kind === 'sage-source' ? '.sage' : '.json';
  const filename = safeFilename(
    suggestedName.endsWith(extension)
      ? suggestedName
      : `${suggestedName}${extension}`,
  );
  const path = `${TemporaryDirectoryPath}/${filename}`;
  await writeFile(path, content, 'utf8');
  try {
    await Share.share({
      title: filename,
      url: `file://${path}`,
      message: kind === 'sage-source' ? content : undefined,
    });
  } finally {
    // Share sheets may consume lazily; retain the temporary file until next launch.
  }
}

export const acceptedDocumentTypes = Object.freeze([SAGE_MIME, WORKSHEET_MIME]);

function stripFileScheme(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function safeFilename(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._ -]+/g, '_').trim();
  return (cleaned || 'SageJS-worksheet').slice(0, 100);
}
