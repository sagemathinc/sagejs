"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { atomicJson, acquireLock } = require("./runner.cjs");

function realDirectory(directory, create = false) {
  if (create) fs.mkdirSync(directory, { recursive: false });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) {
    throw new Error(`transaction directory must be canonical and link-free: ${directory}`);
  }
}
function exists(filename) {
  try { fs.lstatSync(filename); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

// The caller must hold the checkout mutation lease and ensure consumers are
// quiescent. Windows cannot atomically exchange two nonempty directories; the
// durable journal makes the short missing-target interval recoverable, not
// invisible. No previous or partially prepared directory is deleted here.
async function replaceDirectory({ parent, name, prepare, validate, checkpoint = () => {} }) {
  parent = path.resolve(parent);
  realDirectory(parent);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("unsafe transaction target name");
  const target = path.join(parent, name);
  const store = path.join(parent, `.transactions-${name}`);
  realDirectory(store, !exists(store));
  const unlock = acquireLock(path.join(store, "active.lock"));
  const journalPath = path.join(store, "active.json");
  let journal;
  const save = (phase) => {
    journal.phase = phase;
    atomicJson(journalPath, journal);
    atomicJson(path.join(store, journal.id, "journal.json"), journal);
    checkpoint(phase);
  };
  async function inspect(directory) {
    if (!exists(directory)) return { valid: false };
    // Unsafe filesystem objects are never treated as replaceable cache misses.
    realDirectory(directory);
    try { return { valid: true, value: await validate(directory) }; }
    catch (error) { return { valid: false, reason: error.message }; }
  }
  try {
    if (exists(journalPath)) {
      const stat = fs.lstatSync(journalPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe transaction journal");
      journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      if (journal.schema !== "sagejs.directory-transaction/v1" || journal.name !== name ||
          !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(journal.id || "") ||
          !["building", "ready", "replacing", "installed", "complete"].includes(journal.phase)) {
        throw new Error("invalid transaction journal; preserve and inspect it before recovery");
      }
      realDirectory(path.join(store, journal.id));
    }
    const current = await inspect(target);
    if (current.valid) {
      if (journal && journal.phase !== "complete") save("complete");
      return { directory: target, reused: true, retained: journal ? path.join(store, journal.id) : undefined, value: current.value };
    }
    let transaction = journal ? path.join(store, journal.id) : null;
    if (transaction && exists(path.join(transaction, "previous"))) {
      const previous = path.join(transaction, "previous");
      realDirectory(previous);
      // An interrupted/failed installation may have left a new bad target.
      // Keep it too, then restore the exact previous directory before retrying.
      if (exists(target)) {
        realDirectory(target);
        fs.renameSync(target, path.join(transaction, `failed-installed-${randomUUID()}`));
      }
      fs.renameSync(previous, target);
      checkpoint("restored");
    }
    let staged = transaction ? await inspect(path.join(transaction, "new")) : { valid: false };
    if (!staged.valid) {
      journal = { schema: "sagejs.directory-transaction/v1", name, id: randomUUID(), phase: "building" };
      transaction = path.join(store, journal.id);
      realDirectory(transaction, true);
      save("building");
      const pending = path.join(transaction, "new");
      realDirectory(pending, true);
      await prepare(pending);
      staged = await inspect(pending);
      if (!staged.valid) throw new Error(`prepared directory failed verification: ${staged.reason || "missing output"}`);
    }
    save("ready");
    save("replacing");
    if (exists(target)) {
      realDirectory(target);
      fs.renameSync(target, path.join(transaction, "previous"));
      checkpoint("previous-preserved");
    }
    fs.renameSync(path.join(transaction, "new"), target);
    save("installed");
    const installed = await inspect(target);
    if (!installed.valid) throw new Error(`installed directory failed verification: ${installed.reason || "missing output"}`);
    save("complete");
    return { directory: target, reused: false, retained: transaction, value: installed.value };
  } finally { unlock(); }
}

module.exports = { replaceDirectory, realDirectory, exists };
