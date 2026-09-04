#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const common = require("./complex-cubic-frontier-external-adapter.cjs");

const EXPECTED_VERSION = "2.18.5";
const MARKER_PREFIX = "SAGEJS_CC_MAGMA_";

function magmaString(value) {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error("unsafe Magma string");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function recordLiteral(record) {
  return `<${magmaString(record.label)}, [${record.coefficients.join(",")}]>`;
}

function recordsLiteral(records) {
  return `[*${records.map(recordLiteral).join(",")}*]`;
}

function prelude(request) {
  return `SetSeed(1);
SetColumns(1024);
major, minor, patch := GetVersion();
if major ne 2 or minor ne 18 or patch ne 5 then
  error "frontier adapter requires Magma 2.18-5";
end if;
Qx<x> := PolynomialRing(Rationals());
minimum_root_ns := ${request.minimum_retained_root_nanoseconds};

function SagejsIntegerSequenceText(values)
  if #values eq 0 then return "[]"; end if;
  return "[" cat Join([IntegerToString(Integers()!value) : value in values], ",") cat "]";
end function;

function SagejsFreshOrder(coefficients)
  polynomial := Qx!coefficients;
  field := NumberField(polynomial);
  return MaximalOrder(field);
end function;

function SagejsClassAnswer(order)
  group, group_map := ClassGroup(order : Proof := "GRH");
  class_number := Integers()!#group;
  invariants := [Integers()!value : value in Invariants(group) | value gt 1];
  product := 1;
  for value in invariants do product *:= value; end for;
  if product ne class_number then error "class invariant product mismatch"; end if;
  return IntegerToString(class_number), SagejsIntegerSequenceText(invariants);
end function;

function SagejsSanitizeError(value)
  return SubstituteString(SubstituteString(Sprint(value), "|", "/"), "\\n", " ");
end function;
`;
}

function censusSource(request) {
  const records = request.shards.flat();
  return `${prelude(request)}
records := ${recordsLiteral(records)};
for record in records do
  try
    order := SagejsFreshOrder(record[2]);
    class_number, invariants := SagejsClassAnswer(order);
    print ${magmaString(`${MARKER_PREFIX}CENSUS|`)} cat record[1] cat "|" cat
      IntegerToString(Integers()!Discriminant(order)) cat "|" cat
      class_number cat "|" cat invariants;
  catch error_value
    print ${magmaString(`${MARKER_PREFIX}ERROR|`)} cat record[1] cat "|" cat
      SagejsSanitizeError(error_value);
  end try;
end for;
quit;
`;
}

function timingSource(request) {
  const shards = `[*${request.shards.map(recordsLiteral).join(",")}*]`;
  const warmups = recordsLiteral(request.warmups);
  const boundaries = `[${request.boundaries.map(magmaString).join(",")}]`;
  return `${prelude(request)}
warmups := ${warmups};
shards := ${shards};
boundaries := ${boundaries};

function SagejsRunBatch(records, boundary, iterations)
  prepared := [* *];
  if boundary eq "scalar-prepared" then
    for repeat_index in [1..iterations] do
      for record in records do
        Append(~prepared, SagejsFreshOrder(record[2]));
      end for;
    end for;
  end if;
  answers := ["" : index in [1..#records]];
  per_seconds := [RealField(30)!0 : index in [1..#records]];
  position := 1;
  root_started := Realtime();
  for repeat_index in [1..iterations] do
    for record_index in [1..#records] do
      field_started := Realtime();
      if boundary eq "scalar-prepared" then
        order := prepared[position];
        position +:= 1;
      else
        order := SagejsFreshOrder(records[record_index][2]);
      end if;
      class_number, invariants := SagejsClassAnswer(order);
      per_seconds[record_index] +:= Realtime() - field_started;
      answer := class_number cat "#" cat invariants;
      if repeat_index eq 1 then
        answers[record_index] := answer;
      elif answers[record_index] ne answer then
        error "repeated class-group answer changed";
      end if;
    end for;
  end for;
  root_nanoseconds := Integers()!Round((Realtime() - root_started) * 1000000000);
  per_nanoseconds := [Integers()!Round(value * 1000000000 / iterations) : value in per_seconds];
  return root_nanoseconds, answers, per_nanoseconds;
end function;

for warmup in warmups do
  warmup_number, warmup_invariants := SagejsClassAnswer(SagejsFreshOrder(warmup[2]));
end for;

for boundary in boundaries do
  for shard_index in [1..#shards] do
    records := shards[shard_index];
    iterations := 1;
    repeat
      calibration_ns, calibration_answers, calibration_per :=
        SagejsRunBatch(records, boundary, iterations);
      if calibration_ns lt minimum_root_ns then iterations *:= 2; end if;
      if iterations gt 1048576 then error "calibration repetition safety limit exceeded"; end if;
    until calibration_ns ge minimum_root_ns;
    repeat
      root_ns, answers, per_ns := SagejsRunBatch(records, boundary, iterations);
      if root_ns lt minimum_root_ns then iterations *:= 2; end if;
      if iterations gt 1048576 then error "retained repetition safety limit exceeded"; end if;
    until root_ns ge minimum_root_ns;
    print ${magmaString(`${MARKER_PREFIX}TIMING|`)} cat boundary cat "|" cat
      IntegerToString(shard_index - 1) cat "|" cat IntegerToString(iterations) cat "|" cat
      IntegerToString(root_ns) cat "|" cat Join(answers, ";") cat "|" cat
      Join([IntegerToString(value) : value in per_ns], ",") cat "|" cat
      IntegerToString(#records);
  end for;
end for;
quit;
`;
}

function source(request) {
  return request.mode === "census" ? censusSource(request) : timingSource(request);
}

function runtimeIdentity() {
  const requested = process.env.MAGMA_ORACLE ||
    (fs.existsSync("/home/user/bin/magma") ? "/home/user/bin/magma" : "magma");
  const executable = common.resolveExecutable(requested);
  const versionProbe = runMagma(executable, `major, minor, patch := GetVersion();
print "SAGEJS_CC_MAGMA_VERSION|" cat IntegerToString(major) cat "." cat
  IntegerToString(minor) cat "." cat IntegerToString(patch);
quit;
`);
  const version = versionProbe.stdout.split(/\r?\n/)
    .find((line) => line.startsWith("SAGEJS_CC_MAGMA_VERSION|"))
    ?.slice("SAGEJS_CC_MAGMA_VERSION|".length);
  if (version !== EXPECTED_VERSION) {
    throw new Error(`Magma ${EXPECTED_VERSION} is required; runtime reported ${version || "nothing"}`);
  }
  const runtime = `${executable}.exe`;
  if (!fs.statSync(runtime, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Magma identity requires a launcher adjacent to magma.exe");
  }
  const packageDirectory = path.join(path.dirname(path.dirname(executable)), "package");
  if (!fs.statSync(packageDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("Magma identity requires its package tree");
  }
  return {
    system: "magma",
    version: "Magma V2.18-5",
    executable,
    proof_setting: 'ClassGroup(order : Proof := "GRH")',
    proof_semantics: "Magma GRH factor-base bound; exact relation arithmetic conditional on GRH",
    environment: { MAGMA_LIBRARIES: "" },
    artifacts: [
      common.fileArtifact("magma-launcher", executable),
      common.fileArtifact("magma-runtime", runtime),
      common.treeArtifact("magma-package-tree", packageDirectory),
    ],
  };
}

function runMagma(executable, program) {
  return common.run(executable, ["-b"], {
    input: program,
    env: { MAGMA_LIBRARIES: "" },
  });
}

function execute(runtime, program) {
  return runMagma(runtime.executable, program);
}

const implementation = {
  adapterFile: __filename,
  execute,
  markerPrefix: MARKER_PREFIX,
  runtimeIdentity,
  source,
};

if (require.main === module) common.adapterMain("magma", implementation);

module.exports = {
  EXPECTED_VERSION,
  MARKER_PREFIX,
  censusSource,
  execute,
  runtimeIdentity,
  source,
  timingSource,
};
