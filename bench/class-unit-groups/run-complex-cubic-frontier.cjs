#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inspectBuildReceipt } = require("../../scripts/build-receipt.cjs");

const {
  ADAPTER_SCHEMA,
  BOUNDARIES,
  CENSUS_SCHEMA,
  CENSUS_STATUSES,
  SYSTEMS,
  TERMINAL_STATUSES,
  TIMING_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateAdapterResponse,
  validateTimingEvent,
} = require("./complex-cubic-frontier-schema.cjs");
const {
  loadFrozenSurveyCorpus,
} = require("./load-complex-cubic-frontier-survey.cjs");

const ROOT = path.resolve(__dirname, "../..");
const READY_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_READY";
const RESPONSE_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_RESPONSE|";
const RUNTIME_IDENTITY_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-runtime-identity-v1";
const GP_CENSUS_MARKER = "SAGEJS_COMPLEX_CUBIC_GP_CENSUS|";
const GP_TIMING_MARKER = "SAGEJS_COMPLEX_CUBIC_GP_TIMING|";
const MINIMUM_ROOT_NS = 1_200_000_000n;
const RETAINED_ROUNDS = 11;
const THREAD_ENV = Object.freeze({
  OPENBLAS_NUM_THREADS: "1",
  OMP_NUM_THREADS: "1",
  MKL_NUM_THREADS: "1",
  BLIS_NUM_THREADS: "1",
  VECLIB_MAXIMUM_THREADS: "1",
  NUMEXPR_NUM_THREADS: "1",
  JULIA_NUM_THREADS: "1",
  FLINT_NUM_THREADS: "1",
});

function usage() {
  return `Usage: node ${path.relative(ROOT, __filename)} MODE --corpus PATH --output PATH [options]

Modes:
  --census              classify all 1,000 fields; timings are non-authoritative
  --timing              run the retained 20 x 50 x 11 timing protocol

Required for --timing:
  --census-file PATH    accepted census from the identical corpus and source tree

Options:
  --corpus PATH        committed content-addressed corpus manifest
  --asset-dir PATH     directory containing the survey asset (default: manifest directory)
  --systems LIST        comma-separated systems (default: sagejs,pari)
  --boundaries LIST     scalar-prepared,fresh-complete (default: both)
  --cpu N               logical CPU used through taskset on Linux (default: 0)
  --timeout-seconds N   fresh process/system/round timeout (default: 3600)
  --sagejs PATH         Sage.js launcher (default: bin/sagejs)
  --gp PATH             direct GP launcher (default: gp)
  --adapter SYSTEM=PATH generic JSON adapter; repeatable (required for Magma/Hecke)
  --allow-dirty         permit exploratory output, marked non-promotable
  --dry-run             validate and emit the complete execution plan only
  --help                show this text

Conditional semantics are fixed: Sage.js calls K.class_number(proof=False),
direct GP calls bnfinit(...,0), Magma adapters attest Proof := "GRH", and Hecke
adapters attest class_group(...; GRH=true). No timeout cap is recorded as time.`;
}

function parseList(value, allowed, label) {
  const result = String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  if (result.length === 0 || new Set(result).size !== result.length ||
      result.some((entry) => !allowed.includes(entry))) {
    throw new Error(`${label} must be a unique subset of ${allowed.join(",")}`);
  }
  return result;
}

function positiveInteger(value, label, { zero = false } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < (zero ? 0 : 1)) {
    throw new Error(`${label} must be a ${zero ? "nonnegative" : "positive"} integer`);
  }
  return result;
}

function parseArguments(argv) {
  const options = {
    mode: null,
    corpus: null,
    assetDir: null,
    censusFile: null,
    output: null,
    systems: ["sagejs", "pari"],
    boundaries: [...BOUNDARIES],
    cpu: 0,
    timeoutSeconds: 3600,
    sagejs: process.env.SAGEJS_FRONTIER_EXECUTABLE || path.join(ROOT, "bin/sagejs"),
    gp: process.env.GP_ORACLE || process.env.PARI_ORACLE || "gp",
    adapters: {},
    allowDirty: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--census" || argument === "--timing") {
      if (options.mode) throw new Error("choose exactly one mode");
      options.mode = argument.slice(2);
      continue;
    }
    if (argument === "--allow-dirty") { options.allowDirty = true; continue; }
    if (argument === "--dry-run") { options.dryRun = true; continue; }
    if (!["--corpus", "--asset-dir", "--census-file", "--output", "--systems", "--boundaries",
      "--cpu", "--timeout-seconds", "--sagejs", "--gp", "--adapter"].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
    const value = argv[(index += 1)];
    if (argument === "--corpus") options.corpus = path.resolve(value);
    else if (argument === "--asset-dir") options.assetDir = path.resolve(value);
    else if (argument === "--census-file") options.censusFile = path.resolve(value);
    else if (argument === "--output") options.output = path.resolve(value);
    else if (argument === "--systems") options.systems = parseList(value, SYSTEMS, argument);
    else if (argument === "--boundaries") options.boundaries = parseList(value, BOUNDARIES, argument);
    else if (argument === "--cpu") options.cpu = positiveInteger(value, argument, { zero: true });
    else if (argument === "--timeout-seconds") options.timeoutSeconds = positiveInteger(value, argument);
    else if (argument === "--sagejs") options.sagejs = value;
    else if (argument === "--gp") options.gp = value;
    else {
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error("--adapter must be SYSTEM=PATH");
      const system = value.slice(0, separator);
      if (!SYSTEMS.includes(system)) throw new Error(`unknown adapter system ${system}`);
      options.adapters[system] = path.resolve(value.slice(separator + 1));
    }
  }
  if (!options.mode || !options.corpus || !options.output) {
    throw new Error("one mode, --corpus, and --output are required");
  }
  if (options.mode === "timing" && !options.censusFile) {
    throw new Error("--timing requires --census-file");
  }
  if (!options.systems.includes("sagejs") || !options.systems.includes("pari")) {
    throw new Error("frontier evidence requires both sagejs and pari");
  }
  return options;
}

function resolveExecutable(requested) {
  if (!requested) return null;
  const bases = requested.includes("/") || requested.includes("\\")
    ? [path.resolve(requested)]
    : (process.env.PATH || "").split(path.delimiter).map((directory) => path.join(directory, requested));
  for (const candidate of bases) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function sourceIdentity(allowDirty = false) {
  const run = (args) => childProcess.execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const commit = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  const dirty = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty && !allowDirty) throw new Error("frontier evidence requires a clean Git worktree");
  const build = inspectBuildReceipt(ROOT);
  const receiptPath = path.join(ROOT, "dist/build-receipt.json");
  return {
    candidate_commit: commit,
    candidate_tree: tree,
    clean: dirty === "",
    promotion_eligible: dirty === "" && build.current,
    source_closure_sha256: sha256(`git-tree:${tree}`),
    build_receipt: {
      current: build.current,
      reason: build.reason,
      path: fs.existsSync(receiptPath) ? receiptPath : null,
      sha256: fs.existsSync(receiptPath) ? sha256(fs.readFileSync(receiptPath)) : null,
    },
  };
}

