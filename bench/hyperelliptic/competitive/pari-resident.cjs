#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

function gpPolynomial(values) {
  return `Polrev([${values.join(",")}])`;
}

function statisticSamples(name, coldExpression, warmExpression, repetitions, batchSize) {
  return `
${name}_cold=[]; ${name}_warm=[]; ${name}_loop=[];
for(i=1,${repetitions}, t=getwalltime(); ${name}_x=${coldExpression}; ${name}_cold=concat(${name}_cold,getwalltime()-t));
${name}_x=${coldExpression};
for(i=1,${repetitions}, t=getwalltime(); ${name}_y=${warmExpression}; ${name}_warm=concat(${name}_warm,getwalltime()-t));
for(i=1,${repetitions}, t=getwalltime(); for(j=1,${batchSize},${name}_y=${warmExpression}); ${name}_loop=concat(${name}_loop,getwalltime()-t));`;
}

function exactResult(caseData, variable) {
  if (caseData.kind === "local_factor") return `Str(Vec(${variable}))`;
  if (caseData.kind === "real_period") return `Str(${variable})`;
  if (caseData.kind === "central_value") return `Str(${variable})`;
  if (caseData.kind === "lfunction_init") return `Str(lfun(${variable},1,0))`;
  return '"null"';
}

function caseSource(caseData, index, defaults, overrides = {}) {
  const timing = caseData.timing ?? {};
  const repetitions = overrides.repetitions ?? timing.repetitions ?? defaults.repetitions;
  const batchSize = overrides.batch_size ?? timing.batch_size ?? defaults.batch_size;
  const f = gpPolynomial(caseData.model.f);
  const h = gpPolynomial(caseData.model.h);
  const name = `c${index}`;
  const requestedPrecisionBits = caseData.precision ?? 64;
  let expression;
  let coldExpression;
  let setup = "";
  if (caseData.kind === "local_factor") {
    const model = caseData.model.h.some((value) => BigInt(value) !== 0n)
      ? `[Mod(1,${caseData.model.prime})*${f},Mod(1,${caseData.model.prime})*${h}]`
      : `Mod(1,${caseData.model.prime})*${f}`;
    expression = `hyperellcharpoly(${model})`;
    coldExpression = expression;
  } else if (caseData.kind === "real_period") {
    expression = `hyperellperiods(${caseData.model.h.some((value) => BigInt(value) !== 0n) ? `[${f},${h}]` : f},2)`;
    coldExpression = expression;
  } else if (caseData.kind === "central_value") {
    if (caseData.model.genus !== 2) return `print("SJS|${caseData.id}|unsupported|PARI lfungenus2 is genus-2 only");`;
    setup = `${name}_L=lfungenus2([${f},${h}]); ${name}_I=lfuninit(${name}_L,[1,0,0],4);`;
    expression = `lfun(${name}_I,1,0)`;
    coldExpression = `lfun(lfuninit(lfungenus2([${f},${h}]),[1,0,0],4),1,0)`;
  } else if (caseData.kind === "lfunction_init") {
    if (caseData.model.genus !== 2) return `print("SJS|${caseData.id}|unsupported|PARI lfungenus2 is genus-2 only");`;
    setup = `${name}_L=lfungenus2([${f},${h}]);`;
    expression = `lfuninit(${name}_L,[1,0,0],${caseData.maximum_order})`;
    coldExpression = `lfuninit(lfungenus2([${f},${h}]),[1,0,0],${caseData.maximum_order})`;
  } else {
    return `print("SJS|${caseData.id}|unsupported|PARI has no comparable ${caseData.kind} contract");`;
  }
  return `default(realbitprecision,${requestedPrecisionBits}); ${name}_bits=default(realbitprecision); ${setup}${statisticSamples(name, coldExpression, expression, repetitions, batchSize)}
print("SJS|${caseData.id}|ok|",Str(${name}_cold),"|",Str(${name}_warm),"|",Str(${name}_loop),"|",${exactResult(caseData, `${name}_x`)},"|",Str(${name}_bits));`;
}

