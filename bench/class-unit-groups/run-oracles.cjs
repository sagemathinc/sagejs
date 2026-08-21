#!/usr/bin/env node
"use strict";

// Developer-only harness. External computer algebra systems are offline
// oracles and are never Sage.js runtime dependencies.

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const here = __dirname;
const repositoryRoot = path.resolve(here, "../..");
const defaultFixture = path.join(
  repositoryRoot,
  "test/fixtures/number-field-class-unit-oracles.json",
);

function usage() {
  console.log(`Usage: node ${path.relative(repositoryRoot, __filename)} [options]

Options:
  --tier NAME       quick, core, extended, stress, or all (default: core)
  --samples N       persistent-process samples per proof mode (default: 1)
  --sage PATH       Sage launcher (default: /home/user/sagelite/sage)
  --magma PATH      Magma launcher (default: /home/user/bin/magma)
  --fixture PATH    alternate corpus/baseline JSON
  --output PATH     write a full candidate oracle receipt
  --check           compare stable mathematical projections with the baseline
  --no-sage         record Sage/PARI as unavailable
  --no-magma        record Magma as unavailable
  --require-sage    fail if Sage/PARI is unavailable
  --require-magma   fail if Magma is unavailable
  --help            show this text`);
}

function parseArguments(argv) {
  const options = {
    tier: "core",
    samples: 1,
    sage: process.env.SAGE_ORACLE || "/home/user/sagelite/sage",
    magma: process.env.MAGMA_ORACLE || "/home/user/bin/magma",
    fixture: defaultFixture,
    output: null,
    check: false,
    runSage: true,
    runMagma: true,
    requireSage: false,
    requireMagma: false,
  };
  const valueOptions = new Set([
    "--tier",
    "--samples",
    "--sage",
    "--magma",
    "--fixture",
    "--output",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    } else if (argument === "--check") options.check = true;
    else if (argument === "--no-sage") options.runSage = false;
    else if (argument === "--no-magma") options.runMagma = false;
    else if (argument === "--require-sage") options.requireSage = true;
    else if (argument === "--require-magma") options.requireMagma = true;
    else if (valueOptions.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      const key = {
        "--tier": "tier",
        "--samples": "samples",
        "--sage": "sage",
        "--magma": "magma",
        "--fixture": "fixture",
        "--output": "output",
      }[argument];
      options[key] = value;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  options.samples = Number(options.samples);
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    throw new Error("--samples must be a positive integer");
  }
  return options;
}

function selectedCases(fixture, tier) {
  if (tier === "all") return fixture.cases;
  return fixture.cases.filter((entry) => entry.tiers.includes(tier));
}

function validateFixture(fixture) {
  if (
    fixture.schema_version !== 1 ||
    !Array.isArray(fixture.cases) ||
    !Array.isArray(fixture.regulator_precisions_bits)
  ) {
    throw new Error("unsupported class/unit oracle fixture schema");
  }
  const ids = new Set();
  for (const entry of fixture.cases) {
    if (ids.has(entry.id)) throw new Error(`duplicate case id: ${entry.id}`);
    ids.add(entry.id);
    if (
      !Array.isArray(entry.polynomial) ||
      entry.polynomial.some((value) => !/^-?\d+$/.test(value)) ||
      entry.polynomial.at(-1) !== "1"
    ) {
      throw new Error(`${entry.id}: polynomial must be monic decimal integers`);
    }
    if (!Array.isArray(entry.ideal_probe_primes) || entry.ideal_probe_primes.length < 1) {
      throw new Error(`${entry.id}: at least one ideal probe prime is required`);
    }
  }
  const requiredIds = [
    "rational",
    "real-quadratic-discriminant-12",
    "quintic-discriminant-380452-c4",
  ];
  for (const id of requiredIds) {
    if (!ids.has(id)) throw new Error(`corpus lacks required case ${id}`);
  }
}

function unavailable(family, executable, reason) {
  return {
    implementation_family: family,
    status: "unavailable",
    executable,
    reason,
    records: [],
  };
}

function runExternal(executable, args, options = {}) {
  const timeoutMilliseconds = options.timeout || 600_000;
  const spawnOptions = { ...options };
  delete spawnOptions.timeout;
  if (process.platform !== "win32" && fs.existsSync("/usr/bin/timeout")) {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMilliseconds / 1000));
    const run = childProcess.spawnSync(
      "/usr/bin/timeout",
      ["--signal=TERM", "--kill-after=5s", `${timeoutSeconds}s`, executable, ...args],
      { ...spawnOptions, timeout: timeoutMilliseconds + 10_000, killSignal: "SIGKILL" },
    );
    if (run.status === 124 || run.status === 137) {
      run.error = new Error(`external oracle timed out after ${timeoutSeconds}s`);
    }
    return run;
  }
  return childProcess.spawnSync(executable, args, {
    ...spawnOptions,
    timeout: timeoutMilliseconds,
    killSignal: "SIGKILL",
  });
}

