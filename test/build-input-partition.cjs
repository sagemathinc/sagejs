// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { artifactInputsFingerprint, workspaceFingerprint, currentBuildIdentity,
  inspectBuildReceipt, refreshBuildReceiptAfterNative, writeBuildReceipt } = require("../scripts/build-receipt.cjs");
const { requireUnchangedWorkspace } = require("../scripts/run-python-conformance.cjs");

const packageAndBenchmarkValidationPaths = [
  "upstream-tests/python-packages/manifest.json",
  "scripts/run-pure-python-packages.cjs",
  "scripts/python-package-phases.cjs",
  "scripts/python-package-suites.cjs",
  "tools/python-compat/drivers/tomli-errors.py",
  "bench/cowasm/run.cjs",
  "bench/python-compat/qualification.cjs",
];

const derivedValidationArtifactPaths = [
  "architecture/optimizer-opportunities.manifest.json",
  "docs/optimizer-opportunities.md",
  "bench/modular/qexp-correctness/source-freeze.json",
];

function fixture(context, git = false) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-build-inputs-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  if (git) execFileSync("git", ["init", "-q", root]);
  const write = (name, value = "initial\n") => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), value);
  };
  write("package.json", "{}\n");
  return { root, write };
}

for (const git of [false, true]) {
  test(`audited validation-only edits preserve artifacts (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    for (const name of ["README.md", "AGENTS.md", "agents/plan.md", "docs/reference/api.md",
      "test/regression.cjs", "website/reference-data.json", "website/reference.html",
      "packages/flint-wasm/test/example.test.mjs",
      "packages/flint-wasm/test/example.test.cjs",
      "upstream-tests/micropython/baselines/review.json",
      "upstream-tests/python-compat/suites/example.py",
      ...packageAndBenchmarkValidationPaths, ...derivedValidationArtifactPaths]) {
      const artifact = artifactInputsFingerprint(root);
      const workspace = workspaceFingerprint(root);
      write(name);
      assert.equal(artifactInputsFingerprint(root), artifact, name);
      assert.notEqual(workspaceFingerprint(root), workspace, name);
      assert.throws(() => requireUnchangedWorkspace(workspace, workspaceFingerprint(root)), /workspace changed/);
    }
  });

  test(`derived validation edits and removal preserve artifacts (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    for (const name of derivedValidationArtifactPaths) {
      write(name);
      const artifact = artifactInputsFingerprint(root);
      const workspace = workspaceFingerprint(root);
      write(name, "regenerated validation evidence\n");
      const regenerated = workspaceFingerprint(root);
      assert.equal(artifactInputsFingerprint(root), artifact, name);
      assert.notEqual(regenerated, workspace, name);
      assert.throws(() => requireUnchangedWorkspace(workspace, regenerated), /workspace changed/);
      rmSync(join(root, name));
      assert.equal(artifactInputsFingerprint(root), artifact, name);
      assert.notEqual(workspaceFingerprint(root), regenerated, name);
    }
  });

  test(`real build inputs remain conservative (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    for (const name of ["src/baselib/builtins.py", "bin/sagejs-source.cjs", "sagejs-version.json",
      "pnpm-lock.yaml", "tsconfig.json", "scripts/build.cjs", "architecture/native-kernels.json",
      "bench/numerical-p3-nlopt/corpus.json",
      "scripts/build-receipt.cjs", "scripts/precompiled-python-packages.json",
      "src/compiler.py", "tools/python/lowerer.ts",
      "scripts/optimizer-opportunity-dashboard.cjs",
      "tools/optimizer-development/dashboard-artifacts.cjs",
      "tools/optimizer-development/identity.cjs",
      "architecture/optimizer-opportunities.manifest.json.in",
      "architecture/optimizer-opportunities.schema.json",
      "architecture/package-graph.json",
      "bench/modular/qexp-correctness/source-freeze.cjs",
      "bench/modular/qexp-correctness/pinned-corpus.json",
      "bench/modular/qexp-correctness/sagejs-corpus.cjs",
      "src/baselib/modular.py", "src/lib/sagejs/modular_forms/qexp.py",
      "bench/modular/qexp-correctness/source-freeze.json.in",
      "bench/modular/qexp-correctness/source-freeze.schema.json",
      "scripts/run-pure-python-packages-generator.cjs", "scripts/python-package-phases-extra.cjs",
      "scripts/python-package-suites-extra.cjs", "tools/python-compat/drivers/unknown.py",
      "bench/cowasm/run.cjs.in", "bench/python-compat/qualification-schema.json",
      "upstream-tests/python-packages-generator/generator.cjs",
      "tools/nested/test/example.ts", "tools/grammar/README.md", "packages/math/input.py",
      "packages/flint-wasm/test/example-support.mjs",
      "packages/flint-wasm/test/fixtures/example.py",
      "upstream-tests/tree-sitter-example/src/scanner.c", "website/unknown-input.json",
      "unknown-config.json"]) {
      const before = artifactInputsFingerprint(root);
      write(name);
      assert.notEqual(artifactInputsFingerprint(root), before, name);
      const added = artifactInputsFingerprint(root);
      write(name, "changed\n");
      assert.notEqual(artifactInputsFingerprint(root), added, name);
    }
  });
}

for (const field of ["reviewed_sagejs_files", "qualification_tooling_files"]) {
  test(`reviewed production ${field} overrides validation-only exclusions`, (context) => {
    const { root, write } = fixture(context);
    const paths = [...packageAndBenchmarkValidationPaths, ...derivedValidationArtifactPaths];
    write("src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json",
      JSON.stringify({ [field]: Object.fromEntries(
        paths.map((name) => [name, "reviewed"])) }));
    for (const name of paths) {
      write(name);
      const artifact = artifactInputsFingerprint(root);
      write(name, "changed reviewed input");
      assert.notEqual(artifactInputsFingerprint(root), artifact, name);
    }
  });
}

test("artifact reuse preserves the original build provenance and output checks", (context) => {
  const { root, write } = fixture(context);
  for (const directory of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
    write(`dist/${directory}/payload`);
  }
  for (const name of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) write(`dist/${name}`);
  const original = currentBuildIdentity(root);
  writeBuildReceipt({ root, durationMilliseconds: 1, identity: original });
  const receipt = readFileSync(join(root, "dist/build-receipt.json"));
  write("test/new-case.cjs");
  for (const name of derivedValidationArtifactPaths) write(name);
  const status = inspectBuildReceipt(root);
  assert.equal(status.current, true);
  assert.equal(status.buildWorkspaceSha256, original.workspaceSha256);
  assert.equal(status.validationWorkspaceSha256, workspaceFingerprint(root));
  assert.notEqual(status.validationWorkspaceSha256, status.buildWorkspaceSha256);
  assert.deepEqual(readFileSync(join(root, "dist/build-receipt.json")), receipt);
  const refreshed = refreshBuildReceiptAfterNative(root);
  assert.equal(refreshed.identity.workspaceSha256, original.workspaceSha256);
  assert.equal(refreshed.refreshWorkspaceSha256, workspaceFingerprint(root));
  assert.equal(inspectBuildReceipt(root).current, true);
  assert.equal(inspectBuildReceipt(root).buildWorkspaceSha256, original.workspaceSha256);
  write("dist/module-cache/payload", "tampered");
  assert.match(inspectBuildReceipt(root).reason, /digest or inventory/);
});

test("source-reviewed tests remain build inputs even in validation-only roots", (context) => {
  const { root, write } = fixture(context);
  const path = "test/reviewed-numerical-contract.cjs";
  const wasmTest = "packages/flint-wasm/test/reviewed.test.mjs";
  write("src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json",
    JSON.stringify({ reviewed_sagejs_files: { [path]: "reviewed" },
      qualification_tooling_files: {
        "test/review-tool.cjs": "reviewed", [wasmTest]: "reviewed",
      } }));
  for (const name of [path, "test/review-tool.cjs", wasmTest]) {
    write(name);
    const before = artifactInputsFingerprint(root);
    write(name, "changed contract");
    assert.notEqual(artifactInputsFingerprint(root), before, name);
  }
});

test("submodule revision, dirty source, and untracked source are fingerprinted", (context) => {
  const { root, write } = fixture(context, true);
  const nested = join(root, "upstream-tests/tree-sitter-example");
  write("upstream-tests/tree-sitter-example/src/scanner.c");
  execFileSync("git", ["init", "-q", nested]);
  const git = (...args) => execFileSync("git", ["-C", nested, ...args], { stdio: "pipe" });
  git("add", "src/scanner.c");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  execFileSync("git", ["-C", root, "add", "upstream-tests/tree-sitter-example"], { stdio: "pipe" });
  const original = artifactInputsFingerprint(root);
  write("upstream-tests/tree-sitter-example/src/scanner.c", "dirty");
  assert.notEqual(artifactInputsFingerprint(root), original);
  write("upstream-tests/tree-sitter-example/src/scanner.c");
  assert.equal(artifactInputsFingerprint(root), original);
  write("upstream-tests/tree-sitter-example/new-source.c");
  assert.notEqual(artifactInputsFingerprint(root), original);
  rmSync(join(nested, "new-source.c"));
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "new revision");
  assert.notEqual(artifactInputsFingerprint(root), original);
});
