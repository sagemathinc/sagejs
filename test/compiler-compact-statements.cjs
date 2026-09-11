// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Script, createContext } = require("node:vm");
const createCompiler = require("../dist/tools/compiler.js").default;

test("compact compiler output separates adjacent call fragments", () => {
  const compiler = createCompiler();
  const output = new compiler.OutputStream({ beautify: false });
  output.print("(() => { const value = 'first;value'; events.push(value); })()");
  output.semicolon();
  output.print("(() => { events.push('second'); })()");
  output.semicolon();
  const events = [];
  new Script(output.get()).runInContext(createContext({ events }));
  assert.deepEqual(events, ["first;value", "second"]);
});
