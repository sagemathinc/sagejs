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