function hostIdentity(cpu) {
  const cpus = os.cpus();
  if (cpu >= cpus.length) throw new Error(`logical CPU ${cpu} does not exist on this host`);
  return {
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    total_memory_bytes: String(os.totalmem()),
    logical_cpu_count: cpus.length,
    selected_logical_cpu: cpu,
    selected_cpu_model: cpus[cpu].model,
    node: process.version,
    thread_environment: THREAD_ENV,
  };
}

const PORTABLE_CORPUS_IDENTITY_KEYS = Object.freeze([
  "manifest_id",
  "manifest_file_sha256",
  "survey_asset_filename",
  "survey_asset_gzip_sha256",
  "survey_asset_records_sha256",
  "labels_sha256",
  "records_sha256",
  "record_count",
]);

function portableCorpusIdentity(corpus) {
  return {
    manifest_id: corpus.manifest.id,
    manifest_file_sha256: corpus.manifest.file_sha256,
    survey_asset_filename: corpus.survey_asset.filename,
    survey_asset_gzip_sha256: corpus.survey_asset.gzip_sha256,
    survey_asset_records_sha256: corpus.survey_asset.records_sha256,
    labels_sha256: corpus.digests.labels_sha256,
    records_sha256: corpus.digests.records_sha256,
    record_count: corpus.records.length,
  };
}

function corpusIdentity(filename, corpus) {
  const portable = portableCorpusIdentity(corpus);
  return {
    manifest_path: filename,
    ...portable,
    identity_sha256: canonicalDigest(portable),
  };
}

function corpusIdentitiesMatch(recorded, current) {
  if (!recorded || !current || typeof recorded !== "object" || typeof current !== "object") {
    return false;
  }
  const project = (identity) => Object.fromEntries(
    PORTABLE_CORPUS_IDENTITY_KEYS.map((key) => [key, identity[key]]),
  );
  const recordedPortable = project(recorded);
  const currentPortable = project(current);
  return recorded.identity_sha256 === canonicalDigest(recordedPortable) &&
    current.identity_sha256 === canonicalDigest(currentPortable) &&
    recorded.identity_sha256 === current.identity_sha256;
}

function toolPlan(options) {
  return options.systems.map((system) => {
    const requested = options.adapters[system] || (system === "sagejs" ? options.sagejs :
      system === "pari" ? options.gp : null);
    const executable = resolveExecutable(requested);
    let version = null;
    if (executable) {
      if (system === "sagejs" && !options.adapters[system]) {
        try { version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"))).version; } catch {}
      } else if (system === "pari" && !options.adapters[system]) {
        try {
          const probe = childProcess.spawnSync(executable, ["--version"], {
            encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
          });
          if (probe.error || probe.status !== 0) throw probe.error || new Error("nonzero exit");
          version = `${probe.stdout || ""}\n${probe.stderr || ""}`
            .split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "version-probe-failed";
        } catch {
          version = "version-probe-failed";
        }
      } else version = "external-protocol-adapter";
    }
    return {
      system,
      adapter_kind: options.adapters[system] ? "json-protocol" :
        system === "sagejs" ? "generated-sagejs-python" :
          system === "pari" ? "generated-direct-gp" : "missing",
      requested,
      executable,
      executable_sha256: executable ? sha256(fs.readFileSync(executable)) : null,
      version,
      status: executable ? "available" : "unavailable",
    };
  });
}

function systemOrder(round, systems = SYSTEMS) {
  const offset = round % systems.length;
  return [...systems.slice(offset), ...systems.slice(0, offset)];
}

function shardRecords(corpus) {
  const shards = Array.from({ length: 20 }, () => []);
  for (const record of corpus.records) shards[record.selection.shard].push(record);
  return shards;
}

function pythonLiteral(value) {
  return JSON.stringify(value);
}

function sageCensusSource(records) {
  const fields = records.map((record) => ({ label: record.label, coefficients: record.coefficients }));
  return `import hashlib
import json

records = json.loads(${pythonLiteral(JSON.stringify(fields))})
R = PolynomialRing(QQ, "x")
x = R.gen()
print(${pythonLiteral(READY_MARKER)}, flush=True)
payload = []
for record in records:
    try:
        polynomial = sum(int(value) * x**index for index, value in enumerate(record["coefficients"]))
        field = NumberField(polynomial, "a_" + record["label"].replace(".", "_"))
        discriminant = str(field.maximal_order().discriminant())
        class_number = str(field.class_number(proof=False))
        receipt = getattr(field, "_native_cubic_class_number_certificate", None)
        if receipt is not None:
            invariants = [str(value) for value in receipt.invariants]
            authenticated = bool(receipt.matches(field))
            receipt_payload = receipt.to_dict()
            receipt_digest = hashlib.sha256(json.dumps(
                receipt_payload, sort_keys=True, separators=(",", ":")
            ).encode()).hexdigest()
            replay = bool(receipt.verify(field))
            proof_status = receipt.proof_status
            status = "native-pass" if authenticated and replay else "native-certificate-failure"
            fallback_verified = None
        else:
            computation = field.class_unit_group(proof=False)
            group = computation.class_group() if computation.complete else None
            invariants = [] if group is None else [str(value) for value in group.invariants()]
            fallback_verified = bool(computation.complete and group.verify())
            authenticated = None
            replay = None
            receipt_payload = None
            receipt_digest = None
            proof_status = computation.proof_status
            status = "native-decline-fallback-pass" if fallback_verified else "fallback-proof-failure"
        payload.append({
            "label": record["label"], "status": status, "discriminant": discriminant,
            "class_number": class_number, "class_group_invariants": invariants,
            "proof_status": proof_status, "native_receipt_authenticated": authenticated,
            "independent_exact_replay": replay, "fallback_verified": fallback_verified,
            "receipt_digest": receipt_digest, "receipt": receipt_payload,
        })
    except Exception as error:
        payload.append({"label": record["label"], "status": "error", "reason": type(error).__name__ + ": " + str(error)})
print(${pythonLiteral(RESPONSE_MARKER)} + json.dumps({
    "schema": ${pythonLiteral(ADAPTER_SCHEMA)}, "mode": "census", "system": "sagejs",
    "status": "ok", "proof": "conditional-grh", "payload": {"records": payload},
}, sort_keys=True, separators=(",", ":")), flush=True)
`;
}

function sageTimingSource(corpus, boundaries, round, minimumRootNs = MINIMUM_ROOT_NS) {
  const fields = corpus.records.map((record) => ({
    label: record.label, coefficients: record.coefficients, shard: record.selection.shard,
  }));
  const warmups = corpus.warmups.map((record) => ({ label: record.label, coefficients: record.coefficients }));
  return `import json
import time

records = json.loads(${pythonLiteral(JSON.stringify(fields))})
warmups = json.loads(${pythonLiteral(JSON.stringify(warmups))})
boundaries = json.loads(${pythonLiteral(JSON.stringify(boundaries))})
minimum_ns = ${minimumRootNs.toString()}
R = PolynomialRing(QQ, "x")
x = R.gen()

def fresh(record, suffix):
    polynomial = sum(int(value) * x**index for index, value in enumerate(record["coefficients"]))
    field = NumberField(polynomial, "a_" + record["label"].replace(".", "_") + "_" + suffix)
    field.maximal_order()
    return field

def run_batch(shard, boundary, iterations, serial):
    prepared = None
    if boundary == "scalar-prepared":
        prepared = [[fresh(record, "p_%s_%s_%s" % (serial, repeat, index))
                     for index, record in enumerate(shard)] for repeat in range(iterations)]
    all_answers = []
    per_field = [0] * len(shard)
    root_started = time.perf_counter_ns()
    for repeat in range(iterations):
        current = []
        for index, record in enumerate(shard):
            field_started = time.perf_counter_ns()
            field = prepared[repeat][index] if prepared is not None else fresh(
                record, "f_%s_%s_%s" % (serial, repeat, index))
            value = int(field.class_number(proof=False))
            per_field[index] += time.perf_counter_ns() - field_started
            current.append(str(value))
        all_answers.append(current)
    root_ns = time.perf_counter_ns() - root_started
    return root_ns, all_answers, per_field

print(${pythonLiteral(READY_MARKER)}, flush=True)
for index, record in enumerate(warmups):
    assert int(fresh(record, "warm_%s" % index).class_number(proof=False)) >= 1

shards = [[record for record in records if record["shard"] == shard] for shard in range(20)]
events = []
serial = 0
for boundary in boundaries:
    for shard_index, shard in enumerate(shards):
        iterations = 1
        while True:
            serial += 1
            calibration_ns, ignored, ignored_fields = run_batch(shard, boundary, iterations, serial)
            if calibration_ns >= minimum_ns:
                break
            iterations *= 2
            if iterations > 1048576:
                raise RuntimeError("calibration exceeded the repetition safety limit")
        while True:
            serial += 1
            root_ns, answers, per_field = run_batch(shard, boundary, iterations, serial)
            if root_ns >= minimum_ns:
                break
            iterations *= 2
            if iterations > 1048576:
                raise RuntimeError("retained repetition safety limit exceeded")
        first = answers[0]
        if any(answer != first for answer in answers):
            raise ArithmeticError("repeated class numbers changed within a retained shard")
        events.append({
            "boundary": boundary, "shard": shard_index, "iterations": iterations,
            "record_count": len(shard), "root_nanoseconds": str(root_ns),
            "answers": first,
            "per_field_nanoseconds": [str(value // iterations) for value in per_field],
        })
print(${pythonLiteral(RESPONSE_MARKER)} + json.dumps({
    "schema": ${pythonLiteral(ADAPTER_SCHEMA)}, "mode": "timing", "system": "sagejs",
    "status": "ok", "proof": "conditional-grh", "payload": {"round": ${round}, "events": events},
}, sort_keys=True, separators=(",", ":")), flush=True)
`;
}

function gpPolynomial(record) {
  for (const coefficient of record.coefficients) {
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(coefficient)) throw new Error("unsafe GP coefficient");
  }
  return `Polrev([${record.coefficients.join(",")}])`;
}

