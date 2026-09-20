import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const cleanRoot = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node assemble-browser.mjs CLEAN_C4_WORKTREE");
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json")));

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function identity(filename, displayPath) {
  const value = fs.readFileSync(filename);
  return { path: displayPath, sha256: hash(value), bytes: value.byteLength };
}
function read(filename) {
  return JSON.parse(fs.readFileSync(filename));
}
function write(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

const evidence = [];
for (const entry of cases.cases) {
  for (const stage of ["factor-base", "relation-prefix"]) {
    const basename = `${entry.id}.${stage}`;
    const source = path.join(
      cleanRoot,
      "bench/pari-class-group-rust/qualification/wasm-prepared-multifield",
      `${basename}.browser-receipt.json`,
    );
    const destination = path.join(here, `${basename}.browser-receipt.json`);
    const receipt = read(source);
    if (receipt.repository_revision !== cases.artifactRevision) {
      throw new Error(`${basename} was not run from the artifact revision`);
    }
    write(destination, receipt);
    const nativePath = path.join(here, `${basename}.native-receipt.json`);
    const vectorPath = path.join(here, "vectors", `${basename}.vector.json`);
    const native = read(nativePath);
    if (JSON.stringify(native.result) !== JSON.stringify(receipt.vector.expected)) {
      throw new Error(`${basename} native/browser result mismatch`);
    }
    evidence.push({
      fieldId: entry.id,
      role: entry.role,
      stage,
      input: identity(path.join(root, entry.input), entry.input),
      native: identity(nativePath, path.relative(root, nativePath)),
      vector: identity(vectorPath, path.relative(root, vectorPath)),
      browser: identity(destination, path.relative(root, destination)),
      artifact: {
        ...receipt.artifact,
        retained: true,
        revision: cases.artifactRevision,
      },
      nativeMedianMs: native.medianMs,
      browserMedianMs: Object.fromEntries(
        receipt.engines.map((engine) => [engine.engine, engine.timings_ms.call]),
      ),
      browserMemoryPages: Object.fromEntries(
        receipt.engines.map((engine) => [engine.engine, engine.memory_pages]),
      ),
      result: native.result,
    });
  }
}

write(path.join(here, "receipt.json"), {
  schema: "sagejs.rust-class-group/prepared-multifield-wasm-evidence-v1",
  status: "pass",
  observedAt: new Date().toISOString(),
  artifactRevision: cases.artifactRevision,
  claims: {
    inputPolicy: "answer-free neutral prepared fields only",
    expectedOutputPolicy:
      "native output is stored only in the out-of-band browser vector expected member, never in the candidate request",
    crossTarget: ["native-linux", "chromium", "firefox", "webkit"],
    scope:
      "prepared factor-base and bounded relation-prefix stages only; not W0/R5 or an end-to-end class-group result",
    revisionPolicy:
      "all measured source and Wasm artifacts are frozen at artifactRevision; the later checkout HEAD is excluded",
    artifactRetention:
      "both gitignored Wasm artifacts are retained locally and their exact bytes are required by verify.mjs",
  },
  fixedRow6Assumptions: {
    productionRuntime: [],
    remainingHarnessOnly: [
      "the older wasm-prepared-factor-base/prepare-vector.mjs selects row6",
      "the older wasm-prepared-relation-prefix/prepare-vector.mjs selects row6",
      "row6 constants remain in cfg(test) regression modules",
    ],
  },
  evidence,
});
