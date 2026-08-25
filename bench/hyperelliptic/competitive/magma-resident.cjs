#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

function polynomial(variable, values) {
  return values.map((value, degree) => `(${value})*${variable}^${degree}`).join("+") || "0";
}

function curveExpression(caseData, variable) {
  const f = polynomial(variable, caseData.model.f);
  const h = polynomial(variable, caseData.model.h);
  return caseData.model.h.some((value) => BigInt(value) !== 0n)
    ? `HyperellipticCurve(${f},${h})`
    : `HyperellipticCurve(${f})`;
}

function pointExpression(name, data, variable) {
  return `${name}![${polynomial(variable, data.u)},${polynomial(variable, data.v)}]`;
}

function unsupported(caseData, reason) {
  return `printf "SJS|${caseData.id}|unsupported|${reason}\\n";`;
}

function caseSource(caseData, index, defaults, overrides = {}) {
  const name = `c${index}`;
  const timing = caseData.timing ?? {};
  const repetitions = overrides.repetitions ?? timing.repetitions ?? defaults.repetitions;
  const batchSize = overrides.batch_size ?? timing.batch_size ?? defaults.batch_size;
  const supported = new Set([
    "jacobian_add", "jacobian_double", "jacobian_scalar", "jacobian_validate", "group_structure",
    "local_factor", "canonical_height",
  ]);
  if (!supported.has(caseData.kind)) return unsupported(caseData, `Magma runner has no comparable ${caseData.kind} contract`);
  if (caseData.kind.startsWith("unsupported_")) return unsupported(caseData, "not a timed competitor workload");
  const field = caseData.model.base === "QQ" ? "Rationals()" : `GF(${caseData.model.prime})`;
  const setup = `
${name}F:=${field}; ${name}R<${name}x>:=PolynomialRing(${name}F);
${name}C:=${curveExpression(caseData, `${name}x`)}; ${name}J:=Jacobian(${name}C);`;
  let operandSetup = "";
  let expression;
  let resultFormat;
  let resultArguments;
  if (caseData.kind.startsWith("jacobian_") || caseData.kind === "canonical_height") {
    operandSetup += `${name}P:=${pointExpression(`${name}J`, caseData.left, `${name}x`)};`;
  }
  if (caseData.kind === "jacobian_add") {
    operandSetup += `${name}Q:=${pointExpression(`${name}J`, caseData.right, `${name}x`)};`;
    expression = `${name}P+${name}Q`;
    resultFormat = "%o|%o|%o";
    resultArguments = `${name}u,${name}v,${name}d`;
  } else if (caseData.kind === "jacobian_validate") {
    expression = `${name}P`;
    resultFormat = "%o|%o|%o";
    resultArguments = `${name}u,${name}v,${name}d`;
  } else if (caseData.kind === "jacobian_double") {
    expression = `${name}P+${name}P`;
    resultFormat = "%o|%o|%o";
    resultArguments = `${name}u,${name}v,${name}d`;
  } else if (caseData.kind === "jacobian_scalar") {
    expression = `(${caseData.scalar})*${name}P`;
    resultFormat = "%o|%o|%o";
    resultArguments = `${name}u,${name}v,${name}d`;
  } else if (caseData.kind === "group_structure") {
    expression = `AbelianGroup(${name}J)`;
    resultFormat = "%o";
    resultArguments = `Invariants(${name}value)`;
  } else if (caseData.kind === "local_factor") {
    expression = `EulerFactor(${name}J)`;
    resultFormat = "%o";
    resultArguments = `[Integers()!Coefficient(${name}value,i):i in [0..Degree(${name}value)]]`;
  } else {
    expression = `CanonicalHeight(${name}P : Precision:=${caseData.precision})`;
    resultFormat = "%o";
    resultArguments = `${name}value`;
  }
  const operation = caseData.kind === "group_structure"
    ? `${name}value,${name}map:=${expression};`
    : `${name}value:=${expression};`;
  const coefficient = caseData.model.base === "QQ" ? "Coefficient" : "Integers()!Coefficient";
  const extract = caseData.kind.startsWith("jacobian_")
    ? `${name}uv,${name}d:=Eltseq(${name}value); ${name}u:=[${coefficient}(${name}uv[1],i):i in [0..Degree(${name}uv[1])]]; ${name}v:=[${coefficient}(${name}uv[2],i):i in [0..Degree(${name}uv[2])]];`
    : "";
  const coldSetup = `${name}coldC:=${curveExpression(caseData, `${name}x`)}; ${name}coldJ:=Jacobian(${name}coldC);`;
  const coldOperands = operandSetup
    .replaceAll(`${name}J`, `${name}coldJ`)
    .replaceAll(`${name}P`, `${name}coldP`)
    .replaceAll(`${name}Q`, `${name}coldQ`);
  const coldOperation = operation
    .replaceAll(`${name}J`, `${name}coldJ`)
    .replaceAll(`${name}P`, `${name}coldP`)
    .replaceAll(`${name}Q`, `${name}coldQ`);
  return `${setup}${operandSetup}
${name}cold:=[]; ${name}warm:=[]; ${name}loop:=[];
for ${name}i in [1..${repetitions}] do t:=Realtime(); ${coldSetup}${coldOperands}${coldOperation} Append(~${name}cold,1000*(Realtime()-t)); end for;
for ${name}i in [1..${repetitions}] do t:=Realtime(); ${operation} Append(~${name}warm,1000*(Realtime()-t)); end for;
for ${name}i in [1..${repetitions}] do t:=Realtime(); for ${name}j in [1..${batchSize}] do ${operation} end for; Append(~${name}loop,1000*(Realtime()-t)); end for;
${operation} ${extract}
printf "SJS|${caseData.id}|ok|%o|%o|%o|${resultFormat}\\n",${name}cold,${name}warm,${name}loop,${resultArguments};`;
}

