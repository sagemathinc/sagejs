"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const {
  createSage,
  SageSessionClosedError,
  SageSessionInterruptedError,
  SageSessionTimeoutError,
} = require("../dist/tools/kernel.js");
const {
  parsePolyglotCell,
  prepareSubmittedPolyglotCell,
  rewriteQuestionMarkHelp,
} = require("../dist/tools/polyglot.js");
const {
  documentationMarkdownIssues,
  renderDocumentationMarkdown,
} = require("../dist/tools/documentation.js");

async function main(t) {
  const session = await createSage();
  t.after(() => session.close());
  const streamed = [];
  session.on("stdout", (text) => streamed.push(text));

  const first = await session.evaluate(
    "value = 12\nprint('value:', value)\nfactor(value)",
  );
  assert.equal(first.repr, "2^2 * 3");
  assert.equal(first.stdout, "value: 12\n");
  assert.deepEqual(streamed, ["value: 12\n"]);
  assert.ok(first.durationMs >= 0);

  const documentation = await session.documentation();
  assert.equal(documentation.schema_version, 1);
  assert.ok(documentation.entries.length >= 26);
  const dimensionDocumentation = documentation.entries.find(
    (entry) => entry.name === "dimension_cusp_forms",
  );
  assert.equal(
    dimensionDocumentation.references[0].doi,
    "10.1007/BFb0065297",
  );
  assert.ok(dimensionDocumentation.tags.includes("modular forms"));
  assert.equal(
    documentation.entries.find((entry) => entry.name === "matrix").signature,
    "matrix(*args: Any) -> Matrix",
  );
  assert.deepEqual(
    documentation.entries.flatMap((entry) =>
      documentationMarkdownIssues(entry.doc).map(
        (issue) => `${entry.name}: ${issue}`,
      ),
    ),
    [],
    "registered public docstrings must use canonical Markdown",
  );
  assert.equal(
    readFileSync(
      join(__dirname, "..", "docs", "reference", "api.md"),
      "utf8",
    ).replace(/\r\n/g, "\n"),
    renderDocumentationMarkdown(documentation),
    "generated API documentation is stale; run pnpm docs:generate",
  );

  assert.equal((await session.eval("value^2")).repr, "144");
  assert.equal((await session.evaluate("_")).repr, "144");
  assert.equal((await session.evaluate("assigned = 17")).repr, "");
  assert.equal((await session.evaluate("_")).repr, "144");
  assert.equal((await session.evaluate("assigned")).repr, "17");
  assert.equal((await session.evaluate("assigned + 1;")).repr, "");
  assert.equal((await session.evaluate("_")).repr, "17");
  const timed = await session.evaluate("%time timed_value = 2^20");
  assert.equal(timed.repr, "");
  assert.match(
    timed.stdout,
    /^CPU times: user [\d.]+ms, sys: [\d.]+ms, total: [\d.]+ms\nWall time: [\d.]+ms\n$/,
  );
  const coldImport = await session.evaluate("%time import colorsys");
  assert.match(
    coldImport.stdout,
    /\nInitialization \(included in wall time\): [\d.]+ms\n/,
  );
  assert.doesNotMatch(coldImport.stdout, /\n  Module /);
  const detailedImport = await session.evaluate(
    "%time --breakdown import calendar",
  );
  assert.match(
    detailedImport.stdout,
    /\nInitialization \(included in wall time\): [\d.]+ms\n/,
  );
  assert.match(detailedImport.stdout, /\n  Module calendar: [\d.]+ms\n/);
  const warmImport = await session.evaluate("%time import colorsys");
  assert.doesNotMatch(warmImport.stdout, /\nInitialization/);
  await session.evaluate("timeit_counter = 0");
  const timeit = await session.evaluate(
    "%timeit -n 2 -r 3 timeit_counter += 1",
  );
  assert.equal(timeit.repr, "");
  assert.match(
    timeit.stdout,
    /^[\d.]+ (?:ns|µs|ms|s) ± [\d.]+ (?:ns|µs|ms|s) per loop \(mean ± std\. dev\. of 3 runs, 2 loops each\)\n$/,
  );
  assert.equal((await session.evaluate("timeit_counter")).repr, "7");
  await session.evaluate("timeit_sentinel = 123");
  assert.equal((await session.evaluate("timeit_sentinel")).repr, "123");
  const suppressedTimeit = await session.evaluate(
    "%timeit -n1 -r1 timeit_sentinel + 1",
  );
  assert.equal(suppressedTimeit.repr, "");
  assert.equal((await session.evaluate("_")).repr, "123");
  const importedTimeit = await session.evaluate(
    "%timeit -n1 -r1 import bisect",
  );
  assert.equal(importedTimeit.repr, "");
  assert.match(importedTimeit.stdout, /mean ± std\. dev\. of 1 run/);
  assert.match(importedTimeit.stdout, /Initialization \(warmup only\):/);
  assert.equal(
    (await session.evaluate("bisect.bisect_left([1, 3, 5], 4)")).repr,
    "2",
  );
  assert.match(
    (await session.evaluate("search_doc('natural logarithm')")).stdout,
    /log2 -- The natural logarithm of `2`\./,
  );
  assert.equal(
    (
      await session.evaluate(
        [
          "puzzle = matrix(ZZ, 9, [",
          "0,1,3,6,8,7,2,4,9, 8,4,9,5,2,1,6,3,7,",
          "2,6,7,3,4,9,5,8,1, 1,5,8,4,6,3,9,7,2,",
          "9,7,4,2,1,8,3,6,5, 3,2,6,7,9,5,4,1,8,",
          "7,8,2,9,3,4,1,5,6, 6,3,5,1,7,2,8,9,4,",
          "4,9,1,8,5,6,7,2,3])",
          "sudoku(puzzle)[0]",
        ].join("\n"),
      )
    ).repr,
    "(5, 1, 3, 6, 8, 7, 2, 4, 9)",
  );
  assert.deepEqual(parsePolyglotCell("%%matlab\nA = [1 2; 3 4]"), {
    language: "matlab",
    source: "\nA = [1 2; 3 4]",
    cursorOffset: 8,
    hasMagic: true,
  });
  assert.equal(
    parsePolyglotCell("%%mathematica\nRange[3]").language,
    "wolfram",
  );
  assert.deepEqual(
    prepareSubmittedPolyglotCell(
      parsePolyglotCell("%%magma\nFactorization(2026)"),
    ),
    {
      language: "magma",
      source: "\nFactorization(2026)\n;",
      cursorOffset: 7,
      hasMagic: true,
    },
  );
  assert.deepEqual(
    parsePolyglotCell("%%m2\nfactor 2026"),
    {
      language: "macaulay2",
      source: "\nfactor 2026",
      cursorOffset: 4,
      hasMagic: true,
    },
  );
  assert.equal(
    prepareSubmittedPolyglotCell(
      parsePolyglotCell("%%maple\n2 + 2:"),
    ).source,
    "\n2 + 2:",
  );
  assert.equal(
    prepareSubmittedPolyglotCell(
      parsePolyglotCell("%%wolfram\n2 + 2"),
    ).source,
    "\n2 + 2",
  );
  assert.equal(
    rewriteQuestionMarkHelp("b.q_expansion?", "sage"),
    "help(b.q_expansion)",
  );
  assert.equal(
    rewriteQuestionMarkHelp("is_prime??", "sage"),
    "help(is_prime)",
  );
  assert.equal(
    rewriteQuestionMarkHelp("value ? other", "sage"),
    "value ? other",
  );
  assert.equal(
    rewriteQuestionMarkHelp("b.q_expansion?", "matlab"),
    "b.q_expansion?",
  );
  assert.throws(
    () => parsePolyglotCell("%%fortran\n1 + 1"),
    /unknown Sage\.js cell language %%fortran/,
  );

  const matlabCreation = await session.evaluate(
    "A = [1 2; 3 4];",
    { language: "matlab" },
  );
  assert.equal(matlabCreation.repr, "");
  assert.equal(
    (await session.evaluate("A.tolist()", { language: "sage" })).repr,
    "[[1, 2], [3, 4]]",
  );
  await session.evaluate("A[0, 0] = 9", { language: "sage" });
  assert.equal(
    (await session.evaluate("A(1,1)", { language: "matlab" })).repr,
    "9",
  );
  for (const language of ["magma", "maple", "wolfram"]) {
    const source = language === "wolfram" ? "A" : "A;";
    assert.match(
      (await session.evaluate(source, { language })).repr,
      /9, 2[\s\S]*3, 4/,
    );
  }
  assert.equal(
    (await session.evaluate("2^3", { language: "python" })).repr,
    "1",
  );
  assert.equal(
    (await session.evaluate("2^3", { language: "sage" })).repr,
    "8",
  );

  assert.ok(
    (await session.complete("prime_p", 7)).matches.includes("prime_pi"),
  );
  await session.evaluate("graphics = plot(x, (x, 0, 1))");
  assert.ok(
    (await session.complete("graphics.sa", 11)).matches.includes("save"),
  );
  assert.ok(
    (await session.complete("QQ['x'].g", 9)).matches.includes("gen"),
  );
  const inspection = await session.inspect("prime_pi", 8);
  assert.equal(inspection.found, true);
  assert.match(inspection.text, /prime_pi/);
  assert.deepEqual(await session.isComplete("for n in range(3):"), {
    status: "incomplete",
    indent: "    ",
  });
  assert.deepEqual(await session.isComplete("2 + 2"), {
    status: "complete",
  });
  assert.deepEqual(
    await session.isComplete("%timeit -n2 2 + 2", { language: "python" }),
    { status: "complete" },
  );
  assert.deepEqual(await session.isComplete("def f(:\n    pass"), {
    status: "invalid",
  });
  assert.equal((await session.evaluate("len(zeta_zeros())")).repr, "15000");
  assert.equal(
    (await session.evaluate("round(zeta_zeros()[-1], 9)")).repr,
    "14040.459877073",
  );
  await session.evaluate(`
class ImportedMethod:
    def value(self):
        from math import log
        return log(10)
imported_method = ImportedMethod()
`);
  assert.equal(
    (await session.evaluate("imported_method.value()")).repr,
    "2.302585092994046",
  );

  await session.evaluate("timeit_preserved = 77");
  const interruptedTimeit = session.evaluate(
    "%timeit -n100000000 -r2 2 + 3",
  );
  setTimeout(() => void session.interrupt(), 50);
  await assert.rejects(interruptedTimeit, SageSessionInterruptedError);
  assert.equal((await session.evaluate("timeit_preserved")).repr, "77");
  assert.match(
    (await session.evaluate("%timeit -n1 -r1 2 + 3")).stdout,
    /mean ± std\. dev\. of 1 run, 1 loop each/,
  );

  const interrupted = session.evaluate("while True:\n    pass");
  setTimeout(() => void session.interrupt(), 50);
  await assert.rejects(interrupted, SageSessionInterruptedError);
  if (process.platform === "win32") {
    // Windows has no thread-directed POSIX SIGINT. An uncooperative loop is
    // interrupted by replacing its worker, so state from that worker is lost.
    await assert.rejects(session.evaluate("value"), /value is not defined/);
    await session.evaluate("value = 12");
  } else {
    assert.equal((await session.evaluate("value")).repr, "12");
  }
  assert.equal((await session.evaluate("2^10")).repr, "1024");

  await assert.rejects(
    session.evaluate("while True:\n    pass", { timeout: 50 }),
    SageSessionTimeoutError,
  );
  assert.equal((await session.evaluate("factor(30)")).repr, "2 * 3 * 5");

  await session.evaluate("preserved = 41");
  const sleeping = session.evaluate(
    "from time import sleep\nfor i in range(100):\n    print(i)\n    sleep(1)",
  );
  setTimeout(() => void session.interrupt(), 50);
  await assert.rejects(sleeping, SageSessionInterruptedError);
  assert.equal((await session.evaluate("preserved")).repr, "41");

  const caughtReady = new Promise((resolve) => session.once("stdout", resolve));
  const caught = session.evaluate(
    [
      "caught = False",
      "try:",
      "    print('__interrupt_handler_ready__')",
      "    while True:",
      "        pass",
      "except KeyboardInterrupt:",
      "    caught = True",
      "caught",
    ].join("\n"),
  );
  await caughtReady;
  await session.interrupt();
  assert.equal((await caught).repr, "True");
  assert.equal((await session.evaluate("preserved")).repr, "41");

  await session.reset();
  await assert.rejects(session.evaluate("value"), /value is not defined/);

  await session.close();
  await assert.rejects(session.evaluate("1 + 1"), SageSessionClosedError);

  const python = await createSage({ mode: "python" });
  t.after(() => python.close());
  assert.equal((await python.evaluate("2^3")).repr, "1");
  assert.equal((await python.evaluate("2**3")).repr, "8");
  await python.evaluate("def pooled_constant():\n    return 2\n");
  assert.equal((await python.evaluate("pooled_constant()")).repr, "2");
  assert.equal((await python.evaluate("3")).repr, "3");
  assert.equal((await python.evaluate("pooled_constant()")).repr, "2");
  await python.close();

}

test("embeddable kernel sessions, interrupts, and polyglot state", {
  timeout: 30_000,
}, main);
