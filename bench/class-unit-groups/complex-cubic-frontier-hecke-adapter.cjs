#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const common = require("./complex-cubic-frontier-external-adapter.cjs");

const EXPECTED_HECKE_VERSION = "0.40.0";
const EXPECTED_HECKE_COMMIT = "66af28e52682620edb302931fce3f9ac87fc4eb7";
const EXPECTED_JULIA_VERSION = "1.12.7";
const MARKER_PREFIX = "SAGEJS_CC_HECKE_";

function juliaString(value) {
  return JSON.stringify(value);
}

function coefficientLiteral(value) {
  return `parse(BigInt, ${juliaString(value)})`;
}

function recordLiteral(record) {
  return `(${juliaString(record.label)}, BigInt[${record.coefficients.map(coefficientLiteral).join(",")}])`;
}

function recordsLiteral(records) {
  return `[${records.map(recordLiteral).join(",")}]`;
}

function prelude(request) {
  return `using Hecke
import Nemo, AbstractAlgebra

VERSION == v"${EXPECTED_JULIA_VERSION}" ||
    error("frontier adapter requires Julia ${EXPECTED_JULIA_VERSION}")
pkgversion(Hecke) == v"${EXPECTED_HECKE_VERSION}" ||
    error("frontier adapter requires Hecke ${EXPECTED_HECKE_VERSION}")
Threads.nthreads() == 1 || error("frontier adapter requires one Julia thread")

const SAGEJS_QQX, SAGEJS_X = polynomial_ring(QQ, "x"; cached=false)
const SAGEJS_MINIMUM_ROOT_NS = UInt64(${request.minimum_retained_root_nanoseconds})

function sagejs_fresh_order(coefficients, name)
    polynomial = SAGEJS_QQX(0)
    for (exponent, coefficient) in enumerate(coefficients)
        polynomial += ZZ(coefficient) * SAGEJS_X^(exponent - 1)
    end
    field, generator = number_field(polynomial, name; cached=false)
    return maximal_order(field)
end

function sagejs_class_answer(order_value)
    group, group_map = class_group(order_value; GRH=true, redo=true)
    invariants = filter(value -> value > 1, elementary_divisors(group))
    class_number = Hecke.order(group)
    product(invariants; init=ZZ(1)) == class_number ||
        error("class invariant product mismatch")
    invariant_text = "[" * join(string.(invariants), ",") * "]"
    return string(class_number), invariant_text
end

function sagejs_assert_grh_context(order_value)
    reduced_order = lll(maximal_order(nf(order_value)))
    context = get_attribute(reduced_order, :ClassGrpCtx)
    (context !== nothing && context.GRH) ||
        error("Hecke did not retain a GRH class-group context")
end

function sagejs_error_text(error_value)
    return replace(sprint(showerror, error_value), "|" => "/", '\\n' => " ")
end
`;
}

function censusSource(request) {
  const records = request.shards.flat();
  return `${prelude(request)}
records = ${recordsLiteral(records)}
for (record_index, (label, coefficients)) in enumerate(records)
    try
        order_value = sagejs_fresh_order(coefficients, "sagejs_census_$(record_index)")
        class_number, invariants = sagejs_class_answer(order_value)
        sagejs_assert_grh_context(order_value)
        println(${juliaString(`${MARKER_PREFIX}CENSUS|`)} * label * "|" *
            string(discriminant(order_value)) * "|" * class_number * "|" * invariants)
    catch error_value
        println(${juliaString(`${MARKER_PREFIX}ERROR|`)} * label * "|" *
            sagejs_error_text(error_value))
    end
end
`;
}