function pariCensusSource(records, proof = "conditional-grh") {
  const flag = proof === "conditional-grh" ? 0 : 1;
  const certify = proof === "unconditional"
    ? "if(!bnfcertify(bnf,0), error(\"bnfcertify(bnf,0) returned false\"));" : "";
  const lines = [
    "default(parisizemax, 8589934592);",
    "allocatemem(1073741824);",
    `print("${READY_MARKER}");`,
  ];
  for (const record of records) {
    if (!/^[0-9.]+$/.test(record.label)) throw new Error(`unsafe GP label ${record.label}`);
    lines.push(`P=${gpPolynomial(record)};bnf=bnfinit(P,${flag});${certify}print("${GP_CENSUS_MARKER}${record.label}|",bnf.disc,"|",bnf.no,"|",Str(bnf.cyc));`);
  }
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function pariTimingSource(corpus, boundaries, round, minimumRootNs = MINIMUM_ROOT_NS) {
  const shards = shardRecords(corpus);
  const lines = [
    "default(parisizemax, 8589934592);",
    "allocatemem(1073741824);",
    `sagejs_run_batch(C,boundary,iterations)={my(prepared=List(),answers=vector(#C),per=vector(#C),position=1,bnf,P,t,root);if(boundary==0,for(repeat=1,iterations,for(i=1,#C,listput(prepared,nfinit(Polrev(C[i]))))));root=getwalltime();for(repeat=1,iterations,for(i=1,#C,t=getwalltime();if(boundary==0,bnf=bnfinit(prepared[position],0);position++,P=Polrev(C[i]);bnf=bnfinit(P,0));per[i]+=getwalltime()-t;if(repeat==iterations,answers[i]=[bnf.no,bnf.cyc])));root=getwalltime()-root;[root,answers,per]};`,
    `print("${READY_MARKER}");`,
  ];
  for (const warmup of corpus.warmups) {
    lines.push(`bnfinit(${gpPolynomial(warmup)},0);`);
  }
  boundaries.forEach((boundary) => {
    const boundaryCode = boundary === "scalar-prepared" ? 0 : 1;
    shards.forEach((records, shard) => {
      const coefficients = `[${records.map((record) =>
        `[${record.coefficients.join(",")}]`).join(",")}]`;
      lines.push(`C=${coefficients};iterations=1;cal=sagejs_run_batch(C,${boundaryCode},iterations);while(cal[1]*1000000<${minimumRootNs.toString()},iterations*=2;if(iterations>1048576,error("calibration exceeded repetition safety limit"));cal=sagejs_run_batch(C,${boundaryCode},iterations));ret=sagejs_run_batch(C,${boundaryCode},iterations);while(ret[1]*1000000<${minimumRootNs.toString()},iterations*=2;if(iterations>1048576,error("retained repetition safety limit exceeded"));ret=sagejs_run_batch(C,${boundaryCode},iterations));print("${GP_TIMING_MARKER}${boundary}|${shard}|",iterations,"|",ret[1]*1000000,"|",Str(ret[2]),"|",Str(ret[3]));`);
    });
  });
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function protocolRequest(corpus, mode, system, options = {}) {
  return {
    schema: "sagejs.benchmark/complex-cubic-frontier-adapter-request-v1",
    mode,
    system,
    proof: "conditional-grh",
    proof_setting: system === "magma" ? "Proof := \"GRH\"" :
      system === "hecke" ? "class_group(...; GRH=true)" : null,
    boundaries: options.boundaries ?? [],
    round: options.round ?? null,
    minimum_retained_root_nanoseconds: MINIMUM_ROOT_NS.toString(),
    warmups: corpus.warmups,
    shards: shardRecords(corpus),
  };
}

function parseGpCensus(stdout, records) {
  const byLabel = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(GP_CENSUS_MARKER)) continue;
    const [label, discriminant, classNumber, invariantsText] = line.slice(GP_CENSUS_MARKER.length).split("|");
    byLabel.set(label, {
      label, status: "ok", discriminant, class_number: classNumber,
      class_group_invariants: normalizePariInvariants(JSON.parse(invariantsText)),
      proof_status: "exact-relations-conditional-grh",
    });
  }
  return {
    schema: ADAPTER_SCHEMA, mode: "census", system: "pari", proof: "conditional-grh",
    status: byLabel.size === records.length ? "ok" : "error",
    payload: { records: records.map((record) => byLabel.get(record.label) || {
      label: record.label, status: "error", reason: "direct GP emitted no census record",
    }) },
  };
}

