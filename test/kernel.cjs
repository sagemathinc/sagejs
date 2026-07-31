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
  renderDocumentationMarkdown,
} = require("../dist/tools/documentation.js");

async function main() {
  const session = await createSage();
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
    "matrix(*args)",
  );
  assert.equal(
    readFileSync(
      join(__dirname, "..", "docs", "reference", "api.md"),
      "utf8",
    ),
    renderDocumentationMarkdown(documentation),
    "generated API documentation is stale; run pnpm docs:generate",
  );

  assert.equal((await session.eval("value^2")).repr, "144");
  assert.equal((await session.evaluate("assigned = 17")).repr, "");
  assert.equal((await session.evaluate("assigned")).repr, "17");
  assert.equal((await session.evaluate("assigned + 1;")).repr, "");
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

  const interrupted = session.evaluate("while True:\n    pass");
  setTimeout(() => void session.interrupt(), 50);
  await assert.rejects(interrupted, SageSessionInterruptedError);
  assert.equal((await session.evaluate("value")).repr, "12");
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

  const caught = session.evaluate(
    [
      "caught = False",
      "try:",
      "    while True:",
      "        pass",
      "except KeyboardInterrupt:",
      "    caught = True",
      "caught",
    ].join("\n"),
  );
  setTimeout(() => void session.interrupt(), 50);
  assert.equal((await caught).repr, "True");
  assert.equal((await session.evaluate("preserved")).repr, "41");

  await session.reset();
  await assert.rejects(session.evaluate("value"), /value is not defined/);

  await session.close();
  await assert.rejects(session.evaluate("1 + 1"), SageSessionClosedError);

  const python = await createSage({ mode: "python" });
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
