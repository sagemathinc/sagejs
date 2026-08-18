"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { PersistentLineProcess, commandVersion } = require("./process.cjs");

const ROOT = resolve(__dirname, "../..");
const WORKERS = resolve(__dirname, "workers");

const SYSTEMS = Object.freeze({
  sagejs: { family: "sagejs", boundary: "warm-public" },
  "sagejs-dynamic": { family: "sagejs", boundary: "dynamic-public" },
  "sagejs-native": { family: "sagejs", boundary: "native-public" },
  sage: { family: "pari-sage", boundary: "warm-public" },
  pari: { family: "pari-sage", boundary: "nfbasis" },
  hecke: { family: "hecke-oscar", boundary: "core" },
  oscar: { family: "hecke-oscar", boundary: "warm-public" },
  magma: { family: "magma", boundary: "warm-public", opt_in: true },
});

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustStatistics(samples) {
  const values = samples.map((sample) => Number(sample.timing_ms)).filter(Number.isFinite);
  const center = median(values);
  return {
    median_ms: center,
    mad_ms: center === null ? null : median(values.map((value) => Math.abs(value - center))),
    minimum_ms: values.length ? Math.min(...values) : null,
    maximum_ms: values.length ? Math.max(...values) : null,
    sample_count: values.length,
  };
}

function parseBasisEncoding(encoded) {
  if (!encoded) return null;
  return encoded.split(";").map((row) => row.split(",").map((entry) => entry.trim()));
}

function gitRevision(path) {
  try {
    return execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

class JsonWorkerAdapter {
  constructor({ id, family, boundary, command, args, env, memoryMb, startupTimeoutMs }) {
    this.id = id;
    this.family = family;
    this.boundary = boundary;
    this.process = new PersistentLineProcess({
      name: id,
      command,
      args,
      env,
      memoryMb,
      startupTimeoutMs,
      cwd: ROOT,
    });
  }

  async run(caseSpec, options = {}) {
    const boundary = options.boundary || this.boundary;
    const request = {
      coefficients: caseSpec.polynomial.coefficients,
      boundary,
      local_primes: options.localPrimes || caseSpec.local_primes || [],
      native_kernel_eligible: caseSpec.native_kernel_eligible === true,
      warmups: options.warmups,
      samples: options.samples,
    };
    const raw = await this.process.request(JSON.stringify(request), { timeoutMs: options.timeoutMs });
    if (raw.status !== "ok") return this.#failure(caseSpec, boundary, raw);
    let payload;
    try {
      payload = JSON.parse(raw.line);
    } catch (error) {
      return this.#failure(caseSpec, boundary, {
        status: "crash",
        reason: `invalid ${this.id} protocol payload: ${error.message}`,
        raw_line: raw.line,
      });
    }
    if (payload.status !== "ok") {
      return this.#failure(caseSpec, boundary, {
        status: payload.status === "unsupported" ? "unsupported" : "crash",
        reason: payload.reason,
        traceback: payload.traceback || payload.stack,
      });
    }
    return {
      case_id: caseSpec.id,
      system: this.id,
      implementation_family: this.family,
      boundary,
      status: "ok",
      version: this.process.version,
      process_startup_ms: this.process.startupMs,
      request_wall_ms: raw.wall_ms,
      peak_rss_kb: raw.peak_rss_kb,
      peak_rss_scope: raw.peak_rss_scope,
      peak_rss_observed_processes: raw.peak_rss_observed_processes,
      irreducible_verified: payload.irreducible_verified,
      irreducibility_ms: payload.irreducibility_ms,
      samples: payload.samples,
      statistics: robustStatistics(payload.samples || []),
      basis: payload.basis,
      field_discriminant: payload.field_discriminant,
      certified: payload.certified,
      factorization: payload.factorization,
      cache_identity: payload.cache_identity,
      algorithm_selection: payload.algorithm_selection,
      selected_algorithm: payload.selected_algorithm,
      executed_algorithms: payload.executed_algorithms,
      diagnostic_trace: payload.diagnostic_trace,
      scheduler: payload.scheduler,
      profiling_only: boundary === "factor-discovery",
    };
  }

  #failure(caseSpec, boundary, raw) {
    return {
      case_id: caseSpec.id,
      system: this.id,
      implementation_family: this.family,
      boundary,
      status: raw.status,
      reason: raw.reason,
      timeout_ms: raw.timeout_ms,
      peak_rss_kb: raw.peak_rss_kb,
      peak_rss_scope: raw.peak_rss_scope,
      peak_rss_observed_processes: raw.peak_rss_observed_processes,
      stderr: raw.stderr,
      traceback: raw.traceback,
      version: this.process.version,
    };
  }

  close() {
    this.process.close();
  }
}

