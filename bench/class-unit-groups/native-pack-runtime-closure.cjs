"use strict";

const fs = require("node:fs"), path = require("node:path");
const {createHash} = require("node:crypto");
const layout = require("../../tools/native-pack-layout.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const CACHE_ROOT = "dist/native-kernels";
const CURRENT_CLOSURE = "sagejs.benchmark/complex-cubic-candidate-runtime-closure-v4";
const LEGACY_CLOSURE = "sagejs.benchmark/complex-cubic-candidate-runtime-closure-v3";

function readCatalogFile(root, relative) {
  let filename = root;
  const components = relative.split("/");
  for (let index = 0; index < components.length; index++) {
    filename = path.join(filename, components[index]);
    const status = fs.lstatSync(filename);
    if (index === components.length - 1 ? !status.isFile() : !status.isDirectory()) {
      throw new Error(`native catalog rejects non-regular path ${relative}`);
    }
  }
  return fs.readFileSync(filename);
}

function currentCatalogClosure(root) {
  const bytes = readCatalogFile(root, `${CACHE_ROOT}/index.json`);
  const index = JSON.parse(bytes);
  for (const filename of layout.catalogPaths(index)) {
    readCatalogFile(root, `${CACHE_ROOT}/${filename}`);
  }
  const packs = [];
  for (const pack of index.packs) {
    const base = `${CACHE_ROOT}/${layout.packDirectory(pack.packKey)}/pack`;
    const addon = readCatalogFile(root, `${base}/${layout.PACK_FILENAME}`);
    const manifest = JSON.parse(readCatalogFile(root, `${base}/index.json`));
    if (manifest.schema !== "sagejs.native-pack/v2" || manifest.packKey !== pack.packKey ||
        !Number.isSafeInteger(pack.packAbi) || pack.packAbi < 1 ||
        !Number.isSafeInteger(pack.nativeAbi) || pack.nativeAbi < 1 ||
        manifest.packAbi !== pack.packAbi || manifest.nativeAbi !== pack.nativeAbi ||
        manifest.bytes !== addon.length || pack.bytes !== addon.length || addon.length === 0 ||
        manifest.sha256 !== hash(addon) || pack.sha256 !== manifest.sha256 ||
        !Array.isArray(manifest.kernels) ||
        JSON.stringify(manifest.kernels.map(kernel => kernel.cacheKey).sort()) !==
          JSON.stringify([...pack.kernels].sort())) {
      throw new Error("candidate runtime closure rejects an inconsistent production native pack");
    }
    for (const kernel of manifest.kernels) {
      const record = index.logicalSources[kernel.logicalSource];
      if (!record || !/^[a-f0-9]{64}$/.test(record.sourceHash ?? "") ||
          record.cacheKey !== kernel.cacheKey || record.packKey !== pack.packKey ||
          record.sourceHash !== kernel.sourceHash || record.nativeAbi !== kernel.nativeAbi ||
          record.nativeAbi !== pack.nativeAbi) {
        throw new Error("candidate runtime closure rejects inconsistent native source routing");
      }
      const standalone = path.join(root,CACHE_ROOT,layout.packDirectory(pack.packKey),
        record.cacheKey,"build/Release/sagejs_native_kernel.node");
      try {
        fs.lstatSync(standalone);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      throw new Error("candidate runtime closure rejects the standalone native-addon fallback");
    }
    packs.push({path:`${base}/${layout.PACK_FILENAME}`,pack_key:pack.packKey,
      sha256:manifest.sha256,bytes:String(addon.length)});
  }
  packs.sort((left,right)=>left.pack_key.localeCompare(right.pack_key));
  return {schema:layout.SCHEMA,path:`${CACHE_ROOT}/index.json`,sha256:hash(bytes),
    kernel_count:index.expectedKernels,packs};
}

function closurePaths(closure) {
  if (closure?.schema === LEGACY_CLOSURE) return {
    pack:`${CACHE_ROOT}/pack/${layout.PACK_FILENAME}`,
    standalone:`${CACHE_ROOT}/${closure.native_cache_key}/build/Release/sagejs_native_kernel.node`,
  };
  if (closure?.schema !== CURRENT_CLOSURE) throw new Error("unsupported candidate runtime closure schema");
  const packKey=closure.production_native_pack?.pack_key;
  if (!/^[a-f0-9]{64}$/.test(closure.native_cache_key ?? "")) throw new Error("invalid native kernel key");
  const base=`${CACHE_ROOT}/${layout.packDirectory(packKey)}`;
  return {pack:`${base}/pack/${layout.PACK_FILENAME}`,
    standalone:`${base}/${closure.native_cache_key}/build/Release/sagejs_native_kernel.node`};
}

function validateCatalogClosure(closure) {
  if (closure?.schema === LEGACY_CLOSURE) return;
  const catalog=closure?.native_pack_catalog;
  if (closure?.schema !== CURRENT_CLOSURE || catalog?.schema !== layout.SCHEMA ||
      catalog.path !== `${CACHE_ROOT}/index.json` || !/^[a-f0-9]{64}$/.test(catalog.sha256 ?? "") ||
      !Number.isSafeInteger(catalog.kernel_count) || catalog.kernel_count < 1 ||
      !Array.isArray(catalog.packs) || catalog.packs.length < 1 || catalog.packs.length > catalog.kernel_count) {
    throw new Error("candidate source requires a complete native pack catalog closure");
  }
  const keys=new Set();
  for (const pack of catalog.packs) {
    if (!pack || keys.has(pack.pack_key) || pack.path !== `${CACHE_ROOT}/${layout.packDirectory(pack.pack_key)}/pack/${layout.PACK_FILENAME}` ||
        !/^[a-f0-9]{64}$/.test(pack.sha256 ?? "") ||
        typeof pack.bytes !== "string" || !/^[1-9][0-9]*$/.test(pack.bytes)) {
      throw new Error("candidate source has an invalid native pack catalog closure");
    }
    keys.add(pack.pack_key);
  }
  const selected=catalog.packs.find(pack=>pack.pack_key===closure.production_native_pack?.pack_key);
  if (!selected || ["path","pack_key","sha256","bytes"].some(key=>selected[key]!==closure.production_native_pack[key])) {
    throw new Error("candidate source selected pack disagrees with its catalog closure");
  }
}

module.exports={CACHE_ROOT,CURRENT_CLOSURE,LEGACY_CLOSURE,currentCatalogClosure,closurePaths,validateCatalogClosure};
