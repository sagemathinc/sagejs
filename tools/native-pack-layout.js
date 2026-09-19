"use strict";

// Shared by the publisher, ordinary loader and SEA collector/extractor.
// Paths are derived from authenticated identities, never supplied by a catalog.
const SCHEMA = "sagejs.native-cache/v5";
const PACK_FILENAME = "sagejs_native_kernel_pack.node";
const isKey = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function packDirectory(packKey) {
  if (!isKey(packKey)) throw new Error("invalid native pack identity");
  return `packs/${packKey}`;
}

function modulePath(record) {
  if (!isKey(record?.cacheKey)) throw new Error("invalid native kernel identity");
  return `${packDirectory(record.packKey)}/${record.cacheKey}/index.cjs`;
}

function parseModulePath(value) {
  const match = /^packs\/([a-f0-9]{64})\/([a-f0-9]{64})\/index\.cjs$/.exec(value);
  if (!match) throw new Error("invalid native kernel module path");
  return { packKey: match[1], cacheKey: match[2] };
}

function selectedPack(index, record) {
  if (index?.schema !== SCHEMA || index.complete !== true ||
      !isKey(record?.cacheKey) || !isKey(record?.packKey) ||
      !Array.isArray(index.packs)) return undefined;
  const matches = index.packs.filter((pack) => pack?.packKey === record.packKey);
  if (matches.length !== 1) return undefined;
  const pack = matches[0];
  if (!Array.isArray(pack.kernels) ||
      pack.kernels.filter((key) => key === record.cacheKey).length !== 1) return undefined;
  return pack;
}

function catalogPaths(index) {
  if (index?.schema !== SCHEMA || index.complete !== true ||
      !Array.isArray(index.packs) || index.packs.length === 0 ||
      index.logicalSources === null || typeof index.logicalSources !== "object" ||
      Array.isArray(index.logicalSources)) {
    throw new Error("a complete production native pack catalog is required");
  }
  const paths = ["index.json"];
  const packs = new Set(), kernels = new Set(), referenced = new Set();
  for (const pack of index.packs) {
    if (!isKey(pack?.packKey) || packs.has(pack.packKey) ||
        !Array.isArray(pack.kernels) || pack.kernels.length === 0) {
      throw new Error("invalid or duplicate production native pack");
    }
    packs.add(pack.packKey);
    for (const key of pack.kernels) {
      if (!isKey(key) || kernels.has(key)) throw new Error("invalid or duplicate packed kernel");
      kernels.add(key);
    }
    const base = packDirectory(pack.packKey);
    paths.push(`${base}/pack/index.json`, `${base}/pack/${PACK_FILENAME}`);
  }
  for (const record of Object.values(index.logicalSources)) {
    if (!selectedPack(index, record) || referenced.has(record.cacheKey)) {
      throw new Error("invalid or duplicate native source routing");
    }
    referenced.add(record.cacheKey);
    paths.push(modulePath(record));
  }
  if (referenced.size !== kernels.size || index.expectedKernels !== kernels.size) {
    throw new Error("incomplete native source routing");
  }
  return paths;
}

module.exports = { SCHEMA, PACK_FILENAME, packDirectory, modulePath, parseModulePath,
  selectedPack, catalogPaths };