class JuliaAdapter {
  constructor({ id, project, memoryMb, executable = "/home/user/.local/bin/julia" }) {
    this.id = id;
    this.family = "hecke-oscar";
    this.boundary = id === "hecke" ? "core" : "warm-public";
    this.project = project;
    this.process = new PersistentLineProcess({
      name: id,
      command: executable,
      args: ["--startup-file=no", `--project=${project}`, resolve(WORKERS, "julia.jl"), id],
      memoryMb,
      startupTimeoutMs: id === "oscar" ? 180_000 : 90_000,
      cwd: ROOT,
    });
  }

  async run(caseSpec, options) {
    const boundary = options.boundary || this.boundary;
    const requestId = `r${++JuliaAdapter.nextId}`;
    const request = [
      requestId,
      boundary,
      options.warmups,
      options.samples,
      caseSpec.polynomial.coefficients.join(","),
    ].join("\t");
    const raw = await this.process.request(request, { timeoutMs: options.timeoutMs });
    const base = {
      case_id: caseSpec.id,
      system: this.id,
      implementation_family: this.family,
      boundary,
      version: this.process.version,
      source_revision: gitRevision(this.project),
      process_startup_ms: this.process.startupMs,
      request_wall_ms: raw.wall_ms,
    };
    if (raw.status !== "ok") return { ...base, ...raw, line: undefined };
    const fields = raw.line.trim().split(/\s+/);
    if (fields[0] !== requestId) {
      return { ...base, status: "crash", reason: "Julia oracle response id mismatch" };
    }
    if (fields[1] !== "OK") {
      return {
        ...base,
        status: fields[1] === "UNSUPPORTED" ? "unsupported" : "crash",
        reason: fields.slice(2).join("\t"),
      };
    }
    const samples = fields[3].split(";").map((sample) => {
      const [construction, order, materialization] = sample.split(",").map(Number);
      return {
        timing_ms: order,
        stages: {
          field_construction: construction,
          maximal_order: order,
          public_object_materialization: materialization,
          factor_discovery: "included-in-maximal_order",
          local_primes: "not-exposed-by-public-api",
          basis_merge: "included-in-maximal_order",
          certification: "verified-by-independent-harness",
        },
      };
    });
    return {
      ...base,
      status: "ok",
      peak_rss_kb: raw.peak_rss_kb,
      peak_rss_scope: raw.peak_rss_scope,
      peak_rss_observed_processes: raw.peak_rss_observed_processes,
      irreducible_verified: true,
      irreducibility_ms: Number(fields[2]),
      samples,
      statistics: robustStatistics(samples),
      field_discriminant: fields[4],
      basis: parseBasisEncoding(fields[5]),
      certified: true,
    };
  }

  close() {
    this.process.close();
  }
}
JuliaAdapter.nextId = 0;

function gpInitialization() {
  return [
    "nfmo_basis_string(b,n)={my(s=\"\",q);for(i=1,n,for(j=1,n,if(j>1,s=concat(s,\",\"));q=polcoef(b[i],j-1);s=concat(s,Str(numerator(q),\"/\",denominator(q))));if(i<n,s=concat(s,\";\")));s}",
    "print(Str(\"@@NFMO_READY@@PARI/GP \" ,version()))",
  ].join(";\n");
}

class PariAdapter {
  constructor({ executable = "/usr/bin/gp", memoryMb }) {
    this.id = "pari";
    this.family = "pari-sage";
    this.boundary = "nfbasis";
    const lineBuffer = process.platform === "linux" ? "stdbuf" : executable;
    const spawnArgs = process.platform === "linux"
      ? ["-oL", executable, "-f", "-q"]
      : ["-f", "-q"];
    this.process = new PersistentLineProcess({
      name: "pari",
      command: lineBuffer,
      args: spawnArgs,
      memoryMb,
      startupTimeoutMs: 15_000,
      startupInput: gpInitialization(),
      cwd: ROOT,
    });
  }

