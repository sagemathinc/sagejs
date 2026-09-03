import assert from "node:assert/strict";
import { chromium } from "playwright-core";

import numericalClosure from
  "../../../scripts/check-numerical-browser-closure.cjs";
import {
  createBrowserWasmServer,
  executablePathFor,
  repositoryRoot,
} from "./browser-wasm-support.mjs";

const { publicNumericalModules } = numericalClosure;
const modules = publicNumericalModules(repositoryRoot);
const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for numerical browser coverage");

const source = `${modules.map((name) => `import ${name}`).join("\n")}
import math
from sagejs.numerics import find_root
from sagejs.numerics.approximation import interpolate, polynomial_roots
from sagejs.numerics.frontends import create_frontend_registry, operation_refs
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.ode import solve_ivp
from sagejs.numerics.optimization import minimize_scalar
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe
from sagejs.numerics.sweeps import run_parameter_sweep
from sagejs.numerics.visualization import root_plot

root = find_root(lambda x: x*x - 2.0, 0.0, 2.0)
approximation = interpolate([0.0, 1.0, 2.0], [1.0, 3.0, 5.0])
polynomial = polynomial_roots([1.0, 0.0, -1.0])
quadrature = integrate(lambda x: x*x, 0.0, 1.0)
linear = solve([[3.0, 1.0], [1.0, 2.0]], [9.0, 8.0])
minimum = minimize_scalar(lambda x: (x - 2.0)**2, -1.0, 5.0)
ode = solve_ivp(
    lambda t, y: [-y[0]],
    (0.0, 1.0),
    [1.0],
    reference=lambda t: [math.exp(-t)],
)
spectrum = fft([1.0, 0.0, 0.0, 0.0])
summary = describe([1.0, 2.0, 3.0, 4.0])
sweep = run_parameter_sweep(
    [1, 2, 3],
    lambda value, context: value*value,
)
registry = create_frontend_registry()

checks = [
    root.success
    and abs(root.value - math.sqrt(2.0)) < 1.0e-9
    and len(root_plot(root).layers) > 0,
    approximation.success
    and abs(approximation.evaluate(1.5) - 4.0) < 1.0e-12
    and len(approximation.to_plot_spec().layers) > 0,
    polynomial.success
    and len(polynomial.value["roots"]) == 2
    and len(polynomial.to_plot_spec().layers) > 0,
    quadrature.success
    and abs(quadrature.value - 1.0/3.0) < 1.0e-9
    and len(quadrature.to_plot_spec().layers) > 0,
    linear.success and len(linear.plot().layers) > 0,
    minimum.success
    and abs(minimum.value - 2.0) < 1.0e-8
    and len(minimum.plot().layers) > 0,
    ode.success
    and abs(ode.value[0] - math.exp(-1.0)) < 1.0e-6
    and len(ode.plot().layers) > 0,
    spectrum.success and len(spectrum.plot().layers) > 0,
    summary.success
    and summary.value["mean"] == 2.5
    and len(summary.to_plot_spec().layers) > 0,
    sweep.success and [item.value for item in sweep.items] == [1, 4, 9],
    len(operation_refs()) >= 8 and registry is not None,
]
print(${modules.length}, all(checks))
`;

const server = await createBrowserWasmServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`${server.origin}/browser-wasm-harness.html`, {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  const result = await page.evaluate(
    ([program, timeout]) => window.__sagejsTest.evaluate(program, timeout),
    [source, 180_000],
  );
  assert.equal(result.stdout, `${modules.length} True\n`);
  assert.deepEqual(pageErrors, []);
  await page.evaluate(() => window.__sagejsTest.close());
  console.log(
    `Chromium imported ${modules.length} public numerical modules and ` +
      "passed roots, approximation/polynomial roots, integration, linear " +
      "algebra, optimization, ODE, spectral, statistics, sweeps, frontend, " +
      "and PlotSpec witnesses.",
  );
} finally {
  await browser.close();
  await server.close();
}
