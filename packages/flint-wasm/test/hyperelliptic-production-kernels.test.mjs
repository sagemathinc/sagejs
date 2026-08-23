import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WASI } from "node:wasi";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const manifestPath = path.join(packageRoot, "dist", "native-kernels", "index.json");
const capabilityIds = [
  "kernel:genus2-kummer-height-production",
  "kernel:genus3-weil-candidate-production",
  "kernel:hyperelliptic-cantor-production",
  "kernel:hyperelliptic-kummer-production",
  "kernel:hyperelliptic-period-edge-batch-production",
];
let relocatedTemporary;
let relocatedRoot;

function relocatedPackage() {
  if (relocatedRoot !== undefined) return relocatedRoot;
  relocatedTemporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-relocated-"));
  relocatedRoot = path.join(relocatedTemporary, "installed-package");
  fs.cpSync(packageRoot, relocatedRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(packageRoot, source);
      if (relative === "") return true;
      const first = relative.split(path.sep)[0];
      return first === "dist" || first === "demo" || !relative.includes(path.sep);
    },
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(
    relocatedRoot, "dist", "native-kernels", "index.json",
  ), "utf8"));
  for (const kernel of manifest.kernels) {
    assert.match(kernel.logicalSource, /^[a-z][a-z0-9_/]*\.py$/);
    assert.equal(kernel.logicalSource.includes(repositoryRoot), false);
  }
  return relocatedRoot;
}

test.after(() => {
  if (relocatedTemporary !== undefined) {
    fs.rmSync(relocatedTemporary, { recursive: true, force: true });
  }
});

