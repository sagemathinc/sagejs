"use strict";

const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  NATIVE_ABI_VERSION,
  nativeBuildWorkspace,
} = require("./compiler.cjs");
const {
  NATIVE_PACK_ABI_VERSION,
} = require("./js-backend.cjs");
const { portableKernelIdentity } = require("./portable-identity.cjs");

const PACK_IDENTITY_SCHEMA = "sagejs.native-pack-identity/v2";
const PACK_MANIFEST_SCHEMA = "sagejs.native-pack/v2";
const PACK_FILENAME = "sagejs_native_kernel_pack.node";

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  return sha256Bytes(readFileSync(filename));
}

function unique(values) {
  return Array.from(new Set(values));
}

function deepMerge(left, right) {
  if (
    left === null || right === null ||
    typeof left !== "object" || typeof right !== "object" ||
    Array.isArray(left) || Array.isArray(right)
  ) return structuredClone(right);
  const result = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    result[key] = key in result ? deepMerge(result[key], value) :
      structuredClone(value);
  }
  return result;
}

function cDefine(value) {
  const separator = value.indexOf("=");
  const name = separator < 0 ? value : value.slice(0, separator);
  const replacement = separator < 0 ? "1" : value.slice(separator + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /[\r\n]/.test(replacement)) {
    throw new Error(`invalid generated pack preprocessor definition ${value}`);
  }
  return `#define ${name} ${replacement}`;
}

function packIdentity(items) {
  const kernels = [...items]
    .sort((left, right) => left.logicalSource.localeCompare(right.logicalSource))
    .map((item) => {
      const portable = portableKernelIdentity(item);
      return {
        logicalSource: item.logicalSource,
        cacheKey: item.cacheKey,
        moduleIdentity: item.moduleIdentity,
        sourceHash: item.sourceHash,
        abiHash: portable.abiHash,
        coreHash: portable.coreHash,
        oracleIdentity: portable.oracleIdentity,
        portableIdentity: portable.identityHash,
        nativeAbi: item.nativeAbi,
        functionDeclarations: portable.functionDeclarations,
        foreignInputs: item.foreignInputs.map((input) => ({
          id: input.id,
          fingerprint: input.fingerprint,
        })),
      };
    });
  const identity = {
    schema: PACK_IDENTITY_SCHEMA,
    builderFingerprint: sha256File(__filename),
    packAbi: NATIVE_PACK_ABI_VERSION,
    nativeAbi: NATIVE_ABI_VERSION,
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
    kernels,
  };
  return { identity, packKey: sha256Bytes(JSON.stringify(identity)) };
}

function assertPackSymbolIdentities(items) {
  const symbols = new Map();
  const claim = (symbol, source) => {
    const previous = symbols.get(symbol);
    if (previous !== undefined) {
      throw new Error(
        `duplicate generated production-pack symbol ${symbol}: ` +
          `${previous} and ${source}`,
      );
    }
    symbols.set(symbol, source);
  };
  for (const item of items) {
    if (!/^[a-f0-9]{16}$/.test(item.moduleIdentity)) {
      throw new Error(
        `invalid module identity for ${item.logicalSource}: ` +
          item.moduleIdentity,
      );
    }
    claim(
      `sagejs_native_pack_init_m_${item.moduleIdentity}`,
      item.logicalSource,
    );
    for (const fn of item.ir.functions) {
      claim(
        `sagejs_kernel_m_${item.moduleIdentity}_${fn.name}`,
        item.logicalSource,
      );
    }
    for (const fn of item.exceptionShields) {
      claim(`${fn}_m_${item.moduleIdentity}`, item.logicalSource);
    }
  }
}

