#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");
const genbackApi = require("./row3_reduced_genback_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row3_class_group_transaction.py");
const SCHEMA = "sagejs.pari-class-group/row3-class-group-transaction-v1";
const PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b";
const GENBACK_SHA256 = "5e690a14cee61e849559eaf0a6fa3ca491d919d43fec1ab65e1fbb6c7dec4ce9";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row3ClassGroupTransactionFailure extends Error {}
function fail(message) { throw new Row3ClassGroupTransactionFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
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
  const parsed = spawnSync("python3", ["-c", program], { cwd: ROOT, input: bytes,
    encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  const required = ["genback-owner", "genback-sha256", "output-dir",
    "presentation-owner", "presentation-sha256"];
  if (Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail("wrong transaction arguments");
  return values;
}

function verifyOwner(owner, expectedAncestry = null) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-3 transaction schema");
  const ancestry = owner.ancestry || {};
  if (expectedAncestry && JSON.stringify(ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-3 transaction ancestry changed");
  if (Object.keys(ancestry).sort().join("\0") !==
      "genbackSha256\0presentationSha256\0sourceSha256" ||
      ancestry.presentationSha256 !== PRESENTATION_SHA256 ||
      ancestry.genbackSha256 !== GENBACK_SHA256 ||
      Object.values(ancestry).some(value => !DIGEST.test(value)))
    fail("row-3 transaction ancestry is incomplete");
  if (JSON.stringify(owner.requestJoin) !== JSON.stringify({ smithUirColumn: ["1", "-1"],
    genbackExponents: ["1", "-1"], matches: true })) fail("request join changed");
  const klass = owner.classGroup || {};
  if (klass.classNumber !== "6" || JSON.stringify(klass.invariants) !== '["6"]' ||
      klass.generatorCount !== 1 || JSON.stringify(integers(klass.generatorIdealHnf, 9,
        "generator ideal")) !== '["3839","0","2150","0","349","30","0","0","1"]')
    fail("final class state changed");
  const clg2 = owner.clg2 || {};
  if (JSON.stringify(integers(clg2.Ur, 4, "Ur")) !== '["-2","0","-3","0"]' ||
      JSON.stringify(integers(clg2.M1, 2, "M1")) !== '["2","-3"]' ||
      JSON.stringify(integers(clg2.M2, 4, "M2")) !== '["-1","1","-1","1"]' ||
      arraySha(integers(clg2.Ga, 21, "Ga")) !==
        "f5698dfbec5ac27551ec1354c89f9c30f6dd86e8e6c7dd5ae05dab524e0fa016" ||
      arraySha(integers(clg2.GD, 21, "GD")) !==
        "fb9114d56ceb0426647026f3a56be166b0b677651d30042cb9d251936b880243" ||
      JSON.stringify(clg2.Ge) !== JSON.stringify({ factorOffsets: [0, 1], factorKinds: [0],
        factorValues: ["1", "0", "0", "349"], factorExponents: ["1"] }))
    fail("clg2 changed");
  const arch = owner.archimedean || {};
  if (arraySha(integers(arch.terminalRelationLogs, 42, "terminal C")) !==
        "79b58240e4c6b3633a0397387ff15c33be918286d4f08edc85d83fd297b02516" ||
      arraySha(integers(arch.ga, 42, "ga")) !==
        "e51fcd02424c4104657711259885b51443c6de54763aec46cec0852bdd3f07b1" ||
      JSON.stringify(arch.cxlogState) !== "[0,1,-1,-1,1,0,0,0]" ||
      arch.rawLogsReplayed !== 675) fail("archimedean class state changed");
  const expectedTransforms = { D: ["6", "0", "0", "1"],
    U: ["-2", "1", "-3", "1"], Ui: ["1", "-1", "3", "-2"],
    V: ["2", "-3", "1", "-1"], Y: ["0", "-1", "0", "-1"],
    Uir: ["1", "-1", "0", "0"], X: ["0", "0", "-1", "1"] };
  if (JSON.stringify(owner.transform) !== JSON.stringify(expectedTransforms))
    fail("transaction transform changed");
  const final = { internalClassGroupComplete: true, generatorReduced: true,
    exactPrincipalWitnessInherited: true, exactOrderWitnessInherited: true,
    inputBoundary: "retained-presentation-owner", freshPreparedInputComplete: false,
    qualifiedTiming: false };
  if (JSON.stringify(owner.finalClassState) !== JSON.stringify(final) ||
      owner.stop?.code !== 1 ||
      owner.stop?.firstUnavailableOwner !== "authenticated class-and-unit correspondence authority")
    fail("retained-presentation stop changed");
  const completion = { classGroupGenComplete: true, clg2Complete: true,
    retainedPresentationComplete: true, freshPreparedInputComplete: false,
    unitsComplete: false, correspondenceComplete: false, publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion))
    fail("transaction completion changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`); const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row3-class-group-transaction-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable transaction changed");
  } else {
    const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}`;
    try { fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  if (options["presentation-sha256"] !== PRESENTATION_SHA256 ||
      options["genback-sha256"] !== GENBACK_SHA256) fail("wrong transaction owner digest");
  const presentationPath = path.resolve(options["presentation-owner"]);
  const genbackPath = path.resolve(options["genback-owner"]);
  const presentationBytes = fs.readFileSync(presentationPath);
  const genbackBytes = fs.readFileSync(genbackPath);
  if (sha(presentationBytes) !== PRESENTATION_SHA256 || sha(genbackBytes) !== GENBACK_SHA256 ||
      (fs.statSync(presentationPath).mode & 0o777) !== 0o444 ||
      (fs.statSync(genbackPath).mode & 0o777) !== 0o444) fail("transaction input changed");
  const presentation = strictParse(presentationBytes, "presentation");
  const genback = strictParse(genbackBytes, "genback");
  presentationApi.verifyOwner(presentation, presentation.ancestry);
  genbackApi.verifyOwner(genback, genback.ancestry);
  const ancestry = { presentationSha256: PRESENTATION_SHA256, genbackSha256: GENBACK_SHA256,
    sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import hashlib,importlib,json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate key: '+key)
  out[key]=value
 return out
paths=sys.argv[1:3]; expected=sys.argv[3:5]
data=[]
for path,digest in zip(paths,expected):
 raw=open(path,'rb').read()
 if hashlib.sha256(raw).hexdigest()!=digest: raise ValueError('owner changed')
 data.append(json.loads(raw,object_pairs_hook=strict))
ancestry=json.load(sys.stdin,object_pairs_hook=strict)
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_class_group_transaction')
json.dump(m.compose_row3_class_group_transaction(data[0],data[1],ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", "python3", "-c", program, presentationPath, genbackPath,
    PRESENTATION_SHA256, GENBACK_SHA256], { cwd: ROOT, input: JSON.stringify(ancestry),
    encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "transaction replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { GENBACK_SHA256, PRESENTATION_SHA256, Row3ClassGroupTransactionFailure,
  SCHEMA, publish, verifyOwner };
