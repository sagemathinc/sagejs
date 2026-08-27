#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const readline = require("node:readline");

const repository = resolve(__dirname, "../../..");
const { createSage } = require(resolve(repository, "dist/tools/kernel.js"));

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function extractJson(stdout) {
  const lines = stdout.trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith("SAGEJS_COMPETITIVE_JSON=")) {
      return JSON.parse(lines[index].slice("SAGEJS_COMPETITIVE_JSON=".length));
    }
  }
  throw new Error(`Sage.js evaluation produced no benchmark payload:\n${stdout}`);
}

function pythonLiteral(value) {
  return JSON.stringify(value);
}

function polynomialData(model, key) {
  return `[${model[key].map((value) => String(value)).join(",")}]`;
}

function divisorData(data) {
  return `{"u":${pythonLiteral(data.u)},"v":${pythonLiteral(data.v)}}`;
}

function sourceForCase(caseData, defaults, overrides = {}) {
  const timing = caseData.timing ?? {};
  const repetitions = overrides.repetitions ?? timing.repetitions ?? defaults.repetitions;
  const warmups = overrides.warmups ?? timing.warmups ?? defaults.warmups;
  const repeatedSize = overrides.batch_size ?? timing.batch_size ?? defaults.batch_size;
  const model = caseData.model;
  const base = model.base === "QQ" ? "QQ" : `GF(int(${pythonLiteral(model.prime)}))`;
  let prepare;
  let operate;
  let encode;
  if (caseData.kind.startsWith("unsupported_")) {
    const call = caseData.kind === "unsupported_wild_global" ? "curve.global_reduction()" : "curve.jacobian()";
    const result = caseData.kind === "unsupported_characteristic_2_jacobian"
      ? '{"status":"unsupported","reason":"characteristic-2"}'
      : caseData.kind === "unsupported_even_degree_jacobian"
        ? '{"status":"unsupported","reason":"odd-degree"}'
        : '{"status":"unsupported","prime":"2"}';
    return String.raw`
import json
import time
base=${base}; ring=PolynomialRing(base,"x")
curve=HyperellipticCurve(ring(${polynomialData(model, "f")}),ring(${polynomialData(model, "h")}))
started_wall=time.perf_counter(); started_cpu=time.process_time()
try:
    ${call}
    raise AssertionError("unsupported case unexpectedly succeeded")
except Exception as error:
    text=str(error)
    assert (${pythonLiteral(caseData.kind === "unsupported_wild_global" ? "unsupported at p=2" : caseData.expected.reason)} in text)
result=${result}
row={"id":${pythonLiteral(caseData.id)},"status":"ok","result":result,"result_mode":"exact","warm_mode":"not-applicable","object_cold_samples_ms":[(time.perf_counter()-started_wall)*1000],"object_cold_cpu_samples_ms":[(time.process_time()-started_cpu)*1000],"warm_samples_ms":[],"warm_cpu_samples_ms":[],"repeated_warm_loop_samples_ms":[],"repeated_warm_loop_cpu_samples_ms":[],"repeated_warm_loop_size":1}
print("SAGEJS_COMPETITIVE_JSON="+json.dumps(row,sort_keys=True))
True`;
  }
  const curveSetup = `base=${base}; ring=PolynomialRing(base,"x"); curve=HyperellipticCurve(ring(${polynomialData(model, "f")}),ring(${polynomialData(model, "h")}))`;
  if (caseData.kind.startsWith("jacobian_") || caseData.kind === "canonical_height") {
    const right = caseData.right ? `; right=jacobian([ring(${polynomialData(caseData.right, "u")}),ring(${polynomialData(caseData.right, "v")})])` : "";
    prepare = `${curveSetup}; jacobian=curve.jacobian(); left=jacobian([ring(${polynomialData(caseData.left, "u")}),ring(${polynomialData(caseData.left, "v")})])${right}; return (curve,ring,jacobian,left${caseData.right ? ",right" : ""})`;
  } else if (caseData.kind === "group_structure") {
    prepare = `${curveSetup}; return (curve,ring,curve.jacobian())`;
  } else if (caseData.kind === "central_value") {
    prepare = `${curveSetup}; return (curve,curve.lseries())`;
  } else if (caseData.kind === "lfunction_init") {
    prepare = `${curveSetup}; return (curve,)`;
  } else {
    prepare = `${curveSetup}; return (curve,ring)`;
  }
  if (caseData.kind === "jacobian_add") operate = "return state[3]+state[4]";
  else if (caseData.kind === "jacobian_validate") operate = "return state[3]";
  else if (caseData.kind === "jacobian_double") operate = "return state[3]+state[3]";
  else if (caseData.kind === "jacobian_scalar") {
    operate = caseData.options?.algorithm
      ? `return state[3].scalar_multiple(int(${pythonLiteral(caseData.scalar)}),algorithm=${pythonLiteral(caseData.options.algorithm)})`
      : `return int(${pythonLiteral(caseData.scalar)})*state[3]`;
  }
  else if (caseData.kind === "group_structure") {
    operate = `return state[2].group_structure(algorithm=${pythonLiteral(caseData.options?.algorithm ?? "basis")},seed=${caseData.options?.seed ?? 0})`;
  } else if (caseData.kind === "local_factor") operate = "return state[0].frobenius_polynomial()";
  else if (caseData.kind === "global_reduction") operate = "return state[0].global_reduction()";
  else if (caseData.kind === "real_period") operate = `return state[0].real_period(prec=${caseData.precision})`;
  else if (caseData.kind === "central_value") operate = `return (state[1].analytic_rank(prec=${caseData.precision}),state[1].value(1,prec=${caseData.precision}),state[1].last_diagnostics())`;
  else if (caseData.kind === "lfunction_init") operate = `return state[0].lseries().init(prec=${caseData.precision},max_order=${caseData.maximum_order})`;
  else if (caseData.kind === "canonical_height") operate = `return state[3].canonical_height(precision=${caseData.precision})`;
  else throw new Error(`unknown Sage.js case kind ${caseData.kind}`);
  if (caseData.kind.startsWith("jacobian_")) {
    encode = model.base === "QQ"
      ? 'u,v=value.uv(); return {"u":[str(c) for c in u.list()],"v":[str(c) for c in v.list()]}'
      : `u,v=value.uv(); return {"u":[str(int(c.lift())%${model.prime}) for c in u.list()],"v":[str(int(c.lift())%${model.prime}) for c in v.list()]}`;
  } else if (caseData.kind === "group_structure") encode = 'return [str(item) for item in value]';
  else if (caseData.kind === "local_factor") encode = 'return [str(item) for item in reversed(value.list())]';
  else if (caseData.kind === "global_reduction") encode = 'return {"conductor":str(value.conductor),"root_number":str(value.root_number),"bad_primes":[str(item) for item in value.bad_primes]}';
  else if (caseData.kind === "real_period") encode = 'check=value.verify(); return {"value":str(value.model_period()),"real_components":int(value.real_components()),"verified":bool(check["verified"]),"rigorous":bool(check["rigorous"]),"achieved_precision":int(value.achieved_stability_bits)}';
  else if (caseData.kind === "central_value") encode = 'return {"analytic_rank":int(value[0]),"value":str(value[1].real()),"refinement_stable":bool(value[2]["refinement_stable"]),"rigorous":bool(value[2]["rigorous"])}';
  else if (caseData.kind === "lfunction_init") encode = 'return {"analytic_rank":int(value.analytic_rank()),"value":str(value.central_value().real())}';
  else encode = 'return {"value":str(value.midpoint()),"rigorous":bool(value.rigorous),"achieved_precision":int(value.ball.precision_bits)}';
  const approximate = ["real_period", "central_value", "lfunction_init", "canonical_height"].includes(caseData.kind);
  return String.raw`
import json
import time
def prepare():
    ${prepare}
def operate(state):
    ${operate}
def encode(value):
    ${encode}
cold=[]; cold_cpu=[]; first=None
for index in range(${repetitions}):
    started=time.perf_counter(); cpu=time.process_time(); state=prepare(); value=operate(state)
    cold_cpu.append((time.process_time()-cpu)*1000); cold.append((time.perf_counter()-started)*1000)
    result=encode(value)
    if first is None: first=result
    else: assert result==first
state=prepare()
for index in range(${warmups}): operate(state)
warm=[]; warm_cpu=[]
for index in range(${repetitions}):
    started=time.perf_counter(); cpu=time.process_time(); result=encode(operate(state))
    warm_cpu.append((time.process_time()-cpu)*1000); warm.append((time.perf_counter()-started)*1000); assert result==first
loops=[]; loops_cpu=[]
for index in range(${repetitions}):
    started=time.perf_counter(); cpu=time.process_time()
    for inner in range(${repeatedSize}): value=operate(state)
    result=encode(value); loops_cpu.append((time.process_time()-cpu)*1000); loops.append((time.perf_counter()-started)*1000); assert result==first
row={"id":${pythonLiteral(caseData.id)},"status":"ok","result":first,"result_mode":${pythonLiteral(approximate ? "approximate" : "exact")},"warm_mode":${pythonLiteral(timing.warm_mode ?? "warm-arithmetic")},"object_cold_samples_ms":cold,"object_cold_cpu_samples_ms":cold_cpu,"warm_samples_ms":warm,"warm_cpu_samples_ms":warm_cpu,"repeated_warm_loop_samples_ms":loops,"repeated_warm_loop_cpu_samples_ms":loops_cpu,"repeated_warm_loop_size":${repeatedSize}}
print("SAGEJS_COMPETITIVE_JSON="+json.dumps(row,sort_keys=True))
True`;
}