function aggregatorSource(items, packKey) {
  const sorted = [...items].sort((left, right) =>
    left.logicalSource.localeCompare(right.logicalSource)
  );
  const declarations = sorted.map((item) =>
    `napi_value sagejs_native_pack_init_m_${item.moduleIdentity}(` +
      "napi_env env, napi_value exports);"
  ).join("\n");
  const registrations = sorted.map((item) => `
    if (napi_create_object(env, &module) != napi_ok)
        return NULL;
    if (sagejs_native_pack_init_m_${item.moduleIdentity}(env, module) == NULL)
        return NULL;
    if (napi_set_named_property(env, exports, "${item.cacheKey}", module) !=
            napi_ok)
        return NULL;`).join("\n");
  return `/* Generated Sage.js production native-kernel pack. */
#include <node_api.h>

${declarations}

NAPI_MODULE_INIT()
{
    napi_value module;
    napi_value metadata;
    if (napi_create_uint32(env, ${NATIVE_PACK_ABI_VERSION}, &metadata) !=
            napi_ok ||
        napi_set_named_property(env, exports, "__sagejsPackAbi", metadata) !=
            napi_ok)
        return NULL;
    if (napi_create_string_utf8(env, "${packKey}", NAPI_AUTO_LENGTH,
            &metadata) != napi_ok ||
        napi_set_named_property(env, exports, "__sagejsPackIdentity",
            metadata) != napi_ok)
        return NULL;
${registrations}
    return exports;
}
`;
}

function packBinding(items, packDirectory) {
  const targets = items.map((item) =>
    JSON.parse(readFileSync(join(item.outputPath, "binding.gyp"), "utf8"))
      .targets[0]
  );
  const sources = ["pack.c"];
  const includeDirectories = [];
  const libraries = [];
  let targetSettings = {};
  items.forEach((item, index) => {
    const target = targets[index];
    const sourceDirectory = join(
      packDirectory,
      "sources",
      item.moduleIdentity,
    );
    mkdirSync(sourceDirectory, { recursive: true });
    for (const filename of ["kernel.c", "kernel_core.c", "kernel_core.h"]) {
      copyFileSync(
        join(item.outputPath, filename),
        join(sourceDirectory, filename),
      );
    }
    if (item.shimSourcePath !== null) {
      copyFileSync(item.shimSourcePath, join(sourceDirectory, "ffi_shims.cc"));
      copyFileSync(item.shimHeaderPath, join(sourceDirectory, "ffi_shims.h"));
      sources.push(join("sources", item.moduleIdentity, "ffi_shims.cc"));
    }
    const definitions = (target.defines ?? [])
      .filter((value) => !value.startsWith("NAPI_VERSION="))
      .map(cDefine);
    writeFileSync(
      join(sourceDirectory, "kernel_pack.c"),
      `${definitions.join("\n")}${definitions.length ? "\n" : ""}` +
        `#define SAGEJS_NATIVE_PACK_INITIALIZER ` +
        `sagejs_native_pack_init_m_${item.moduleIdentity}\n` +
        '#include "kernel.c"\n',
    );
    sources.push(join("sources", item.moduleIdentity, "kernel_pack.c"));
    includeDirectories.push(...(target.include_dirs ?? []));
    // Retain each original library sequence. Repeated archive arguments do not
    // duplicate linked objects, and preserving sequence works with Unix, ld64,
    // and the Windows linker without platform-specific archive groups.
    libraries.push(...(target.libraries ?? []));
    for (const key of [
      "configurations",
      "msvs_settings",
      "xcode_settings",
    ]) {
      if (target[key] !== undefined) {
        targetSettings[key] = deepMerge(
          targetSettings[key] ?? {},
          target[key],
        );
      }
    }
  });
  for (const key of ["cflags", "cflags_cc", "cflags_cc!", "ldflags"]) {
    const values = unique(targets.flatMap((target) => target[key] ?? []));
    if (values.length > 0) targetSettings[key] = values;
  }
  return {
    targets: [{
      target_name: "sagejs_native_kernel_pack",
      // The production pack is extracted from a SEA whose executable is not
      // named `node.exe`; node-gyp's hook redirects delayed Node-API imports
      // to the running process image on Windows.
      win_delay_load_hook: "true",
      sources,
      include_dirs: unique(includeDirectories),
      defines: ["NAPI_VERSION=8"],
      libraries,
      ...targetSettings,
    }],
  };
}

