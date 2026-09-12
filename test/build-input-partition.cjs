// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { artifactInputsFingerprint, workspaceFingerprint, currentBuildIdentity,
  nativeInputIdentity, inspectBuildReceipt, refreshBuildReceiptAfterNative,
  writeBuildReceipt, validateBuildReceipt } = require("../scripts/build-receipt.cjs");
const { requireUnchangedWorkspace } = require("../scripts/run-python-conformance.cjs");

const pythonConformanceValidationPaths = [
  "scripts/run-python-conformance.cjs",
  "scripts/run-python-compat.cjs",
  "tools/python-compat/evidence.cjs",
  "tools/python-compat/manifest.cjs",
  "tools/python-compat/assertion-runner.cjs",
  "tools/python-compat/output-baseline.cjs",
  "tools/python-compat/legacy-output-manifest.cjs",
  "tools/python-compat/legacy-output-runner.cjs",
  "tools/python-compat/output-suite.cjs",
];

const packageAndBenchmarkValidationPaths = [
  ...pythonConformanceValidationPaths,
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

const generalFrontierValidationPaths = [
  "bench/class-unit-groups/general-frontier/campaign.json",
  "bench/class-unit-groups/general-frontier/corpus/candidate-pool.cjs",
  "bench/class-unit-groups/general-frontier/corpus/rank_two_supplement.py",
  "bench/class-unit-groups/general-frontier/reference/pari-screen.gp",
  "bench/class-unit-groups/general-frontier/reference/hecke/screen.jl",
  "bench/class-unit-groups/general-frontier/reference/runner/diagnose.cjs",
];

const coordinationTaskPaths = [
  ".agents/tasks/receipt-task.json",
  ".agents/tasks/class-unit-rank-two-frontier.json",
  ".agents/tasks/general-class-unit-candidate-pool.json",
  ".agents/tasks/general-class-unit-hecke-screen.json",
  ".agents/tasks/general-class-unit-persistent-reference.json",
  ".agents/tasks/general-class-unit-exposure-inventory.json",
  ".agents/tasks/general-class-unit-hard-windows.json",
  ".agents/tasks/general-frontier-build-partition.json",
];

function taskContract(id = "receipt-task") {
  return {
    $schema: "../task.schema.json", schema_version: 2, id,
    title: "Receipt projection", lane: "compiler-runtime", status: "active",
    owner: "test", objective: "Preserve build and validation identities",
    base_commit: "a".repeat(40), claims: ["src/baselib/builtins.py"],
    dependencies: [], references: [],
    architecture: {strategy: "compiler-infrastructure", fallback: "not-applicable",
      oracles: [], exceptions: []},
    platforms: {"linux-x64": "required", "linux-arm64": "required",
      "windows-x64": "required", "macos-arm64": "required"},
    validation: ["pnpm merge:check"], runs: [],
    handoff: {summary: "", risks: [], next_steps: []},
  };
}

function taskRun() {
  return {command: "pnpm merge:check", result: "pass", exit_code: 0, seconds: 1.5,
    started_at: "2026-09-12T09:00:00.000Z", commit: "a".repeat(40),
    workspace_fingerprint: "b".repeat(64), platform: "linux-x64"};
}

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
  test(`post-build task runs preserve receipt provenance and output integrity (${git ? "Git" : "archive"})`, context => {
    const {root, write} = fixture(context, git);
    if (git) write(".gitignore", "dist/\n");
    const name = coordinationTaskPaths[0];
    const task = taskContract();
    write(name, JSON.stringify(task));
    for (const directory of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
      write(`dist/${directory}/payload`);
    }
    for (const file of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) {
      write(`dist/${file}`);
    }
    // This synthetic artifact tree intentionally has no numerical provider,
    // regardless of which optional toolchains are installed on the test host.
    const identity = () => ({...currentBuildIdentity(root), numericalRuntimeProvider: undefined});
    const original = identity();
    writeBuildReceipt({root, durationMilliseconds: 1, identity: original});
    const filename = join(root, "dist/build-receipt.json");
    const receipt = readFileSync(filename);
    const inspect = () => validateBuildReceipt(JSON.parse(readFileSync(filename)), identity(), root);
    task.runs.push(taskRun());
    task.status = "review";
    task.handoff.summary = "Qualification recorded after the build";
    write(name, JSON.stringify(task, null, 2) + "\n");
    const status = inspect();
    assert.equal(status.current, true);
    assert.equal(status.buildWorkspaceSha256, original.workspaceSha256);
    assert.notEqual(status.validationWorkspaceSha256, original.workspaceSha256);
    assert.deepEqual(readFileSync(filename), receipt, "inspection never rewrites provenance");
    task.claims.push("src/baselib/internal.py");
    write(name, JSON.stringify(task));
    assert.equal(inspect().current, false);
    task.claims.pop();
    write(name, JSON.stringify(task));
    assert.equal(inspect().current, true);
    write("dist/module-cache/payload", "tampered");
    assert.match(inspect().reason, /digest or inventory/);
    assert.deepEqual(readFileSync(filename), receipt);
  });

  test(`validated task bookkeeping preserves only artifact identity (${git ? "Git" : "archive"})`, context => {
    const {root, write} = fixture(context, git);
    for (const name of coordinationTaskPaths) {
      const task = taskContract(name.split("/").pop().slice(0, -5));
      const absent = artifactInputsFingerprint(root);
      write(name, JSON.stringify(task));
      const artifact = artifactInputsFingerprint(root);
      assert.notEqual(artifact, absent, "the contract itself remains an input");
      for (const change of [
        () => task.runs.push(taskRun()),
        () => { task.handoff = {summary: "Qualified", risks: ["CI pending"], next_steps: ["Review"]}; },
        () => { task.status = "review"; },
      ]) {
        const workspace = workspaceFingerprint(root);
        change();
        write(name, JSON.stringify(task, null, 2) + "\n");
        assert.equal(artifactInputsFingerprint(root), artifact, name);
        assert.notEqual(workspaceFingerprint(root), workspace, name);
      }
      rmSync(join(root, name));
      assert.equal(artifactInputsFingerprint(root), absent, "deletion changes artifact identity");
    }
  });

  test(`task semantics and schema remain build inputs (${git ? "Git" : "archive"})`, context => {
    const {root, write} = fixture(context, git);
    const name = coordinationTaskPaths[0];
    for (const change of [
      task => { task.claims = ["src/baselib/internal.py"]; },
      task => { task.objective = "A different semantic contract objective"; },
      task => { task.validation.push("pnpm test:compiler"); },
      task => { task.dependencies.push("prerequisite"); },
      task => { task.references.push("contract reference"); },
      task => { task.base_commit = "c".repeat(40); },
      task => { task.owner = "another owner"; },
      task => { task.title = "Changed title"; },
      task => { task.lane = "integration"; },
      task => { task.architecture.oracles.push("cpython"); },
      task => { task.platforms["windows-x64"] = "fallback"; },
      task => { task.$schema = "../future-task.schema.json"; },
    ]) {
      const task = taskContract();
      write(name, JSON.stringify(task));
      const before = artifactInputsFingerprint(root);
      change(task);
      write(name, JSON.stringify(task));
      assert.notEqual(artifactInputsFingerprint(root), before);
    }
    const before = artifactInputsFingerprint(root);
    write(".agents/task.schema.json", JSON.stringify({additionalProperties: true}));
    assert.notEqual(artifactInputsFingerprint(root), before);
  });

  test(`unreviewed task shapes remain raw (${git ? "Git" : "archive"})`, context => {
    const {root, write} = fixture(context, git);
    const name = coordinationTaskPaths[0];
    for (const change of [
      task => { task.extra = "unknown"; },
      task => { task.handoff.extra = "unknown"; },
      task => { task.architecture.extra = "unknown"; },
      task => { task.platforms.extra = "unknown"; },
      task => { task.runs = [{...taskRun(), extra: "unknown"}]; },
      task => { task.schema_version = 3; },
      task => { task.status = "unreviewed"; },
      task => { task.id = "different-file"; },
      task => { delete task.dependencies; },
      task => { task.claims = ["same", "same"]; },
      task => { task.dependencies = [{}]; },
      task => { task.runs = [null]; },
      task => { task.runs = [{...taskRun(), seconds: -1}]; },
      task => { task.runs = [{...taskRun(), exit_code: "0"}]; },
      task => { task.runs = [{...taskRun(), result: "unknown"}]; },
      task => { task.runs = [{...taskRun(), started_at: "2026-02-30T09:00:00.000Z"}]; },
      task => { task.runs = [{...taskRun(), commit: "invalid"}]; },
      task => { task.runs = [{...taskRun(), workspace_fingerprint: "invalid"}]; },
      task => { task.handoff.risks = [{}]; },
    ]) {
      const task = taskContract();
      change(task);
      write(name, JSON.stringify(task));
      const before = artifactInputsFingerprint(root);
      task.handoff.summary = "Bookkeeping changed on an invalid contract";
      write(name, JSON.stringify(task));
      assert.notEqual(artifactInputsFingerprint(root), before);
    }
    const invalidUtf8 = Buffer.from(JSON.stringify(taskContract()));
    invalidUtf8[invalidUtf8.indexOf('"owner":"test"') + 9] = 255;
    for (const source of ["{", "null", "[]", "42", '"task"', invalidUtf8]) {
      write(name, source);
      const before = artifactInputsFingerprint(root);
      write(name, Buffer.isBuffer(source) ? Buffer.concat([source, Buffer.from("\n")]) : source + "\n");
      assert.notEqual(artifactInputsFingerprint(root), before);
    }
    for (const path of [name + ".in", ".agents/tasks/nested/receipt-task.json"]) {
      write(path, JSON.stringify(taskContract()));
      const before = artifactInputsFingerprint(root);
      write(path, JSON.stringify({...taskContract(), status: "complete"}));
      assert.notEqual(artifactInputsFingerprint(root), before);
    }
  });

  for (const field of ["reviewed_sagejs_files", "qualification_tooling_files"]) {
    test(`production ${field} overrides task projection (${git ? "Git" : "archive"})`, context => {
      const {root, write} = fixture(context, git);
      const name = coordinationTaskPaths[0];
      write("src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json",
        JSON.stringify({[field]: {[name]: "reviewed"}}));
      const task = taskContract();
      write(name, JSON.stringify(task));
      const before = artifactInputsFingerprint(root);
      task.runs.push(taskRun());
      write(name, JSON.stringify(task));
      assert.notEqual(artifactInputsFingerprint(root), before);
    });
  }

  test(`audited validation-only edits preserve artifacts (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    for (const name of ["README.md", "AGENTS.md", "agents/plan.md", "docs/reference/api.md",
      "test/regression.cjs", "website/reference-data.json", "website/reference.html",
      "packages/flint-wasm/test/example.test.mjs",
      "packages/flint-wasm/test/example.test.cjs",
      "upstream-tests/micropython/baselines/review.json",
      "upstream-tests/python-compat/suites/example.py",
      ...packageAndBenchmarkValidationPaths, ...derivedValidationArtifactPaths,
      ...generalFrontierValidationPaths]) {
      const artifact = artifactInputsFingerprint(root);
      const workspace = workspaceFingerprint(root);
      write(name);
      assert.equal(artifactInputsFingerprint(root), artifact, name);
      assert.notEqual(workspaceFingerprint(root), workspace, name);
      assert.throws(() => requireUnchangedWorkspace(workspace, workspaceFingerprint(root)), /workspace changed/);
    }
  });

  test(`validation-only edits and removal preserve artifacts (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    for (const name of [...derivedValidationArtifactPaths, ...pythonConformanceValidationPaths,
      ...generalFrontierValidationPaths]) {
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
    for (const name of [...pythonConformanceValidationPaths.flatMap((name) =>
      [name + ".in", name.replace(/\.cjs$/, "-extra.cjs")]),
      "src/baselib/builtins.py", "bin/sagejs-source.cjs", "sagejs-version.json",
      "pnpm-lock.yaml", "tsconfig.json", "scripts/build.cjs", "architecture/native-kernels.json",
      "bench/numerical-p3-nlopt/corpus.json",
      "scripts/build-receipt.cjs", "scripts/precompiled-python-packages.json",
      "src/compiler.py", "tools/python/lowerer.ts",
      "src/lib/sagejs/number_fields/class_unit.py",
      "packages/flint/src/addon.cc", "tools/native-kernel/compiler.cjs",
      "bench/class-unit-groups/general-frontier-extra/campaign.json",
      "bench/class-unit-groups/general-frontier.json",
      "bench/class-unit-groups/unknown-campaign/corpus.json",
      ".agents/lanes.json", ".agents/task.schema.json",
      ".agents/tasks/unknown-campaign.json",
      ".agents/tasks/class-unit-rank-two-frontier.json.in",
      ".agents/tasks/general-class-unit-candidate-pool-extra.json",
      ".agents/tasks/general-class-unit-persistent-reference-extra.json",
      ".agents/tasks/general-class-unit-exposure-inventory-extra.json",
      ".agents/tasks/general-class-unit-hard-windows-extra.json",
      ".agents/tasks/general-class-unit-hard-windows.json.in",
      ".agents/tasks/general-class-unit-exposure-inventory.json.in",
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
    const paths = [...packageAndBenchmarkValidationPaths, ...derivedValidationArtifactPaths,
      ...generalFrontierValidationPaths];
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
  for (const name of [...derivedValidationArtifactPaths, ...pythonConformanceValidationPaths,
    ...generalFrontierValidationPaths]) write(name);
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

for (const git of [false, true]) {
  test(`frontier metadata preserves installed native identity (${git ? "Git" : "archive"})`, (context) => {
    const { root, write } = fixture(context, git);
    const addon = "packages/flint/build/Release/sagejs_flint.node";
    write(addon, "fixture native bytes");
    const native = nativeInputIdentity(root);
    for (const name of generalFrontierValidationPaths) {
      write(name, "initial coordination or benchmark source");
      const artifact = artifactInputsFingerprint(root);
      const workspace = workspaceFingerprint(root);
      write(name, "changed metadata, including validation receipts");
      assert.equal(artifactInputsFingerprint(root), artifact, name);
      assert.deepEqual(nativeInputIdentity(root), native, name);
      assert.notEqual(workspaceFingerprint(root), workspace, name);
    }
    write(addon, "changed native bytes");
    assert.notDeepEqual(nativeInputIdentity(root), native);
  });
}

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

test("partition changes do not relabel an earlier receipt as current", (context) => {
  const { root, write } = fixture(context);
  write(generalFrontierValidationPaths[0]);
  for (const directory of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
    write(`dist/${directory}/payload`);
  }
  for (const name of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) write(`dist/${name}`);
  const identity = currentBuildIdentity(root);
  // A receipt from a partition that included the campaign has a different
  // input digest. No inspection or native reconciliation may rewrite it.
  identity.artifactInputsSha256 = workspaceFingerprint(root);
  assert.notEqual(identity.artifactInputsSha256, artifactInputsFingerprint(root));
  writeBuildReceipt({ root, durationMilliseconds: 1, identity });
  const filename = join(root, "dist/build-receipt.json");
  const receipt = readFileSync(filename);
  assert.deepEqual(inspectBuildReceipt(root), { current: false, reason: "build inputs changed" });
  assert.throws(() => refreshBuildReceiptAfterNative(root), /cannot refresh/);
  assert.deepEqual(readFileSync(filename), receipt);
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
