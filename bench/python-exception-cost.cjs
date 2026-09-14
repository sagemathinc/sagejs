"use strict";
// Mechanism diagnostic, not a controlled before/after release benchmark.
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { createContext, runInContext, runInThisContext } = require("node:vm");
const { performance } = require("node:perf_hooks");
const assert = require("node:assert/strict");
const createCompiler = require("../dist/tools/compiler.js").default;
const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
const root = join(__dirname, "..");
const cases = ["construct", "construct_raise_catch", "raise_existing", "binding_failure", "normal_call"];
const selectedCase = process.env.SAGEJS_EXCEPTION_CASE;
const selectedVariant = process.env.SAGEJS_EXCEPTION_VARIANT;
const privateScope = process.env.SAGEJS_EXCEPTION_PRIVATE_SCOPE === "1";
const logicalRecords = process.env.SAGEJS_EXCEPTION_LOGICAL_RECORDS === "1";
// Match the production Node bootstrap's realm by default. A separate VM
// context materially changes global lookup cost and is an explicit probe.
const realm = process.env.SAGEJS_EXCEPTION_REALM || "host";
assert.ok(["vm", "host"].includes(realm));
assert.ok(!selectedCase || cases.includes(selectedCase));
assert.ok(!selectedVariant || ["fallback", "lazy", "no-capture-diagnostic"].includes(selectedVariant));
const source = `
def identity(value):
    return value
def normal_call(n):
    total = 0
    for i in range(n):
        total += identity(1)
    return total
def construct(n):
    total = 0
    for i in range(n):
        error = ValueError('probe')
        total += len(error.args)
    return total
def binding_failure(n):
    total = 0
    for i in range(n):
        try:
            identity()
        except TypeError:
            total += 1
    return total
def construct_raise_catch(n):
    total = 0
    for i in range(n):
        try:
            raise ValueError('probe')
        except Exception:
            total += 1
    return total
def raise_existing(n):
    error = ValueError('probe')
    total = 0
    for i in range(n):
        try:
            raise error
        except Exception:
            total += 1
    return total
import sagejs.runtime as runtime
runtime.reflect.set(runtime.global_object, '__exception_construct', construct)
runtime.reflect.set(runtime.global_object, '__exception_construct_raise_catch', construct_raise_catch)
runtime.reflect.set(runtime.global_object, '__exception_raise_existing', raise_existing)
runtime.reflect.set(runtime.global_object, '__exception_binding_failure', binding_failure)
runtime.reflect.set(runtime.global_object, '__exception_normal_call', normal_call)
`;
(async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, { filename: "<exception-cost>",
      libdir: join(root, "src/lib"), strict_python_scopes: true,
      scoped_flags: { dict_literals: true, bound_methods: true } });
    const output = new compiler.OutputStream({
      baselib_plain: readFileSync(join(root, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
      private_scope: privateScope, write_name: false, python_attributes: true,
      python_traceback_records: logicalRecords,
      python_truthiness: true, python_tuples: true,
    });
    ast.print(output);
    if (process.env.SAGEJS_EXCEPTION_EMIT) {
      writeFileSync(process.env.SAGEJS_EXCEPTION_EMIT, output.get(), { flag: "wx" });
      return;
    }
    const context = realm === "host" ? globalThis : createContext({ require, process, Buffer, console,
      __sagejs_runtime_require__: require });
    if (realm === "host") {
      globalThis.__sagejs_runtime_require__ = require;
      runInThisContext(output.get(), { timeout: 30000 });
    } else runInContext(output.get(), context, { timeout: 30000 });
    const hostError = realm === "host" ? Error : runInContext("Error", context);
    if (logicalRecords) context.__sagejs_traceback_records_enabled__ = true;
    const capture = hostError.captureStackTrace;
    assert.equal(typeof capture, "function");
    const count = 10000;
    const results = [];
    try {
      const variants = selectedVariant === "no-capture-diagnostic"
        ? [[selectedVariant], [selectedVariant]]
        : [["fallback", "lazy"], ["lazy", "fallback"]];
      for (const order of variants) {
        for (const variant of order) {
          if (selectedVariant && variant !== selectedVariant) continue;
          // Explicit ablation only: dropping creation frames is not a valid
          // runtime optimization and must never be reported as a speedup.
          hostError.captureStackTrace = variant === "no-capture-diagnostic"
            ? () => {} : variant === "lazy" ? capture : undefined;
          for (const name of cases) {
            if (selectedCase && name !== selectedCase) continue;
            const fn = context['__exception_' + name];
            for (let i = 0; i < 3; i++) assert.equal(Number(fn(count)), count);
            const samplesMs = [];
            for (let i = 0; i < 7; i++) {
              const start = performance.now();
              const answer = fn(count);
              samplesMs.push(performance.now() - start);
              assert.equal(Number(answer), count);
            }
            results.push({ variant, name, count, samplesMs });
          }
        }
      }
    } finally { hostError.captureStackTrace = capture; }
    console.log(JSON.stringify({ node: process.version, privateScope, realm, logicalRecords,
      semanticsPreserved: !logicalRecords && selectedVariant !== "no-capture-diagnostic",
      tracebackQualification: logicalRecords ? "experimental synchronous fixtures only" : "native carrier",
      scope: "Standalone same-candidate warm diagnostic, not packaged-runtime qualification or historical/CPython comparison; no-capture-diagnostic deliberately drops frames and is attribution only",
      results }, null, 2));
  } finally { frontend.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
