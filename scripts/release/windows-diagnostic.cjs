"use strict";

// Diagnostic only: no qualification receipts and no automatic retries.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { createHash } = require("node:crypto");

function safeReport(report) {
  const h = report.header || {};
  return {
    schema: "sagejs.windows-runtime-diagnostic-report/v1",
    header: Object.fromEntries([
      "event", "trigger", "nodejsVersion", "arch", "platform", "osName",
      "osRelease", "osVersion", "osMachine", "processId", "threadId",
    ].filter(k => ["string", "number"].includes(typeof h[k])).map(k => [k, h[k]])),
    nativeStack: (report.nativeStack || []).map(f => ({
      pc: String(f.pc || ""), symbol: String(f.symbol || ""),
    })),
    javascriptHeap: Object.fromEntries(Object.entries(report.javascriptHeap || {})
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v))),
  };
}

async function main(root, output, inventoryOnly = false) {
  if (process.platform !== "win32") throw new Error("native Windows required");
  root = fs.realpathSync(root);
  output = path.resolve(output);
  fs.mkdirSync(output); // Refuse to overwrite a previous diagnostic.
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + "\n");
  const command = (exe, args) => cp.spawnSync(exe, args, {
    encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  const cim = "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize)\" }";
  const info = {
    source: cp.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    node: process.version, v8: process.versions.v8,
    nodeSha256: createHash("sha256").update(fs.readFileSync(process.execPath)).digest("hex"),
    os: os.version(), release: os.release(), cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length, availableParallelism: os.availableParallelism(),
    totalMemory: os.totalmem(), freeMemory: os.freemem(),
    image: { name: process.env.ImageOS || null, version: process.env.ImageVersion || null },
    toolchain: command("powershell.exe", ["-NoProfile", "-Command",
      "& \"${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe\" -latest -property installationVersion"]).stdout.trim(),
  };
  save("environment.json", info);
  if (inventoryOnly) return;
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-private-node-reports-"));
  const probes = [];
  for (const lifetime of [100, 100, 2000]) {
    const child = cp.spawn(process.execPath, ["-e", `setTimeout(()=>{},${lifetime})`], { stdio: "ignore" });
    const done = new Promise(resolve => child.on("exit", resolve));
    const start = performance.now();
    const result = command("powershell.exe", ["-NoProfile", "-Command", cim]);
    probes.push({ lifetime, queryMs: performance.now() - start, status: result.status,
      observed: result.stdout.split(/\r?\n/).some(row => row.startsWith(`${child.pid},`)) });
    await done;
  }
  save("cim-probes.json", probes);
  const results = [];
  const flags = ["--report-on-fatalerror", "--report-exclude-env", "--report-exclude-network", `--report-directory=${raw}`];
  const env = { ...process.env, NODE_OPTIONS: flags.join(" "),
    SAGEJS_NATIVE_PREBUILT_REQUIRED: "1", SAGEJS_NUMERICAL_RUNTIME_REQUIRED: "1",
    SAGEJS_NUMERICAL_PRODUCT_ROOT: path.join(root, "build/authenticated-numerical-product") };
  // Quote the only flag that may contain spaces when inherited by kernel Workers.
  env.NODE_OPTIONS = flags.slice(0, -1).join(" ") + ` --report-directory="${raw}"`;
  async function trial(id, args) {
    const start = performance.now();
    const child = cp.spawn(process.execPath, args, { cwd: root, env });
    let log = "";
    let timedOut = false;
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      if (log.length < 4 * 1024 * 1024) log += chunk.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      command("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]);
    }, 180000);
    const result = await new Promise(resolve => {
      child.on("error", error => resolve({ error: error.message, status: null }));
      child.on("close", (status, signal) => resolve({ status, signal }));
    });
    clearTimeout(timer);
    results.push({ id, ...result, timedOut, elapsedMs: performance.now() - start });
    fs.writeFileSync(path.join(output, `${id}.log`), log);
    save("results.json", results);
    console.log(JSON.stringify(results.at(-1)));
    return result.status === 0 && !timedOut;
  }
  let passed = true;
  for (let i = 0; i < 10 && passed; i++) {
    const pair = await Promise.all([0, 1].map(lane => trial(`rforest-${i}-${lane}`,
      ["--test", "test/hyperelliptic-rforest.cjs"])));
    passed = pair.every(Boolean);
  }
  if (passed) passed = await trial("lifecycle", ["-e",
    "const {createSage}=require('./dist/tools/kernel.js'); (async()=>{for(let i=0;i<100;i++){const s=await createSage();await s.evaluate('1+1');await s.close()}})().catch(e=>{console.error(e);process.exitCode=1})"]);
  for (const [i, file] of fs.readdirSync(raw).entries()) {
    if (file.endsWith(".json")) save(`safe-report-${i}.json`, safeReport(JSON.parse(fs.readFileSync(path.join(raw, file), "utf8"))));
  }
  // Raw reports stay private in temporary storage; never upload this directory.
  save("summary.json", { passed, diagnosticOnly: true, tests: results.length,
    reportCount: fs.readdirSync(output).filter(f => f.startsWith("safe-report-")).length });
  if (!passed) process.exitCode = 1;
}

if (require.main === module) main(process.argv[2], process.argv[3], process.argv[4] === "--inventory-only").catch(error => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { safeReport };