function parseArray(text) {
  const value = text.trim();
  if (!value.startsWith("[") || !value.endsWith("]")) throw new Error(`invalid Magma sequence ${text}`);
  const body = value.slice(1, -1).trim();
  return body ? body.split(",").map((item) => item.trim()) : [];
}

function parseRows(stdout, cases, defaults, overrides = {}) {
  const byId = new Map(cases.map((value) => [value.id, value]));
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("SJS|")) continue;
    const fields = line.split("|");
    const caseData = byId.get(fields[1]);
    if (!caseData) throw new Error(`Magma returned unknown case ${fields[1]}`);
    if (fields[2] === "unsupported") {
      rows.push({ id: fields[1], status: "unsupported", reason: fields.slice(3).join("|") });
      continue;
    }
    let result;
    if (caseData.kind.startsWith("jacobian_")) {
      result = { u: parseArray(fields[6]).map(String), v: parseArray(fields[7]).map(String), infinity_weight: Number(fields[8]) };
    } else if (caseData.kind === "group_structure" || caseData.kind === "local_factor") {
      result = parseArray(fields[6]).map(String);
    } else {
      result = { value: fields[6] };
    }
    rows.push({
      id: fields[1], status: "ok", result,
      result_mode: caseData.kind === "canonical_height" ? "approximate" : "exact",
      object_cold_samples_ms: parseArray(fields[3]).map(Number),
      warm_samples_ms: parseArray(fields[4]).map(Number),
      repeated_warm_loop_samples_ms: parseArray(fields[5]).map(Number),
      repeated_warm_loop_size: overrides.batch_size ?? caseData.timing?.batch_size ?? defaults.batch_size,
      warm_mode: caseData.timing?.warm_mode ?? "warm-arithmetic",
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
  const source = ["SetColumns(0); SetSeed(1);", ...cases.map((value, index) => caseSource(value, index, defaults, overrides)), "quit;"].join("\n");
  const executable = process.env.MAGMA ?? "/home/user/bin/magma";
  const resourceMarker = "SJS_RESOURCE|max_rss_kib=%M|user_s=%U|system_s=%S";
  const timed = process.platform !== "win32" && require("node:fs").existsSync("/usr/bin/time");
  const child = spawnSync(timed ? "/usr/bin/time" : executable, timed
    ? ["-f", resourceMarker, executable, "-b"]
    : ["-b"], { input: source, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Magma failed (${child.status}): ${child.stderr}\n${child.stdout}`);
  const resource = child.stderr.match(/SJS_RESOURCE\|max_rss_kib=(\d+)\|user_s=([0-9.]+)\|system_s=([0-9.]+)/);
  return {
    schema: "sagejs.hyperelliptic-competitive-backend.v1",
    backend: { id: "magma", version: "2.18-5", executable },
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
    catch (error) { process.stdout.write(`${JSON.stringify({ schema: "sagejs.hyperelliptic-competitive-error.v1", error: String(error.stack || error) })}\n`); }
  }
});