function normalizePariInvariants(values) {
  if (!Array.isArray(values)) throw new Error("PARI class-group invariants are malformed");
  const normalized = values.map(String).reverse();
  let previous = 1n;
  for (const value of normalized) {
    if (!/^[1-9][0-9]*$/.test(value) || BigInt(value) < 2n || BigInt(value) % previous !== 0n) {
      throw new Error("PARI class-group invariants are not divisibility ordered");
    }
    previous = BigInt(value);
  }
  return normalized;
}

function parseGpTiming(stdout, corpus, boundaries, round) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(GP_TIMING_MARKER)) continue;
    const [boundary, shardText, iterationsText, rootNs, answersText, perFieldText] =
      line.slice(GP_TIMING_MARKER.length).split("|");
    const answers = JSON.parse(answersText).map(([classNumber, invariants]) => ({
      class_number: String(classNumber),
      class_group_invariants: normalizePariInvariants(invariants),
    }));
    const iterations = Number(iterationsText);
    events.push({
      boundary,
      shard: Number(shardText),
      iterations,
      record_count: answers.length,
      root_nanoseconds: rootNs,
      answers,
      per_field_nanoseconds: JSON.parse(perFieldText).map((milliseconds) =>
        String(Math.trunc(Number(milliseconds) * 1_000_000 / iterations))),
    });
  }
  const expected = boundaries.length * 20;
  return {
    schema: ADAPTER_SCHEMA, mode: "timing", system: "pari", proof: "conditional-grh",
    status: events.length === expected ? "ok" : "error", payload: { round, events },
  };
}

function makeTimingEvent(raw, system, round, orderPosition, corpus) {
  const records = shardRecords(corpus)[raw.shard];
  if (!BOUNDARIES.includes(raw.boundary) || !Number.isSafeInteger(raw.iterations) ||
      raw.iterations < 1 || raw.record_count !== records.length) {
    throw new Error(`${system} emitted a malformed retained timing event`);
  }
  const expected = records.map((record) => ({
    class_number: record.class_number, class_group_invariants: record.class_group_invariants,
  }));
  const rawAnswers = raw.answers.map((value) => typeof value === "string"
    ? { class_number: value }
    : value);
  for (let index = 0; index < expected.length; index += 1) {
    if (rawAnswers[index]?.class_number !== expected[index].class_number) {
      throw new Error(`${system} timing answer disagrees at ${records[index].label}`);
    }
    if (rawAnswers[index]?.class_group_invariants &&
        JSON.stringify(rawAnswers[index].class_group_invariants) !==
          JSON.stringify(expected[index].class_group_invariants)) {
      throw new Error(`${system} timing invariants disagree at ${records[index].label}`);
    }
  }
  const answerDigest = canonicalDigest(rawAnswers);
  return validateTimingEvent({
    round,
    order_position: orderPosition,
    system,
    boundary: raw.boundary,
    shard: raw.shard,
    proof: "conditional-grh",
    status: "ok",
    iterations: raw.iterations,
    record_count: records.length,
    root_nanoseconds: raw.root_nanoseconds,
    root_source: "one-contiguous-monotonic-timer",
    phase_sum_used: false,
    digest_inside_root: false,
    answer_digest: answerDigest,
    per_field_nanoseconds: raw.per_field_nanoseconds,
  });
}

function splitLines(state, chunk, onLine) {
  state.buffer += chunk;
  while (true) {
    const newline = state.buffer.indexOf("\n");
    if (newline < 0) break;
    const line = state.buffer.slice(0, newline).replace(/\r$/, "");
    state.buffer = state.buffer.slice(newline + 1);
    onLine(line);
  }
}

function runFreshProcess(spec, options = {}) {
  const nowNs = options.nowNs || (() => process.hrtime.bigint());
  const spawn = options.spawn || childProcess.spawn;
  return new Promise((resolve) => {
    const launched = nowNs();
    const child = spawn(spec.executable, spec.args, {
      cwd: ROOT,
      env: { ...process.env, ...THREAD_ENV, ...spec.env },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutState = { buffer: "" };
    let stdout = "";
    let stderr = "";
    let ready = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && Number.isSafeInteger(child.pid)) {
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // Fall back to the immediate child if its process group has already exited.
        }
      }
      child.kill("SIGKILL");
    }, spec.timeoutSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      splitLines(stdoutState, text, (line) => {
        if (line === READY_MARKER && ready === null) ready = nowNs();
      });
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "error", reason: error.message, stdout, stderr, launched, ready, ended: nowNs() });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ended = nowNs();
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "ok" : "error",
        reason: timedOut ? "wall timeout" : code === 0 ? null : `exit ${code}, signal ${signal}`,
        stdout, stderr, launched, ready, ended,
      });
    });
    child.stdin.end(spec.input);
  });
}

function pinnedSpec(executable, args, input, options) {
  const taskset = process.platform === "linux" ? resolveExecutable("taskset") : null;
  if (!taskset) throw new Error("retained frontier evidence requires Linux taskset affinity");
  const time = fs.existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
  if (!time) throw new Error("retained frontier evidence requires /usr/bin/time for peak RSS");
  return {
    executable: time,
    args: ["-f", "SAGEJS_COMPLEX_CUBIC_FRONTIER_MAX_RSS_KIB|%M", taskset,
      "-c", String(options.cpu), executable, ...args],
    input,
    env: {},
    timeoutSeconds: options.timeoutSeconds,
  };
}

function responseFromStdout(stdout) {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(RESPONSE_MARKER));
  if (!line) throw new Error("adapter emitted no response marker");
  return JSON.parse(line.slice(RESPONSE_MARKER.length));
}

function recordLabelsDigest(records) {
  return sha256(`${records.map((record) => record.label).join("\n")}\n`);
}

function validateIdentityArtifact(artifact, label) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact) ||
      typeof artifact.role !== "string" || artifact.role.length === 0 ||
      typeof artifact.path !== "string" || !path.isAbsolute(artifact.path) ||
      !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 ||
      typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      (artifact.file_count !== undefined &&
        (!Number.isSafeInteger(artifact.file_count) || artifact.file_count <= 0))) {
    throw new Error(`${label} is malformed`);
  }
  return artifact;
}

function runtimeClosureDigest(identity) {
  const {
    identity_sha256: _identityDigest,
    generated_program_sha256: _programDigest,
    ...closure
  } = identity;
  return canonicalDigest(closure);
}