function runSage(options) {
  if (!options.runSage) return unavailable("Sage/PARI", options.sage, "disabled");
  if (!fs.existsSync(options.sage)) {
    return unavailable("Sage/PARI", options.sage, "executable does not exist");
  }
  const started = process.hrtime.bigint();
  const run = runExternal(
    options.sage,
    [
      "-python",
      path.join(here, "sage_oracle.py"),
      "--fixture",
      path.resolve(options.fixture),
      "--tier",
      options.tier,
      "--samples",
      String(options.samples),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      timeout: 600_000,
    },
  );
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (run.error || run.status !== 0) {
    throw new Error(
      `Sage/PARI oracle failed: ${run.error?.message || `exit ${run.status}`}\n${run.stderr}`,
    );
  }
  const result = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  result.status = "ok";
  result.executable = path.resolve(options.sage);
  result.process_total_seconds = processSeconds;
  result.startup_and_shutdown_overhead_seconds = Math.max(
    0,
    processSeconds - result.internal_total_seconds,
  );
  result.warning_output = run.stderr.trim();
  return result;
}

function magmaProgram(cases, samples) {
  const lines = [
    "SetSeed(1);",
    "SetColumns(1024);",
    "Qx<x> := PolynomialRing(Rationals());",
    "major, minor, patch := GetVersion();",
    'printf "SAGEJS_CU_META|%o|%o|%o\\n", major, minor, patch;',
    "function JoinValues(values)",
    '  if #values eq 0 then return ""; end if;',
    '  return Join([ Sprint(value) : value in values ], ",");',
    "end function;",
    "function MatrixText(value)",
    "  rows := [];",
    '  for row := 1 to Nrows(value) do Append(~rows, JoinValues(Eltseq(value[row]))); end for;',
    '  return Join(rows, ";");',
    "end function;",
    "function IdealMatrixText(ideal)",
    "  return MatrixText(HermiteForm(BasisMatrix(ideal)));",
    "end function;",
    "function ElementText(value, field)",
    "  return JoinValues(Eltseq(field ! value));",
    "end function;",
    "function NormalizedPrincipalText(value, field)",
    "  sequence := Eltseq(field ! value);",
    "  for coefficient in sequence do",
    "    if coefficient ne 0 then if coefficient lt 0 then sequence := [-entry : entry in sequence]; end if; break; end if;",
    "  end for;",
    "  return JoinValues(sequence);",
    "end function;",
    "function MedianValue(values)",
    "  Sort(~values); n := #values;",
    "  if IsOdd(n) then return values[(n + 1) div 2]; end if;",
    "  return (values[n div 2] + values[n div 2 + 1]) / 2;",
    "end function;",
  ];

  for (const entry of cases) {
    const id = entry.id;
    if (entry.kind === "rational") {
      lines.push(
        `printf "SAGEJS_CU_FIELD|${id}|1|1|0|1|1|1|1|1|1\\n";`,
        `printf "SAGEJS_CU_MODE|${id}|conditional_grh|exact-relations-conditional-grh||1|2|2|0|0.000000\\n";`,
        `printf "SAGEJS_CU_MODE|${id}|unconditional|exact-unconditional||1|2|2|0|0.000000\\n";`,
        `printf "SAGEJS_CU_UGEN|${id}|conditional_grh|0|torsion|-1|-1\\n";`,
        `printf "SAGEJS_CU_UGEN|${id}|unconditional|0|torsion|-1|-1\\n";`,
        `printf "SAGEJS_CU_REG|${id}|1.000000000000000000000000000000\\n";`,
      );
      for (const prime of entry.ideal_probe_primes) {
        lines.push(
          `printf "SAGEJS_CU_IDEAL|${id}|${prime}|${prime}|1|1|${prime}||1|true|${prime}\\n";`,
        );
      }
      continue;
    }

    const coefficients = entry.polynomial.join(",");
    const primes = entry.ideal_probe_primes.join(",");
    lines.push(
      `f := Qx![${coefficients}];`,
      "K<a> := NumberField(f); O := MaximalOrder(K);",
      "r1, r2 := Signature(K);",
      "equation_discriminant := Integers() ! Discriminant(f);",
      "field_discriminant := Integers() ! Discriminant(O);",
      "equation_order_index := Isqrt(Abs(equation_discriminant div field_discriminant));",
      'basis_text := Join([ ElementText(value, K) : value in Basis(O) ], ";");',
      `printf "SAGEJS_CU_FIELD|${id}|%o|%o|%o|%o|%o|%o|%o|%o|%o\\n", Degree(K), r1, r2, equation_discriminant, field_discriminant, equation_order_index, MinkowskiBound(K), BachBound(K), basis_text;`,
    );

    for (const [mode, proof, label] of [
      ["conditional_grh", "GRH", "exact-relations-conditional-grh"],
      ["unconditional", "Full", "exact-unconditional"],
    ]) {
      lines.push(
        "context_times := [];",
        `for sample := 1 to ${samples} do`,
        `  Ks<as> := NumberField(f); Os := MaximalOrder(Ks); started := Cputime(); Cs, ms := ClassGroup(Os : Proof := "${proof}"); Us, mus := UnitGroup(Os); Append(~context_times, Cputime(started));`,
        "end for;",
        `printf "SAGEJS_CU_MODE|${id}|${mode}|${label}|%o|%o|%o|%o|%o|%.6o\\n", JoinValues(Invariants(Cs)), #Cs, JoinValues(Invariants(Us)), Invariants(Us)[1], UnitRank(Ks), MedianValue(context_times);`,
        "class_generators := OrderedGenerators(Cs);",
        "for generator_index := 1 to #class_generators do",
        "  generator := class_generators[generator_index]; ideal := ms(generator);",
        `  printf "SAGEJS_CU_CGEN|${id}|${mode}|%o|%o|%o|%o\\n", generator_index - 1, Order(generator), Norm(ideal), IdealMatrixText(ideal);`,
        "end for;",
        "unit_generators := OrderedGenerators(Us);",
        "for generator_index := 1 to #unit_generators do",
        "  unit := mus(unit_generators[generator_index]); kind := generator_index eq 1 select \"torsion\" else \"free\";",
        `  printf "SAGEJS_CU_UGEN|${id}|${mode}|%o|%o|%o|%o\\n", generator_index - 1, kind, Norm(Ks ! unit), ElementText(unit, Ks);`,
        "end for;",
        `if "${mode}" eq "unconditional" then`,
        "  Kfull := Ks; Ofull := Os; Cfull := Cs; mfull := ms; Ufull := Us; mufull := mus;",
        "end if;",
      );
    }

    lines.push(
      `printf "SAGEJS_CU_REG|${id}|%.30o\\n", Regulator(Ofull);`,
      `for rational_prime in [${primes}] do`,
      "  factors := Factorization(rational_prime * Ofull);",
      "  for pair in factors do",
      "    ideal := pair[1]; ramification_index := pair[2]; ideal_norm := Integers() ! Norm(ideal);",
      "    residue_degree := 0; remaining := ideal_norm;",
      "    while remaining gt 1 do assert IsDivisibleBy(remaining, rational_prime); remaining div:= rational_prime; residue_degree +:= 1; end while;",
      "    ideal_class := ideal @@ mfull; principal := IsPrincipal(ideal); principal_text := \"\";",
      "    if principal then _, principal_generator := IsPrincipal(ideal); principal_text := NormalizedPrincipalText(principal_generator, Kfull); end if;",
      `    printf "SAGEJS_CU_IDEAL|${id}|%o|%o|%o|%o|%o|%o|%o|%o|%o\\n", rational_prime, ideal_norm, ramification_index, residue_degree, IdealMatrixText(ideal), JoinValues(Eltseq(ideal_class)), Order(ideal_class), principal, principal_text;`,
      "  end for;",
      "end for;",
      "class_generators := OrderedGenerators(Cfull);",
      "for generator_index := 1 to #class_generators do",
      "  generator := class_generators[generator_index]; exponent := Order(generator); base_ideal := mfull(generator); relation_ideal := base_ideal^exponent; relation_class := relation_ideal @@ mfull;",
      "  principal, principal_generator := IsPrincipal(relation_ideal); assert principal;",
      `  printf "SAGEJS_CU_REL|${id}|%o|%o|%o|%o|%o|%o\\n", generator_index - 1, exponent, IdealMatrixText(base_ideal), IdealMatrixText(relation_ideal), JoinValues(Eltseq(relation_class)), NormalizedPrincipalText(principal_generator, Kfull);`,
      "end for;",
    );
  }
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function splitValues(value) {
  return value === "" ? [] : value.split(",");
}

function splitMatrix(value) {
  return value === "" ? [] : value.split(";").map(splitValues);
}

function parseMagmaOutput(stdout, cases, samples) {
  const records = new Map();
  for (const entry of cases) {
    records.set(entry.id, {
      id: entry.id,
      status: "ok",
      proof_modes: {},
      prime_ideal_probes: [],
      generator_relation_probes: [],
      timing: { samples },
    });
  }
  let version = "unknown";
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("SAGEJS_CU_")) continue;
    const fields = line.split("|");
    const type = fields[0].slice("SAGEJS_CU_".length);
    if (type === "META") {
      version = fields.slice(1, 4).join(".");
      continue;
    }
    const record = records.get(fields[1]);
    if (!record) throw new Error(`Magma returned unknown case ${fields[1]}`);
    if (type === "FIELD") {
      record.degree = Number(fields[2]);
      record.signature = [Number(fields[3]), Number(fields[4])];
      record.equation_discriminant = fields[5];
      record.field_discriminant = fields[6];
      record.equation_order_index = fields[7];
      record.bounds = { minkowski_integer: fields[8], bach_grh_integer: fields[9] };
      record.maximal_order_basis = splitMatrix(fields[10]);
    } else if (type === "MODE") {
      const mode = fields[2];
      record.proof_modes[mode] = {
        proof_status: fields[3],
        class_group: {
          invariant_factors: splitValues(fields[4]),
          order: fields[5],
          generators: [],
        },
        unit_group: {
          invariant_factors: splitValues(fields[6]),
          torsion_order: fields[7],
          rank: Number(fields[8]),
          generators: [],
        },
      };
      record.timing[`${mode}_context_median_cpu_seconds`] = Number(fields[9]);
    } else if (type === "CGEN") {
      const group = record.proof_modes[fields[2]].class_group;
      group.generators.push({
        generator_index: Number(fields[3]),
        order: fields[4],
        norm: fields[5],
        hnf: splitMatrix(fields[6]),
      });
    } else if (type === "UGEN") {
      if (!record.proof_modes[fields[2]]) {
        throw new Error(`Magma unit generator preceded its mode: ${line}`);
      }
      const group = record.proof_modes[fields[2]].unit_group;
      group.generators.push({
        generator_index: Number(fields[3]),
        kind: fields[4],
        norm: fields[5],
        power_basis: splitValues(fields[6]),
      });
    } else if (type === "REG") {
      record.regulator_decimal = fields[2];
    } else if (type === "IDEAL") {
      record.prime_ideal_probes.push({
        rational_prime: fields[2],
        norm: fields[3],
        ramification_index: Number(fields[4]),
        residue_degree: Number(fields[5]),
        hnf: splitMatrix(fields[6]),
        class_log: splitValues(fields[7]),
        class_order: fields[8],
        is_principal: fields[9] === "true",
        principal_generator: splitValues(fields[10]),
      });
    } else if (type === "REL") {
      record.generator_relation_probes.push({
        generator_index: Number(fields[2]),
        exponent: fields[3],
        base_ideal_hnf: splitMatrix(fields[4]),
        relation_ideal_hnf: splitMatrix(fields[5]),
        relation_class_log: splitValues(fields[6]),
        principal_generator: splitValues(fields[7]),
      });
    }
  }
  for (const record of records.values()) {
    if (record.degree === undefined) throw new Error(`Magma omitted ${record.id}`);
    record.prime_ideal_probes.sort((left, right) => {
      const leftKey = [BigInt(left.rational_prime), BigInt(left.norm), JSON.stringify(left.hnf)];
      const rightKey = [BigInt(right.rational_prime), BigInt(right.norm), JSON.stringify(right.hnf)];
      if (leftKey[0] !== rightKey[0]) return leftKey[0] < rightKey[0] ? -1 : 1;
      if (leftKey[1] !== rightKey[1]) return leftKey[1] < rightKey[1] ? -1 : 1;
      return leftKey[2].localeCompare(rightKey[2]);
    });
  }
  return {
    schema_version: 1,
    implementation_family: "Magma",
    versions: { magma: version },
    settings: {
      tier: null,
      samples,
      conditional_proof_parameter: "GRH",
      unconditional_proof_parameter: "Full",
      timing_clock: "Cputime (coarse)",
    },
    records: [...records.values()],
  };
}

