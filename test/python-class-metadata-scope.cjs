// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const esbuild = require("esbuild");

// Source-only metadata tests: no compiler/dist/runtime is loaded. AST/CST
// doubles below exercise the exact lowerer's bookkeeping for an empty class.
const lowererPath = join(__dirname, "../tools/python/lowerer.ts");
const source = readFileSync(lowererPath, "utf8");
const compiled = new Module(lowererPath, module);
compiled.require = name => {
  if (["./contract", "./optimizer", "./semantic"].includes(name)) return {};
  throw new Error(`unexpected source-test dependency: ${name}`);
};
compiled._compile(esbuild.transformSync(source, {
  loader: "ts", format: "cjs", target: "es2022",
}).code, lowererPath);
const { PythonCstLowerer } = compiled.exports;

const compiler = new Proxy({}, { get(target, name) {
  return target[name] ??= class { constructor(fields) { Object.assign(this, fields); } };
} });
const frame = (names = []) => ({ names: new Set(names), localNames: new Set(["Target"]),
  globals: new Set(), functionDepth: 0, bindingName: "Owner" });
const functionFrame = () => ({ globals: new Set(), nonlocals: new Set(), bindings: new Set() });
const lowerer = () => new PythonCstLowerer(compiler, {}, {});
function syntax(type, text, fields = {}, namedChildren = []) {
  return { type, text, startIndex: 10, endIndex: 20,
    startPosition: { row: 0, column: 0 }, endPosition: { row: 1, column: 0 },
    namedChildren, children: namedChildren,
    childForFieldName: name => fields[name] ?? null,
    childrenForFieldName: name => fields[name] ? [fields[name]] : [],
    descendantsOfType: () => [] };
}
const emptyClass = () => syntax("class_definition", "class Target: pass", {
  name: syntax("identifier", "Target"), body: syntax("block", "pass"),
});

test("nested class metadata is owned and does not classify skipped namespaces", () => {
  const subject = lowerer();
  const owner = frame();
  subject.classBindings.push(owner);
  subject.classStack.push("Owner");
  const nested = subject.lowerClass(emptyClass(), []);
  assert.equal(subject.knownClassMetadata("Target"), nested);
  assert.equal(subject.classMetadataOwners.get(nested).owner, owner);
  assert.equal(owner.names.has("Target"), true);
  subject.functionFrames.push(functionFrame());
  assert.equal(subject.knownClassMetadata("Target"), undefined, "a method must dynamically call the module factory");
  subject.functionFrames.pop();
  subject.classBindings.push(frame());
  assert.equal(subject.knownClassMetadata("Target"), undefined, "a nested class body also skips the enclosing class namespace");
});

test("shadowed builtin and enclosing function class metadata remains authoritative", () => {
  for (const previous of [{ native: true }, { python_class: true, static: { __new__: true } }]) {
    const subject = lowerer();
    const owner = frame();
    subject.knownClasses.set("Target", previous);
    subject.classBindings.push(owner);
    subject.classStack.push("Owner");
    const nested = subject.lowerClass(emptyClass(), []);
    assert.equal(subject.knownClassMetadata("Target"), nested);
    subject.functionFrames.push(functionFrame());
    assert.equal(subject.knownClassMetadata("Target"), previous);
  }
});

test("provisional metadata has the same ownership as the finished nested class", () => {
  const subject = lowerer();
  const owner = frame();
  const previous = { python_class: true, static: { __new__: true } };
  subject.knownClasses.set("Target", previous);
  subject.classBindings.push(owner);
  subject.classStack.push("Owner");
  const original = subject.withLexicalImportScope;
  subject.withLexicalImportScope = function (callback) {
    const provisional = this.knownClasses.get("Target");
    assert.equal(provisional.provisional, true);
    assert.equal(this.classMetadataOwners.get(provisional).owner, owner);
    assert.equal(this.knownClassMetadata("Target"), previous);
    return original.call(this, callback);
  };
  subject.lowerClass(emptyClass(), []);
});

test("global, nonlocal, and function-local definitions do not pollute class names", () => {
  for (const kind of ["global", "nonlocal", "function-local"]) {
    const subject = lowerer();
    const owner = frame();
    if (kind === "global") owner.globals.add("Target");
    if (kind !== "function-local") owner.localNames.delete("Target");
    else subject.functionFrames.push(functionFrame());
    subject.classBindings.push(owner);
    subject.classStack.push("Owner");
    const definition = subject.lowerClass(emptyClass(), []);
    assert.equal(definition.name.thedef, undefined, "actual lexical/module binding is not renamed");
    assert.equal(subject.classMetadataOwners.has(definition), false);
    assert.equal(owner.names.has("Target"), false, "excluded definitions are not class-local reads later");
  }
});
