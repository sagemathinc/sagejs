import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("the Node host runs the isolated WebAssembly Sage kernel", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      "print(factor(2026))",
    );
    assert.equal(result.stdout, "2 * 1013\n");
    assert.ok(
      result.instrumentation.routes.some(
        (route) => route.execution_target === "wasm-artifact",
      ),
    );
  } finally {
    await session.close();
  }
});

test("the Node Wasm host works from an input-type module script", () => {
  const source = `
    import { createSage } from './packages/flint-wasm/node-kernel.mjs';
    const sage = await createSage();
    const result = await sage.evaluate('print(factor(2026))');
    process.stdout.write(result.stdout);
    await sage.close();
  `;
  const result = spawnSync(process.execPath, ["--input-type=module"], {
    cwd: new URL("../../..", import.meta.url),
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "2 * 1013\n");
});
