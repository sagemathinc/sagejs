"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_DELTA,
  parseArguments: parseBrowserArguments,
  validateBrowserMemoryReceipt,
} = require("../../../scripts/numerical-computing/qualification/run-browser-memory.cjs");
const {
  parseArguments: parseSanitizerArguments,
  usage: sanitizerUsage,
} = require("../../../scripts/numerical-computing/qualification/run-native-sanitizers.cjs");
const {
  stageBrowserArtifact,
} = require("../../../scripts/numerical-computing/qualification/prepare-browser.cjs");

function peak(bytes, overrides = {}) {
  return {
    bytes,
    measurement_method: "linux-procfs-process-tree-sampled-v1",
    measurement_scope: "process_tree",
    authenticated_by: "qualification-collector",
    sample_interval_ms: 5,
    ...overrides,
  };
}

function browserReceipt(baseline, pressure) {
  return {
    status: "passed",
    platform: { id: "linux-x64" },
    runtime: { subject: { kind: "browser" } },
    cases: [
      {
        case_id: "p8-browser-memory-baseline",
        status: "passed",
        metrics: { peak_memory: baseline },
      },
      {
        case_id: "p8-browser-memory-pressure",
        status: "passed",
        metrics: { peak_memory: pressure },
      },
      {
        case_id: "p8-browser-worker-replacement",
        status: "passed",
        metrics: { peak_memory: pressure },
      },
    ],
  };
}

test("native sanitizer CLI is explicit and defaults to all three sanitizers", () => {
  const parsed = parseSanitizerArguments(["--output", "build/evidence.json"]);
  assert.deepEqual(parsed.components, ["cminpack", "nlopt"]);
  assert.equal(parsed.requireClean, true);
  assert.match(sanitizerUsage(), /not a claim that Wasm ran under a native sanitizer/);
  assert.throws(
    () => parseSanitizerArguments(["--output", "x", "--component", "cobyla"]),
    /unsupported component/,
  );
});

test("browser memory CLI requires an exact real-engine row", () => {
  const parsed = parseBrowserArguments([
    "--engine", "chromium", "--kind", "worker", "--output", "build/browser-memory",
  ]);
  assert.equal(parsed.minimumDelta, DEFAULT_DELTA);
  assert.equal(parsed.kind, "worker");
  assert.throws(
    () => parseBrowserArguments([
      "--engine", "firefox", "--kind", "worker", "--output", "build/browser-memory",
    ]),
    /worker.*Chromium/i,
  );
});

test("browser memory evidence requires authenticated process-tree delta", () => {
  const baseline = peak(200 * 1024 * 1024);
  const pressure = peak(240 * 1024 * 1024);
  const measured = validateBrowserMemoryReceipt(
    browserReceipt(baseline, pressure),
    DEFAULT_DELTA,
  );
  assert.equal(measured.delta_bytes, 40 * 1024 * 1024);
  assert.throws(
    () => validateBrowserMemoryReceipt(
      browserReceipt(baseline, peak(220 * 1024 * 1024)),
      DEFAULT_DELTA,
    ),
    /below/,
  );
  assert.throws(
    () => validateBrowserMemoryReceipt(
      browserReceipt(baseline, peak(240 * 1024 * 1024, {
        measurement_scope: "browser_heap",
      })),
      DEFAULT_DELTA,
    ),
    /lacks authenticated/,
  );
});

test("browser artifact staging binds runtime-only modules without node_modules", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-browser-stage-test-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, "source");
  fs.mkdirSync(path.join(source, "dist"), { recursive: true });
  fs.mkdirSync(path.join(source, "release"), { recursive: true });
  fs.mkdirSync(path.join(source, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ files: ["kernel.mjs"] }));
  fs.writeFileSync(path.join(source, "kernel.mjs"), "export default 1;\n");
  fs.writeFileSync(path.join(source, "new-runtime-only.mjs"), "export default 2;\n");
  fs.writeFileSync(path.join(source, "dist", "generated.dat"), "generated\n");
  fs.writeFileSync(path.join(source, "release", "manifest.json"), "{}\n");
  fs.writeFileSync(path.join(source, "node_modules", "excluded.js"), "bad\n");
  const staged = stageBrowserArtifact(temporary, "source", "output");
  assert.equal(staged, "output");
  assert.equal(fs.existsSync(path.join(temporary, "output", "new-runtime-only.mjs")), true);
  assert.equal(fs.existsSync(path.join(temporary, "output", "dist", "generated.dat")), true);
  assert.equal(fs.existsSync(path.join(temporary, "output", "node_modules")), false);
});
