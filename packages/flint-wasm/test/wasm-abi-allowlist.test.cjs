"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { checkAbi, wasmFiles } = require("../scripts/wasm-abi-allowlist.cjs");
const {
  resolveToolchain,
} = require("../../wasm-toolchain/scripts/toolchain.cjs");
const {
  embeddedBuildPath,
} = require("../../../tools/reproducible-generated-paths.cjs");

const dist = join(__dirname, "..", "dist");
const tracked = join(__dirname, "..", "release", "wasm-abi-allowlist.json");
const repositoryRoot = resolve(__dirname, "..", "..", "..");

test("every production Wasm module matches its exact reviewed ABI", async () => {
  const inventory = await checkAbi({ dist, allowlist: tracked });
  assert.equal(Object.keys(inventory.modules).length, 13);
  assert.ok(inventory.modules["flint-factor.wasm"]);
  assert.ok(inventory.modules["m4ri-resource.wasm"]);
  assert.ok(inventory.modules["native-kernels/kernel-flint.wasm"]);
});

test("an added, removed, or changed module ABI fails closed", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-abi-allowlist-"));
  const filename = join(temporary, "allowlist.json");
  try {
    const value = JSON.parse(readFileSync(tracked, "utf8"));
    value.modules["flint-factor.wasm"].exports.push({
      name: "undeclared_export",
      kind: "function",
    });
    writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
    await assert.rejects(
      checkAbi({ dist, allowlist: filename }),
      /ABI differs.*changed=\[flint-factor\.wasm\]/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("production modules do not embed checkout or prepared-toolchain paths", () => {
  const toolchain = resolveToolchain({ root: repositoryRoot });
  const forbidden = [repositoryRoot, toolchain.root].map((value) => Buffer.from(value));
  for (const filename of wasmFiles(dist)) {
    const bytes = readFileSync(filename);
    for (const prefix of forbidden) {
      assert.equal(
        bytes.indexOf(prefix),
        -1,
        `${filename} embeds ${prefix.toString("utf8")}`,
      );
    }
  }
});

test("no signed production asset embeds checkout or prepared-toolchain paths", () => {
  const toolchain = resolveToolchain({ root: repositoryRoot });
  const manifest = JSON.parse(
    readFileSync(join(dist, "production-manifest.json"), "utf8"),
  );
  for (const asset of manifest.assets) {
    const embedded = embeddedBuildPath(
      readFileSync(join(dist, asset.path), "latin1"),
      [repositoryRoot, toolchain.root],
    );
    assert.equal(
      embedded,
      null,
      `${asset.path} embeds ${embedded?.root ?? "a local build path"}`,
    );
  }
});
