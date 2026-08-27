import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright-core";
import { fileURLToPath } from "node:url";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium,firefox,webkit",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const testRoot = path.dirname(fileURLToPath(import.meta.url));
const heldOut = JSON.parse(fs.readFileSync(
  path.resolve(testRoot, "../../../test/fixtures/optimizer-field-held-out.json"),
  "utf8",
));

function withoutFinalLine(stdout) {
  const lines = stdout.trimEnd().split("\n");
  return `${lines.slice(0, -1).join("\n")}\n`;
}

function generatedCorpusSource() {
  const definitions = [];
  const calls = [];
  for (let index = 0; index < 8; index += 1) {
    const left = `generated_${index}_left`;
    const right = `generated_${index}_right`;
    const loop = `generated_${index}_position`;
    const item = `generated_${index}_coefficient`;
    const name = `generated_field_region_${index}`;
    const direct = index % 3 === 0;
    const value = direct ? item : `values[${loop}]`;
    const header = direct
      ? `    for ${item} in values:`
      : `    for ${loop} in range(count):`;
    const body = index % 2 === 0
      ? [
          `        ${left} = ${left}*${right}+${value}`,
          `        ${right} = -${right}+${left}`,
        ]
      : [
          `        ${right} = ${right}*${left}-${value}`,
          `        ${left} = ${left}+${right}`,
          `        if ${left} == ${value}:`,
          `            ${right} = ${right}-${left}`,
          "        else:",
          `            ${right} = ${right}+${left}`,
        ];
    definitions.push([
      `def ${name}(count, values, K, a):`,
      `    ${left} = K(${index + 1})+${(index % 7) + 1}*a`,
      `    ${right} = K(${index + 3})+${(index % 5) + 2}*a`,
      header,
      ...body,
      `    return ${left}, ${right}`,
    ].join("\n"));
    calls.push(`print(${name}(len(values), values, K, a))`);
  }
  return String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
values = tuple(K(i^2+3)+(i^3+5)*a for i in range(11))
${definitions.join("\n")}
${calls.join("\n")}
print(K._lastCompilerOptimizationRoute)
`;
}

const primeSource = String.raw`
import time


def recurrence(count, parent):
    value = parent(1)
    multiplier = parent(12345)
    increment = parent(6789)
    index = 777
    for index in range(count):
        value = value * multiplier + increment
    return int(value), index


field = GF(65521)
recurrence(1000000, field)
started = time.time()
answer = recurrence(10000000, field)
elapsed = time.time() - started
print(answer, elapsed < 0.75)
print(recurrence(0, field))
print(recurrence(29, GF(94906297)))
`;
const primeExpected = [
  "(19598, 9999999) True",
  "(1, 777)",
  "(9497506, 28)",
  "",
].join("\n");

const heldOutSource = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
${heldOut.workloads.map(({ definition, call }) => `${definition}\n${call}`).join("\n")}
print(K._lastCompilerOptimizationRoute)
`;
const generatedSource = generatedCorpusSource();

const compositionSource = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
values = tuple(K(i^2+3)+(i^3+5)*a for i in range(32))

def general(values):
    left = K(1)+a
    right = K(3)+2*a
    for coefficient in values:
        left = left*right+coefficient
        right = -right+left
    return left, right

pair = general(values)
pair_route = K._lastCompilerOptimizationRoute
R.<t> = PolynomialRing(K)
polynomial = R([K(i^2+3)+(i^3+5)*a for i in range(80)])
poly_value = polynomial(K(17)+23*a)
poly_route = K._lastCompilerOptimizationRoute
E = EllipticCurve(K,[0,0,0,1,1])
Q = E(0,1)
negative_Q = E(0,-1)
xs = tuple(K(0) for i in range(257))
ys = tuple(K(1) if i%2==0 else -K(1) for i in range(257))
a4 = E.a4()
a6 = E.a6()
weight = K(7)+a

def validate_curve_batch(xs, ys, a4, a6, weight):
    checksum = K(0)
    for i in range(len(xs)):
        checksum = checksum*weight + ys[i]*ys[i] - (xs[i]*xs[i]*xs[i] + a4*xs[i] + a6)
    return checksum

K._lastCompilerOptimizationRoute = 'curve-sentinel'
curve_value = validate_curve_batch(xs, ys, a4, a6, weight)
curve_route = K._lastCompilerOptimizationRoute
print(pair)
print(poly_value, poly_value.parent() is K)
print(Q, negative_Q, curve_value)
print(pair_route, poly_route, curve_route)
`;

const resourceSource = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)
R.<t> = PolynomialRing(K)
polynomial = R([K(i^2+3)+(i^3+5)*a for i in range(80)])
before = len(K._nativeResourceChildren)
for repetition in range(64):
    materialized_value = polynomial(K(17)+23*a)
after = len(K._nativeResourceChildren)
print(materialized_value.parent() is K, after-before)
`;

const performanceSource = String.raw`
import time
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)

def v8_batch(count):
    left = K(1)+a
    right = K(3)+2*a
    coefficient = K(5)+7*a
    for i in range(count):
        left = left*right+coefficient
        right = -right+left
    return left, right

v8_batch(10000)
started = time.time()
answer = v8_batch(1000000)
elapsed = time.time()-started
print(answer, elapsed < 3.0)
print(K._lastCompilerOptimizationRoute)
`;

const adversarialSource = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)