function parseVector(text) {
  if (!/^\[[0-9, .-]*\]$/.test(text)) throw new Error(`invalid GP timing vector ${text}`);
  return JSON.parse(text).map(Number);
}

function parseRows(stdout, cases, defaults, overrides = {}) {
  const byId = new Map(cases.map((value) => [value.id, value]));
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("SJS|")) continue;
    const fields = line.split("|");
    const caseData = byId.get(fields[1]);
    if (!caseData) throw new Error(`GP returned unknown case ${fields[1]}`);
    if (fields[2] === "unsupported") {
      rows.push({ id: fields[1], status: "unsupported", reason: fields.slice(3).join("|") });
      continue;
    }
    let result;
    if (caseData.kind === "local_factor") {
      result = JSON.parse(fields[6]).map(String);
    } else if (caseData.kind === "real_period") {
      result = { value: fields[6] };
    } else {
      result = { analytic_rank: Math.abs(Number(fields[6])) < 1e-30 ? 1 : 0, value: fields[6] };
    }
    rows.push({
      id: fields[1], status: "ok", result,
      result_mode: caseData.kind === "local_factor" ? "exact" : "approximate",
      object_cold_samples_ms: parseVector(fields[3]),
      warm_samples_ms: parseVector(fields[4]),
      repeated_warm_loop_samples_ms: parseVector(fields[5]),
      repeated_warm_loop_size: overrides.batch_size ?? caseData.timing?.batch_size ?? defaults.batch_size,
      warm_mode: caseData.kind === "central_value"
        ? "prepared-analytic-evaluation"
        : caseData.kind === "lfunction_init"
          ? "prepared-descriptor-init"
          : "resident-recompute",
      requested_precision_bits: caseData.precision ?? null,
      effective_pari_bit_precision: Number(fields[7]),
    });
  }
  return rows;
}

function handle(request) {
  const corpus = JSON.parse(readFileSync(resolve(request.cases_path), "utf8"));
  const selected = new Set(request.case_ids ?? []);
  const cases = corpus.cases.filter((value) => !selected.size || selected.has(value.id));
  const defaults = corpus.defaults;
  const overrides = request.defaults ?? {};
  const source = [
    "default(parisizemax,4000000000); default(realbitprecision,64);",
    ...cases.map((value, index) => caseSource(value, index, defaults, overrides)),
    "quit;",
  ].join("\n");
  const executable = process.env.GP ?? "/home/user/.local/pari-2.18.1-alpha/bin/gp";
  const resourceMarker = "SJS_RESOURCE|max_rss_kib=%M|user_s=%U|system_s=%S";
  const timed = process.platform !== "win32" && require("node:fs").existsSync("/usr/bin/time");
  const child = spawnSync(timed ? "/usr/bin/time" : executable, timed
    ? ["-f", resourceMarker, executable, "-q", "-f", "-s", "1000000000"]
    : ["-q", "-f", "-s", "1000000000"], {
    input: source, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`GP failed (${child.status}): ${child.stderr}\n${child.stdout}`);
  const resource = child.stderr.match(/SJS_RESOURCE\|max_rss_kib=(\d+)\|user_s=([0-9.]+)\|system_s=([0-9.]+)/);
  return {
    schema: "sagejs.hyperelliptic-competitive-backend.v1",
    backend: { id: "pari", version: "2.18.1-alpha", executable },
    rows: parseRows(child.stdout, cases, defaults, overrides),
    resources: resource ? { peak_rss_kib: Number(resource[1]), user_seconds: Number(resource[2]), system_seconds: Number(resource[3]), scope: "resident mathematical subprocess" } : { status: "unavailable" },
    stderr: child.stderr.replace(/SJS_RESOURCE\|[^\n]*\n?/, "").trim(),
  };
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  for (const line of input.split(/\r?\n/).filter((value) => value.trim())) {
    try { process.stdout.write(`${JSON.stringify(handle(JSON.parse(line)))}\n`); }
    catch (error) {
      process.stdout.write(`${JSON.stringify({ schema: "sagejs.hyperelliptic-competitive-error.v1", error: String(error.stack || error) })}\n`);
    }
  }
});
