"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const { identity, snapshot, acquireLock, fileDigest, atomicJson } = require("./runner.cjs");
const { ownerState } = require("./status.cjs");
const { parseTestMetadata } = require("../test-metadata.cjs");

const schema = "sagejs.test-checkpoint/v1";
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (filename) => { try { return JSON.parse(fs.readFileSync(filename, "utf8")); } catch { return null; } };

// Local scheduling hints only. Opt-in metadata asserts isolated/read-only
// inputs, no mutable setup consumed by siblings, and a complete list of ignored
// generated dependencies. Absence of that assertion always means execute.
function openCheckpoints({ root, files, runnerArguments = [], concurrency,
  environment = process.env, fresh = false }) {
  const candidate = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = identity(root, candidate);
  const directory = path.join(root, "build/release-test-checkpoints");
  fs.mkdirSync(directory, { recursive: true });
  const unlock = acquireLock(path.join(directory, "active.lock"));
  try {
    const owner = { pid: process.pid, host: os.hostname() };
    const base = { schema, source, root: fs.realpathSync(root), node: process.version, nodeExecutable: fileDigest(process.execPath),
      host: owner.host, platform: process.platform, arch: process.arch, runnerArguments, concurrency,
      // Do not serialize secrets into receipts. Even seemingly incidental env
      // changes invalidate conservatively until their influence is audited.
      environment: digest(Object.entries(environment).sort(([a], [b]) => a.localeCompare(b))) };
    const groups = new Map();
    const eligible = new Map();
    const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0"));
    for (const file of files) {
      if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file) || file.split("/").some((part) => part === "." || part === "..")) {
        throw new Error(`unsafe checkpoint test path: ${file}`);
      }
      if (!tracked.has(file)) throw new Error(`checkpoint test is not tracked: ${file}`);
      const { resumeInputs } = parseTestMetadata(fs.readFileSync(path.join(root, file), "utf8"), file);
      if (resumeInputs === undefined) continue;
      const inputs = [...resumeInputs].sort();
      const groupId = digest(inputs);
      if (!groups.has(groupId)) groups.set(groupId, { inputs, hash: snapshot(root, inputs) });
      const key = digest({ ...base, file, inputs, artifacts: groups.get(groupId).hash });
      eligible.set(file, { key, filename: path.join(directory, "files", `${key}.json`) });
    }
    const attempt = { schema, id: randomUUID(), source, owner, state: "collecting",
      started: new Date().toISOString(), baseDigest: digest(base), eligibleFiles: [...eligible.keys()] };
    const attemptPath = path.join(directory, "attempts", `${attempt.id}.json`);
    atomicJson(attemptPath, attempt);
    let closed = false;
    return {
      eligibleFiles: [...eligible.keys()],
      reusable(file) {
        if (closed) throw new Error("checkpoint session is closed");
        const entry = eligible.get(file);
        if (fresh || !entry) return null;
        const record = readJson(entry.filename);
        if (record?.schema !== schema || record.key !== entry.key || record.status !== "passed" ||
            record.file !== file || !Number.isFinite(record.durationMilliseconds) || record.durationMilliseconds < 0 ||
            !/^[0-9a-f-]{36}$/.test(record.attempt || "")) return null;
        const previous = readJson(path.join(directory, "attempts", `${record.attempt}.json`));
        if (previous?.schema !== schema || previous.id !== record.attempt || previous.baseDigest !== attempt.baseDigest) return null;
        // A killed controller can leave normally completed files. Current
        // source/artifact hashes provide their after-execution comparison. A
        // stale lock still requires manual orphan inspection; we never remove
        // it or infer that children died from the parent's disappearance.
        if (previous.state !== "verified" && !(previous.state === "collecting" && ownerState(previous.owner) === "missing")) return null;
        return record;
      },
      started(file) {
        if (closed) throw new Error("checkpoint session is closed");
        const entry = eligible.get(file);
        if (!entry) return;
        // A failed fresh attempt must supersede an older pass, not leave it
        // available for the next retry to conceal the newly observed failure.
        atomicJson(entry.filename, { schema, key: entry.key, file, attempt: attempt.id, status: "running" });
      },
      passed(file, durationMilliseconds) {
        if (closed) throw new Error("checkpoint session is closed");
        const entry = eligible.get(file);
        if (!entry) return;
        atomicJson(entry.filename, { schema, key: entry.key, file, attempt: attempt.id,
          status: "passed", durationMilliseconds, completed: new Date().toISOString() });
      },
      finish() {
        if (closed) return;
        closed = true;
        let safeToUnlock = true;
        try {
          identity(root, candidate);
          for (const { inputs, hash } of groups.values()) {
            if (snapshot(root, inputs) !== hash) throw new Error("test checkpoint inputs changed during execution");
          }
          attempt.state = "verified";
          atomicJson(attemptPath, attempt);
        } catch (error) {
          attempt.state = "invalidated";
          try { atomicJson(attemptPath, attempt); }
          catch {
            // Renaming the existing authority record needs no new file data
            // allocation. If even that fails, retain the lease: a collecting
            // record must not later look like an innocently killed controller.
            try { fs.renameSync(attemptPath, `${attemptPath}.invalidated`); }
            catch (renameError) {
              if (renameError.code !== "ENOENT") {
                safeToUnlock = false;
                throw new Error(`cannot invalidate checkpoint attempt; quarantine ${directory} before recovery`, { cause: error });
              }
            }
          }
          throw error;
        } finally { if (safeToUnlock) unlock(); }
      },
    };
  } catch (error) { unlock(); throw error; }
}

module.exports = { openCheckpoints };