const publicSource = String.raw`
import json
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.genus2_kummer_height_kernel import (
    dyadic_kummer_height_recurrence,
    modular_kummer_height_recurrence,
)
from sagejs.hyperelliptic_curves.genus3_candidate_kernel import (
    scan_genus3_candidate_progressions,
    scan_genus3_weil_candidates,
    scan_genus3_weil_candidates_batch,
)
from sagejs.hyperelliptic_curves.jacobian_kernels import (
    packed_cantor_add_batch,
    packed_cantor_progression_batch,
    packed_cantor_scalar_batch,
    packed_cantor_search_progression,
)
from sagejs.hyperelliptic_curves.jacobian_kummer_native import (
    genus2_kummer_degenerate_pseudo_add_batch,
    genus2_kummer_double_batch,
    genus2_kummer_project_batch,
)
from sagejs.hyperelliptic_curves.periods import (
    _conjugation_action_float64_kernel,
    _period_edge_batch_float64,
    _period_sign_mask_float64_kernel,
)
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_float64_buffer,
    kernel_float64_zeros,
    kernel_integer_buffer,
    kernel_integer_zeros,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
)

def u(kernel, values):
    return kernel_uint64_buffer(kernel, values)

def uz(kernel, length):
    return kernel_uint64_zeros(kernel, length)

def z(kernel, values):
    return kernel_integer_buffer(kernel, values)

def zz(kernel, length):
    return kernel_integer_zeros(kernel, length, 8)

def unsigned_values(buffer):
    return [int(buffer[index]) for index in range(len(buffer))]

def integer_values(buffer):
    return [int(value) for value in integer_buffer_values(buffer)]

model_values = [1, 1, 0, 0, 0, 1, 0, 0] + [0] * 4
identity_values = [0, 1, 0, 0, 0, 0, 0, 0]

add_output = uz(packed_cantor_add_batch, 16)
add_status = uz(packed_cantor_add_batch, 2)
assert packed_cantor_add_batch(
    add_output, add_status, u(packed_cantor_add_batch, model_values),
    u(packed_cantor_add_batch, identity_values * 2),
    u(packed_cantor_add_batch, identity_values * 2), 2, 2, 3,
)
progression_output = uz(packed_cantor_progression_batch, 16)
progression_status = uz(packed_cantor_progression_batch, 2)
assert packed_cantor_progression_batch(
    progression_output, progression_status,
    u(packed_cantor_progression_batch, model_values),
    u(packed_cantor_progression_batch, identity_values),
    u(packed_cantor_progression_batch, identity_values), 2, 2, 3,
)
scalar_output = uz(packed_cantor_scalar_batch, 8)
scalar_status = uz(packed_cantor_scalar_batch, 1)
assert packed_cantor_scalar_batch(
    scalar_output, scalar_status, u(packed_cantor_scalar_batch, model_values),
    u(packed_cantor_scalar_batch, identity_values),
    u(packed_cantor_scalar_batch, [0]), u(packed_cantor_scalar_batch, [0]),
    1, 1, 2, 3,
)
search_output = uz(packed_cantor_search_progression, 1)
search_status = uz(packed_cantor_search_progression, 1)
search_diagnostics = uz(packed_cantor_search_progression, 5)
assert packed_cantor_search_progression(
    search_output, search_status, search_diagnostics,
    u(packed_cantor_search_progression, model_values),
    u(packed_cantor_search_progression, identity_values),
    u(packed_cantor_search_progression, [1]),
    u(packed_cantor_search_progression, [1]), 1, 1, 1, 100, 2, 3,
)

project_output = uz(genus2_kummer_project_batch, 4)
project_status = uz(genus2_kummer_project_batch, 1)
assert genus2_kummer_project_batch(
    project_output, project_status,
    u(genus2_kummer_project_batch, identity_values),
    u(genus2_kummer_project_batch, [1, 1, 0, 0, 0, 1, 0, 0]),
    u(genus2_kummer_project_batch, [0, 0, 0, 0]), 1, 19,
)
double_output = uz(genus2_kummer_double_batch, 4)
double_status = uz(genus2_kummer_double_batch, 1)
assert genus2_kummer_double_batch(
    double_output, double_status,
    u(genus2_kummer_double_batch, [0, 0, 0, 1]),
    u(genus2_kummer_double_batch, [0] * 140),
    uz(genus2_kummer_double_batch, 35), 0, 1, 0, 1, 19,
)
pseudo_output = uz(genus2_kummer_degenerate_pseudo_add_batch, 4)
pseudo_status = uz(genus2_kummer_degenerate_pseudo_add_batch, 1)
assert genus2_kummer_degenerate_pseudo_add_batch(
    pseudo_output, pseudo_status,
    u(genus2_kummer_degenerate_pseudo_add_batch, [0, 0, 0, 1]),
    u(genus2_kummer_degenerate_pseudo_add_batch, [0, 0, 0, 1]),
    u(genus2_kummer_degenerate_pseudo_add_batch, [0, 0, 0, 1]), 1, 19,
)

height_coefficients = [1, 1, 1, 1]
height_exponents = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
height_counts = [1, 1, 1, 1]
modular_output = zz(modular_kummer_height_recurrence, 1)
modular_result = modular_kummer_height_recurrence(
    modular_output, z(modular_kummer_height_recurrence, height_coefficients),
    u(modular_kummer_height_recurrence, height_exponents),
    u(modular_kummer_height_recurrence, height_counts),
    1, 2, 3, 4, 5, 97, 1,
)
scale = 16
dyadic_output = zz(dyadic_kummer_height_recurrence, 10)
dyadic_state = z(dyadic_kummer_height_recurrence, [16, 16, 32, 32, 48, 48, 64, 64])
dyadic_result = dyadic_kummer_height_recurrence(
    dyadic_output, dyadic_state,
    z(dyadic_kummer_height_recurrence, height_coefficients),
    u(dyadic_kummer_height_recurrence, height_exponents),
    u(dyadic_kummer_height_recurrence, height_counts),
    zz(dyadic_kummer_height_recurrence, 48), scale, 1,
)

period_output = kernel_float64_zeros(_period_edge_batch_float64, 2)
period_checksum = _period_edge_batch_float64(
    kernel_float64_buffer(_period_edge_batch_float64, [0.0, 0.0, 1.0, 0.0]),
    kernel_float64_buffer(_period_edge_batch_float64, [2.0, 0.0]),
    kernel_float64_buffer(_period_edge_batch_float64, [0.0, 1.0]),
    period_output, runtime.parse_float("1.0"), 1, 1, 1, 1,
)
sign_output = kernel_float64_zeros(_period_sign_mask_float64_kernel, 1)
sign_result = _period_sign_mask_float64_kernel(
    kernel_float64_zeros(_period_sign_mask_float64_kernel, 16),
    kernel_float64_buffer(_period_sign_mask_float64_kernel, [1.0] * 32),
    kernel_float64_zeros(_period_sign_mask_float64_kernel, 40),
    sign_output, 2, 8,
)
conjugation_output = kernel_float64_zeros(_conjugation_action_float64_kernel, 16)
conjugation_result = _conjugation_action_float64_kernel(
    kernel_float64_zeros(_conjugation_action_float64_kernel, 16),
    kernel_float64_zeros(_conjugation_action_float64_kernel, 32),
    conjugation_output, 2,
)

candidate_output = zz(scan_genus3_weil_candidates, 32)
candidate_result = scan_genus3_weil_candidates(candidate_output, 3, 0, 0, 0, 100000)
batch_output = zz(scan_genus3_weil_candidates_batch, 18)
batch_result = scan_genus3_weil_candidates_batch(
    batch_output, z(scan_genus3_weil_candidates_batch, [3, 0, 0, 0]),
    1, 5, 100000,
)
progression_candidate_output = zz(scan_genus3_candidate_progressions, 31)
empty_witnesses = z(scan_genus3_candidate_progressions, [])
progression_candidate_result = scan_genus3_candidate_progressions(
    progression_candidate_output, 3, 0, 0, 0,
    empty_witnesses, 0, empty_witnesses, 0, 0, 100000,
)

record = {
    "cantor": {
        "add": [unsigned_values(add_output), unsigned_values(add_status)],
        "progression": [unsigned_values(progression_output), unsigned_values(progression_status)],
        "scalar": [unsigned_values(scalar_output), unsigned_values(scalar_status)],
        "search": [unsigned_values(search_output), unsigned_values(search_status), unsigned_values(search_diagnostics)],
    },
    "kummer": {
        "project": [unsigned_values(project_output), unsigned_values(project_status)],
        "double": [unsigned_values(double_output), unsigned_values(double_status)],
        "pseudo": [unsigned_values(pseudo_output), unsigned_values(pseudo_status)],
    },
    "height": {
        "modular": [int(modular_result), integer_values(modular_output)],
        "dyadic": [int(dyadic_result), integer_values(dyadic_output), integer_values(dyadic_state)],
    },
    "period": {
        "edge": [round(float(period_checksum), 12), [round(float(period_output[i]), 12) for i in range(2)]],
        "sign": [round(float(sign_result), 12), [round(float(sign_output[i]), 12) for i in range(1)]],
        "conjugation": [round(float(conjugation_result), 12), [round(float(conjugation_output[i]), 12) for i in range(16)]],
    },
    "candidate": {
        "single": [int(candidate_result), integer_values(candidate_output)],
        "batch": [int(batch_result), integer_values(batch_output)],
        "progression": [int(progression_candidate_result), integer_values(progression_candidate_output)],
    },
    "compiled": [
        is_compiled(packed_cantor_add_batch),
        is_compiled(packed_cantor_progression_batch),
        is_compiled(packed_cantor_search_progression),
        is_compiled(packed_cantor_scalar_batch),
        is_compiled(genus2_kummer_project_batch),
        is_compiled(genus2_kummer_double_batch),
        is_compiled(genus2_kummer_degenerate_pseudo_add_batch),
        is_compiled(modular_kummer_height_recurrence),
        is_compiled(dyadic_kummer_height_recurrence),
        is_compiled(_period_edge_batch_float64),
        is_compiled(_period_sign_mask_float64_kernel),
        is_compiled(_conjugation_action_float64_kernel),
        is_compiled(scan_genus3_weil_candidates),
        is_compiled(scan_genus3_weil_candidates_batch),
        is_compiled(scan_genus3_candidate_progressions),
    ],
}
print(json.dumps(record, sort_keys=True, separators=(",", ":")))
`;