function sourceFor(cases, request) {
  const payload = JSON.stringify({ cases, request });
  return String.raw`
import json
import time

_payload = json.loads(${JSON.stringify(payload)})
_cases = _payload["cases"]
_request = _payload["request"]

def _integer(value):
    return int(str(value))

def _polynomial(ring, values):
    return ring([_integer(value) for value in values])

def _coefficients(polynomial, prime=None):
    answer = []
    for coefficient in polynomial.list():
        value = coefficient.lift() if hasattr(coefficient, "lift") else coefficient
        value = int(value)
        if prime is not None:
            value %= prime
        answer.append(str(value))
    return answer

def _divisor_data(divisor, prime):
    u_value, v_value = divisor.uv()
    return {"u": _coefficients(u_value, prime), "v": _coefficients(v_value, prime)}

def _curve(case):
    model = case["model"]
    base = QQ if model.get("base") == "QQ" else GF(_integer(model["prime"]))
    ring = PolynomialRing(base, "x")
    f_value = _polynomial(ring, model["f"])
    h_value = _polynomial(ring, model["h"])
    return HyperellipticCurve(f_value, h_value), ring

def _divisor(jacobian, ring, data):
    return jacobian([_polynomial(ring, data["u"]), _polynomial(ring, data["v"])])

def _prepare(case):
    curve, ring = _curve(case)
    kind = case["kind"]
    if kind.startswith("jacobian_") or kind == "canonical_height":
        jacobian = curve.jacobian()
        left = _divisor(jacobian, ring, case["left"])
        right = _divisor(jacobian, ring, case["right"]) if "right" in case else None
        return (curve, ring, jacobian, left, right)
    if kind == "group_structure":
        return (curve, ring, curve.jacobian())
    if kind == "central_value":
        return (curve, curve.lseries())
    return (curve, ring)

def _operate(case, state):
    kind = case["kind"]
    model = case["model"]
    if kind == "jacobian_add":
        return _divisor_data(state[3] + state[4], _integer(model["prime"]))
    if kind == "jacobian_double":
        return _divisor_data(state[3] + state[3], _integer(model["prime"]))
    if kind == "jacobian_scalar":
        return _divisor_data(_integer(case["scalar"]) * state[3], _integer(model["prime"]))
    if kind == "group_structure":
        options = case.get("options", {})
        values = state[2].group_structure(
            algorithm=options.get("algorithm", "basis"), seed=options.get("seed", 0)
        )
        return [str(value) for value in values]
    if kind == "local_factor":
        polynomial = state[0].frobenius_polynomial()
        return _coefficients(polynomial)
    if kind == "global_reduction":
        data = state[0].global_reduction()
        return {
            "conductor": str(data.conductor),
            "root_number": str(data.root_number),
            "bad_primes": [str(value) for value in data.bad_primes],
        }
    if kind == "real_period":
        result = state[0].real_period(prec=case["precision"])
        check = result.verify()
        return {
            "real_components": int(result.real_components()),
            "verified": bool(check["verified"]),
            "rigorous": bool(check["rigorous"]),
            "model_period": str(result.model_period()),
            "achieved_precision": int(result.achieved_stability_bits),
        }
    if kind == "central_value":
        value = state[1].value(1, prec=case["precision"])
        rank = state[1].analytic_rank(prec=case["precision"])
        diagnostics = state[1].last_diagnostics()
        return {
            "analytic_rank": int(rank),
            "value": str(value.real()),
            "refinement_stable": bool(diagnostics["refinement_stable"]),
            "rigorous": bool(diagnostics["rigorous"]),
        }
    if kind == "canonical_height":
        result = state[3].canonical_height(prec=case["precision"])
        return {
            "value": str(result.midpoint()),
            "rigorous": bool(result.rigorous),
            "achieved_precision": int(result.ball.precision_bits),
        }
    raise ValueError("unknown prepared benchmark kind " + str(kind))

def _unsupported(case):
    kind = case["kind"]
    try:
        curve, ring = _curve(case)
        if kind == "unsupported_characteristic_2_jacobian":
            curve.jacobian()
        elif kind == "unsupported_even_degree_jacobian":
            curve.jacobian()
        elif kind == "unsupported_wild_global":
            curve.global_reduction()
        else:
            raise ValueError("unknown capability case")
    except Exception as error:
        text = str(error)
        if kind == "unsupported_characteristic_2_jacobian":
            assert "characteristic-2" in text
            return {"status": "unsupported", "reason": "characteristic-2"}
        if kind == "unsupported_even_degree_jacobian":
            assert "odd-degree" in text
            return {"status": "unsupported", "reason": "odd-degree"}
        prime = getattr(error, "diagnostics", {}).get("prime", None)
        assert prime == 2
        return {"status": "unsupported", "prime": "2"}
    raise AssertionError("an unsupported case unexpectedly succeeded")

def _run_case(case):
    timing = case.get("timing", {})
    defaults = _payload["request"].get("defaults", {})
    repetitions = int(timing.get("repetitions", defaults.get("repetitions", 7)))
    warmups = int(timing.get("warmups", defaults.get("warmups", 2)))
    batch_size = int(timing.get("batch_size", defaults.get("batch_size", 1000)))
    if case["kind"].startswith("unsupported_"):
        started_wall = time.perf_counter()
        started_cpu = time.process_time()
        result = _unsupported(case)
        return {
            "id": case["id"], "status": "ok", "result": result,
            "result_mode": "exact", "warm_mode": "not-applicable",
            "object_cold_samples_ms": [(time.perf_counter()-started_wall)*1000],
            "object_cold_cpu_samples_ms": [(time.process_time()-started_cpu)*1000],
            "warm_samples_ms": [], "warm_cpu_samples_ms": [],
            "batch_samples_ms": [], "batch_cpu_samples_ms": [], "batch_size": 1,
        }
    object_wall = []
    object_cpu = []
    cold_result = None
    for _index in range(repetitions):
        started_wall = time.perf_counter()
        started_cpu = time.process_time()
        state = _prepare(case)
        value = _operate(case, state)
        object_cpu.append((time.process_time() - started_cpu) * 1000)
        object_wall.append((time.perf_counter() - started_wall) * 1000)
        if cold_result is None:
            cold_result = value
        else:
            assert value == cold_result
    state = _prepare(case)
    for _index in range(warmups):
        _operate(case, state)
    warm_wall = []
    warm_cpu = []
    for _index in range(repetitions):
        started_wall = time.perf_counter()
        started_cpu = time.process_time()
        value = _operate(case, state)
        warm_cpu.append((time.process_time() - started_cpu) * 1000)
        warm_wall.append((time.perf_counter() - started_wall) * 1000)
        assert value == cold_result
    batch_wall = []
    batch_cpu = []
    for _index in range(repetitions):
        started_wall = time.perf_counter()
        started_cpu = time.process_time()
        value = None
        for _batch_index in range(batch_size):
            value = _operate(case, state)
        batch_cpu.append((time.process_time() - started_cpu) * 1000)
        batch_wall.append((time.perf_counter() - started_wall) * 1000)
        assert value == cold_result
    approximate = case["kind"] in ("real_period", "central_value", "canonical_height")
    return {
        "id": case["id"], "status": "ok", "result": cold_result,
        "result_mode": "approximate" if approximate else "exact",
        "warm_mode": timing.get("warm_mode", "warm-arithmetic"),
        "object_cold_samples_ms": object_wall,
        "object_cold_cpu_samples_ms": object_cpu,
        "warm_samples_ms": warm_wall,
        "warm_cpu_samples_ms": warm_cpu,
        "batch_samples_ms": batch_wall,
        "batch_cpu_samples_ms": batch_cpu,
        "batch_size": batch_size,
    }

_selected = set(_request.get("case_ids", []))
_rows = []
for _case in _cases:
    if _selected and _case["id"] not in _selected:
        continue
    _rows.append(_run_case(_case))
print("SAGEJS_COMPETITIVE_JSON=" + json.dumps({
    "schema": "sagejs.hyperelliptic-competitive-backend.v1",
    "backend": {"id": "sagejs", "version": "0.4.0"},
    "rows": _rows,
}, sort_keys=True))
True
`;
}

