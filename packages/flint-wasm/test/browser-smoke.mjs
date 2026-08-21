import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  expectedStdout as matrixFallbackExpectedStdout,
  publicSource as matrixFallbackPublicSource,
} from "./matrix-resource-fallback-support.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const chromiumCandidates = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chromium = chromiumCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

assert.ok(
  chromium,
  "Chromium not found; set SAGEJS_CHROMIUM to run the browser smoke test",
);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const factorLoopOutput = [
  "3^4 * 5^2",
  "2 * 1013",
  "2027",
  "2^2 * 3 * 13^2",
  "2029",
  "2 * 5 * 7 * 29",
  "3 * 677",
  "2^4 * 127",
  "19 * 107",
  "2 * 3^2 * 113",
  "5 * 11 * 37",
  "2^2 * 509",
  "3 * 7 * 97",
  "2 * 1019",
  "2039",
  "2^3 * 3 * 5 * 17",
  "13 * 157",
  "2 * 1021",
  "3^2 * 227",
  "2^2 * 7 * 73",
  "5 * 409",
  "2 * 3 * 11 * 31",
  "23 * 89",
  "2^11",
  "3 * 683",
  "2 * 5^2 * 41",
  "",
].join("\n");

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
  const filename = path.resolve(packageRoot, relative);
  if (
    !filename.startsWith(`${packageRoot}${path.sep}`) ||
    !fs.existsSync(filename)
  ) {
    response.writeHead(404).end("not found");
    return;
  }
  const actual = fs.statSync(filename).isDirectory()
    ? path.join(filename, "index.html")
    : filename;
  response.writeHead(200, {
    "Content-Type":
      contentTypes.get(path.extname(actual)) ?? "application/octet-stream",
  });
  fs.createReadStream(actual).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

