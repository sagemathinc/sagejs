import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

const sagejsVersion = JSON.parse(
  readFileSync(new URL("../../../sagejs-version.json", import.meta.url), "utf8"),
);

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
    const version = await session.evaluate("version(True)");
    assert.match(version.repr, /'schema': 'sagejs\.version\/v1'/);
    assert.match(version.repr, /'platform': 'browser-wasm32'/);
    assert.match(
      version.repr,
      new RegExp(`'version': '${sagejsVersion.version.replaceAll(".", "\\.")}'`),
    );
    const groebner = await session.evaluate(`
R = PolynomialRing(GF(65537), names=("x", "y"), order="degrevlex")
x, y = R.gens()
I = R.ideal(x*y - 1, x**3 + 7*y**2)
print(I.groebner_basis())
print(I.normal_form(x*y - 1))
print(I.groebner_basis_metadata()["backend"])
S = PolynomialRing(QQ, names=("u", "v"), order="degrevlex")
u, v = S.gens()
J = S.ideal(u*v - 1, u**3 + 7*v**2)
print(J.groebner_basis(algorithm="msolve", proof=False))
print(J.groebner_basis_metadata()["probabilistic"])
`);
    assert.equal(
      groebner.stdout,
      "[x*y + 65536, y^3 + 18725*x^2, x^3 + 7*y^2]\n" +
        "0\n" +
        "msolve:f4-prime-field-v1\n" +
        "[u*v - 1, v^3 + 1/7*u^2, u^3 + 7*v^2]\n" +
        "True\n",
    );
    assert.ok(
      groebner.instrumentation.routes.some(
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
