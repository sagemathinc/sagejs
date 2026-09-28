import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";

import {
  executablePathFor,
  packageRoot,
  parseEngineList,
  securityHeaders,
} from "./browser-wasm-support.mjs";

const artifact = path.resolve(process.env.SAGEJS_QUADRATIC_WASM_ARTIFACT ??
  fileURLToPath(new URL("../../imaginary-quadratic-core/target/wasm32-wasip1/release/" +
    "sagejs_imaginary_quadratic_core.wasm", import.meta.url)));
assert.ok(fs.existsSync(artifact), "build the isolated quadratic development reactor first");
const bytes = fs.readFileSync(artifact);
const receipt = {
  bytes: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const unisolated = process.env.SAGEJS_BROWSER_UNISOLATED === "1";
const browserHeaders = unisolated
  ? Object.fromEntries(Object.entries(securityHeaders).filter(([name]) =>
    name !== "Cross-Origin-Opener-Policy" && name !== "Cross-Origin-Embedder-Policy"))
  : securityHeaders;

const types = new Map([
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".json", "application/json"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.writeHead(200, {
      ...browserHeaders,
      "content-type": "text/html",
    }).end("<!doctype html><title>isolated quadratic core</title>");
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400, browserHeaders).end("invalid path");
    return;
  }
  const filename = decoded === "/test-quadratic-core.wasm"
    ? artifact : path.resolve(packageRoot, `.${decoded}`);
  if ((filename !== artifact && !filename.startsWith(`${packageRoot}${path.sep}`)) ||
      !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404, browserHeaders).end("not found");
    return;
  }
  response.writeHead(200, {
    ...browserHeaders,
    "content-type": types.get(path.extname(filename)) ?? "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browsers = { chromium, firefox, webkit };
const engines = parseEngineList(process.env.SAGEJS_BROWSER_ENGINES ?? "chromium");
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
try {
  for (const name of engines) {
    const browserType = browsers[name];
    const executablePath = executablePathFor(name, browserType);
    if (!executablePath) {
      if (required.has(name)) throw new Error(`${name} is required but unavailable`);
      console.log(`SKIP ${name}: compatible browser executable is not installed`);
      continue;
    }
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: name === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      if (unisolated) {
        const environment = await page.evaluate(() => ({
          crossOriginIsolated: globalThis.crossOriginIsolated,
          sharedArrayBuffer: typeof SharedArrayBuffer,
        }));
        assert.deepEqual(environment, {
          crossOriginIsolated: false,
          sharedArrayBuffer: "undefined",
        }, `${name} must exercise the unisolated baseline`);
      }
      const result = await page.evaluate(async ({ origin, receipt }) => {
        const { instantiateSageEvaluator } = await import(`${origin}/evaluator.mjs`);
        const { SageSession } = await import(`${origin}/kernel.mjs`);
        const session = new SageSession();
        const resources = { ...session.resources };
        let evaluator;
        try {
          await session.ready();
          await session.close();
          evaluator = await instantiateSageEvaluator({
            ...resources,
            classGroup: { artifact: `${origin}/test-quadratic-core.wasm`, receipt },
          });
          const tiny = await evaluator.evaluate([
            "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^2-x+6)",
            "G = K.class_group(algorithm='rust')",
            "w = (1+a)/2",
            "I = K.ideal(2, w)",
            "[G.order(), G.invariants(), G.proof_status,",
            " G(G.gen().ideal()).coordinates(), G(I).coordinates(),",
            " K.class_number(algorithm='rust')]",
          ].join("\n"));
          let forgedError = "";
          try {
            await evaluator.evaluate([
              "backend, capability, resident = rust_runtime._imaginary_backend()",
              "discriminant, polynomial = rust_runtime._imaginary_polynomial(K)",
              "answer = rust_runtime._imaginary_call(backend, resident,",
              " 'imaginary-class-group',",
              " {'polynomialAscending': polynomial, 'transport': 'core-v3'})",
              "forged = answer['result']",
              "forged['completeClassMapCorePacked'][0] = True",
              "rust_runtime.validate_imaginary_group_result(",
              " forged, K.discriminant(), compact=True)",
            ].join("\n"));
          } catch (error) {
            forgedError = String(error);
          }
          const large = await evaluator.evaluate([
            "K.<a> = NumberField(x^2-x+3750000079)",
            "G = K.class_group(algorithm='rust')",
            "I = G.gen(0).ideal()",
            "J = G.gen(1).ideal()",
            "[G.order(), G.invariants(), G.proof_status,",
            " G(I).coordinates(), G(J).coordinates(),",
            " G(I*J).coordinates(), G(2*I).coordinates(),",
            " K.class_number(algorithm='rust')]",
          ].join("\n"));
          return { tiny: tiny.repr, forgedError, large: large.repr };
        } finally {
          evaluator?.terminate();
          await session.close();
        }
      }, { origin, receipt });
      assert.equal(result.tiny,
        "[3, (3,), 'exact-unconditional', (1,), (1,), 3]", name);
      assert.match(result.forgedError, /failed exact packed verification/, name);
      assert.equal(result.large,
        "[33768, (2, 16884), 'exact-unconditional', " +
        "(1, 0), (0, 1), (1, 1), (1, 0), 33768]", name);
      console.log(`PASS ${name} (${unisolated ? "unisolated" : "cross-origin isolated"}): ` +
        "quadratic reactor, exact ideal maps and tamper rejection");
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