def guarded_pair(count):
    left = K(1)+a
    right = K(2)+3*a
    for step in range(count):
        left = left*right+right
        right = right-left
    return left, right

saved = K._machineExtensionSub
K._machineExtensionSub = None
K._lastCompilerOptimizationRoute = 'method-guard'
print(guarded_pair(5), K._lastCompilerOptimizationRoute)
K._machineExtensionSub = saved
`;

const interruptSource = String.raw`
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2+x+5)

def long_v8_batch(count):
    left = K(1)+a
    right = K(3)+2*a
    coefficient = K(5)+7*a
    for i in range(count):
        left = left*right+coefficient
        right = -right+left
    return left, right

long_v8_batch(500000000)
`;

const server = await createBrowserWasmServer();
try {
  for (const engine of engines) {
    const browserType = browserTypes[engine];
    const executablePath = executablePathFor(engine, browserType);
    if (!executablePath) {
      if (required.has(engine)) {
        throw new Error(`${engine} is required but unavailable`);
      }
      continue;
    }
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
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
      const prime = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [primeSource, 120_000, "O2"],
      );
      assert.equal(prime.stdout, primeExpected, `${engine} recurrence output`);

      const heldFast = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [heldOutSource, 120_000, "O2"],
      );
      const heldSlow = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [heldOutSource, 120_000, "O0"],
      );
      assert.ok(
        heldFast.stdout.endsWith("v8-extension-tuple-region\n"),
        `${engine} held-out route`,
      );
      assert.ok(
        heldSlow.stdout.endsWith("generic\n"),
        `${engine} held-out O0 route`,
      );
      assert.equal(
        heldFast.stdout.replace("v8-extension-tuple-region\n", "generic\n"),
        heldSlow.stdout,
        `${engine} held-out O2/O0`,
      );

      const generatedFast = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [generatedSource, 120_000, "O2"],
      );
      const generatedSlow = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [generatedSource, 120_000, "O0"],
      );
      assert.ok(
        generatedFast.stdout.endsWith("v8-extension-tuple-region\n"),
        `${engine} generated route`,
      );
      assert.equal(
        generatedFast.stdout.replace("v8-extension-tuple-region\n", "generic\n"),
        generatedSlow.stdout,
        `${engine} generated O2/O0`,
      );

      const compositionFast = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [compositionSource, 120_000, "O2"],
      );
      const compositionSlow = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [compositionSource, 120_000, "O0"],
      );
      assert.equal(
        withoutFinalLine(compositionFast.stdout),
        withoutFinalLine(compositionSlow.stdout),
        `${engine} polynomial/elliptic O2/O0`,
      );
      assert.ok(
        compositionFast.stdout.endsWith(
          "v8-extension-tuple-region v8-extension-tuple-region v8-extension-tuple-region\n",
        ),
        `${engine} composed routes`,
      );
      assert.ok(
        compositionSlow.stdout.endsWith(
          "generic v8-extension-tuple-region curve-sentinel\n",
        ),
        `${engine} composed O0 routes`,
      );

      const resources = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [resourceSource, 120_000, "O2"],
      );
      const resourceMatch = resources.stdout.trim().match(/^True (\d+)$/);
      assert.ok(resourceMatch, `${engine} resource output: ${resources.stdout}`);
      assert.ok(
        Number(resourceMatch[1]) <= 66,
        `${engine} materialized too many field resources: ${resources.stdout}`,
      );

      const performance = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [performanceSource, 120_000, "O2"],
      );
      assert.match(
        performance.stdout,
        /\) True\nv8-extension-tuple-region\n$/,
        `${engine} V8 tier ceiling and route`,
      );

      const adversarial = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        [adversarialSource, 120_000, "O2"],
      );
      assert.match(adversarial.stdout, / method-guard\n$/, `${engine} guard fallback`);

      const interrupted = await page.evaluate(
        (program) => window.__sagejsTest.interrupt(program),
        interruptSource,
      );
      assert.equal(interrupted.rejected, true, `${engine} interruption rejection`);
      assert.ok(interrupted.latency_ms < 10_000, `${engine} interruption latency`);
      const recovered = await page.evaluate(
        ([program, timeout, level]) =>
          window.__sagejsTest.evaluate(program, timeout, level),
        ["print(GF(97)(40)+2)", 120_000, "O2"],
      );
      assert.equal(recovered.stdout, "42\n", `${engine} recovery`);
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(
        `${engine}: optimizer differential, composition, guards, resources, tier, and recovery passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