  async run(caseSpec, options) {
    const boundary = options.boundary || this.boundary;
    const requestId = `r${++PariAdapter.nextId}`;
    const coefficients = caseSpec.polynomial.coefficients.join(",");
    const samples = Math.max(1, options.samples);
    const warmups = Math.max(0, options.warmups);
    const repetitions = Math.max(1, options.innerIterations || caseSpec.inner_iterations || 1);
    const localPrimes = options.localPrimes || caseSpec.local_primes || [];
    let operation;
    let basis;
    let discriminant;
    if (boundary === "nfbasis") {
      const argument = localPrimes.length ? `[T,[${localPrimes.join(",")}]]` : "T";
      operation = `b=nfbasis(${argument})`;
      basis = "b";
      discriminant = "nfdisc(T)";
    } else if (boundary === "nfinit") {
      operation = "z=nfinit(T);b=z.zk";
      basis = "b";
      discriminant = "z.disc";
    } else if (boundary === "factor-discovery") {
      operation = "fac=factor(abs(poldisc(T)))";
      basis = null;
      discriminant = null;
    } else {
      return {
        case_id: caseSpec.id,
        system: this.id,
        implementation_family: this.family,
        boundary,
        status: "unsupported",
        reason: `unsupported PARI boundary ${boundary}`,
      };
    }
    const commands = [
      `T=Polrev([${coefficients}])`,
      "irr=polisirreducible(T)",
      `for(w=1,${warmups},${operation})`,
      "times=\"\"",
      `for(s=1,${samples},t=getwalltime();for(k=1,${repetitions},${operation});e=(getwalltime()-t)/${repetitions}.;if(s>1,times=concat(times,\",\"));times=concat(times,Str(e)))`,
    ];
    if (basis) {
      commands.push(`d=${discriminant}`);
      commands.push(`bs=nfmo_basis_string(${basis},poldegree(T))`);
      commands.push(`print(Str(\"@@NFMO_RESULT@@${requestId}\\tOK\\t\",irr,\"\\t\",times,\"\\t\",d,\"\\t\",bs))`);
    } else {
      commands.push(`print(Str(\"@@NFMO_RESULT@@${requestId}\\tPROBE\\t\",irr,\"\\t\",times))`);
    }
    const raw = await this.process.request(commands.join(";"), { timeoutMs: options.timeoutMs });
    const base = {
      case_id: caseSpec.id,
      system: this.id,
      implementation_family: this.family,
      boundary,
      version: this.process.version,
      process_startup_ms: this.process.startupMs,
      request_wall_ms: raw.wall_ms,
    };
    if (raw.status !== "ok") return { ...base, ...raw, line: undefined };
    const fields = raw.line.trim().split(/\s+/);
    if (fields[0] !== requestId || !["OK", "PROBE"].includes(fields[1])) {
      return { ...base, status: "crash", reason: "invalid PARI oracle response", raw_line: raw.line };
    }
    const timings = fields[3].split(",").map(Number);
    const parsedSamples = timings.map((timing) => ({
      timing_ms: timing,
      inner_iterations: repetitions,
      stages: { [boundary === "factor-discovery" ? "factor_discovery" : boundary]: timing },
    }));
    return {
      ...base,
      status: "ok",
      peak_rss_kb: raw.peak_rss_kb,
      peak_rss_scope: raw.peak_rss_scope,
      peak_rss_observed_processes: raw.peak_rss_observed_processes,
      irreducible_verified: fields[2] === "1",
      samples: parsedSamples,
      statistics: robustStatistics(parsedSamples),
      field_discriminant: fields[4] || null,
      basis: parseBasisEncoding(fields[5]),
      profiling_only: fields[1] === "PROBE",
    };
  }

  close() {
    this.process.close();
  }
}
PariAdapter.nextId = 0;

class MagmaAdapter {
  constructor({ executable = "/home/user/bin/magma", memoryMb }) {
    this.id = "magma";
    this.family = "magma";
    this.boundary = "warm-public";
    this.process = new PersistentLineProcess({
      name: "magma",
      command: executable,
      args: ["-b"],
      memoryMb,
      startupTimeoutMs: 30_000,
      startupInput:
        'SetColumns(1024); ma,mi,pa := GetVersion(); printf "@@NFMO_READY@@Magma %o.%o-%o\\n", ma,mi,pa;',
      cwd: ROOT,
    });
  }

