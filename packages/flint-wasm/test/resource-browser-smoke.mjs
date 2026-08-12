import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

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
  if (!filename.startsWith(`${packageRoot}${path.sep}`) ||
      !fs.existsSync(filename)) {
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
const chrome = spawn(chromium, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--js-flags=--expose-gc",
  "--remote-debugging-port=0",
  "about:blank",
]);

let socket;
try {
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
  const targetsUrl = new URL("/json/list", debuggerUrl);
  targetsUrl.protocol = "http:";
  const targets = await (await fetch(targetsUrl)).json();
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Chromium did not expose a page target");

  socket = new WebSocket(page.webSocketDebuggerUrl);
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
  function command(method, params = {}) {
    commandId += 1;
    return new Promise((resolve, reject) => {
      pending.set(commandId, { resolve, reject });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  }
  async function outputState() {
    const result = await command("Runtime.evaluate", {
      expression: `({
        output: document.querySelector('#output')?.textContent ?? '',
        running: document.querySelector('#run')?.disabled ?? true
      })`,
      returnByValue: true,
    });
    return result.result.value;
  }
  async function waitForIdle() {
    const deadline = Date.now() + 30_000;
    let state;
    while (Date.now() < deadline) {
      state = await outputState();
      if (!state.running) return state.output;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`browser evaluation did not finish: ${state?.output ?? ""}`);
  }
  async function runSource(source) {
    await command("Runtime.evaluate", {
      expression:
        `document.querySelector('#source').value = ${JSON.stringify(source)};` +
        "document.querySelector('#run').click()",
    });
    const output = await waitForIdle();
    assert.doesNotMatch(output, /^Error:/);
    return output;
  }

  await command("Runtime.enable");
  await command("Page.enable");
  await command("Page.navigate", {
    url: `http://127.0.0.1:${port}/demo/?` +
      new URLSearchParams({ run: "factor(2026)" }),
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await outputState();
    if (!state.running && state.output === "2 * 1013") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await outputState()).output, "2 * 1013");

  const liveCount = [
    "runtime.reflect.apply(runtime.reflect.get(runtime.flint_backend(),",
    "    '__sagejs_wasm_resource_live_count__'), runtime.undefined, [])",
  ].join("\n");
  assert.equal(await runSource([
    "import sagejs.runtime as runtime",
    "from sagejs.ffi.flint import dirichlet_group, dirichlet_group_size, dirichlet_group_num_primitive",
    "group = dirichlet_group(13)",
    "print(dirichlet_group_size(group), dirichlet_group_num_primitive(group), group.closed)",
    "group.close(); group.close()",
    "print(group.closed)",
    `print(${liveCount})`,
  ].join("\n")), "12 11 False\nTrue\n0\nNone");

  assert.equal(await runSource([
    "import sagejs.runtime as runtime",
    "from sagejs.ffi.flint import dirichlet_group, dirichlet_group_size",
    "def use_temporary_dirichlet_group():",
    "    temporary = dirichlet_group(17)",
    "    return dirichlet_group_size(temporary)",
    "assert use_temporary_dirichlet_group() == 16",
    liveCount,
  ].join("\n")), "1");

  let remaining = "1";
  for (let attempt = 0; attempt < 30 && remaining !== "0"; attempt += 1) {
    remaining = (await runSource([
      "import sagejs.runtime as runtime",
      "runtime.reflect.apply(runtime.reflect.get(runtime.global_object, 'gc'), runtime.undefined, [])",
      liveCount,
    ].join("\n"))).trim();
    if (remaining !== "0") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.equal(remaining, "0");

  assert.equal(await runSource([
    "from sagejs.ffi.flint import fmpq_matrix, fmpq_matrix_nrows, fmpq_matrix_ncols, fmpq_matrix_set_entry, fmpq_matrix_entry_numerator, fmpq_matrix_entry_denominator",
    "empty = fmpq_matrix(2, 3)",
    "print(fmpq_matrix_nrows(empty), fmpq_matrix_ncols(empty), empty.closed)",
    "fmpq_matrix_set_entry(empty, 1, 2, -22, 7)",
    "print(fmpq_matrix_entry_numerator(empty, 1, 2), fmpq_matrix_entry_denominator(empty, 1, 2))",
    "empty.close(); empty.close()",
    "print(empty.closed)",
    "def dense_qq_resource_slice():",
    "    value = matrix(QQ, 2, [QQ(1)/2, QQ(1)/3, 2, -1])",
    "    square = value * value",
    "    reduced = value.rref()",
    "    packed = value._packed_rationals()",
    "    copy = value.__copy__()",
    "    return (value.det(), square.str(), reduced.str(), len(packed), packed[0], packed[len(packed)-1], copy.str() == value.str())",
    "print(dense_qq_resource_slice())",
  ].join("\n")), [
    "2 3 False",
    "-22 7",
    "True",
    "(-7/6, '[11/12  -1/6]\\n[   -1   5/3]', '[1 0]\\n[0 1]', 40, 1, 1, True)",
    "None",
  ].join("\n"));

  remaining = "1";
  for (let attempt = 0; attempt < 50 && remaining !== "0"; attempt += 1) {
    remaining = (await runSource([
      "import sagejs.runtime as runtime",
      "runtime.reflect.apply(runtime.reflect.get(runtime.global_object, 'gc'), runtime.undefined, [])",
      liveCount,
    ].join("\n"))).trim();
    if (remaining !== "0") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.equal(remaining, "0");
  console.log("Generated Wasm resource browser lifecycle smoke test passed");
} finally {
  socket?.close();
  chrome.kill();
  server.close();
}