function validateRuntimeIdentity(identity, system, expectedProgramSha256 = null) {
  const expectedProofSetting = system === "magma"
    ? 'ClassGroup(order : Proof := "GRH")'
    : system === "hecke"
      ? "class_group(order; GRH=true, redo=true)"
      : null;
  if (!identity || typeof identity !== "object" || Array.isArray(identity) ||
      identity.schema !== RUNTIME_IDENTITY_SCHEMA || identity.system !== system ||
      typeof identity.version !== "string" || identity.version.length === 0 ||
      typeof identity.executable !== "string" || !path.isAbsolute(identity.executable) ||
      identity.proof_setting !== expectedProofSetting ||
      typeof identity.proof_semantics !== "string" || identity.proof_semantics.length === 0 ||
      !identity.environment || typeof identity.environment !== "object" ||
      Array.isArray(identity.environment) ||
      !Array.isArray(identity.artifacts) || identity.artifacts.length === 0 ||
      typeof identity.generated_program_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(identity.generated_program_sha256) ||
      typeof identity.identity_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(identity.identity_sha256)) {
    throw new Error(`${system} emitted a malformed runtime identity`);
  }
  const artifacts = [
    ...identity.artifacts.map((artifact, index) =>
      validateIdentityArtifact(artifact, `${system} runtime identity artifact ${index}`)),
    validateIdentityArtifact(identity.adapter, `${system} runtime identity adapter`),
    validateIdentityArtifact(identity.helper, `${system} runtime identity helper`),
  ];
  const roles = artifacts.map((artifact) => artifact.role);
  if (new Set(roles).size !== roles.length || identity.adapter.role !== "protocol-adapter" ||
      identity.helper.role !== "protocol-helper") {
    throw new Error(`${system} emitted duplicate or invalid runtime identity artifact roles`);
  }
  const { identity_sha256: recordedDigest, ...payload } = identity;
  if (canonicalDigest(payload) !== recordedDigest) {
    throw new Error(`${system} emitted a stale runtime identity digest`);
  }
  if (expectedProgramSha256 !== null &&
      identity.generated_program_sha256 !== expectedProgramSha256) {
    throw new Error(`${system} runtime identity does not match the request-derived program`);
  }
  return identity;
}

function interpretAdapterProcessResult(
  tool,
  corpus,
  mode,
  options,
  processResult,
  expectedProgramSha256,
) {
  let response;
  let runtimeIdentity = null;
  let responseValidationError = null;
  try {
    if (processResult.status !== "ok") {
      response = {
        schema: ADAPTER_SCHEMA, mode, system: tool.system, status: processResult.status,
        proof: "conditional-grh", payload: null,
      };
    } else if (tool.system === "pari" && tool.adapter_kind !== "json-protocol") {
      response = mode === "census" ? parseGpCensus(processResult.stdout, corpus.records) :
        parseGpTiming(processResult.stdout, corpus, options.boundaries, options.round);
    } else response = responseFromStdout(processResult.stdout);
    validateAdapterResponse(response, { mode, system: tool.system });
    runtimeIdentity = response.status === "ok" && tool.adapter_kind === "json-protocol"
      ? validateRuntimeIdentity(
        response.payload?.runtime_identity,
        tool.system,
        expectedProgramSha256,
      )
      : null;
    if (processResult.status === "ok" && processResult.ready === null) {
      throw new Error(`${tool.system} adapter never emitted the ready marker`);
    }
  } catch (error) {
    // A malformed direct census shard is a measured failed 50-field region, not
    // grounds for discarding evidence from every other independent shard.
    // External adapters authenticate one whole-corpus runtime closure, and timing
    // responses are retained evidence roots, so both continue to fail closed.
    if (mode !== "census" || tool.adapter_kind === "json-protocol") throw error;
    responseValidationError = error instanceof Error ? error.message : String(error);
    response = {
      schema: ADAPTER_SCHEMA, mode, system: tool.system, status: "error",
      proof: "conditional-grh", payload: null,
    };
    validateAdapterResponse(response, { mode, system: tool.system });
  }
  return { response, runtimeIdentity, responseValidationError };
}

async function invokeAdapter(tool, corpus, mode, options = {}) {
  if (tool.status !== "available") {
    return { response: {
      schema: ADAPTER_SCHEMA, mode, system: tool.system, status: "unavailable",
      proof: "conditional-grh", payload: null,
    }, process: null };
  }
  let args;
  let input;
  let adapterRequest = null;
  let expectedProgramSha256 = null;
  if (tool.adapter_kind === "json-protocol") {
    args = [];
    adapterRequest = protocolRequest(corpus, mode, tool.system, options);
    input = `${JSON.stringify(adapterRequest)}\n`;
    const adapterModule = require(tool.executable);
    if (typeof adapterModule.source !== "function") {
      throw new Error(`${tool.system} adapter does not expose deterministic source(request)`);
    }
    expectedProgramSha256 = sha256(adapterModule.source(adapterRequest));
  } else if (tool.system === "sagejs") {
    args = ["--python", "-"];
    input = mode === "census" ? sageCensusSource(corpus.records) :
      sageTimingSource(corpus, options.boundaries, options.round);
  } else if (tool.system === "pari") {
    args = ["-q"];
    input = mode === "census" ? pariCensusSource(corpus.records) :
      pariTimingSource(corpus, options.boundaries, options.round);
  } else {
    throw new Error(`${tool.system} requires --adapter ${tool.system}=PATH`);
  }
  const processResult = await runFreshProcess(pinnedSpec(tool.executable, args, input, options));
  const { response, runtimeIdentity, responseValidationError } = interpretAdapterProcessResult(
    tool, corpus, mode, options, processResult, expectedProgramSha256,
  );
  const processEvidence = {
    system: tool.system,
    mode,
    round: options.round ?? null,
    census_shard: mode === "census" ? options.censusShard ?? null : null,
    record_labels_sha256: mode === "census"
      ? recordLabelsDigest(corpus.records)
      : null,
    status: processResult.status,
    response_validation_error: responseValidationError,
    launch_to_ready_nanoseconds: processResult.ready === null ? null :
      (processResult.ready - processResult.launched).toString(),
    process_wall_nanoseconds: (processResult.ended - processResult.launched).toString(),
    timeout_seconds: options.timeoutSeconds,
    affinity_logical_cpus: [options.cpu],
    peak_rss_bytes: (() => {
      const match = /SAGEJS_COMPLEX_CUBIC_FRONTIER_MAX_RSS_KIB\|(\d+)/.exec(processResult.stderr);
      return match ? String(BigInt(match[1]) * 1024n) : null;
    })(),
    stderr_sha256: sha256(processResult.stderr),
    runtime_identity: runtimeIdentity,
    runtime_closure_sha256: runtimeIdentity === null
      ? null
      : runtimeClosureDigest(runtimeIdentity),
  };
  return { response, process: processEvidence };
}

function censusBatchPlan(corpus, tool) {
  if (tool.status !== "available" || tool.adapter_kind === "json-protocol") {
    return [{ shard: null, corpus }];
  }
  return shardRecords(corpus).map((records, shard) => ({
    shard,
    corpus: { ...corpus, records },
  }));
}