function dynamicOracle() {
  const environment = { ...process.env, SAGEJS_NATIVE_MODE: "dynamic" };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  const run = spawnSync(process.execPath, [
    path.join(repositoryRoot, "bin", "sagejs"), "--python",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    input: publicSource,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const record = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.ok(record.compiled.every((value) => value === false));
  record.compiled = Array(record.compiled.length).fill(true);
  return record;
}

function assertAuthenticatedRoutes(result) {
  assert.equal(result.stderr, "");
  const routes = new Map(result.instrumentation.routes.map((route) => [
    route.capability_id, route,
  ]));
  for (const capabilityId of capabilityIds) {
    const route = routes.get(capabilityId);
    assert.ok(route, `missing authenticated route ${capabilityId}`);
    assert.equal(route.selected_route, "receipt-backed-wasm-artifact");
    assert.equal(route.execution_target, "wasm-artifact");
    assert.ok(route.call_count >= 1);
  }
}

async function productionRuntime() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const { instantiateWasmKernelPacks } = await import(
    "../dist/wasm-pack-loader.mjs"
  );
  const runtime = await instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return fs.readFileSync(path.join(packageRoot, "dist", "native-kernels", pack.asset));
    },
    host() {
      const wasi = new WASI({ version: "preview1", returnOnExit: true });
      return {
        imports: { wasi_snapshot_preview1: wasi.wasiImport },
        initialize(instance) { wasi.initialize(instance); },
      };
    },
  });
  return { manifest, runtime };
}

