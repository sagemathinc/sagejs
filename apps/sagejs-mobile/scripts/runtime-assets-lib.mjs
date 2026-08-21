import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const MOBILE_ASSET_SCHEMA = 'sagejs.mobile-runtime-assets/v1';
export const PRODUCTION_SCHEMA = 'sagejs.wasm-production-artifact/v1';
export const RECEIPT_SCHEMA = 'sagejs.wasm-build-receipt/v1';

export const HOST_FILES = Object.freeze([
  'compiler-worker.mjs',
  'evaluator.mjs',
  'index.mjs',
  'kernel-worker.mjs',
  'kernel.mjs',
  'm4ri.mjs',
  'plotly-renderer.mjs',
  'portable-matrix.mjs',
  'portable-polynomial.mjs',
]);

export const SHELL_FILES = Object.freeze([
  'index.html',
  'main.mjs',
  'styles.css',
]);

export async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

export async function hashFile(filename) {
  const bytes = await readFile(filename);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function verifySource(source) {
  const productionPath = path.join(source, 'dist', 'production-manifest.json');
  const receiptPath = path.join(source, 'dist', 'build-receipt.json');
  const production = await readJson(productionPath);
  const receipt = await readJson(receiptPath);
  if (production.schema !== PRODUCTION_SCHEMA) {
    throw new Error(
      `unsupported production manifest schema ${production.schema}`,
    );
  }
  if (receipt.schema !== RECEIPT_SCHEMA) {
    throw new Error(`unsupported build receipt schema ${receipt.schema}`);
  }
  if (!receipt.artifact || receipt.artifact.identity !== production.identity) {
    throw new Error('build receipt does not attest the production artifact');
  }
  if (!Array.isArray(production.assets) || production.assets.length === 0) {
    throw new Error('production manifest contains no assets');
  }
  for (const asset of production.assets) {
    assertSafeRelativePath(asset.path);
    const actual = await hashFile(path.join(source, 'dist', asset.path));
    if (actual.bytes !== asset.bytes || actual.sha256 !== asset.sha256) {
      throw new Error(
        `production asset ${asset.path} does not match its manifest`,
      );
    }
  }
  for (const filename of HOST_FILES) {
    await stat(path.join(source, filename));
  }
  return { production, receiptPath };
}

export function assertSafeRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`unsafe asset path ${JSON.stringify(value)}`);
  }
}

export async function listFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`runtime asset ${relative} is not a regular file`);
  }
  return result.sort();
}