  async run(caseSpec, options) {
    const boundary = options.boundary || this.boundary;
    const base = {
      case_id: caseSpec.id,
      system: this.id,
      implementation_family: this.family,
      boundary,
    };
    if (boundary !== "warm-public") {
      return { ...base, status: "unsupported", reason: `unsupported Magma boundary ${boundary}` };
    }
    const requestId = `r${++MagmaAdapter.nextId}`;
    const polynomial = caseSpec.polynomial.coefficients
      .map((coefficient, power) => `(${coefficient})*x^${power}`)
      .join("+");
    const warmups = Math.max(0, options.warmups);
    const samples = Math.max(1, options.samples);
    const command = [
      "try",
      "Qx<x>:=PolynomialRing(Rationals());",
      `f:=${polynomial};`,
      "irr:=IsIrreducible(f);",
      `for w in [1..${warmups}] do K:=NumberField(f); O:=MaximalOrder(K); end for;`,
      "times:=\"\";",
      `for s in [1..${samples}] do tc:=Realtime(); K:=NumberField(f); cm:=Realtime(tc)*1000; order_start:=Realtime(); O:=MaximalOrder(K); om:=Realtime(order_start)*1000; tm:=Realtime(); B:=Basis(O); d:=Discriminant(O); mm:=Realtime(tm)*1000; if s gt 1 then times cat:=\";\"; end if; times cat:=Sprint(cm) cat \",\" cat Sprint(om) cat \",\" cat Sprint(mm); end for;`,
      `for i in [1..#B] do row:=Eltseq(K!B[i]); for j in [1..#row] do printf "@@NFMO_ENTRY@@${requestId} %o %o %o %o\\n", i, j, Numerator(row[j]), Denominator(row[j]); end for; end for;`,
      `printf "@@NFMO_RESULT@@${requestId}\\tOK\\t%o\\t%o\\t%o\\n", irr, times, d;`,
      "catch e",
      `printf "@@NFMO_RESULT@@${requestId}\\tERROR\\t%o\\n", e;`,
      "end try;",
    ].join("\n");
    const raw = await this.process.request(command, { timeoutMs: options.timeoutMs });
    const withMetadata = {
      ...base,
      version: this.process.version,
      process_startup_ms: this.process.startupMs,
      request_wall_ms: raw.wall_ms,
    };
    if (raw.status !== "ok") return { ...withMetadata, ...raw, line: undefined };
    const fields = raw.line.trim().split(/\s+/);
    if (fields[0] !== requestId || fields[1] !== "OK") {
      return {
        ...withMetadata,
        status: "crash",
        reason: fields.slice(2).join("\t") || "invalid Magma response",
        raw_line: raw.line,
        output_lines: raw.output_lines,
      };
    }
    const parsedSamples = fields[3].split(";").map((entry) => {
      const [construction, order, materialization] = entry.split(",").map(Number);
      return {
        timing_ms: order,
        stages: {
          field_construction: construction,
          maximal_order: order,
          public_object_materialization: materialization,
          certification: "verified-by-independent-harness",
        },
      };
    });
    const entries = (raw.output_lines || [])
      .filter((line) => line.startsWith(`@@NFMO_ENTRY@@${requestId} `))
      .map((line) => line.slice(`@@NFMO_ENTRY@@${requestId} `.length).trim().split(/\s+/));
    const degree = caseSpec.polynomial.coefficients.length - 1;
    const basis = Array.from({ length: degree }, () => Array(degree).fill(null));
    for (const [row, column, numerator, denominator] of entries) {
      basis[Number(row) - 1][Number(column) - 1] = `${numerator}/${denominator}`;
    }
    return {
      ...withMetadata,
      status: "ok",
      peak_rss_kb: raw.peak_rss_kb,
      peak_rss_scope: raw.peak_rss_scope,
      peak_rss_observed_processes: raw.peak_rss_observed_processes,
      irreducible_verified: fields[2] === "true",
      samples: parsedSamples,
      statistics: robustStatistics(parsedSamples),
      field_discriminant: fields[4],
      basis,
      certified: true,
    };
  }

  close() {
    this.process.close();
  }
}
MagmaAdapter.nextId = 0;

