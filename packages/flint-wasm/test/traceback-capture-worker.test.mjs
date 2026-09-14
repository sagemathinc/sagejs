import assert from "node:assert/strict";
import test from "node:test";

test("evaluator rejects invalid capture selection before worker creation", async () => {
  const { instantiateSageEvaluator } = await import("../evaluator.mjs");
  let workers = 0;
  class UnexpectedWorker {
    constructor() { workers++; throw new Error("unexpected worker"); }
  }
  for (const tracebackCapture of ["fast", null, true, 1]) {
    await assert.rejects(
      instantiateSageEvaluator({ tracebackCapture, WorkerConstructor: UnexpectedWorker }),
      /tracebackCapture must be 'native' or 'guarded'/,
    );
  }
  assert.equal(workers, 0);
});

// Exercise the real worker message handler with a compiler that exposes its
// output options. This qualifies policy propagation, not browser execution.
test("worker validates capture policy and keeps bootstrap native", async () => {
  const previousSelf = globalThis.self;
  const previousFetch = globalThis.fetch;
  const replies = [];
  let fetches = 0;
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async (url) => {
    fetches++;
    const sources = {
      compiler: "exports.OutputStream = function(options) { this.get = () => JSON.stringify(options); };",
      baselib: "",
      stdlib: JSON.stringify({ modules: {}, preload: [] }),
    };
    return new Response(sources[url] ?? "");
  };
  const frontend = "data:text/javascript," + encodeURIComponent(`
    export function configureBrowserCompilerResources() {}
    export async function createPythonCompilerFrontend() {
      return {parse() { return {print() {}, imports: {},
        optimization_ir: {schema: "sagejs.optimizing-mathematics/v1",
          passes: [], contracts: [], regions: []}}; }};
    }
  `);
  try {
    await import("../compiler-worker.mjs");
    const request = async (data) => {
      await self.onmessage({ data: { id: replies.length, ...data } });
      return replies.at(-1);
    };
    for (const tracebackCapture of ["fast", null, true, 1]) {
      const invalid = await request({ type: "initialize", tracebackCapture });
      assert.equal(invalid.ok, false);
      assert.match(invalid.error.message, /tracebackCapture must be/);
    }
    assert.equal(fetches, 0);
    for (const policy of [undefined, "native", "guarded"]) {
      const initialized = await request({
        type: "initialize", mode: "python", tracebackCapture: policy,
        compiler: "compiler", baselib: "baselib", standardLibrary: "stdlib",
        compilerFrontend: frontend, treeSitterRuntime: "wasm",
        pythonGrammar: "python", sageGrammar: "sage",
      });
      assert.equal(initialized.ok, true, initialized.error?.stack);
      const bootstrap = JSON.parse(initialized.result.replace(/^void 0;\n/, ""));
      assert.equal(bootstrap.python_traceback_records, false);
      assert.equal(bootstrap.python_traceback_guarded, false);
      for (const mode of ["python", "sage"]) {
        const compiled = await request({
          type: "compile", source: "pass", filename: "capture.py", mode,
        });
        assert.equal(compiled.ok, true, compiled.error?.stack);
        const options = JSON.parse(compiled.result.javascript);
        assert.equal(options.python_traceback_records, policy === "guarded");
        assert.equal(options.python_traceback_guarded, policy === "guarded");
      }
    }
  } finally {
    globalThis.self = previousSelf;
    globalThis.fetch = previousFetch;
  }
});