function manifestFor(items, identity, packKey, addonPath) {
  return {
    schema: PACK_MANIFEST_SCHEMA,
    packKey,
    packAbi: NATIVE_PACK_ABI_VERSION,
    nativeAbi: NATIVE_ABI_VERSION,
    platform: process.platform,
    architecture: process.arch,
    nodeModulesAbi: process.versions.modules,
    bytes: statSync(addonPath).size,
    sha256: sha256File(addonPath),
    identity,
    kernels: [...items]
      .sort((left, right) =>
        left.logicalSource.localeCompare(right.logicalSource)
      )
      .map((item) => {
        const portable = portableKernelIdentity(item);
        return {
          abiHash: portable.abiHash,
          coreHash: portable.coreHash,
          oracleIdentity: portable.oracleIdentity,
          portableIdentity: portable.identityHash,
          logicalSource: item.logicalSource,
          cacheKey: item.cacheKey,
          moduleIdentity: item.moduleIdentity,
          sourceHash: item.sourceHash,
          nativeAbi: item.nativeAbi,
          functionDeclarations: portable.functionDeclarations,
          foreignDeclarations: item.foreignDeclarations,
        };
      }),
  };
}

function validCachedPack(directory, identity, packKey) {
  const addonPath = join(directory, "build", "Release", PACK_FILENAME);
  const manifestPath = join(directory, "index.json");
  if (!existsSync(addonPath) || !existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      manifest.schema !== PACK_MANIFEST_SCHEMA ||
      manifest.packKey !== packKey ||
      JSON.stringify(manifest.identity) !== JSON.stringify(identity) ||
      manifest.bytes !== statSync(addonPath).size ||
      manifest.sha256 !== sha256File(addonPath)
    ) return null;
    return { addonPath, manifest, manifestPath };
  } catch (_error) {
    return null;
  }
}

function buildProductionPack({ items, cacheRoot }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("a production native pack requires at least one kernel");
  }
  assertPackSymbolIdentities(items);
  const { identity, packKey } = packIdentity(items);
  const packDirectory = join(resolve(cacheRoot), "packs", packKey);
  const cached = validCachedPack(packDirectory, identity, packKey);
  if (cached !== null) {
    return { ...cached, cached: true, packKey };
  }

  rmSync(packDirectory, { recursive: true, force: true });
  mkdirSync(packDirectory, { recursive: true });
  writeFileSync(
    join(packDirectory, "pack.c"),
    aggregatorSource(items, packKey),
  );
  writeFileSync(
    join(packDirectory, "binding.gyp"),
    `${JSON.stringify(packBinding(items, packDirectory), null, 2)}\n`,
  );
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(resolve(__dirname, "..", ".."), "packages", "flint")],
  });
  const workspace = nativeBuildWorkspace(packDirectory);
  let build;
  try {
    build = spawnSync(process.execPath, [nodeGyp, "rebuild"], {
      cwd: workspace.directory,
      encoding: "utf8",
    });
  } finally {
    workspace.close();
  }
  if (build.status !== 0) {
    process.stderr.write(build.stdout);
    process.stderr.write(build.stderr);
    throw new Error(`production native pack node-gyp exited ${build.status}`);
  }
  const addonPath = join(
    packDirectory,
    "build",
    "Release",
    PACK_FILENAME,
  );
  const manifest = manifestFor(items, identity, packKey, addonPath);
  const manifestPath = join(packDirectory, "index.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    addonPath,
    cached: false,
    manifest,
    manifestPath,
    packKey,
  };
}

module.exports = {
  NATIVE_PACK_ABI_VERSION,
  PACK_FILENAME,
  PACK_IDENTITY_SCHEMA,
  PACK_MANIFEST_SCHEMA,
  aggregatorSource,
  assertPackSymbolIdentities,
  buildProductionPack,
  packBinding,
  packIdentity,
};