function createAdapters(config = {}) {
  const memoryMb = config.memoryMb || 4096;
  const memoryFor = (system) => config.systemMemoryMb?.[system] || memoryMb;
  const adapters = {
    sagejs: new JsonWorkerAdapter({
      id: "sagejs",
      family: "sagejs",
      boundary: "warm-public",
      command: process.execPath,
      args: [`--max-old-space-size=${Math.floor(memoryFor("sagejs") * 0.75)}`, resolve(WORKERS, "sagejs.cjs")],
      env: { SAGEJS_ROOT: ROOT },
      startupTimeoutMs: 30_000,
    }),
    "sagejs-dynamic": new JsonWorkerAdapter({
      id: "sagejs-dynamic",
      family: "sagejs",
      boundary: "dynamic-public",
      command: process.execPath,
      args: [`--max-old-space-size=${Math.floor(memoryFor("sagejs-dynamic") * 0.75)}`, resolve(WORKERS, "sagejs.cjs")],
      env: { SAGEJS_ROOT: ROOT, SAGEJS_NATIVE_DISABLE: "1" },
      startupTimeoutMs: 30_000,
    }),
    "sagejs-native": new JsonWorkerAdapter({
      id: "sagejs-native",
      family: "sagejs",
      boundary: "native-public",
      command: process.execPath,
      args: [`--max-old-space-size=${Math.floor(memoryFor("sagejs-native") * 0.75)}`, resolve(WORKERS, "sagejs.cjs")],
      env: { SAGEJS_ROOT: ROOT },
      startupTimeoutMs: 30_000,
    }),
    sage: new JsonWorkerAdapter({
      id: "sage",
      family: "pari-sage",
      boundary: "warm-public",
      command: config.sage || "/home/user/bin/sagelite",
      args: [resolve(WORKERS, "sage.py")],
      memoryMb: memoryFor("sage"),
      startupTimeoutMs: 30_000,
    }),
    pari: new PariAdapter({
      executable: config.pari || "/usr/bin/gp",
      memoryMb: memoryFor("pari"),
    }),
    hecke: new JuliaAdapter({
      id: "hecke",
      project: config.heckeProject || "/home/user/upstream/Hecke.jl",
      executable: config.julia,
      memoryMb: memoryFor("hecke"),
    }),
    oscar: new JuliaAdapter({
      id: "oscar",
      project: config.oscarProject || "/home/user/upstream/Oscar.jl",
      executable: config.julia,
      memoryMb: memoryFor("oscar"),
    }),
  };
  if (config.enableMagma) {
    adapters.magma = new MagmaAdapter({
      executable: config.magma,
      memoryMb: memoryFor("magma"),
    });
  }
  return adapters;
}

function localCapabilities(config = {}) {
  const magmaPath = config.magma || "/home/user/bin/magma";
  let magma = {
    status: "disabled",
    reason: "Magma capability probing is opt-in",
  };
  if (config.enableMagma || config.probeMagma) {
    const magmaProbe = spawnSync(magmaPath, ["-b"], {
      input: 'ma,mi,pa := GetVersion(); printf "Magma %o.%o-%o\\n", ma,mi,pa; quit;\n',
      encoding: "utf8",
      timeout: 10_000,
    });
    magma = magmaProbe.error
      ? {
          status: magmaProbe.error.code === "ENOENT" ? "unavailable" :
            magmaProbe.error.code === "ETIMEDOUT" ? "timeout" : "crash",
          reason: magmaProbe.error.message,
        }
      : {
          status: magmaProbe.status === 0 ? "ok" : "crash",
          version: String(magmaProbe.stdout || magmaProbe.stderr).trim().split(/\r?\n/)[0],
          exit_code: magmaProbe.status,
        };
  }
  return {
    sage: commandVersion(config.sage || "/home/user/bin/sagelite", ["--version"]),
    pari: commandVersion(config.pari || "/usr/bin/gp", ["--version"]),
    julia: commandVersion(config.julia || "/home/user/.local/bin/julia", ["--version"]),
    magma,
    implementation_families: {
      "pari-sage": ["pari", "sage"],
      "hecke-oscar": ["hecke", "oscar"],
      magma: ["magma"],
      sagejs: ["sagejs", "sagejs-dynamic", "sagejs-native"],
    },
  };
}

module.exports = {
  ROOT,
  SYSTEMS,
  createAdapters,
  gitRevision,
  localCapabilities,
  median,
  parseBasisEncoding,
  robustStatistics,
};
