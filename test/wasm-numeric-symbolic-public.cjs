// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const test = require("node:test");

const { pathToFileURL } = require("node:url");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "../packages/flint-wasm");
const releaseArtifactAvailable = [
  "wasi-runtime.mjs",
  "production-manifest.json",
  "build-receipt.json",
].every((name) => existsSync(path.join(packageRoot, "dist", name)));
const releaseArtifactSkip = releaseArtifactAvailable
  ? false
  : "build the FLINT Wasm release artifact first";

function routeMap(result) {
  return new Map(
    (result.instrumentation?.routes ?? []).map((route) => [
      route.capability_id,
      route,
    ]),
  );
}

test("public numeric and supported symbolic workflows select FLINT Wasm", {
  skip: releaseArtifactSkip,
}, async () => {
  const { createSage } = await import(pathToFileURL(
    path.join(packageRoot, "node-kernel.mjs"),
  ));
  const session = await createSage();
  try {
    const arithmetic = await session.evaluate(
      "R=RealField(100); x=R(1)/R(3); (x,x.precision())",
    );
    assert.equal(arithmetic.repr, "(0.33333333333333333333333333333, 100)");
    assert.equal(
      routeMap(arithmetic).get("napi:@sagemath/sagejs-flint:realDiv")
        ?.selected_route,
      "receipt-backed-wasm-artifact",
    );

    const special = await session.evaluate([
      "zeros = [round(v, 10) for v in zeta_zeros(3)]",
      "ei = Ei(CDF(1,2))",
      "bessel = bessel_I(1+I,2+I).n(80)",
      "(zeros, ei, bessel)",
    ].join("\n"));
    assert.match(special.repr, /14\.1347251417/);
    assert.match(special.repr, /1\.0421677081649356/);
    assert.match(special.repr, /1\.440909147041788130993/);
    const specialRoutes = routeMap(special);
    for (const id of [
      "napi:@sagemath/sagejs-flint:zetaZeros",
      "napi:@sagemath/sagejs-flint:complexEi",
      "napi:@sagemath/sagejs-flint:complexBesselI",
    ]) {
      assert.equal(
        specialRoutes.get(id)?.selected_route,
        "receipt-backed-wasm-artifact",
        `missing public Wasm route ${id}`,
      );
    }

    const symbolic = await session.evaluate([
      "x=var('x')",
      "integral_value = numerical_integral(",
      "    exp(x^2), 1, 2, eps_abs=1e-12, eps_rel=1e-12)",
      "root = (x^2-2).find_root(1,2)",
      "(integral_value, root)",
    ].join("\n"));
    assert.match(symbolic.repr, /14\.9899760196000/);
    assert.ok(symbolic.repr.includes("1.41421356237"));
    const symbolicRoutes = routeMap(symbolic);
    for (const id of [
      "specialist:symbolic-numerical-integral-wasm",
      "specialist:symbolic-find-root-wasm",
    ]) {
      assert.equal(
        symbolicRoutes.get(id)?.selected_route,
        "receipt-backed-wasm-artifact",
        `missing public Wasm route ${id}`,
      );
    }

    // Arbitrary Python callables remain the explicit portable domain.
    const callable = await session.evaluate(
      "numerical_integral(lambda t: abs(t-0.1),0,1)[0]",
    );
    assert.ok(Math.abs(Number(callable.repr) - 0.41) < 1e-8);
    assert.equal(
      routeMap(callable).has("specialist:symbolic-numerical-integral-wasm"),
      false,
    );
  } finally {
    await session.close();
  }
});

test("an interrupted bounded numeric worker is replaced before the next run", {
  skip: releaseArtifactSkip,
}, async () => {
  const { createSage, SageSessionTimeoutError } = await import(pathToFileURL(
    path.join(packageRoot, "node-kernel.mjs"),
  ));
  const session = await createSage();
  try {
    await assert.rejects(
      session.evaluate([
        "x=var('x')",
        "numerical_integral(abs(x-0.123456789),0,1,",
        "    max_points=100000,eps_abs=1e-300,eps_rel=0)",
      ].join("\n"), { timeout: 1 }),
      SageSessionTimeoutError,
    );
    await session.ready();
    const recovered = await session.evaluate("RealField(100)(1)/3");
    assert.match(recovered.repr, /^0\.33333333333333333333333333333/);
    assert.equal(
      routeMap(recovered).get("napi:@sagemath/sagejs-flint:realDiv")
        ?.selected_route,
      "receipt-backed-wasm-artifact",
    );
  } finally {
    await session.close();
  }
});
