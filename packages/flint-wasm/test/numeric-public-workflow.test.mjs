import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = new URL("../dist/flint-factor.wasm", import.meta.url);

test("MPFR resources and Acb special functions execute in the production Wasm module", async () => {
  const routes = [];
  const backend = await instantiateFlintFactor(await readFile(wasm), {
    recordCapability(...record) {
      routes.push(record);
    },
  });
  const resources = [];
  const keep = (value) => {
    resources.push(value);
    return value;
  };

  assert.equal(backend.numericLiveCount(), 0);
  const one = keep(backend.realFromBigInt(1n, 100));
  const three = keep(backend.realFromBigInt(3n, 100));
  const third = keep(backend.realDiv(one, three));
  assert.equal(
    backend.realToString(third),
    "0.33333333333333333333333333333",
  );
  const rounded = keep(backend.realRound(third, 53));
  assert.equal(backend.realToString(rounded), "0.333333333333333");

  const input = keep(backend.complexFromStrings("1", "2", 100));
  const ei = keep(backend.complexEi(input));
  assert.match(
    backend.complexToString(ei),
    /^1\.0421677081649356844163271638 \+ 3\.7015014259378742641152943269\*I$/,
  );
  const order = keep(backend.complexFromStrings("1", "1", 100));
  const argument = keep(backend.complexFromStrings("2", "1", 100));
  const bessel = keep(backend.complexBesselI(order, argument));
  assert.match(
    backend.complexToString(bessel),
    /^1\.4409091470417881309936831544 \+ 0\.47516726750336723007051513668\*I$/,
  );
  assert.deepEqual(
    backend.zetaZeros(3, 100).map((value) => Number(value.toFixed(10))),
    [14.1347251417, 21.0220396388, 25.0108575801],
  );
  const integral = backend.symbolicNumericalIntegral(
    ["Exp", ["Power", "x", 2]],
    "x",
    1,
    2,
    87,
    1e-12,
    1e-12,
    true,
  );
  assert.ok(Math.abs(integral.value - 14.989976019600048) < 1e-12);
  assert.ok(integral.error < 1e-10);
  assert.ok(Math.abs(backend.symbolicFindRoot(
    ["Subtract", ["Power", "x", 2], 2],
    "x",
    1,
    2,
    100,
    1e-12,
  ) - Math.SQRT2) < 1e-10);

  assert.ok(backend.numericLiveCount() >= resources.length);
  for (const resource of resources.reverse()) {
    assert.equal(backend.closeNumericResource(resource), true);
    assert.equal(backend.closeNumericResource(resource), false);
  }
  assert.equal(backend.numericLiveCount(), 0);
  assert.throws(() => backend.realToString(one), /live WebAssembly real resource/);

  const mixedResources = [];
  for (let index = 0; index < 4096; index += 1) {
    mixedResources.push(backend.realFromBigInt(BigInt(index), 64));
  }
  for (let index = 0; index < 4096; index += 1) {
    mixedResources.push(backend.complexFromReals(
      mixedResources[index],
      mixedResources[(index + 1) % 4096],
    ));
  }
  assert.equal(backend.numericLiveCount(), 8192);
  assert.throws(
    () => backend.realFromBigInt(8192n, 64),
    /resource limit reached/,
  );
  const closedComplex = mixedResources.pop();
  assert.equal(backend.closeNumericResource(closedComplex), true);
  const replacement = backend.realFromBigInt(8192n, 64);
  assert.equal(backend.numericLiveCount(), 8192);
  assert.throws(
    () => backend.complexToString(closedComplex),
    /live WebAssembly complex resource/,
  );
  assert.equal(backend.closeNumericResource(replacement), true);
  for (const resource of mixedResources.reverse()) {
    assert.equal(backend.closeNumericResource(resource), true);
  }
  assert.equal(backend.numericLiveCount(), 0);

  assert.throws(
    () => backend.symbolicFindRoot(
      ["Subtract", ["Power", "x", 2], 2],
      "x",
      1,
      2,
      100001,
      1e-12,
    ),
    /maxIterations must be between 1 and 100000/,
  );

  const routeIds = new Set(routes.map(([id]) => id));
  for (const id of [
    "napi:@sagemath/sagejs-flint:realDiv",
    "napi:@sagemath/sagejs-flint:complexEi",
    "napi:@sagemath/sagejs-flint:complexBesselI",
    "napi:@sagemath/sagejs-flint:zetaZeros",
    "specialist:symbolic-numerical-integral-wasm",
    "specialist:symbolic-find-root-wasm",
  ]) {
    assert.ok(routeIds.has(id), `missing route ${id}`);
  }
  assert.ok(routes.every(([, route]) => route === "receipt-backed-wasm-artifact"));
});

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

test("public browser evaluator authenticates numeric and symbolic Wasm routes", {
  skip: chromium ? false : "Chromium is not installed",
}, async () => {
  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".wasm", "application/wasm"],
  ]);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
    const filename = path.resolve(packageRoot, relative);
    if (!filename.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(filename)) {
      response.writeHead(404).end("not found");
      return;
    }
    const actual = fs.statSync(filename).isDirectory()
      ? path.join(filename, "index.html")
      : filename;
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(actual)) ?? "application/octet-stream",
    });
    fs.createReadStream(actual).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const chrome = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=0",
    "about:blank",
  ]);
  let chromeErrors = "";
  try {
    const debuggerUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Chromium did not start:\n${chromeErrors}`)),
        10_000,
      );
      chrome.on("error", reject);
      chrome.stderr.on("data", (chunk) => {
        chromeErrors += chunk;
        const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
    });
    const targetsUrl = new URL("/json/list", debuggerUrl);
    targetsUrl.protocol = "http:";
    const targets = await (await fetch(targetsUrl)).json();
    const page = targets.find((target) => target.type === "page");
    assert.ok(page, "Chromium did not expose a page target");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let commandId = 0;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id === undefined) return;
      const handlers = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handlers?.reject(new Error(message.error.message));
      else handlers?.resolve(message.result);
    });
    const command = (method, params = {}) => {
      commandId += 1;
      return new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    };
    await command("Runtime.enable");
    await command("Page.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    const evaluation = await command("Runtime.evaluate", {
      expression: `(async () => {
        const { createSage } = await import("/kernel.mjs");
        const session = await createSage();
        try {
          const result = await session.evaluate(
            "R=RealField(100); x=var('x'); " +
            "(R(1)/R(3), Ei(CDF(1,2)), " +
            "numerical_integral(exp(x^2),1,2)[0], " +
            "(x^2-2).find_root(1,2))"
          );
          return {
            repr: result.repr,
            routes: result.instrumentation.routes.map(
              ({ capability_id, selected_route }) =>
                [capability_id, selected_route]
            ),
          };
        } finally {
          await session.close();
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description ??
        evaluation.exceptionDetails.text);
    }
    const result = evaluation.result.value;
    assert.match(result.repr, /0\.33333333333333333333333333333/);
    assert.match(result.repr, /14\.9899760196000/);
    const routes = new Map(result.routes);
    for (const capabilityId of [
      "napi:@sagemath/sagejs-flint:realDiv",
      "napi:@sagemath/sagejs-flint:complexEi",
      "specialist:symbolic-numerical-integral-wasm",
      "specialist:symbolic-find-root-wasm",
    ]) {
      assert.equal(routes.get(capabilityId), "receipt-backed-wasm-artifact");
    }
    socket.close();
  } finally {
    chrome.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
  }
});
