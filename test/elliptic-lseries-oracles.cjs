#!/usr/bin/env node
// sagejs-test-tier: integration

/** Structural and high-precision identity checks for the offline L-value corpus. */

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const dataDirectory = resolve(root, "test/data/elliptic-lseries");
const specBytes = readFileSync(resolve(dataDirectory, "corpus-spec.json"));
const spec = JSON.parse(specBytes);
const oracle = JSON.parse(readFileSync(resolve(dataDirectory, "sage-pari-oracles.json")));
const expectedSpecHash = createHash("sha256").update(specBytes).digest("hex");

assert.equal(spec.schema, "sagejs.elliptic-lseries/corpus-spec-v1");
assert.equal(oracle.schema, "sagejs.elliptic-lseries/sage-pari-oracles-v1");
assert.equal(oracle.source_spec.sha256, expectedSpecHash);
assert.equal(oracle.source_spec.path, "test/data/elliptic-lseries/corpus-spec.json");
assert.equal(oracle.provenance.single_process, true);
assert.match(oracle.provenance.algorithm, /lfuninit\/lfun\/lfunlambda/);
assert.equal(oracle.provenance.pari_completed_to_canonical_factor, "1/2");
assert.deepEqual(oracle.precisions_bits, [53, 100, 200]);

const decimalPattern = /^-?(?:0|[0-9]+(?:\.[0-9]+)?)(?:[eE][+-]?[0-9]+)?$/;

function decimal(value) {
  assert.equal(typeof value, "string");
  assert.match(value, decimalPattern);
  let text = value;
  let sign = 1n;
  if (text.startsWith("-")) {
    sign = -1n;
    text = text.slice(1);
  }
  let exponent = 0;
  const e = text.search(/[eE]/);
  if (e >= 0) {
    exponent = Number(text.slice(e + 1));
    text = text.slice(0, e);
  }
  const dot = text.indexOf(".");
  const fractionLength = dot < 0 ? 0 : text.length - dot - 1;
  let digits = text.replace(".", "").replace(/^0+/, "");
  if (digits.length === 0) return { integer: 0n, exponent: 0 };
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  return { integer: sign * BigInt(digits), exponent: exponent - fractionLength };
}

