// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Language } = require("web-tree-sitter");

const originalLoad = Language.load;
let languageLoads = 0;
let rejectNextLanguageLoad = false;
Language.load = async function countedLanguageLoad(...args) {
  languageLoads += 1;
  // Force concurrent callers to meet while the grammar is still loading.
  await Promise.resolve();
  if (rejectNextLanguageLoad) {
    rejectNextLanguageLoad = false;
    throw new Error("synthetic grammar load failure");
  }
  return originalLoad.apply(this, args);
};

const {
  createTreeSitterParser,
} = require("../dist/tools/foreign/tree-sitter.js");

function parseAndClose(parser, source) {
  const tree = parser.parse(source);
  try {
    assert.equal(tree.rootNode.hasError, false);
  } finally {
    tree.delete();
    parser.delete();
  }
}

test.after(() => {
  Language.load = originalLoad;
});

test("one immutable grammar survives recursive native-module parser lifecycles", async () => {
  // Loading the Sage grammar afresh fails in web-tree-sitter 0.26.11 on the
  // 755th parser construction because every dynamic link consumes table
  // entries that cannot be unloaded. This count deliberately crosses that
  // observed boundary while creating and deleting each independently owned
  // parser, as recursive @native source lowering does.
  for (let index = 0; index < 800; index += 1) {
    const parser = await createTreeSitterParser("tree-sitter-sage.wasm");
    parseAndClose(parser, [
      "@native",
      `def module_${index}(value: int) -> int:`,
      "    return value + 1",
      "",
    ].join("\n"));
  }
  assert.equal(languageLoads, 1);
});

test("concurrent frontends share pending loads but own independent parsers", async () => {
  const parsers = await Promise.all([
    ...Array.from({ length: 32 }, () =>
      createTreeSitterParser("tree-sitter-sage.wasm")),
    ...Array.from({ length: 32 }, () =>
      createTreeSitterParser("tree-sitter-python.wasm")),
  ]);
  for (const [index, parser] of parsers.entries()) {
    parseAndClose(parser, `answer_${index} = ${index}\n`);
  }
  // The Sage grammar is resident from the preceding lifecycle test, and all
  // concurrent Python callers share exactly one pending language load.
  assert.equal(languageLoads, 2);

  const parser = await createTreeSitterParser("tree-sitter-python.wasm");
  parseAndClose(parser, "answer = 42\n");
  assert.equal(languageLoads, 2, "closing a parser must not unload its grammar");
});

test("a rejected grammar load is evicted and can be retried", async () => {
  rejectNextLanguageLoad = true;
  await assert.rejects(
    createTreeSitterParser("tree-sitter-magma.wasm"),
    /synthetic grammar load failure/,
  );
  assert.equal(languageLoads, 3);

  const parser = await createTreeSitterParser("tree-sitter-magma.wasm");
  parseAndClose(parser, "value := 42;\n");
  assert.equal(languageLoads, 4);

  const reused = await createTreeSitterParser("tree-sitter-magma.wasm");
  parseAndClose(reused, "other := 43;\n");
  assert.equal(languageLoads, 4);
});
