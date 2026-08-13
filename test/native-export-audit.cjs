"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  consumerLocationIndex,
} = require("../tools/ffi/native-export-audit.cjs");

function write(root, path, source) {
  const filename = join(root, path);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, source);
}

test("native export consumers are indexed once by package and export", (context) => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-native-export-audit-"));
  context.after(() => rmSync(root, { recursive: true }));
  const files = [
    "architecture/ignored.js",
    "packages/flint/client.cjs",
    "packages/graph/client.cjs",
    "src/both.py",
    "src/unrelated.py",
  ];
  write(root, files[0], "flint_backend.rank()\n");
  write(root, files[1], "backend.rank(); backend['rank']; backend.rank_extra()\n");
  write(root, files[2], "backend.rank(); backend[\"components\"]\n");
  write(
    root,
    files[3],
    "# @sagemath/sagejs-flint graph_backend\napi['rank'](); api.components()\n",
  );
  write(root, files[4], "api.rank()\n");

  const index = consumerLocationIndex(root, files, [
    { package: "@sagemath/sagejs-flint", export: "rank" },
    { package: "@sagemath/sagejs-graph", export: "rank" },
    { package: "@sagemath/sagejs-graph", export: "components" },
  ]);

  assert.deepEqual(index.get("@sagemath/sagejs-flint:rank"), [
    "packages/flint/client.cjs",
    "src/both.py",
  ]);
  assert.deepEqual(index.get("@sagemath/sagejs-graph:rank"), [
    "packages/graph/client.cjs",
    "src/both.py",
  ]);
  assert.deepEqual(index.get("@sagemath/sagejs-graph:components"), [
    "packages/graph/client.cjs",
    "src/both.py",
  ]);
});