function negate(value) {
  return value === "0" ? "0" : value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function decimalAgrees(leftText, rightText, digits) {
  const left = decimal(leftText);
  const right = decimal(rightText);
  const exponent = Math.min(left.exponent, right.exponent);
  const leftInteger = left.integer * 10n ** BigInt(left.exponent - exponent);
  const rightInteger = right.integer * 10n ** BigInt(right.exponent - exponent);
  const difference = leftInteger >= rightInteger
    ? leftInteger - rightInteger
    : rightInteger - leftInteger;
  const scaleLeft = leftInteger < 0n ? -leftInteger : leftInteger;
  const scaleRight = rightInteger < 0n ? -rightInteger : rightInteger;
  const scale = scaleLeft > scaleRight ? scaleLeft : scaleRight;
  const absoluteShift = exponent + digits;
  const absolutelySmall = absoluteShift >= 0
    ? difference * 10n ** BigInt(absoluteShift) <= 1n
    : difference <= 10n ** BigInt(-absoluteShift);
  if (absolutelySmall) return true;
  if (scale === 0n) return difference === 0n;
  return difference * 10n ** BigInt(digits) <= scale * 10n;
}

function complexAgrees(left, right, digits) {
  return (
    decimalAgrees(left.real, right.real, digits) &&
    decimalAgrees(left.imag, right.imag, digits)
  );
}

function negatedComplex(value) {
  return { real: negate(value.real), imag: negate(value.imag) };
}

function conjugate(value) {
  return { real: value.real, imag: negate(value.imag) };
}

const pointById = new Map(spec.points.map((point) => [point.id, point]));
assert.equal(pointById.size, spec.points.length);
const specCurveById = new Map(spec.curves.map((curve) => [curve.id, curve]));
const recordById = new Map(oracle.records.map((record) => [record.id, record]));
assert.equal(recordById.size, spec.curves.length);
assert.deepEqual(new Set(spec.curves.map((curve) => curve.probable_analytic_rank)), new Set([0, 1, 2, 3, 4, 5]));
assert.deepEqual(new Set(spec.curves.map((curve) => curve.root_number)), new Set([-1, 1]));

for (const [curveId, curveSpec] of specCurveById) {
  const record = recordById.get(curveId);
  assert(record, `missing curve record ${curveId}`);
  assert.deepEqual(record.a_invariants, curveSpec.a_invariants);
  assert.equal(record.conductor, curveSpec.conductor);
  assert.equal(record.root_number, curveSpec.root_number);
  assert.equal(record.probable_analytic_rank, curveSpec.probable_analytic_rank);
  assert.match(record.coefficient_probe.sha256, /^[0-9a-f]{64}$/);
  assert.equal(record.coefficient_probe.cutoff, 256);
  assert.equal(record.coefficient_probe.length, 257);

  const expectedPointIds = spec.profiles[curveSpec.profile];
  const values = new Map(
    record.values.map((value) => [`${value.point_id}/${value.precision_bits}`, value]),
  );
  assert.equal(values.size, expectedPointIds.length * spec.precisions_bits.length);
  for (const precision of spec.precisions_bits) {
    for (const pointId of expectedPointIds) {
      const value = values.get(`${pointId}/${precision}`);
      assert(value, `missing ${curveId} ${pointId} at ${precision} bits`);
      for (const component of [value.raw.real, value.raw.imag, value.completed.real, value.completed.imag]) {
        decimal(component);
      }
    }

    for (const pointId of ["zero", "minus-one", "minus-two"]) {
      const value = values.get(`${pointId}/${precision}`);
      assert.deepEqual(value.raw, { real: "0", imag: "0" }, `${curveId} ${pointId} must be a trivial zero`);
    }

    const upper = values.get(`center-plus-i/${precision}`);
    const lower = values.get(`center-minus-i/${precision}`);
    assert(complexAgrees(lower.raw, conjugate(upper.raw), Math.floor(precision * 0.27)));
    assert(complexAgrees(lower.completed, conjugate(upper.completed), Math.floor(precision * 0.27)));

    const functionalLeft = values.get(`half-plus-i/${precision}`).completed;
    const functionalRight = values.get(`three-halves-minus-i/${precision}`).completed;
    const signedRight = curveSpec.root_number === 1 ? functionalRight : negatedComplex(functionalRight);
    assert(
      complexAgrees(functionalLeft, signedRight, Math.floor(precision * 0.27)),
      `functional equation failed for ${curveId} at ${precision} bits`,
    );

    if (expectedPointIds.includes("center-plus-10i")) {
      const highUpper = values.get(`center-plus-10i/${precision}`);
      const highLower = values.get(`center-minus-10i/${precision}`);
      assert(complexAgrees(highLower.raw, conjugate(highUpper.raw), Math.floor(precision * 0.27)));
      assert(complexAgrees(highLower.completed, conjugate(highUpper.completed), Math.floor(precision * 0.27)));
    }
  }

  for (const pointId of expectedPointIds) {
    const p53 = values.get(`${pointId}/53`);
    const p100 = values.get(`${pointId}/100`);
    const p200 = values.get(`${pointId}/200`);
    assert(complexAgrees(p53.raw, p100.raw, 13), `${curveId}/${pointId} raw 53/100 drift`);
    assert(complexAgrees(p100.raw, p200.raw, 27), `${curveId}/${pointId} raw 100/200 drift`);
    assert(complexAgrees(p53.completed, p100.completed, 13), `${curveId}/${pointId} completed 53/100 drift`);
    assert(complexAgrees(p100.completed, p200.completed, 27), `${curveId}/${pointId} completed 100/200 drift`);
  }
}

for (const curveSpec of spec.curves.filter((curve) => curve.isomorphic_to)) {
  assert.equal(
    recordById.get(curveSpec.id).coefficient_probe.sha256,
    recordById.get(curveSpec.isomorphic_to).coefficient_probe.sha256,
    `${curveSpec.id} coefficient prefix differs from its isomorphic source`,
  );
}

const publicValue = recordById
  .get("user-evaluation")
  .values.find((value) => value.point_id === "center-plus-i" && value.precision_bits === 100);
assert(publicValue.raw.real.startsWith("-0.0053103195260299207325292689378"));
assert(publicValue.raw.imag.startsWith("0.099052027739678168544361108900"));
const nearTrivialZero = recordById
  .get("user-evaluation")
  .values.find((value) => value.point_id === "near-minus-one" && value.precision_bits === 200);
assert.equal(
  nearTrivialZero.raw.real,
  "-2.5140610412436272218622294692026523566212107093271311682330717e8",
);
assert.equal(nearTrivialZero.raw.imag, "0");

const magmaPath = resolve(dataDirectory, "magma-oracles.json");
if (existsSync(magmaPath)) {
  const magma = JSON.parse(readFileSync(magmaPath));
  assert.equal(magma.schema, "sagejs.elliptic-lseries/magma-oracles-v1");
  assert.equal(magma.source_spec.sha256, expectedSpecHash);
  assert.equal(magma.provenance.single_process, true);
  for (const value of magma.records) {
    const sageRecord = recordById.get(value.curve_id);
    const sageValue = sageRecord.values.find(
      (candidate) => candidate.point_id === value.point_id && candidate.precision_bits === 200,
    );
    assert(sageValue, `missing Sage comparison for Magma ${value.curve_id}/${value.point_id}`);
    assert(complexAgrees(value.raw, sageValue.raw, 50), `Magma raw mismatch at ${value.curve_id}/${value.point_id}`);
    assert(complexAgrees(value.completed, sageValue.completed, 48), `Magma completion mismatch at ${value.curve_id}/${value.point_id}`);
  }
}

process.stdout.write(
  `elliptic L-series oracle corpus passed (${oracle.records.length} curves, ` +
    `${oracle.records.reduce((sum, record) => sum + record.values.length, 0)} Sage/PARI values)\n`,
);
