"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "flint-wasm");
const requiredRoutes = ["analytic:complex-gamma", "analytic:riemann-xi"];

const publicSource = `
gamma_points = [["0.5","0"],["1","1"],["2.5","-3"],["-0.25","2"]]
gamma_points += [[1, (index-126)/32] for index in range(252)]
xi_points = [["0","0"],["1","0"],["0.5","0"],["2","0"]]
xi_points += [["0.5", (index-126)/16] for index in range(252)]
gamma_batch = complex_gamma_values(gamma_points, prec=160)
xi_batch = riemann_xi_values(xi_points, prec=160)
print(len(gamma_batch), len(xi_batch))
print(float(gamma_batch[0].real()), float(gamma_batch[0].imag()))
print(float(gamma_batch[1].real()), float(gamma_batch[1].imag()))
print(float(xi_batch[0].real()), float(xi_batch[0].imag()))
print(float(xi_batch[1].real()), float(xi_batch[1].imag()))
print(float(xi_batch[2].real()), float(xi_batch[2].imag()))
print(float(xi_batch[3].real()), float(xi_batch[3].imag()))
print(all(value.precision() == 160 for value in gamma_batch + xi_batch))
`;

const expectedStdout = [
  "256 256",
  "1.772453850905516 0.0",
  "0.49801566811835607 -0.15494982830181067",
  "1.0 0.0",
  "1.0 0.0",
  "0.9942415563766283 0.0",
  "1.0471975511965979 0.0",
  "True",
  "",
].join("\n");

function assertPrivateRoutes(instrumentation) {
  assert.ok(instrumentation, "private route instrumentation is missing");
  const routes = new Map(
    instrumentation.routes.map((route) => [route.capability_id, route]),
  );
  for (const id of requiredRoutes) {
    assert.deepEqual(
      {
        route: routes.get(id)?.selected_route,
        target: routes.get(id)?.execution_target,
        calls: routes.get(id)?.call_count,
      },
      {
        route: "receipt-backed-wasm-artifact",
        target: "wasm-artifact",
        calls: 1,
      },
      `${id} must execute as one coarse public Wasm batch`,
    );
  }
  const analyticCrossings = requiredRoutes.reduce(
    (total, id) => total + routes.get(id).call_count,
    0,
  );
  assert.equal(analyticCrossings, 2);
  assert.ok(instrumentation.boundary_crossings >= analyticCrossings);
  assert.ok(instrumentation.copied_bytes > 0);
}

async function importPackage(relative) {
  return import(pathToFileURL(path.join(packageRoot, relative)).href);
}

test("the real analytic reactor preserves exact and ball evidence", async () => {
  const [{ createWasiHost }, { createAnalyticWasmBackend }] = await Promise.all([
    importPackage("dist/wasi-runtime.mjs"),
    importPackage("analytic-backend.mjs"),
  ]);
  const bytes = await fs.readFile(path.join(packageRoot, "dist", "flint-factor.wasm"));
  const module = await WebAssembly.compile(bytes);
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const traces = [];
  const backend = createAnalyticWasmBackend(instance, {
    recordCapability: (...record) => traces.push(record),
  });
  try {
    const gamma = backend.complexGammaValuesDetailed([
      ["1", "0"],
      ["0.5", "0"],
      ["1", "1"],
    ], 160);
    const xi = backend.riemannXiValuesDetailed([
      ["0", "0"],
      ["2", "0"],
      ["-1", "0"],
    ], 160);

    assert.equal(gamma.values[0].real, "1.0000000000000000000000000000000000000000000000000000000");
    assert.equal(gamma.values[0].realExact, true);
    assert.equal(gamma.values[0].imaginaryExact, true);
    assert.ok(Math.abs(Number(gamma.values[1].real) - Math.sqrt(Math.PI)) <= Number.EPSILON);
    assert.ok(gamma.values[1].realAccuracyBits >= 150);
    assert.ok(gamma.values[2].realAccuracyBits >= 150);
    assert.ok(gamma.values[2].imaginaryAccuracyBits >= 150);

    // The packed core returns FLINT's standard one-half normalization. Its
    // exact endpoint and functional equation are checked before the public
    // wrapper applies Sage.js's documented factor two.
    assert.equal(xi.values[0].real, "0.50000000000000000000000000000000000000000000000000000000");
    assert.equal(xi.values[0].realExact, true);
    assert.equal(xi.values[1].real, xi.values[2].real);
    assert.ok(Math.abs(Number(xi.values[1].real) - Math.PI / 6) <= Number.EPSILON);
    assert.ok(xi.values[1].realAccuracyBits >= 150);
    assert.deepEqual(
      traces.map(([id, route]) => [id, route]),
      requiredRoutes.map((id) => [id, "receipt-backed-wasm-artifact"]),
    );
    assert.ok(instance.exports.sagejs_analytic_input_capacity() > 0);
    assert.ok(instance.exports.sagejs_analytic_output_capacity() > 0);
  } finally {
    backend.release();
  }
  assert.equal(instance.exports.sagejs_analytic_input_capacity(), 0);
  assert.equal(instance.exports.sagejs_analytic_output_capacity(), 0);
});

test("public Node-Wasm gamma and xi use two coarse private routes", async () => {
  assert.doesNotMatch(publicSource, /runtime|flint_backend|_native/);
  const { createSage } = await importPackage("node-kernel.mjs");
  const sage = await createSage();
  try {
    const result = await sage.evaluate(publicSource);
    assert.equal(result.stdout, expectedStdout);
    assertPrivateRoutes(result.instrumentation);
  } finally {
    await sage.close();
  }
});

test("public Chromium gamma and xi use the same production reactor", async () => {
  const [{ chromium }, browserSupport] = await Promise.all([
    import("playwright-core"),
    importPackage("test/browser-wasm-support.mjs"),
  ]);
  const executablePath = browserSupport.executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for analytic public evidence");
  const server = await browserSupport.createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    const result = await page.evaluate(
      ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
      [publicSource, 120_000],
    );
    assert.equal(result.stdout, expectedStdout);
    assertPrivateRoutes(result.instrumentation);
  } finally {
    await browser?.close();
    await server.close();
  }
});
