#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { instantiateFlintFactor } from "../index.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const snapshotPath = path.join(
  repositoryRoot,
  "architecture",
  "wasm-public-fallback-audit.json",
);

async function pythonFiles(directory) {
  const answer = [];
  for (const name of (await readdir(directory)).sort()) {
    const filename = path.join(directory, name);
    const information = await stat(filename);
    if (information.isDirectory()) answer.push(...await pythonFiles(filename));
    else if (information.isFile() && filename.endsWith(".py")) answer.push(filename);
  }
  return answer;
}

export async function auditPublicFallbacks() {
  const manifest = JSON.parse(await readFile(
    path.join(repositoryRoot, "architecture", "wasm-capabilities.json"),
  ));
  const backend = await instantiateFlintFactor(
    await readFile(path.join(packageRoot, "dist", "flint-factor.wasm")),
    {
      algebraicSource: await readFile(
        path.join(packageRoot, "dist", "flint-algebraic.wasm"),
      ),
    },
  );
  const methods = new Set(Object.keys(backend));
  const portable = manifest.capabilities.filter((capability) =>
    capability.kind === "napi-export" &&
    capability.disposition === "portable-fallback"
  );
  const absent = portable.filter((capability) =>
    !methods.has(capability.id.split(":").at(-1))
  );
  const direct = new Set();
  const files = [
    ...await pythonFiles(path.join(repositoryRoot, "src", "baselib")),
    ...await pythonFiles(path.join(repositoryRoot, "src", "lib")),
  ];
  for (const capability of absent) {
    const name = capability.id.split(":").at(-1);
    const pattern = new RegExp(
      `(?:flint_backend\\(\\)|backend)\\.${name}\\s*\\(`,
    );
    for (const filename of files) {
      if (pattern.test(await readFile(filename, "utf8"))) {
        direct.add(name);
        break;
      }
    }
  }
  return {
    schema: "sagejs.wasm-public-fallback-audit/v1",
    backend_method_count: methods.size,
    portable_napi_capability_count: portable.length,
    same_name_backend_method_count: portable.length - absent.length,
    absent_same_name_backend_method_count: absent.length,
    absent_methods_directly_referenced_by_public_source_count: direct.size,
    absent_methods_directly_referenced_by_public_source: [...direct].sort(),
  };
}

async function main() {
  const actual = await auditPublicFallbacks();
  if (process.argv.includes("--write")) {
    await writeFile(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(`Wrote ${path.relative(repositoryRoot, snapshotPath)}.`);
    return;
  }
  const expected = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.deepEqual(actual, expected, "Wasm public-fallback inventory drifted");
  console.log(
    `Verified ${actual.portable_napi_capability_count} portable N-API decisions; ` +
    `${actual.absent_methods_directly_referenced_by_public_source_count} absent ` +
    "same-name methods remain visible to the source audit.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
