"use strict";

// Run the exact same isolated pack witness on a host without a compiler,
// package manager, FLINT, or a checkout. The bundle is an explicit input; this
// receipt does not qualify a full Sage.js installation or public API.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");

async function main() {
  if (process.argv.length !== 4) throw new Error("usage: floating-pack-portable.cjs BUNDLE OUTPUT");
  const directory = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  if (fs.existsSync(output)) throw new Error("refusing to overwrite a receipt");
  const { exercisePack } = require(path.join(directory, "floating-pack-exercise.cjs"));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "index.json"), "utf8"));
  assert.equal(manifest.packs.length, 1);
  assert.equal(manifest.packs[0].domain, "float64");
  const asset = manifest.packs[0].asset;
  assert.match(asset, /^packs\/float64\/[a-f0-9]{64}\.wasm$/);
  const inputs = ["index.json", "wasm-pack-loader.mjs", "floating-pack-exercise.cjs", asset];
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const bindings = () => inputs.map(name => {
    const bytes = fs.readFileSync(path.join(directory, name));
    return { path: name, bytes: bytes.length, sha256: hash(bytes) };
  });
  const before = bindings();
  const start = performance.now();
  const observation = await exercisePack({
    loader: pathToFileURL(path.join(directory, "wasm-pack-loader.mjs")).href,
    manifest, assets: { [asset]: [...fs.readFileSync(path.join(directory, asset))] },
  });
  assert.deepEqual(observation, {
    domains: ["float64"], status: 0, total: 1, input: [1e16, 1, -1e16, -0],
    signs: ["-3", "0", "-0", "0", "-0", "2"], original: ["0", "-0", "2", "0", "-0", "-3"],
    boxedOrder: [1, 3], hooks: 0, rejected: [true, true, true], wrongSource: true,
    boundSource: true, corruptionRejected: true, unavailable: true, target: "wasm", capacityStable: true,
  });
  assert.deepEqual(bindings(), before, "bundle changed during qualification");
  fs.writeFileSync(output, JSON.stringify({
    schema: "sagejs.floating-pack-portability/v1", status: "passed",
    scope: "isolated-loader-and-pack-not-full-product",
    observed_at: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, node: process.version,
      os: os.release(), cpu: os.cpus()[0]?.model },
    collector_sha256: hash(fs.readFileSync(__filename)), inputs: before,
    exercise_elapsed_ms: performance.now() - start,
    observation,
  }, null, 2) + "\n", { flag: "wx" });
  console.log("portable floating pack passed", process.platform, process.arch, process.version);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