async function handle(session, request) {
  if (request.schema !== "sagejs.hyperelliptic-competitive-request.v1") {
    throw new Error("unknown request schema");
  }
  const casesPath = resolve(request.cases_path);
  const corpus = JSON.parse(readFileSync(casesPath, "utf8"));
  const selectedIds = new Set(request.case_ids ?? []);
  const selectedCases = selectedIds.size
    ? corpus.cases.filter((caseData) => selectedIds.has(caseData.id))
    : corpus.cases;
  const timingOverrides = request.defaults ?? {};
  const rows = [];
  for (const caseData of selectedCases) {
    const source = sourceForCase(caseData, corpus.defaults, timingOverrides);
    if (process.env.SAGEJS_BENCH_DEBUG_SOURCE) process.stderr.write(source);
    let result;
    try {
      result = await session.evaluate(source, { timeout: request.timeout_ms ?? 900_000 });
    } catch (error) {
      throw new Error(`${caseData.id}: ${error.stack || error}`);
    }
    if (result.repr !== "True") throw new Error(`${caseData.id} did not finish: ${result.repr}`);
    rows.push(extractJson(result.stdout));
  }
  const usage = process.resourceUsage();
  return {
    schema: "sagejs.hyperelliptic-competitive-backend.v1",
    backend: { id: "sagejs", version: "0.4.0", node: process.version },
    resources: { peak_rss_kib: usage.maxRSS, user_seconds: usage.userCPUTime / 1e6, system_seconds: usage.systemCPUTime / 1e6, scope: "resident Sage.js process" },
    rows,
    corpus_sha256: digest(corpus),
  };
}

