import assert from "node:assert/strict";
import test from "node:test";
import { createSage } from "../node-kernel.mjs";
import { gamma1ModularFormsCase } from "./public-gap-closure-support.mjs";

test("packaged Wasm Gamma1 descent matches the pinned Sage operator", async (t) => {
  const sage = await createSage({ timeout: 60_000 });
  t.after(() => sage.close());
  const result = await sage.evaluate(gamma1ModularFormsCase.source);
  assert.equal(result.repr, gamma1ModularFormsCase.expected);
});

test("browser module cache serves ordinary and dynamic Python imports", async (t) => {
  const sage = await createSage({ mode: "python", timeout: 60_000 });
  t.after(() => sage.close());
  const ordinary = await sage.evaluate("from glob import has_magic\nhas_magic('a*')");
  assert.equal(ordinary.repr, "True");
  const dynamic = await sage.evaluate(
    "ns = {}\nexec('from glob import has_magic\\nanswer = has_magic(\"abc\")', ns)\nns['answer']",
  );
  assert.equal(dynamic.repr, "False");
  const identity = await sage.evaluate(
    "import glob\nns = {}\nexec('import glob\\nsame = glob', ns)\nns['same'] is glob",
  );
  assert.equal(identity.repr, "True");
});