function mergeCensusInvocations(tool, corpus, entries) {
  const records = [];
  for (const entry of entries) {
    const expected = entry.batch.corpus.records;
    const response = entry.invocation.response;
    if (response.status === "ok") {
      if (!response.payload || !Array.isArray(response.payload.records) ||
          response.payload.records.length !== expected.length) {
        throw new Error(`${tool.system} census shard emitted the wrong record count`);
      }
      records.push(...response.payload.records);
      continue;
    }
    const status = response.status === "unavailable" ? "comparator-unavailable" : response.status;
    records.push(...expected.map((record) => ({
      label: record.label,
      status,
      reason: `${tool.system} census process ${response.status}`,
    })));
  }
  if (records.length !== corpus.records.length) {
    throw new Error(`${tool.system} census shards do not cover the frozen corpus`);
  }
  return {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: tool.system,
    status: "ok",
    proof: "conditional-grh",
    payload: { records },
  };
}

function validateCensusProcessTopology(census, corpus, tools) {
  const processes = census.summary?.processes;
  if (!Array.isArray(processes)) {
    throw new Error("timing requires authenticated census process evidence");
  }
  const availableTools = tools.filter((tool) => tool.status === "available");
  const expectedProcessCount = availableTools.reduce((count, tool) =>
    count + (tool.adapter_kind === "json-protocol" ? 1 : 20), 0);
  if (processes.length !== expectedProcessCount || processes.some((process) =>
    !process || process.mode !== "census" ||
    !availableTools.some((tool) => tool.system === process.system))) {
    throw new Error("timing requires exactly the expected census process topology");
  }

  const runtimeClosures = new Map();
  const shards = shardRecords(corpus);
  for (const tool of availableTools) {
    const matching = processes.filter((process) => process.system === tool.system);
    if (tool.adapter_kind === "json-protocol") {
      if (matching.length !== 1 || matching[0].census_shard !== null ||
          matching[0].status !== "ok" || matching[0].response_validation_error != null ||
          matching[0].record_labels_sha256 !== recordLabelsDigest(corpus.records)) {
        throw new Error(`timing requires one successful full-corpus ${tool.system} census process`);
      }
      const process = matching[0];
      const identity = validateRuntimeIdentity(process.runtime_identity, tool.system);
      const closure = runtimeClosureDigest(identity);
      if (process.runtime_closure_sha256 !== closure) {
        throw new Error(`${tool.system} census runtime closure digest is stale`);
      }
      runtimeClosures.set(tool.system, closure);
      continue;
    }

    if (matching.length !== 20) {
      throw new Error(`timing requires exactly 20 ${tool.system} census shard processes`);
    }
    const byShard = new Map();
    for (const process of matching) {
      if (!Number.isSafeInteger(process.census_shard) || process.census_shard < 0 ||
          process.census_shard >= 20 || byShard.has(process.census_shard) ||
          process.status !== "ok" || process.response_validation_error != null ||
          process.runtime_identity !== null || process.runtime_closure_sha256 !== null) {
        throw new Error(`${tool.system} census shard process topology is invalid`);
      }
      byShard.set(process.census_shard, process);
    }
    for (let shard = 0; shard < 20; shard += 1) {
      if (byShard.get(shard)?.record_labels_sha256 !== recordLabelsDigest(shards[shard])) {
        throw new Error(`${tool.system} census shard ${shard} label digest is stale`);
      }
    }
  }
  return runtimeClosures;
}

function combineCensus(corpus, responses) {
  const responseMaps = new Map();
  const expectedLabels = new Set(corpus.records.map((record) => record.label));
  for (const response of responses) {
    if (response.status === "ok") {
      if (!response.payload || !Array.isArray(response.payload.records) ||
          response.payload.records.length !== corpus.records.length) {
        throw new Error(`${response.system} emitted the wrong census record count`);
      }
      const records = new Map();
      for (const record of response.payload.records) {
        if (!record || typeof record.label !== "string" || !expectedLabels.has(record.label) ||
            records.has(record.label) ||
            !["ok", ...CENSUS_STATUSES].includes(record.status)) {
          throw new Error(`${response.system} emitted malformed, duplicate, or foreign census data`);
        }
        records.set(record.label, record);
      }
      responseMaps.set(response.system, records);
    }
  }
  const records = corpus.records.map((expected) => {
    const observations = {};
    let status = null;
    let unavailable = false;
    let timedOut = false;
    for (const response of responses) {
      const observed = responseMaps.get(response.system)?.get(expected.label) || {
        label: expected.label,
        status: TERMINAL_STATUSES.includes(response.status) ? response.status : "error",
      };
      observations[response.system] = observed;
      if (response.system === "sagejs" && CENSUS_STATUSES.includes(observed.status)) status = observed.status;
      if (["unavailable", "comparator-unavailable"].includes(observed.status)) unavailable = true;
      if (observed.status === "timeout") timedOut = true;
      if (observed.status === "error") status = "error";
      if (observed.discriminant && observed.discriminant !== expected.discriminant) {
        status = "cross-system-disagreement";
      }
      if (observed.class_number && observed.class_number !== expected.class_number) {
        status = "cross-system-disagreement";
      }
      if (observed.class_group_invariants &&
          JSON.stringify(observed.class_group_invariants) !== JSON.stringify(expected.class_group_invariants)) {
        status = "cross-system-disagreement";
      }
    }
    if (timedOut && !["cross-system-disagreement", "error"].includes(status)) status = "timeout";
    if (unavailable && ![
      "cross-system-disagreement", "error", "timeout", "native-certificate-failure",
      "fallback-proof-failure",
    ].includes(status)) {
      status = "comparator-unavailable";
    }
    return {
      label: expected.label,
      expected: {
        discriminant: expected.discriminant,
        class_number: expected.class_number,
        class_group_invariants: expected.class_group_invariants,
        oracle: "LMFDB record with used_grh=false",
      },
      status: status || "comparator-unavailable",
      observations,
    };
  });
  const counts = {};
  records.forEach((record) => { counts[record.status] = (counts[record.status] || 0) + 1; });
  const agreement = records.every((record) =>
    !["cross-system-disagreement", "error", "native-certificate-failure", "fallback-proof-failure"]
      .includes(record.status));
  const coverageComplete = responses.every((response) => response.status === "ok") &&
    records.every((record) => !["comparator-unavailable", "timeout", "error"]
      .includes(record.status));
  return { records, summary: { counts, agreement, coverage_complete: coverageComplete } };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1)];
}

function summarizeValues(values) {
  return {
    count: values.length,
    median: quantile(values, 0.5),
    geometric_mean: values.length === 0 ? null :
      Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length),
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    worst: values.length === 0 ? null : Math.max(...values),
    within_1x: values.filter((value) => value <= 1).length,
    within_3x: values.filter((value) => value <= 3).length,
    within_10x: values.filter((value) => value <= 10).length,
  };
}