async function main() {
  if (process.argv.includes("--emit-source")) {
    const request = JSON.parse(readFileSync(0, "utf8"));
    const corpus = JSON.parse(readFileSync(resolve(request.cases_path), "utf8"));
    const selectedIds = new Set(request.case_ids ?? []);
    const selectedCases = selectedIds.size
      ? corpus.cases.filter((caseData) => selectedIds.has(caseData.id))
      : corpus.cases;
    process.stdout.write(sourceFor(selectedCases, { ...request, defaults: corpus.defaults }));
    return;
  }
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = input[Symbol.asyncIterator]();
  // Capture the first request before the Sage runtime starts.  Some embedded
  // runtimes inspect stdin during initialization; registering the reader first
  // keeps the JSONL protocol reliable for pipes as well as interactive clients.
  const first = await iterator.next();
  if (first.done) return;
  if (process.env.SAGEJS_BENCH_DEBUG) process.stderr.write("competitive: request captured\n");
  const session = await createSage();
  if (process.env.SAGEJS_BENCH_DEBUG) process.stderr.write("competitive: session ready\n");
  try {
    let item = first;
    while (!item.done) {
      const line = item.value;
      if (line.trim()) {
        try {
          const response = await handle(session, JSON.parse(line));
          if (process.env.SAGEJS_BENCH_DEBUG) process.stderr.write("competitive: response ready\n");
          process.stdout.write(`${JSON.stringify(response)}\n`);
        } catch (error) {
          process.stdout.write(`${JSON.stringify({ schema: "sagejs.hyperelliptic-competitive-error.v1", error: String(error.stack || error) })}\n`);
        }
      }
      item = await iterator.next();
    }
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
