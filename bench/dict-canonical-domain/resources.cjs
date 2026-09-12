"use strict";

// Developer observations, never controlled number-field timing receipts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const root = path.resolve(process.argv[2]);
const mode = process.argv[3];
const base = "0c2945e1de400b0ee66150ae523491f7c712ce0a";
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const files = ["src/baselib/containers.py", "src/baselib/finite_fields.py"];
const read = name => fs.readFileSync(path.join(root, name));
const identities = () => ({
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source_sha256: Object.fromEntries(files.map(name => [name, digest(read(name))])),
  compiler_sha256: digest(read("dist/compiler/compiler.js")),
  build_receipt_sha256: digest(read("dist/build-receipt.json")),
  package_policy_sha256: digest(read("architecture/package-graph.json")),
  script_sha256: digest(fs.readFileSync(__filename)),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
});

async function generated() {
  const compiler = require(path.join(root, "dist/tools/compiler.js")).default();
  const { createPythonCompilerFrontend } = require(path.join(root, "dist/tools/python/compiler-frontend.js"));
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const rows = [];
  try {
    for (const name of files) {
      for (const revision of ["base", "candidate"]) {
        const raw = revision === "base"
          ? execFileSync("git", ["show", `${base}:${name}`], { cwd: root, encoding: "utf8" })
          : read(name).toString("utf8");
        const ast = frontend.parse(raw, {
          filename: path.basename(name), basedir: path.join(root, "src/baselib"),
          intrinsic_package_shells: true, scoped_flags: { bound_methods: true },
          compiler_bootstrap: true,
        });
        const output = new compiler.OutputStream({
          beautify: true, keep_docstrings: true, write_name: false,
          private_scope: false, omit_baselib: true, python_truthiness: true,
          python_ordering: false,
          baselib_module_id: `sagejs._baselib.${path.basename(name, ".py")}`,
        });
        ast.print(output);
        const target = output.get();
        rows.push({ name, revision, source_bytes: Buffer.byteLength(raw),
          source_sha256: digest(raw), emitted_module_bytes: Buffer.byteLength(target),
          emitted_module_sha256: digest(target) });
      }
    }
  } finally { frontend.close(); }
  const artifacts = ["dist/compiler/compiler.js", "dist/compiler/baselib-plain-pretty.js",
    "dist/runtime-cache/compiler.bin", "dist/runtime-cache/runtime-bootstrap-sage.bin",
    "dist/runtime-cache/runtime-bootstrap-python.bin"].map(name => {
      const value = read(name);
      return { name, bytes: value.length, sha256: digest(value) };
    });
  return { base, rows, artifacts,
    emitted_boundary: "isolated modules, same candidate frontend/emitter and self.js module options; excludes whole-baselib facade wrappers",
    native_objects: "not applicable: no new native mathematical code or kernels" };
}

async function runtime() {
  assert.equal(typeof global.gc, "function", "run with node --expose-gc");
  const { createKernelEvaluatorAsync } = require(path.join(root, "dist/tools/kernel-evaluator.js"));
  let output = "";
  const evaluator = await createKernelEvaluatorAsync({ mode: "sage", onOutput: text => { output += text; } });
  const evaluate = source => {
    output = "";
    const answer = evaluator.evaluate(source, { suppressResult: true });
    assert.equal(output, "");
    return answer;
  };
  const heap = () => { global.gc(); global.gc(); return process.memoryUsage(); };
  const observations = [];
  try {
    evaluate(`
import sagejs.runtime as runtime
parent = GF(65521)
held = []
empty = {}
def primitive_work(size):
    mapping = {}
    for i in range(size):
        mapping[str(i)] = i
    for i in range(size):
        assert mapping[str(i)] == i
        assert str(i + size) not in mapping
    assert len(mapping) == size
def residue_work(size):
    mapping = {}
    for i in range(size):
        mapping[parent(i)] = i
    for i in range(size):
        assert mapping[parent(i)] == i
        assert parent(i + size) not in mapping
    assert len(mapping) == size
def retain_small_dictionaries(size):
    global held
    held = [{"first": i, "second": i + 1} for i in range(size)]
    assert len(held) == size
def probe_distinct_misses(start, stop):
    for i in range(start, stop):
        assert parent(i) not in empty
    assert len(empty) == 0
`);
    evaluate("primitive_work(32)\nresidue_work(32)\nretain_small_dictionaries(32)\nheld = []");
    for (const [name, sizes] of [["primitive_work", [256, 512, 1024]], ["residue_work", [256, 512, 1024]]]) {
      for (const size of sizes) {
        const samples = [];
        for (let index = 0; index < 3; index++) {
          const started = performance.now();
          evaluate(`${name}(${size})`);
          samples.push(performance.now() - started);
        }
        observations.push({ name, size, elapsed_ms: samples });
      }
    }
    const churn = [{ state: "before", memory: heap() }];
    evaluate("retain_small_dictionaries(10000)");
    churn.push({ state: "10000-live", memory: heap() });
    evaluate("held = []");
    churn.push({ state: "released", memory: heap() });
    const misses = [{ state: "before", memory: heap() }];
    evaluate("probe_distinct_misses(4096, 12288)");
    misses.push({ state: "8192-distinct", memory: heap() });
    evaluate("probe_distinct_misses(12288, 28672)");
    misses.push({ state: "24576-distinct", memory: heap() });
    return { observations, churn, misses, allocation_count: null,
      memory_scope: "post-GC managed heap of one fresh process/evaluator, including compiler and caches; not exact allocation accounting",
      timing_scope: "local developer evaluation wall time including tiny call compilation; three repetitions, no statistical performance certification" };
  } finally { evaluator.close(); }
}

(async () => {
  assert.ok(mode === "generated" || mode === "runtime");
  const before = identities();
  const buildInspection = require(path.join(root, "scripts/build-receipt.cjs")).inspectBuildReceipt(root);
  const result = mode === "generated" ? await generated() : await runtime();
  assert.deepEqual(identities(), before, "source/build boundary changed during observation");
  console.log(JSON.stringify({ schema: "sagejs.dictionary-developer-resource.v1", controlled_timing: false,
    mode, identities: before, build_inspection: buildInspection,
    qualification_note: "An invalidated build receipt is retained explicitly; this developer observation cannot substitute for final exact-tree build/platform qualification.",
    ...result }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