function deterministicBootstrap(valuesByShard, iterations = 2000) {
  const shards = [...valuesByShard.keys()].sort((left, right) => left - right);
  if (shards.length === 0) return { seed: "complex-cubic-frontier-bootstrap-v1", iterations, lower: null, upper: null };
  let state = 0x8f31a25d;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const samples = [];
  for (let sample = 0; sample < iterations; sample += 1) {
    const selected = [];
    for (let index = 0; index < shards.length; index += 1) {
      selected.push(...valuesByShard.get(shards[Math.floor(random() * shards.length)]));
    }
    samples.push(Math.exp(selected.reduce((sum, value) => sum + Math.log(value), 0) /
      selected.length));
  }
  return {
    seed: "complex-cubic-frontier-bootstrap-v1",
    iterations,
    lower: quantile(samples, 0.025),
    upper: quantile(samples, 0.975),
  };
}

function timingMetrics(events, corpus, census) {
  const metrics = {};
  const recordsByShard = shardRecords(corpus);
  const censusByLabel = new Map(census.records.map((record) => [record.label, record]));
  for (const boundary of BOUNDARIES) {
    const sage = events.filter((event) => event.boundary === boundary && event.system === "sagejs");
    const pari = events.filter((event) => event.boundary === boundary && event.system === "pari");
    const pariMap = new Map(pari.map((event) => [`${event.round}:${event.shard}`, event]));
    const shardRatios = [];
    const fieldRatios = [];
    const ratiosByShard = new Map();
    const stratified = new Map();
    for (const event of sage) {
      const other = pariMap.get(`${event.round}:${event.shard}`);
      if (!other || event.status !== "ok" || other.status !== "ok") continue;
      const sageMean = Number(BigInt(event.root_nanoseconds)) / event.iterations;
      const pariMean = Number(BigInt(other.root_nanoseconds)) / other.iterations;
      const ratio = sageMean / pariMean;
      shardRatios.push(ratio);
      if (!ratiosByShard.has(event.shard)) ratiosByShard.set(event.shard, []);
      ratiosByShard.get(event.shard).push(ratio);
      const records = recordsByShard[event.shard];
      records.forEach((record, index) => {
        const pariNs = Number(BigInt(other.per_field_nanoseconds[index]));
        const sageNs = Number(BigInt(event.per_field_nanoseconds[index]));
        if (pariNs <= 0) return;
        const fieldRatio = sageNs / pariNs;
        fieldRatios.push(fieldRatio);
        const route = censusByLabel.get(record.label)?.status || "unknown";
        const dimensions = record.selection.stratum.split("/");
        const keys = [
          `discriminant:${dimensions[0]}`,
          `class-group:${dimensions[1]}`,
          `equation-order:${dimensions[2]}`,
          `ramification:${dimensions[3]}`,
          `route:${route}`,
        ];
        for (const key of keys) {
          if (!stratified.has(key)) stratified.set(key, []);
          stratified.get(key).push(fieldRatio);
        }
      });
    }
    const corpusTotals = {};
    for (const system of SYSTEMS) {
      corpusTotals[system] = [];
      for (let round = 0; round < RETAINED_ROUNDS; round += 1) {
        const selected = events.filter((event) => event.boundary === boundary &&
          event.system === system && event.round === round && event.status === "ok");
        if (selected.length !== 20) continue;
        corpusTotals[system].push(selected.reduce((sum, event) =>
          sum + Number(BigInt(event.root_nanoseconds)) / event.iterations, 0));
      }
    }
    metrics[boundary] = {
      absolute_corpus_nanoseconds_by_round: corpusTotals,
      paired_shards: summarizeValues(shardRatios),
      paired_fields_diagnostic_only: summarizeValues(fieldRatios),
      paired_shard_geometric_mean_bootstrap_95: deterministicBootstrap(ratiosByShard),
      stratified_field_diagnostics: Object.fromEntries(
        [...stratified.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([key, values]) => [key, summarizeValues(values)]),
      ),
    };
  }
  return metrics;
}

function selectFrontierCandidate(corpus, census, events) {
  const compare = (left, right) => {
    const discriminant = BigInt(left.discriminant_absolute) - BigInt(right.discriminant_absolute);
    if (discriminant !== 0n) return discriminant < 0n ? -1 : 1;
    const index = BigInt(left.equation_order_index) - BigInt(right.equation_order_index);
    if (index !== 0n) return index < 0n ? -1 : 1;
    const classNumber = BigInt(left.class_number) - BigInt(right.class_number);
    if (classNumber !== 0n) return classNumber < 0n ? -1 : 1;
    return left.label.localeCompare(right.label);
  };
  const censusByLabel = new Map(census.records.map((record) => [record.label, record]));
  const decline = [...corpus.records].sort(compare).find((record) =>
    censusByLabel.get(record.label)?.observations?.sagejs?.status ===
      "native-decline-fallback-pass" || censusByLabel.get(record.label)?.status ===
      "native-decline-fallback-pass");
  if (decline) {
    return {
      label: decline.label,
      reason: "smallest-discriminant-native-decline",
      discriminant_absolute: decline.discriminant_absolute,
      class_number: decline.class_number,
      equation_order_index: decline.equation_order_index,
    };
  }
  const shards = shardRecords(corpus);
  const fieldRatios = new Map(corpus.records.map((record) => [record.label, []]));
  const sage = events.filter((event) => event.boundary === "scalar-prepared" &&
    event.system === "sagejs" && event.status === "ok");
  const pari = new Map(events.filter((event) => event.boundary === "scalar-prepared" &&
    event.system === "pari" && event.status === "ok").map((event) =>
    [`${event.round}:${event.shard}`, event]));
  for (const event of sage) {
    const other = pari.get(`${event.round}:${event.shard}`);
    if (!other) continue;
    shards[event.shard].forEach((record, index) => {
      const denominator = Number(BigInt(other.per_field_nanoseconds[index]));
      if (denominator > 0) fieldRatios.get(record.label).push(
        Number(BigInt(event.per_field_nanoseconds[index])) / denominator,
      );
    });
  }
  const slower = corpus.records.filter((record) => {
    const ratios = fieldRatios.get(record.label);
    return ratios.length === 11 && quantile(ratios, 0.5) >= 3 &&
      ratios.filter((ratio) => ratio > 1).length >= 9;
  }).sort(compare)[0];
  if (!slower) return null;
  const ratios = fieldRatios.get(slower.label);
  return {
    label: slower.label,
    reason: "smallest-discriminant-stable-threefold-slowdown",
    discriminant_absolute: slower.discriminant_absolute,
    class_number: slower.class_number,
    equation_order_index: slower.equation_order_index,
    scalar_prepared_ratio_median: quantile(ratios, 0.5),
    slower_rounds: ratios.filter((ratio) => ratio > 1).length,
  };
}