test("authenticated production packs execute every hyperelliptic source family", async () => {
  const expected = dynamicOracle();
  const { manifest, runtime } = await productionRuntime();
  const expectedFunctions = new Map([
    ["genus2-kummer-height-production", 6],
    ["genus3-weil-candidate-production", 3],
    ["hyperelliptic-cantor-production", 7],
    ["hyperelliptic-kummer-production", 3],
    ["hyperelliptic-period-edge-batch-production", 3],
  ]);
  for (const [id, count] of expectedFunctions) {
    const kernel = manifest.kernels.find((candidate) => candidate.id === id);
    assert.ok(kernel, `production manifest omitted ${id}`);
    assert.equal(kernel.functions.length, count);
    assert.ok(kernel.functions.every((fn) => fn.status === "compiled-source"));
  }

  const cantorSource = "sagejs/hyperelliptic_curves/jacobian_kernels.py";
  const add = runtime.function(cantorSource, "packed_cantor_add_batch");
  const addOutput = new BigUint64Array(16);
  const addStatus = new BigUint64Array(2);
  assert.equal(add(
    addOutput, addStatus,
    new BigUint64Array([1n, 1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]),
    new BigUint64Array([0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]),
    new BigUint64Array([0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]),
    2n, 2n, 3n,
  ), true);
  assert.deepEqual(Array.from(addOutput, Number), expected.cantor.add[0]);
  assert.deepEqual(Array.from(addStatus, Number), expected.cantor.add[1]);

  const kummer = runtime.function(
    "sagejs/hyperelliptic_curves/jacobian_kummer_native.py",
    "genus2_kummer_project_batch",
  );
  const kummerOutput = new BigUint64Array(4);
  const kummerStatus = new BigUint64Array(1);
  assert.equal(kummer(
    kummerOutput, kummerStatus,
    new BigUint64Array([0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]),
    new BigUint64Array([1n, 1n, 0n, 0n, 0n, 1n, 0n, 0n]),
    new BigUint64Array(4), 1n, 19n,
  ), true);
  assert.deepEqual(Array.from(kummerOutput, Number), expected.kummer.project[0]);
  assert.deepEqual(Array.from(kummerStatus, Number), expected.kummer.project[1]);

  const height = runtime.function(
    "sagejs/hyperelliptic_curves/genus2_kummer_height_kernel.py",
    "modular_kummer_height_recurrence",
  );
  const heightOutput = [0n];
  const heightResult = height(
    heightOutput, [1n, 1n, 1n, 1n],
    new BigUint64Array([
      1n, 0n, 0n, 0n, 0n, 1n, 0n, 0n,
      0n, 0n, 1n, 0n, 0n, 0n, 0n, 1n,
    ]),
    new BigUint64Array([1n, 1n, 1n, 1n]),
    1n, 2n, 3n, 4n, 5n, 97n, 1n,
  );
  assert.equal(Number(heightResult), expected.height.modular[0]);
  assert.deepEqual(heightOutput.map(Number), expected.height.modular[1]);

  const period = runtime.function(
    "sagejs/hyperelliptic_curves/periods.py", "_period_edge_batch_float64",
  );
  const periodOutput = new Float64Array(2);
  const checksum = period(
    new Float64Array([0, 0, 1, 0]), new Float64Array([2, 0]),
    new Float64Array([0, 1]), periodOutput, 1, 1n, 1n, 1n, 1n,
  );
  assert.equal(Number(checksum.toFixed(12)), expected.period.edge[0]);
  assert.deepEqual(
    Array.from(periodOutput, (value) => Number(value.toFixed(12))),
    expected.period.edge[1],
  );
  const sign = runtime.function(
    "sagejs/hyperelliptic_curves/periods.py",
    "_period_sign_mask_float64_kernel",
  );
  const signOutput = new Float64Array(1);
  const signResult = sign(
    new Float64Array(16), new Float64Array(32).fill(1),
    new Float64Array(40), signOutput, 2n, 8n,
  );
  assert.equal(Number(signResult.toFixed(12)), expected.period.sign[0]);
  assert.deepEqual(Array.from(signOutput), expected.period.sign[1]);
  const conjugation = runtime.function(
    "sagejs/hyperelliptic_curves/periods.py",
    "_conjugation_action_float64_kernel",
  );
  const conjugationOutput = new Float64Array(16);
  const conjugationResult = conjugation(
    new Float64Array(16), new Float64Array(32), conjugationOutput, 2n,
  );
  assert.equal(
    Number(conjugationResult.toFixed(12)),
    expected.period.conjugation[0],
  );
  assert.deepEqual(
    Array.from(conjugationOutput), expected.period.conjugation[1],
  );

  const candidate = runtime.function(
    "sagejs/hyperelliptic_curves/genus3_candidate_kernel.py",
    "scan_genus3_weil_candidates",
  );
  const candidateOutput = Array(32).fill(0n);
  const candidateResult = candidate(
    candidateOutput, 3n, 0n, 0n, 0n, 100000n,
  );
  assert.equal(Number(candidateResult), expected.candidate.single[0]);
  assert.deepEqual(candidateOutput.map(Number), expected.candidate.single[1]);

  for (const fn of [
    add, kummer, height, period, sign, conjugation, candidate,
  ]) {
    assert.equal(fn.nativeAvailable, true);
    assert.equal(fn.executionTarget, "wasm");
    assert.equal(fn.sourceTransparent, true);
  }
});