try {
  const chrome = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=0",
    "about:blank",
  ]);
  let chromeErrors = "";
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

  try {
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
    const browserErrors = [];
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const handlers = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          handlers?.reject(new Error(message.error.message));
        } else {
          handlers?.resolve(message.result);
        }
      }
      if (message.method === "Runtime.exceptionThrown") {
        browserErrors.push(
          message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text,
        );
      }
    });

    function command(method, params = {}) {
      commandId += 1;
      return new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    }

    await command("Runtime.enable");
    await command("Network.enable");
    await command("Network.setCacheDisabled", { cacheDisabled: true });
    await command("Page.enable");
    await command("Page.navigate", {
      url:
        `http://127.0.0.1:${port}/demo/?` +
        new URLSearchParams({ run: "factor(2026)" }),
    });

    async function waitForOutput(expected) {
      const deadline = Date.now() + 15_000;
      let text = "";
      while (Date.now() < deadline) {
        const evaluation = await command("Runtime.evaluate", {
          expression: "document.querySelector('#output')?.textContent ?? ''",
          returnByValue: true,
        });
        text = evaluation.result.value;
        if (text === expected || text.startsWith("Error:")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        text,
        expected,
        `browser evaluator failed (${text || "no output"}):\n` +
          `${browserErrors.join("\n")}\n${chromeErrors}`,
      );
    }

    async function startSource(source) {
      await command("Runtime.evaluate", {
        expression:
          `document.querySelector('#source').value = ` +
          `${JSON.stringify(source)}; document.querySelector('#run').click()`,
      });
    }

    async function runSource(source, expected) {
      await startSource(source);
      await waitForOutput(expected);
    }

    async function runSourceWithShortcut(source, modifier, expected) {
      assert.match(modifier, /^(shift|ctrl)$/);
      await command("Runtime.evaluate", {
        expression:
          `document.querySelector('#source').value = ${JSON.stringify(source)}; ` +
          `document.querySelector('#source').dispatchEvent(` +
          `new KeyboardEvent('keydown', {` +
          `key: 'Enter', ${modifier}Key: true, bubbles: true, cancelable: true` +
          `}))`,
      });
      await waitForOutput(expected);
    }

    async function waitForIdle(timeout = 360_000) {
      const deadline = Date.now() + timeout;
      let state = { output: "", running: true };
      while (Date.now() < deadline) {
        const evaluation = await command("Runtime.evaluate", {
          expression: `({
            output: document.querySelector('#output')?.textContent ?? '',
            running: document.querySelector('#run')?.disabled ?? true
          })`,
          returnByValue: true,
        });
        state = evaluation.result.value;
        if (!state.running) {
          return state.output;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        `browser evaluator did not finish; current output:\n${state.output}`,
      );
    }

    async function runPublicExactSubspaces() {
      await runSource(
        "Z = matrix(ZZ, [[2,4,6],[1,2,3],[0,0,0]])\n" +
          "Q = matrix(QQ, [[1/2,1/3,0],[1,2/3,0],[0,0,0]])\n" +
          "B = matrix(GF(2), [[1,0,1],[0,1,1],[1,1,0]])\n" +
          "spaces = [Z.row_space(), Z.column_space(), " +
          "Q.row_space(), Q.column_space(), " +
          "B.row_space(), B.column_space()]\n" +
          "[W.dimension() for W in spaces] == [1,1,1,1,2,2] and " +
          "all(W.basis_matrix().is_immutable() for W in spaces)",
        "True",
      );
    }

    await waitForOutput("2 * 1013");
    const publicExactSubspacesOnly = process.argv.includes(
      "--public-exact-subspaces",
    );
    if (publicExactSubspacesOnly) {
      await runPublicExactSubspaces();
    } else {
    await runSourceWithShortcut("factor(42)", "shift", "2 * 3 * 7");
    await runSourceWithShortcut("factor(66)", "ctrl", "2 * 3 * 11");
    await runSource("import math\nmath.sin(math.pi/2)", "1.0");
    await runSource("prime_pi(10)", "4");
    await runSource(
      "x = var('x')\nf = sin(x^2)\nf.derivative(x)",
      "2*x*cos(x^2)",
    );
    await runSource("QQ['x'].gen()", "x");
    await runSource(
      "R.<x> = QQ[]\nx^2 - 2*x + 1",
      "x^2 - 2*x + 1",
    );
    await runSource(
      "A = matrix(ZZ, [[1,2],[3,4]])\n" +
        "print(A.det(), A.rank())\n" +
        "print(A.rref())\n" +
        "print(A.hermite_form())\n" +
        "print(A.charpoly())\n" +
        "print(matrix(ZZ, [[1,2,3],[2,4,6]]).right_kernel())\n" +
        "set_random_seed(2026)\nR = random_matrix(ZZ,2,3,x=-5,y=5)\n" +
        "set_random_seed(2026)\nR == random_matrix(ZZ,2,3,x=-5,y=5)",
      "-2 2\n[1 0]\n[0 1]\n[1 0]\n[0 2]\n" +
        "x^2 - 5*x - 2\n" +
        "Free module of degree 3 and rank 2 over Integer Ring\n" +
        "Echelon basis matrix:\n[ 1  1 -1]\n[ 0  3 -2]\nTrue",
    );
    await runPublicExactSubspaces();
    await runSource(matrixFallbackPublicSource, matrixFallbackExpectedStdout);
    await runSource(
      "F = GF(5)\nA = matrix(F, [[1,2],[3,4]])\n" +
        "print(A.det(), A.rank())\n" +
        "print(A.rref())\n" +
        "print(A.inverse())\n" +
        "print(A.charpoly())\n" +
        "K = matrix(F, [[1,2,3],[2,4,1]]).right_kernel()\n" +
        "print(K)\n" +
        "matrix(F, [[1,2,3],[2,4,1]]) * K.basis_matrix().T",
      "3 2\n[1 0]\n[0 1]\n[3 1]\n[4 2]\n" +
        "x^2 + 3\n" +
        "Vector space of degree 3 and dimension 2 over " +
        "Finite Field of size 5\nBasis matrix:\n" +
        "[1 0 3]\n[0 1 1]\n[0 0]\n[0 0]",
    );
    await runSource("a = 12\nfactor(a)", "2^2 * 3");
    await runSource("a = 12\nfactor(a^2)", "2^4 * 3^2");
    await runSource(
      "P = P1List(11)\n" +
        "print(len(P), P.normalize_with_scalar(3,7), P.apply_S(0))\n" +
        "M = ModularSymbols(11)\n" +
        "print(M.dimension(), M.cuspidal_subspace().dimension())\n" +
        "print(M.hecke_matrix(2))\n" +
        "print(M.star_involution().matrix())",
      "12 (1, 6, 3) 1\n" +
        "3 2\n" +
        "[ 3  0 -1]\n[ 0 -2  0]\n[ 0  0 -2]\n" +
        "[ 1  0  0]\n[ 0 -1  1]\n[ 0  0  1]\n",
    );
    await runSource(
      "for s in [-1,1]:\n" +
        "    M = ModularSymbols(37,2,sign=s)\n" +
        "    print(s, M.dimension(), " +
        "M.cuspidal_subspace().dimension(), M.hecke_matrix(2).trace())",
      "-1 2 2 -2\n1 3 2 1\n",
    );
    await runSource(
      "M = ModularSymbols(1000,2,sign=1)\n" +
        "f = M.hecke_matrix(2).charpoly()\n" +
        "print(M.dimension(), f(3) % 1000000007)",
      "154 804456041\n",
    );
    await runSource(
      "M = ModularSymbols(389,2,sign=1)\n" +
        "D = M.decomposition()\n" +
        "print([M.new_submodule() is M, D is M.decomposition(), " +
        "[A.dimension() for A in D], sum(A.dimension() for A in D)])",
      "[True, True, [1, 1, 2, 3, 6, 20], 33]\n",
    );
    await runSource(
      "for n in [2025..2050]:\n    print(factor(n))",
      factorLoopOutput,
    );
    await startSource(
      "for n in [2025..2050]:\n    print(n, factor(n^22-1))",
    );
    const poweredFactorOutput = await waitForIdle();
    assert.doesNotMatch(poweredFactorOutput, /Error:/);
    assert.equal(poweredFactorOutput.trim().split("\n").length, 26);
    assert.match(poweredFactorOutput, /^2025 /);
    assert.match(poweredFactorOutput, /\n2050 /);
    await startSource("while True:\n    pass");
    await waitForOutput("Running…");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await command("Runtime.evaluate", {
      expression: "document.querySelector('#interrupt').click()",
    });
    await waitForOutput("Interrupted.");
    await runSource("factor(30)", "2 * 3 * 5");
    await startSource(
      "plot(sin(x^2), (x, 0, 2*pi), " +
        "plot_points=3, adaptive_recursion=0, randomize=False)",
    );
    assert.equal(
      await waitForIdle(),
      "Graphics object consisting of 1 graphics primitive",
    );
    const plotState = await command("Runtime.evaluate", {
      expression: `({
        traces: document.querySelector('#display')?.data?.length ?? 0,
        points: document.querySelector('#display')?.data?.[0]?.x ?? []
      })`,
      returnByValue: true,
    });
    assert.deepEqual(plotState.result.value, {
      traces: 1,
      points: [0, Math.PI, 2 * Math.PI],
    });
    await startSource(
      "E = EllipticCurve([1, 2, 3, 4, 999])\n" +
        "L = E.lseries()\n" +
        "complex_plot(L, (0, 2), (-4, 4), plot_points=100, " +
        "interpolation='nearest')",
    );
    assert.equal(
      await waitForIdle(),
      "Graphics object consisting of 1 graphics primitive",
    );
    const complexPlotState = await command("Runtime.evaluate", {
      expression: `(() => {
        const display = document.querySelector('#display');
        const trace = display?.data?.[0] ?? {};
        const image = display?.querySelector('image') ?? null;
        return {
          trace: [trace.x0, trace.y0, trace.dx, trace.dy],
          image: image === null ? null : ['x', 'y', 'width', 'height'].map(
            (name) => Number(image.getAttribute(name))
          )
        };
      })()`,
      returnByValue: true,
    });
    const complexGeometry = complexPlotState.result.value;
    assert.deepEqual(complexGeometry.trace, [0, 4, 2 / 99, -8 / 99]);
    assert.ok(complexGeometry.image !== null, "complex plot must render an SVG image");
    assert.ok(
      complexGeometry.image.every(Number.isFinite),
      `complex plot SVG geometry must be finite: ${complexGeometry.image}`,
    );
    assert.ok(complexGeometry.image[2] > 0);
    assert.ok(complexGeometry.image[3] > 0);
    const imageExportState = await command("Runtime.evaluate", {
      expression: `(async () => {
        const renderer = await import("/plotly-renderer.mjs");
        const capabilities = renderer.browserGraphicsExportCapabilities(Plotly);
        const bytes = await renderer.sageDisplayToImageBytes({
          mime: renderer.PLOTLY_MIME,
          data: {
            data: [{ type: "scatter", x: [0, 1], y: [0, 1] }],
            layout: { width: 160, height: 120 },
            config: { displaylogo: false }
          }
        }, { format: "png" }, Plotly);
        return {
          available: capabilities.available,
          formats: capabilities.formats,
          signature: Array.from(bytes.slice(0, 8))
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.deepEqual(imageExportState.result.value, {
      available: true,
      formats: ["png", "jpeg", "webp", "svg"],
      signature: [137, 80, 78, 71, 13, 10, 26, 10],
    });
    await runSource(
      "g = plot(prime_pi, 1, 100)\ng.save('prime-pi.png')",
      "Graphics object consisting of 1 graphics primitive",
    );
    await startSource(
      "u, v = var('u v')\n" +
        "wave = plot3d(u^2-v^2, (u,-1,1), (v,-1,1), " +
        "plot_points=(3,3), color='purple', frame=False)\n" +
        "wave + sphere((0,0,1), size=1/5, color='red', " +
        "plot_points=(5,3))",
    );
    assert.equal(await waitForIdle(), "Graphics3d Object");
    const plot3dState = await command("Runtime.evaluate", {
      expression: `({
        types: Array.from(
          document.querySelector('#display')?.data ?? [],
          (trace) => trace.type
        ),
        z: document.querySelector('#display')?.data?.[0]?.z ?? [],
        aspect: document.querySelector('#display')?.layout?.scene
          ?.aspectratio ?? null
      })`,
      returnByValue: true,
    });
    assert.deepEqual(plot3dState.result.value, {
      types: ["surface", "surface"],
      z: [
        [0, -1, 0],
        [1, 0, 1],
        [0, -1, 0],
      ],
      aspect: { x: 1, y: 1, z: 1 },
    });
    }
    socket.close();
  } finally {
    chrome.kill();
  }
  console.log(
    process.argv.includes("--public-exact-subspaces")
      ? "Chromium public exact matrix subspaces test passed"
      : "Chromium Web Worker mathematics and plotting smoke test passed",
  );
} finally {
  server.close();
}