function runMagma(options, cases) {
  if (!options.runMagma) return unavailable("Magma", options.magma, "disabled");
  if (!fs.existsSync(options.magma)) {
    return unavailable("Magma", options.magma, "executable does not exist");
  }
  const started = process.hrtime.bigint();
  const run = runExternal(options.magma, ["-b"], {
    cwd: repositoryRoot,
    input: magmaProgram(cases, options.samples),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 600_000,
  });
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (run.error || run.status !== 0) {
    throw new Error(
      `Magma oracle failed: ${run.error?.message || `exit ${run.status}`}\n${run.stdout}\n${run.stderr}`,
    );
  }
  if (process.env.SAGEJS_CLASS_UNIT_MAGMA_TRANSCRIPT) {
    fs.writeFileSync(process.env.SAGEJS_CLASS_UNIT_MAGMA_TRANSCRIPT, run.stdout);
  }
  const result = parseMagmaOutput(run.stdout, cases, options.samples);
  result.status = "ok";
  result.executable = path.resolve(options.magma);
  result.process_total_seconds = processSeconds;
  result.warning_output = run.stderr.trim();
  result.settings.tier = options.tier;
  return result;
}

function mapById(records) {
  return new Map(records.map((entry) => [entry.id, entry]));
}

function structuralIdealProjection(record) {
  return record.prime_ideal_probes
    .map((entry) => ({
      rational_prime: entry.rational_prime,
      norm: entry.norm,
      ramification_index: entry.ramification_index,
      residue_degree: entry.residue_degree,
      class_order: entry.class_order,
      is_principal: entry.is_principal,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function crossValidate(sage, magma, cases) {
  if (sage.status !== "ok" || magma.status !== "ok") return;
  const sageRecords = mapById(sage.records);
  const magmaRecords = mapById(magma.records);
  for (const entry of cases) {
    const left = sageRecords.get(entry.id);
    const right = magmaRecords.get(entry.id);
    if (!left || !right) throw new Error(`${entry.id}: missing cross-oracle record`);
    for (const key of [
      "degree",
      "signature",
      "equation_discriminant",
      "field_discriminant",
      "equation_order_index",
    ]) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
        throw new Error(`${entry.id}: Sage/Magma ${key} disagreement`);
      }
    }
    for (const mode of ["conditional_grh", "unconditional"]) {
      const leftMode = left.proof_modes[mode];
      const rightMode = right.proof_modes[mode];
      for (const key of ["invariant_factors", "order"]) {
        if (
          JSON.stringify(leftMode.class_group[key]) !==
          JSON.stringify(rightMode.class_group[key])
        ) {
          throw new Error(`${entry.id}: ${mode} class-group ${key} disagreement`);
        }
      }
      for (const key of ["rank", "torsion_order"]) {
        if (
          JSON.stringify(leftMode.unit_group[key]) !==
          JSON.stringify(rightMode.unit_group[key])
        ) {
          throw new Error(`${entry.id}: ${mode} unit-group ${key} disagreement`);
        }
      }
    }
    if (
      JSON.stringify(structuralIdealProjection(left)) !==
      JSON.stringify(structuralIdealProjection(right))
    ) {
      throw new Error(`${entry.id}: prime-ideal map structure disagreement`);
    }
    const sageBall = left.regulators[0];
    const sageMidpoint = (Number(sageBall.lower) + Number(sageBall.upper)) / 2;
    const magmaRegulator = Number(right.regulator_decimal);
    const scale = Math.max(1, Math.abs(sageMidpoint));
    if (Math.abs(sageMidpoint - magmaRegulator) > 1e-12 * scale) {
      throw new Error(`${entry.id}: Sage/Magma regulator disagreement`);
    }
  }
}

function stableRecordProjection(record) {
  return {
    id: record.id,
    degree: record.degree,
    signature: record.signature,
    equation_discriminant: record.equation_discriminant,
    field_discriminant: record.field_discriminant,
    equation_order_index: record.equation_order_index,
    proof_modes: record.proof_modes,
    prime_ideal_probes: record.prime_ideal_probes,
    generator_relation_probes: record.generator_relation_probes,
    regulators: record.regulators,
    regulator_decimal: record.regulator_decimal,
    bounds: record.bounds,
  };
}

function stableOracleProjection(oracle) {
  return oracle.records.map(stableRecordProjection);
}

function checkBaseline(result, fixture, tier) {
  if (!fixture.oracle_baseline) {
    throw new Error("fixture has no oracle_baseline; generate and review a candidate first");
  }
  for (const family of ["sage_pari", "magma"]) {
    const current = result.oracles[family];
    if (current.status !== "ok") continue;
    const baseline = fixture.oracle_baseline.oracles[family];
    const selectedIds = new Set(selectedCases(fixture, tier).map((entry) => entry.id));
    const expected = {
      records: baseline.records.filter((entry) => selectedIds.has(entry.id)),
    };
    const actual = { records: stableOracleProjection(current) };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${family}: stable result differs from the pinned baseline`);
    }
  }
}

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = JSON.parse(fs.readFileSync(options.fixture, "utf8"));
  validateFixture(fixture);
  const cases = selectedCases(fixture, options.tier);
  if (cases.length === 0) throw new Error(`tier ${options.tier} selects no cases`);

  const sage = runSage(options);
  const magma = runMagma(options, cases);
  if (options.requireSage && sage.status !== "ok") throw new Error(sage.reason);
  if (options.requireMagma && magma.status !== "ok") throw new Error(magma.reason);
  if (sage.status === "ok") {
    const observedInvalid = new Map(
      (sage.invalid_inputs || []).map((entry) => [entry.id, entry.status]),
    );
    for (const entry of fixture.invalid_inputs || []) {
      if (observedInvalid.get(entry.id) !== entry.expected_status) {
        throw new Error(`${entry.id}: invalid-input rejection changed`);
      }
    }
  }
  crossValidate(sage, magma, cases);

  const hecke = unavailable(
    "Hecke/Oscar",
    "julia",
    "Julia is not installed on the capture host; Hecke remains an optional third family and is not counted as agreement",
  );
  hecke.source = {
    hecke_version: "0.40.0",
    hecke_commit: "66af28e52682620edb302931fce3f9ac87fc4eb7",
    oscar_version: "1.9.0-DEV",
    oscar_commit: "fc8e4973faab0ba4174330f9b285bf8447eacc42",
  };

  const result = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    tier: options.tier,
    fixture_sha256: sha256File(path.resolve(options.fixture)),
    host: {
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
      cpu: os.cpus()[0]?.model || "unknown",
    },
    oracles: { sage_pari: sage, magma, hecke_oscar: hecke },
  };

  if (options.check) checkBaseline(result, fixture, options.tier);
  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`);
  }
  const summary = {
    tier: options.tier,
    cases: cases.length,
    sage_pari: sage.status,
    magma: magma.status,
    hecke_oscar: hecke.status,
    cross_oracle_agreement: sage.status === "ok" && magma.status === "ok",
    checked_baseline: options.check,
    output: options.output ? path.resolve(options.output) : null,
  };
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
