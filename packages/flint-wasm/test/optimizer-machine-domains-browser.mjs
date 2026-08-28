import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const require = createRequire(import.meta.url);
const { workloadSpecifications } = require(
  "../../../bench/optimizer-machine-corpus/harness.cjs",
);

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium,firefox,webkit",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const sizes = new Map([
  ["bounded-integer", 10_000],
  ["strict-binary64-array", 2_000],
  ["prime-residue-batch", 500],
  ["fixed-extension", 100],
]);
const specifications = workloadSpecifications().filter(
  (specification) => sizes.has(specification.domain),
);

assert.equal(specifications.length, 4, "all four executable machine domains");

function evaluationSource(specification, withContract) {
  const size = sizes.get(specification.domain);
  return `${specification.sageDefinition(size, withContract)}
${specification.invocation}
print(_machine_encode(_machine_answer))
`;
}

function selectedPassIds(result) {
  assert.equal(result.optimization?.authority, "compiler-verified-static");
  return result.optimization.program.regions
    .filter((region) => region.selected)
    .map((region) => region.passId)
    .sort();
}

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

      for (const specification of specifications) {
        const [optimized, generic] = await Promise.all([
          page.evaluate(
            ([source, optimizationLevel]) =>
              window.__sagejsTest.evaluate(source, 60_000, optimizationLevel),
            [evaluationSource(specification, true), "O2"],
          ),
          page.evaluate(
            ([source, optimizationLevel]) =>
              window.__sagejsTest.evaluate(source, 60_000, optimizationLevel),
            [evaluationSource(specification, false), "O0"],
          ),
        ]);

        assert.equal(optimized.stderr, "", `${engine} optimized stderr`);
        assert.equal(generic.stderr, "", `${engine} O0 stderr`);
        assert.equal(
          optimized.stdout,
          generic.stdout,
          `${engine} ${specification.domain} O2/O0 differential`,
        );
        assert.deepEqual(
          selectedPassIds(optimized),
          [specification.expectedPassId],
          `${engine} ${specification.domain} selected route`,
        );
        assert.deepEqual(
          selectedPassIds(generic),
          [],
          `${engine} ${specification.domain} O0 route`,
        );
        console.log(
          `${engine}: ${specification.domain} selected ` +
            `${specification.expectedPassId}; exact O2/O0 output ` +
            `${optimized.stdout.trim()}`,
        );
      }

      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      await page.evaluate(() => window.__sagejsTest.close());
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
