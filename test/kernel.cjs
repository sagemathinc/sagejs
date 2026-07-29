"use strict";

const assert = require("node:assert/strict");

const {
  createSage,
  SageSessionClosedError,
  SageSessionInterruptedError,
  SageSessionTimeoutError,
} = require("../dist/tools/kernel.js");

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

  assert.equal((await session.eval("value^2")).repr, "144");
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
  assert.equal((await session.evaluate("2^10")).repr, "1024");

  await assert.rejects(
    session.evaluate("while True:\n    pass", { timeout: 50 }),
    SageSessionTimeoutError,
  );
  assert.equal((await session.evaluate("factor(30)")).repr, "2 * 3 * 5");

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

  console.log("Embeddable kernel tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