test("the public Node-Wasm evaluator authenticates all hyperelliptic kernel routes", {
  timeout: 120_000,
}, async () => {
  const expected = dynamicOracle();
  const installed = relocatedPackage();
  const { createSage } = await import(pathToFileURL(
    path.join(installed, "node-kernel.mjs"),
  ));
  const session = await createSage({ timeout: 120_000 });
  try {
    const result = await session.evaluate(publicSource, { timeout: 120_000 });
    assert.deepEqual(JSON.parse(result.stdout.trim()), expected);
    assertAuthenticatedRoutes(result);
  } finally {
    await session.close();
  }
});

const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

test("a real browser authenticates and executes all hyperelliptic kernel routes", {
  skip: chromium ? false : "Chromium is not installed",
  timeout: 180_000,
}, async () => {
  const expected = dynamicOracle();
  const installed = relocatedPackage();
  const types = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".wasm", "application/wasm"],
  ]);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
    const filename = path.resolve(installed, relative);
    if (!filename.startsWith(`${installed}${path.sep}`) || !fs.existsSync(filename)) {
      response.writeHead(404).end("not found");
      return;
    }
    const actual = fs.statSync(filename).isDirectory()
      ? path.join(filename, "index.html")
      : filename;
    response.writeHead(200, {
      "Content-Type": types.get(path.extname(actual)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    fs.createReadStream(actual).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const chrome = spawn(chromium, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--remote-debugging-port=0", "about:blank",
  ]);
  let errors = "";
  try {
    const debuggerUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Chromium did not start:\n${errors}`)), 10_000,
      );
      chrome.on("error", reject);
      chrome.stderr.on("data", (chunk) => {
        errors += chunk;
        const match = errors.match(/DevTools listening on (ws:\/\/\S+)/);
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
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      commandId += 1;
      pending.set(commandId, { resolve, reject });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
    await command("Runtime.enable");
    await command("Page.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    const evaluation = await command("Runtime.evaluate", {
      expression: `(async () => {
        const { createSage } = await import("/kernel.mjs");
        const session = await createSage();
        try {
          return await session.evaluate(${JSON.stringify(publicSource)}, { timeout: 120000 });
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
    assert.deepEqual(JSON.parse(result.stdout.trim()), expected);
    assertAuthenticatedRoutes(result);
    socket.close();
  } finally {
    chrome.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
  }
});
