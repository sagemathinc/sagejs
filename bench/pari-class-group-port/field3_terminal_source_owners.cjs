#!/usr/bin/env node
"use strict";

// Strict transactional publication for the two exact source owners consumed
// by field3_terminal_owner_adapters.cjs.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RELATION_SCHEMA = "sagejs.pari-class-group/field3-full-owner-authority-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/field3-live-class-suffix-owner-v1";
const DIGEST = /^[0-9a-f]{64}$/;

class Field3TerminalSourceFailure extends Error {}
function fail(message) { throw new Field3TerminalSourceFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function argsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length)
      fail("invalid arguments");
    const name = argv[index].slice(2);
    if (Object.hasOwn(result, name)) fail(`duplicate --${name}`);
    result[name] = argv[index + 1];
  }
  return result;
}

function requireExactly(options, names) {
  if (Object.keys(options).sort().join("\0") !== names.slice().sort().join("\0"))
    fail(`required arguments are ${names.map((name) => `--${name}`).join(", ")}`);
}

function authenticate(selected, expected, label) {
  if (!DIGEST.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(selected);
  if (!info.isFile() || (info.mode & 0o777) !== 0o444)
    fail(`${label} is not an immutable mode-0444 file`);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return path.resolve(selected);
}

function strictParse(bytes, label) {
  const program = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
if not isinstance(value,dict): raise ValueError('not an object')
json.dump(value,sys.stdout,separators=(',',':'))`;
  const parsed = spawnSync("python3", ["-c", program], {
    cwd: ROOT, input: bytes, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}

function replay(operation, files, digests) {
  const program = String.raw`import importlib,sys
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.field3_terminal_source_replay')
m.main(['field3_terminal_source_replay.py',*sys.argv[1:]])`;
  const run = spawnSync("python3", ["-c", program, operation, ...files, ...digests], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0)
    fail((run.stderr || `exact replay exited ${run.status}`).trim());
  return strictParse(Buffer.from(run.stdout), "exact replay output");
}

function publish(value, directory, prefix) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${prefix}-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        sha(fs.readFileSync(destination)) !== digest)
      fail("existing published owner changed");
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: value.schema, path: destination, sha256: digest, bytes: bytes.length };
}

function main(argv = process.argv) {
  const options = argsOf(argv);
  if (options.operation === "relation") {
    const required = ["operation", "authority", "authority-sha256", "live-join",
      "live-join-sha256", "output-dir"];
    requireExactly(options, required);
    const authority = authenticate(options.authority, options["authority-sha256"],
      "authority owner");
    const live = authenticate(options["live-join"], options["live-join-sha256"],
      "live class join");
    const value = replay("relation", [authority, live],
      [options["authority-sha256"], options["live-join-sha256"]]);
    if (value.schema !== RELATION_SCHEMA || value.exactOwners?.relationRecords?.length !== 86688 ||
        value.exactOwners?.principalGenerators?.length !== 1204 ||
        value.replay?.principalRelationsExact !== true)
      fail("relation replay returned an invalid owner");
    return publish(value, options["output-dir"], "field3-full-owner-authority");
  }
  if (options.operation === "class") {
    const required = ["operation", "full15", "full15-sha256", "relation",
      "relation-sha256", "authority", "authority-sha256", "live-join",
      "live-join-sha256", "raw-owner", "raw-owner-sha256", "protocol-owner",
      "protocol-owner-sha256", "output-dir"];
    requireExactly(options, required);
    const full15 = authenticate(options.full15, options["full15-sha256"], "full15 owner");
    const relation = authenticate(options.relation, options["relation-sha256"],
      "relation authority");
    const authority = authenticate(options.authority, options["authority-sha256"],
      "authority owner");
    const live = authenticate(options["live-join"], options["live-join-sha256"],
      "live class join");
    const raw = authenticate(options["raw-owner"], options["raw-owner-sha256"],
      "raw logarithm owner");
    const protocol = authenticate(options["protocol-owner"],
      options["protocol-owner-sha256"], "local HNF protocol owner");
    const value = replay("class", [full15, relation, authority, live, raw, protocol],
      [options["full15-sha256"], options["relation-sha256"],
        options["authority-sha256"], options["live-join-sha256"],
        options["raw-owner-sha256"], options["protocol-owner-sha256"]]);
    if (value.schema !== CLASS_SCHEMA || value.B?.length !== 572 ||
        value.W?.length !== 4 || value.packedC?.length !== 42 ||
        value.Vbase?.length !== 2 || value.replay?.smithExact !== true ||
        value.replay?.terminalBExact !== true ||
        value.replay?.principalFactorsExact !== true)
      fail("class replay returned an invalid owner");
    return publish(value, options["output-dir"], "field3-live-class-suffix-owner");
  }
  fail("--operation must be relation or class");
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { CLASS_SCHEMA, Field3TerminalSourceFailure, RELATION_SCHEMA,
  authenticate, main, publish };