async function runCensus(corpus, tools, source, options) {
  const responses = [];
  const processes = [];
  for (const tool of tools) {
    const entries = [];
    for (const batch of censusBatchPlan(corpus, tool)) {
      const invocation = await invokeAdapter(tool, batch.corpus, "census", {
        ...options,
        censusShard: batch.shard,
      });
      entries.push({ batch, invocation });
      if (invocation.process !== null) processes.push(invocation.process);
    }
    responses.push(mergeCensusInvocations(tool, corpus, entries));
  }
  const combined = combineCensus(corpus, responses);
  return {
    schema: CENSUS_SCHEMA,
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    corpus: corpusIdentity(options.corpus, corpus),
    source,
    host: hostIdentity(options.cpu),
    proof_contract: {
      request: "conditional-grh",
      sagejs: "K.class_number(proof=False)",
      pari: "bnfinit(P,0)",
      magma: "Proof := \"GRH\"",
      hecke: "class_group(...; GRH=true)",
      lmfdb_oracle: "used_grh=false",
      receipt_carrier: "live-authenticated-with-independent-exact-recomputation",
    },
    systems: tools.map((tool) => tool.system),
    records: combined.records,
    summary: { ...combined.summary, processes },
  };
}

async function runTiming(corpus, census, tools, source, options) {
  const currentCorpusIdentity = corpusIdentity(options.corpus, corpus);
  if (census.schema !== CENSUS_SCHEMA ||
      !corpusIdentitiesMatch(census.corpus, currentCorpusIdentity) ||
      census.source.candidate_tree !== source.candidate_tree ||
      JSON.stringify(census.systems) !== JSON.stringify(tools.map((tool) => tool.system)) ||
      !census.summary.agreement || !census.summary.coverage_complete) {
    throw new Error("timing requires a complete agreeing census for the identical corpus and source tree");
  }
  const censusRuntimeClosures = validateCensusProcessTopology(census, corpus, tools);
  const events = [];
  const processes = [];
  for (let round = 0; round < RETAINED_ROUNDS; round += 1) {
    const order = systemOrder(round, tools.map((tool) => tool.system));
    for (let position = 0; position < order.length; position += 1) {
      const tool = tools.find((entry) => entry.system === order[position]);
      const invocation = await invokeAdapter(tool, corpus, "timing", {
        ...options, round, boundaries: options.boundaries,
      });
      if (tool.adapter_kind === "json-protocol" && invocation.response.status === "ok" &&
          invocation.process.runtime_closure_sha256 !== censusRuntimeClosures.get(tool.system)) {
        throw new Error(`${tool.system} runtime closure changed after the accepted census`);
      }
      processes.push(invocation.process);
      if (invocation.response.status !== "ok") {
        for (const boundary of options.boundaries) for (let shard = 0; shard < 20; shard += 1) {
          events.push(validateTimingEvent({
            round, order_position: position, system: tool.system, boundary, shard,
            proof: "conditional-grh", status: invocation.response.status,
            iterations: 0, record_count: 50, root_nanoseconds: null,
            root_source: "one-contiguous-monotonic-timer", phase_sum_used: false,
            digest_inside_root: false, answer_digest: null, per_field_nanoseconds: [],
          }));
        }
        continue;
      }
      if (invocation.response.payload.round !== round ||
          invocation.response.payload.events.length !== options.boundaries.length * 20) {
        throw new Error(`${tool.system} emitted the wrong retained timing event count`);
      }
      const eventKeys = invocation.response.payload.events.map((event) =>
        `${event.boundary}:${event.shard}`);
      const expectedKeys = options.boundaries.flatMap((boundary) =>
        Array.from({ length: 20 }, (_, shard) => `${boundary}:${shard}`));
      if (new Set(eventKeys).size !== eventKeys.length ||
          expectedKeys.some((key) => !eventKeys.includes(key))) {
        throw new Error(`${tool.system} emitted duplicate or missing retained shard roots`);
      }
      for (const raw of invocation.response.payload.events) {
        events.push(makeTimingEvent(raw, tool.system, round, position, corpus));
      }
    }
  }
  return {
    schema: TIMING_SCHEMA,
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    corpus: currentCorpusIdentity,
    census: { path: options.censusFile, sha256: sha256(fs.readFileSync(options.censusFile)) },
    source,
    host: hostIdentity(options.cpu),
    protocol: {
      retained_rounds: 11,
      shard_count: 20,
      fields_per_shard: 50,
      excluded_warmup_fields: corpus.warmups.length,
      calibration: "discarded doubling until each shard root is at least 1.2 seconds",
      minimum_retained_root_nanoseconds: MINIMUM_ROOT_NS.toString(),
      process_scope: "one fresh pinned single-threaded process per system and round",
      system_order: "left rotation by retained round",
      root_source: "one-contiguous-monotonic-timer",
      phase_sum_used: false,
      digest_inside_root: false,
      timeout_accounting: "right-censored; cap is never substituted as observed duration",
      boundaries: {
        "scalar-prepared": {
          sagejs: "fresh isomorphic field and maximal order before root; K.class_number(proof=False) inside",
          pari: "nfinit(P) before root; bnfinit(nf,0) inside",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
        "fresh-complete": {
          sagejs: "coefficients through polynomial, field, maximal order, and K.class_number(proof=False)",
          pari: "bnfinit(P,0) from polynomial coefficients",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
      },
    },
    tools,
    processes,
    events,
    metrics: {
      ...timingMetrics(events, corpus, census),
      frontier_candidate: selectFrontierCandidate(corpus, census, events),
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const corpus = loadFrozenSurveyCorpus(options.corpus, options.assetDir);
  const source = sourceIdentity(options.allowDirty);
  const tools = toolPlan(options);
  const plan = {
    schema: "sagejs.benchmark/complex-cubic-frontier-plan-v1",
    mode: options.mode,
    corpus: corpusIdentity(options.corpus, corpus),
    source,
    host: hostIdentity(options.cpu),
    systems: tools,
    cpu: options.cpu,
    thread_environment: THREAD_ENV,
    boundaries: options.boundaries,
    retained_rounds: 11,
    shards: 20,
    fields_per_shard: 50,
  };
  if (options.dryRun) {
    fs.writeFileSync(options.output, canonicalJson(plan));
    console.log(canonicalJson(plan));
    return;
  }
  const evidence = options.mode === "census"
    ? await runCensus(corpus, tools, source, options)
    : await runTiming(
      corpus,
      JSON.parse(fs.readFileSync(options.censusFile, "utf8")),
      tools,
      source,
      options,
    );
  fs.writeFileSync(options.output, canonicalJson(evidence));
  console.log(`${options.output}: ${evidence.schema}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  MINIMUM_ROOT_NS,
  READY_MARKER,
  RESPONSE_MARKER,
  RETAINED_ROUNDS,
  THREAD_ENV,
  combineCensus,
  censusBatchPlan,
  corpusIdentitiesMatch,
  corpusIdentity,
  interpretAdapterProcessResult,
  invokeAdapter,
  makeTimingEvent,
  mergeCensusInvocations,
  normalizePariInvariants,
  pariCensusSource,
  pariTimingSource,
  portableCorpusIdentity,
  parseArguments,
  parseGpCensus,
  parseGpTiming,
  protocolRequest,
  quantile,
  recordLabelsDigest,
  runFreshProcess,
  sageCensusSource,
  sageTimingSource,
  shardRecords,
  systemOrder,
  timingMetrics,
  summarizeValues,
  deterministicBootstrap,
  selectFrontierCandidate,
  toolPlan,
  runtimeClosureDigest,
  validateCensusProcessTopology,
  validateRuntimeIdentity,
};
