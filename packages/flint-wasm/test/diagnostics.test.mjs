import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { serializeBrowserError } from "../diagnostics.mjs";

const execution = { phase: "execute", pythonExecution: true, filename: "cell.py" };
function record(name, lineno, next = null) {
  return { __sagejs_traceback_record__: true,
    code: { filename: "cell.py", name, first_lineno: 1, source: "raise ValueError('bad')\n" },
    tb_lineno: lineno, tb_next: next };
}

test("browser errors transport logical frames, chains and native evidence", () => {
  const cause = Object.assign(new Error("earlier"), { name: "TypeError",
    __traceback__: record("first", 1) });
  const error = Object.assign(new Error("bad"), { name: "ValueError",
    __traceback__: record("outer", 1, record("inner", 1)), __cause__: cause,
    __sagejs_native_tb__: { stack: "foreign_callback at bridge.js:12" } });
  const result = structuredClone(serializeBrowserError(error, execution));
  assert.deepEqual(result.pythonDiagnostic.frames.map(f => f.name), ["outer", "inner"]);
  assert.equal(result.pythonDiagnostic.cause.exceptionType, "TypeError");
  assert.match(result.traceback.join("\n"), /direct cause/);
  assert.match(result.traceback.join("\n"), /Native capture \(may overlap Python frames\)/);
  assert.match(result.traceback.join("\n"), /foreign_callback/);
  assert.equal(result.sagejsErrorName, "ValueError");
});

test("browser errors retain foreign/native stacks without fabricated Python frames", () => {
  const error = vm.runInNewContext("new Error('foreign')");
  const result = serializeBrowserError(error, execution);
  assert.equal(result.message, "foreign");
  assert.deepEqual(result.pythonDiagnostic.frames, []);
  assert.deepEqual(result.traceback, error.stack.split("\n"));
});

test("browser normalization handles frozen errors and rejects forged envelopes", () => {
  const error = Object.freeze(Object.assign(new Error("real"), {
    pythonDiagnostic: { schemaVersion: 1, message: () => "not cloneable" },
  }));
  const result = structuredClone(serializeBrowserError(error, execution));
  assert.equal(result.message, "real");
  assert.equal(result.pythonDiagnostic.message, "real");
  assert.equal(result.stack, error.stack);
  assert.deepEqual(result.traceback, error.stack.split("\n"));
  const hostile = { get stack() { throw new Error("getter"); },
    get name() { throw new Error("getter"); }, message: "safe" };
  assert.equal(structuredClone(serializeBrowserError(hostile)).message, "safe");
});

test("native-only Python traceback carriers are labelled and retained", () => {
  const error = new Error("native");
  error.__traceback__ = error;
  const result = serializeBrowserError(error, execution);
  assert.match(result.traceback.join("\n"), /Native capture/);
  assert.ok(result.pythonDiagnostic.nativeTraceback.includes("native"));
});

for (const file of ["app.mjs", "embed/v1/sagejs-cell.mjs"]) {
  test(`live ${file} prefers transported traceback text`, () => {
    const source = readFileSync(new URL(`../../../website/live/${file}`, import.meta.url), "utf8");
    const helper = source.match(/function userErrorText\(error\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(helper);
    const render = vm.runInNewContext(`(${helper})`);
    const error = Object.assign(new Error("bad"), {
      __traceback__: record("cell", 1),
    });
    const serialized = structuredClone(serializeBrowserError(error, execution));
    assert.equal(render(serialized), serialized.traceback.join("\n"));
    assert.match(render({name: "ValueError", message: "fallback"}), /ValueError: fallback/);
    assert.match(render({name: "ValueError", message: "fallback", traceback: [42]}), /ValueError: fallback/);
  });
}
