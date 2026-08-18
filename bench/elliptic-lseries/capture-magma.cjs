#!/usr/bin/env node

/** Capture an optional independent Magma oracle in one persistent process. */

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const specPath = resolve(root, "test/data/elliptic-lseries/corpus-spec.json");
const outputPath = resolve(
  process.argv[2] || join(root, "test/data/elliptic-lseries/magma-oracles.json"),
);
const magma = process.env.MAGMA || "/home/user/bin/magma";

if (!existsSync(magma)) {
  process.stderr.write(`Magma unavailable at ${magma}; optional capture skipped.\n`);
  process.exit(0);
}

const specBytes = readFileSync(specPath);
const spec = JSON.parse(specBytes);
const points = new Map(spec.points.map((point) => [point.id, point]));
const selectedPointIds = ["s2", "center-plus-i", "half-plus-i", "three-halves-minus-i"];
const curves = spec.curves.filter((curve) => curve.magma_compare === true);
const decimalDigits = 70;

function qLiteral(value) {
  return `Q!(${value})`;
}

function complexLiteral(point) {
  return `(C!(${point.real}) + C!(${point.imag})*C.1)`;
}

const lines = [
  "SetSeed(1);",
  "SetColumns(1000);",
  "Q := Rationals();",
  `C := ComplexField(${decimalDigits});`,
  "major, minor, patch := GetVersion();",
  'printf "SAGEJS_VERSION|%o|%o|%o\\n", major, minor, patch;',
];

for (const curve of curves) {
  const invariants = curve.a_invariants.map(qLiteral).join(",");
  lines.push(`E := EllipticCurve([Q|${invariants}]);`);
  lines.push(`L := LSeries(E : Precision := ${decimalDigits});`);
  lines.push(`A := Sqrt(C!(${curve.conductor}))/(2*Pi(C));`);
  for (const pointId of selectedPointIds) {
    const point = points.get(pointId);
    lines.push(`s := ${complexLiteral(point)};`);
    lines.push("raw := C!Evaluate(L, s);");
    lines.push("completed := A^s*Gamma(s)*raw;");
    lines.push(
      `printf "SAGEJS_VALUE|${curve.id}|${pointId}|%o|%o|%o|%o\\n", ` +
        "Real(raw), Imaginary(raw), Real(completed), Imaginary(completed);",
    );
  }
}
lines.push("quit;");

const started = process.hrtime.bigint();
const result = spawnSync(magma, ["-b"], {
  cwd: root,
  encoding: "utf8",
  input: `${lines.join("\n")}\n`,
  maxBuffer: 64 * 1024 * 1024,
});
const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;

if (result.status !== 0) {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  throw new Error(`Magma capture exited with status ${result.status}`);
}

let version;
const records = [];
for (const line of result.stdout.split(/\r?\n/)) {
  if (line.startsWith("SAGEJS_VERSION|")) {
    version = line.slice("SAGEJS_VERSION|".length).split("|").join(".");
  } else if (line.startsWith("SAGEJS_VALUE|")) {
    const [curveId, pointId, rawReal, rawImag, completedReal, completedImag] = line
      .slice("SAGEJS_VALUE|".length)
      .split("|");
    records.push({
      curve_id: curveId,
      point_id: pointId,
      raw: { real: rawReal, imag: rawImag },
      completed: { real: completedReal, imag: completedImag },
    });
  }
}
if (!version || records.length !== curves.length * selectedPointIds.length) {
  throw new Error(
    `unexpected Magma output: version=${version}, records=${records.length}, stderr=${result.stderr}`,
  );
}

const output = {
  schema: "sagejs.elliptic-lseries/magma-oracles-v1",
  description: "Optional independent raw and canonically completed elliptic L-values from Magma.",
  normalization: spec.normalization,
  source_spec: {
    path: "test/data/elliptic-lseries/corpus-spec.json",
    sha256: createHash("sha256").update(specBytes).digest("hex"),
  },
  provenance: {
    magma_version: version,
    executable: magma,
    algorithm: "Magma LSeries/Evaluate, with the canonical completion formed independently",
    decimal_precision_digits: decimalDigits,
    single_process: true,
    capture_seconds: elapsedSeconds,
  },
  point_ids: selectedPointIds,
  records,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`captured ${records.length} Magma values in ${elapsedSeconds.toFixed(3)} s\n`);