function timingSource(request) {
  const shards = `[${request.shards.map(recordsLiteral).join(",")}]`;
  const warmups = recordsLiteral(request.warmups);
  const boundaries = `[${request.boundaries.map(juliaString).join(",")}]`;
  return `${prelude(request)}
warmups = ${warmups}
shards = ${shards}
boundaries = ${boundaries}

function sagejs_run_batch(records, boundary, iterations, serial)
    1 <= iterations <= 1_048_576 || error("unsafe timing iteration count")
    prepared = boundary == "scalar-prepared" ? [
        sagejs_fresh_order(
            record[2],
            "sagejs_prepared_$(serial)_$(repeat_index)_$(record_index)",
        )
        for repeat_index in 1:iterations for (record_index, record) in enumerate(records)
    ] : nothing
    answers = fill("", length(records))
    per_nanoseconds = fill(UInt128(0), length(records))
    position = 1
    root_started = time_ns()
    for repeat_index in 1:iterations
        for (record_index, record) in enumerate(records)
            field_started = time_ns()
            if prepared === nothing
                order_value = sagejs_fresh_order(
                    record[2],
                    "sagejs_fresh_$(serial)_$(repeat_index)_$(record_index)",
                )
            else
                order_value = prepared[position]
                position += 1
            end
            class_number, invariants = sagejs_class_answer(order_value)
            per_nanoseconds[record_index] += time_ns() - field_started
            answer = class_number * "#" * invariants
            if repeat_index == 1
                answers[record_index] = answer
            else
                answers[record_index] == answer ||
                    error("repeated class-group answer changed")
            end
        end
    end
    root_nanoseconds = time_ns() - root_started
    diagnostics = [value ÷ UInt128(iterations) for value in per_nanoseconds]
    return root_nanoseconds, answers, diagnostics
end

for (warmup_index, warmup) in enumerate(warmups)
    order_value = sagejs_fresh_order(warmup[2], "sagejs_warmup_$(warmup_index)")
    warmup_answer = sagejs_class_answer(order_value)
    sagejs_assert_grh_context(order_value)
end

serial = 0
for boundary in boundaries
    for (shard_position, records) in enumerate(shards)
        iterations = 1
        while true
            serial += 1
            calibration_ns, calibration_answers, calibration_per =
                sagejs_run_batch(records, boundary, iterations, serial)
            calibration_ns >= SAGEJS_MINIMUM_ROOT_NS && break
            iterations *= 2
            iterations <= 1_048_576 ||
                error("calibration repetition safety limit exceeded")
        end
        while true
            serial += 1
            root_ns, answers, per_ns = sagejs_run_batch(records, boundary, iterations, serial)
            root_ns >= SAGEJS_MINIMUM_ROOT_NS && break
            iterations *= 2
            iterations <= 1_048_576 ||
                error("retained repetition safety limit exceeded")
        end
        println(${juliaString(`${MARKER_PREFIX}TIMING|`)} * boundary * "|" *
            string(shard_position - 1) * "|" * string(iterations) * "|" *
            string(root_ns) * "|" * join(answers, ";") * "|" *
            join(string.(per_ns), ",") * "|" * string(length(records)))
    end
end
`;
}

function source(request) {
  return request.mode === "census" ? censusSource(request) : timingSource(request);
}

function juliaArgs(project) {
  return [
    "--startup-file=no",
    "--history-file=no",
    "--threads=1",
    "--compiled-modules=yes",
    "--pkgimages=yes",
    `--project=${project}`,
    "-",
  ];
}

function juliaEnvironment(depot) {
  return {
    JULIA_DEPOT_PATH: depot,
    JULIA_LOAD_PATH: "@:@stdlib",
    JULIA_PKG_OFFLINE: "true",
    JULIA_NUM_THREADS: "1",
  };
}

function executeJulia(executable, project, depot, program, timeout) {
  return common.run(executable, juliaArgs(project), {
    input: program,
    env: juliaEnvironment(depot),
    timeout,
  });
}

