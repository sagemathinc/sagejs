#!/usr/bin/env node

import process from "node:process";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "../packages/flint-wasm/test/browser-wasm-support.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const engine = option("--engine", "firefox");
const plotPoints = Number(option("--plot-points", "64"));
const samples = Number(option("--samples", "3"));
if (!Number.isSafeInteger(plotPoints) || plotPoints < 2 || plotPoints > 512) {
  throw new Error("--plot-points must be an integer from 2 through 512");
}
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20) {
  throw new Error("--samples must be an integer from 1 through 20");
}

const browserTypes = { chromium, firefox, webkit };
const browserType = browserTypes[engine];
if (!browserType) throw new Error(`unsupported browser engine ${engine}`);
const executablePath = executablePathFor(engine, browserType);
if (!executablePath) throw new Error(`${engine} is unavailable`);

const server = await createBrowserWasmServer();
const browser = await browserType.launch({
  executablePath,
  headless: true,
  args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});

const workload = `
import json
import time
E = EllipticCurve([0,0,1,-1,0])
L = E.lseries()
n = ${plotPoints}
xs = [2.0 if k == n-1 else 2.0*k/(n-1) for k in range(n)]
ys = [4.0 if k == n-1 else -4.0+8.0*k/(n-1) for k in range(n)]
coordinates = [[x,y] for y in ys for x in xs]
region = {'xmin':0.0,'xmax':2.0,'ymin':-4.0,'ymax':4.0,
          'xcount':n,'ycount':n,'adaptive':True}
timings = {}
started = time.perf_counter()
batch = L._plot_complex_batch(coordinates, 16, region)
timings['native_batch_and_python_materialization'] = 1000*(time.perf_counter()-started)
started = time.perf_counter()
fine_colors = complex_to_rgb([list(batch['fine'])])[0]
timings['domain_color_fine'] = 1000*(time.perf_counter()-started)
started = time.perf_counter()
coarse_colors = complex_to_rgb([list(batch['coarse'])])[0]
timings['domain_color_coarse'] = 1000*(time.perf_counter()-started)
started = time.perf_counter()
picture = complex_plot(L,(0,2),(-4,4),plot_points=${plotPoints},interpolation='nearest')
timings['full_complex_plot'] = 1000*(time.perf_counter()-started)
analytic_points = [CC(2, k/8) for k in range(-16,17)]
R = RiemannZeta(80)
started = time.perf_counter()
riemann_values = R.values(analytic_points)
timings['riemann_zeta_batch'] = 1000*(time.perf_counter()-started)
G = DirichletGroup(5)
D = G[2].lfunction(80)
started = time.perf_counter()
dirichlet_values = D.values(analytic_points)
timings['dirichlet_l_batch'] = 1000*(time.perf_counter()-started)
P.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^2 - 5)
Z = K.zeta_function(prec=80)
started = time.perf_counter()
dedekind_values = Z.values(analytic_points)
timings['quadratic_dedekind_zeta_batch'] = 1000*(time.perf_counter()-started)
batch_diagnostics = batch['diagnostics']
print(json.dumps({
    'phases_ms': timings,
    'batch': {
        'point_count': batch_diagnostics['point_count'],
        'evaluated_point_count': batch_diagnostics['evaluated_point_count'],
        'native_call_count': batch_diagnostics['native_call_count'],
        'fine_precision_bits': batch_diagnostics['fine_precision_bits'],
        'grid_points': batch_diagnostics['grid_points'],
        'coefficient_terms': batch_diagnostics['coefficient_terms'],
    },
}, sort_keys=True))
`;

function checkedInstrumentation(value) {
  if (value == null) return null;
  return {
    boundary_crossings: value.boundary_crossings,
    copied_bytes: value.copied_bytes,
    routes: value.routes,
  };
}

const page = await browser.newPage();
const report = {
  schema: "sagejs.wasm-numeric-plot-profile/v1",
  engine,
  plot_points: plotPoints,
  samples,
  diagnostics: null,
  records: [],
};
try {
  await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  report.diagnostics = await page.evaluate(() => window.__sagejsTest.diagnostics());
  for (let sample = 0; sample < samples; sample += 1) {
    const result = await page.evaluate(
      ([source]) => window.__sagejsTest.evaluate(source, 240_000),
      [workload],
    );
    const outputLines = result.stdout.trim().split("\n");
    const profile = JSON.parse(outputLines.at(-1));
    report.records.push({
      duration_ms: result.duration_ms,
      ...profile,
      instrumentation: checkedInstrumentation(result.instrumentation),
    });
  }
} finally {
  await page.close();
  await browser.close();
  await server.close();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
