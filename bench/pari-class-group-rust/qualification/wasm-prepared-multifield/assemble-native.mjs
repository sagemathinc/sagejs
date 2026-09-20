import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const [cleanRoot, rawRoot] = process.argv.slice(2).map((value) => path.resolve(value));
if (!cleanRoot || !rawRoot) {
  throw new Error("usage: node assemble-native.mjs CLEAN_C4_WORKTREE RAW_DIRECTORY");
}
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json")));
const revision = cases.artifactRevision;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function identity(filename, displayPath) {
  const value = fs.readFileSync(filename);
  return { path: displayPath, sha256: sha256(value), bytes: value.byteLength };
}
function command(program, args) {
  return execFileSync(program, args, { cwd: cleanRoot, encoding: "utf8" }).trim();
}

if (command("git", ["rev-parse", "HEAD"]) !== revision) {
  throw new Error("native evidence must come from the artifact revision");
}
execFileSync("git", ["diff", "--quiet", revision, "--"], { cwd: cleanRoot });

const executables = {
  "factor-base": "bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/target/release/native-benchmark",
  "relation-prefix": "bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/target/release/native-benchmark",
};
for (const entry of cases.cases) {
  for (const stage of Object.keys(executables)) {
    const rawName = `${entry.id}.${stage}.native-raw.json`;
    const raw = JSON.parse(fs.readFileSync(path.join(rawRoot, rawName)));
    raw.observedAt = fs.statSync(path.join(rawRoot, rawName)).mtime.toISOString();
    raw.repositoryRevision = revision;
    raw.caseRole = entry.role;
    raw.input = identity(path.join(cleanRoot, entry.input), entry.input);
    raw.host = {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      uname: command("uname", ["-a"]),
    };
    raw.tools = {
      rustc: command("rustc", ["-Vv"]),
      cargo: command("cargo", ["-V"]),
    };
    raw.executable = {
      ...identity(path.join(cleanRoot, executables[stage]), executables[stage]),
      retained: false,
      identitySemantics: "frozen identity of the exact measured clean-worktree binary",
    };
    fs.writeFileSync(
      path.join(here, `${entry.id}.${stage}.native-receipt.json`),
      `${JSON.stringify(raw, null, 2)}\n`,
    );
  }
}