function runtimeIdentity() {
  const requested = process.env.JULIA_ORACLE ||
    (fs.existsSync("/home/user/.juliaup/bin/julia")
      ? "/home/user/.juliaup/bin/julia"
      : "julia");
  const executable = common.resolveExecutable(requested);
  const project = fs.realpathSync(
    process.env.HECKE_ORACLE_PROJECT || process.env.HECKE_PROJECT ||
      "/home/user/upstream/Hecke.jl",
  );
  const depot = fs.realpathSync(
    process.env.HECKE_ORACLE_DEPOT || process.env.JULIA_DEPOT_PATH ||
      "/home/user/upstream/julia-class-unit-depot",
  );
  const projectToml = path.join(project, "Project.toml");
  const manifestToml = path.join(project, "Manifest.toml");
  if (!fs.statSync(projectToml, { throwIfNoEntry: false })?.isFile() ||
      !fs.statSync(manifestToml, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Hecke identity requires Project.toml and Manifest.toml");
  }
  const projectText = fs.readFileSync(projectToml, "utf8");
  const declaredVersion = /^version\s*=\s*"([^"]+)"/m.exec(projectText)?.[1];
  if (declaredVersion !== EXPECTED_HECKE_VERSION) {
    throw new Error(`Hecke ${EXPECTED_HECKE_VERSION} project is required`);
  }
  const commit = common.gitValue(project, ["rev-parse", "HEAD"]);
  const tree = common.gitValue(project, ["rev-parse", "HEAD^{tree}"]);
  const dirty = common.gitValue(project, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (commit !== EXPECTED_HECKE_COMMIT || dirty !== "") {
    throw new Error(
      `Hecke source must be clean tag commit ${EXPECTED_HECKE_COMMIT}; got ${commit}`,
    );
  }
  const identityMarker = "SAGEJS_CC_HECKE_IDENTITY|";
  const probe = executeJulia(executable, project, depot, `using Hecke
import Nemo, AbstractAlgebra, FLINT_jll, GMP_jll, MPFR_jll, Libdl
items = [
    "julia-version" => string(VERSION),
    "julia-threads" => string(Threads.nthreads()),
    "julia-runtime" => joinpath(Sys.BINDIR, Base.julia_exename()),
    "hecke-version" => string(pkgversion(Hecke)),
    "nemo-version" => string(pkgversion(Nemo)),
    "abstractalgebra-version" => string(pkgversion(AbstractAlgebra)),
    "hecke-entrypoint" => pathof(Hecke),
    "nemo-entrypoint" => pathof(Nemo),
    "abstractalgebra-entrypoint" => pathof(AbstractAlgebra),
    "flint-library" => FLINT_jll.libflint_path,
    "gmp-library" => GMP_jll.libgmp_path,
    "mpfr-library" => MPFR_jll.libmpfr_path,
    "system-image" => unsafe_string(Base.JLOptions().image_file),
]
for (key, value) in items
    println(${juliaString(identityMarker)}, key, "|", value)
end
for library_path in sort!(unique!(filter(
    candidate -> isabspath(candidate) && isfile(candidate),
    Libdl.dllist(),
)))
    println(${juliaString(identityMarker)}, "loaded-library|", library_path)
end
`, 180_000);
  const fields = {};
  const loadedLibraries = [];
  for (const line of probe.stdout.split(/\r?\n/)) {
    if (!line.startsWith(identityMarker)) continue;
    const separator = line.indexOf("|", identityMarker.length);
    if (separator >= 0) {
      const key = line.slice(identityMarker.length, separator);
      const value = line.slice(separator + 1);
      if (key === "loaded-library") loadedLibraries.push(value);
      else fields[key] = value;
    }
  }
  const expected = [
    "julia-version", "julia-threads", "julia-runtime", "hecke-version", "nemo-version",
    "abstractalgebra-version", "hecke-entrypoint", "nemo-entrypoint",
    "abstractalgebra-entrypoint", "flint-library", "gmp-library", "mpfr-library",
    "system-image",
  ];
  if (expected.some((key) => !fields[key])) {
    throw new Error("Hecke runtime identity probe omitted a required component");
  }
  if (process.platform === "linux" && loadedLibraries.length === 0) {
    throw new Error("Hecke runtime identity probe omitted loaded libraries");
  }
  if (fields["julia-version"] !== EXPECTED_JULIA_VERSION ||
      fields["hecke-version"] !== EXPECTED_HECKE_VERSION ||
      fields["julia-threads"] !== "1") {
    throw new Error(
      `expected Julia ${EXPECTED_JULIA_VERSION}, Hecke ${EXPECTED_HECKE_VERSION}, one thread; ` +
      `got Julia ${fields["julia-version"]}, Hecke ${fields["hecke-version"]}, ` +
      `${fields["julia-threads"]} threads`,
    );
  }
  const heckeEntrypoint = fs.realpathSync(fields["hecke-entrypoint"]);
  const relativeEntrypoint = path.relative(project, heckeEntrypoint);
  if (relativeEntrypoint.startsWith("..") || path.isAbsolute(relativeEntrypoint)) {
    throw new Error("loaded Hecke entrypoint is outside the authenticated source checkout");
  }
  const artifactFields = [
    ["julia-runtime", fields["julia-runtime"]],
    ["julia-system-image", fields["system-image"]],
    ["hecke-entrypoint", fields["hecke-entrypoint"]],
    ["nemo-entrypoint", fields["nemo-entrypoint"]],
    ["abstractalgebra-entrypoint", fields["abstractalgebra-entrypoint"]],
    ["flint-library", fields["flint-library"]],
    ["gmp-library", fields["gmp-library"]],
    ["mpfr-library", fields["mpfr-library"]],
  ];
  const loadedArtifacts = [...new Set(loadedLibraries)].sort().flatMap((filename, index) => {
    const artifacts = [
      common.fileArtifact(`loaded-library-${String(index).padStart(3, "0")}`, filename),
    ];
    if (/\/compiled\/v[^/]+\//.test(filename) && filename.endsWith(".so")) {
      const cache = filename.replace(/\.so$/, ".ji");
      if (fs.statSync(cache, { throwIfNoEntry: false })?.isFile()) {
        artifacts.push(common.fileArtifact(
          `loaded-cache-${String(index).padStart(3, "0")}`,
          cache,
        ));
      }
    }
    return artifacts;
  });
  return {
    system: "hecke",
    version:
      `Julia ${fields["julia-version"]}; Hecke ${fields["hecke-version"]}; ` +
      `Nemo ${fields["nemo-version"]}; AbstractAlgebra ${fields["abstractalgebra-version"]}`,
    executable,
    project,
    depot,
    proof_setting: "class_group(order; GRH=true, redo=true)",
    proof_semantics: "Hecke GRH factor-base bound; exact relation arithmetic conditional on GRH",
    source_identity: { commit, tree, clean: true },
    environment: juliaEnvironment(depot),
    artifacts: [
      common.fileArtifact("julia-executable", executable),
      common.fileArtifact("project-toml", projectToml),
      common.fileArtifact("manifest-toml", manifestToml),
      ...artifactFields.map(([role, filename]) => common.fileArtifact(role, filename)),
      ...loadedArtifacts,
    ],
  };
}

function execute(runtime, program) {
  return executeJulia(runtime.executable, runtime.project, runtime.depot, program);
}

const implementation = {
  adapterFile: __filename,
  execute,
  markerPrefix: MARKER_PREFIX,
  runtimeIdentity,
  source,
};

if (require.main === module) common.adapterMain("hecke", implementation);

module.exports = {
  EXPECTED_HECKE_COMMIT,
  EXPECTED_HECKE_VERSION,
  EXPECTED_JULIA_VERSION,
  MARKER_PREFIX,
  censusSource,
  execute,
  runtimeIdentity,
  source,
  timingSource,
};
