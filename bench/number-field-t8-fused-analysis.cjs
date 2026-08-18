#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { arch, cpus, platform, release } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src/lib/sagejs/number_fields/composite_field_analysis.py",
);
const fixture = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-buchmann-lenstra.json"),
    "utf8",
  ),
).t8_2pow32;
const samples = Number(process.env.SAGEJS_NF_T8_SAMPLES ?? "17");
const warmups = Number(process.env.SAGEJS_NF_T8_WARMUPS ?? "4");
assert.ok(Number.isSafeInteger(samples) && samples >= 3 && samples % 2 === 1);
assert.ok(Number.isSafeInteger(warmups) && warmups >= 1);

execFileSync(sagejs, ["native", "compile", source], {
  cwd: root,
  stdio: "ignore",
  timeout: 180_000,
});

const coefficients = fixture.coefficients_low_to_high.join(",");
const program = String.raw`
import json
import time
import sagejs.number_fields.composite_field_analysis as analysis
import sagejs.number_fields.maximal_order_engine as engine
from sagejs.native import is_compiled

coefficients = [${coefficients}]
ring = PolynomialRing(QQ, 'x')
polynomial = ring(coefficients)

def median(values):
    return sorted(values)[len(values) // 2]

def measure_public(label):
    field = NumberField(polynomial, label)
    started = time.perf_counter_ns()
    order = field.maximal_order()
    public_ns = time.perf_counter_ns() - started
    certificate = order.maximality_certificate()
    assert certificate['certified']
    assert certificate['index'] == 3179557053031851899185109992371205233166102563054994659612778573877352351101815706666153685320008306418583370978265859646929314209130671444551656380504174391180190567870975750525148778143146969696718736142491176896345575184876739493887
    assert order.discriminant() == -2147483648
    trace = order.maximal_order_trace()['analysis_trace']
    started = time.perf_counter_ns()
    order.basis()
    basis_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    assert field.maximal_order() is order
    cached_ns = time.perf_counter_ns() - started
    return order, {
        'public_ns': public_ns,
        'basis_projection_ns': basis_ns,
        'cached_ns': cached_ns,
        'stage_ns': {
            'discriminant': trace['discriminant_ns'],
            'factor_discovery': trace['factor_discovery_ns'],
            'bl_construction': trace['bl_construction_ns'],
            'local_work': trace['local_work_ns'],
            'hnf_merge': trace['hnf_merge_ns'],
            'proof_check': trace['proof_check_ns'],
        },
        'events': trace['events'],
    }

for warmup in range(${warmups}):
    measure_public('warm' + str(warmup))

rows = []
last_order = None
for sample in range(${samples}):
    last_order, row = measure_public('sample' + str(sample))
    rows.append(row)

construction_ns = []
checker_ns = []
for sample in range(${samples}):
    started = time.perf_counter_ns()
    packed = analysis.construct_composite_field_analysis(coefficients, 1)
    construction_ns.append(time.perf_counter_ns() - started)
    assert packed.certified
    started = time.perf_counter_ns()
    assert analysis.check_composite_field_analysis(packed)
    checker_ns.append(time.perf_counter_ns() - started)

generic = NumberField(polynomial, 'generic').maximal_order(trace=True)
generic_certificate = generic.maximality_certificate()
fast_certificate = last_order.maximality_certificate()
equivalent = (
    generic_certificate['basis_numerator'] == fast_certificate['basis_numerator']
    and generic_certificate['basis_denominator'] == fast_certificate['basis_denominator']
    and generic_certificate['index'] == fast_certificate['index']
    and generic.discriminant() == last_order.discriminant()
)
assert equivalent

counters = {
    'construct_composite_field_analysis': 0,
    'native_order_from_polynomial': 0,
    '_authenticated_default_field_analysis': 0,
    'decompose_discriminant': 0,
    '_authenticated_order_from_basis': 0,
    'certify_global_order': 0,
}
originals = []
def count(owner, name):
    original = getattr(owner, name)
    def counted(*args, **kwds):
        counters[name] = counters.get(name, 0) + 1
        return original(*args, **kwds)
    setattr(owner, name, counted)
    originals.append((owner, name, original))

count(analysis, 'construct_composite_field_analysis')
count(analysis, 'native_order_from_polynomial')
count(engine, '_authenticated_default_field_analysis')
count(engine, 'decompose_discriminant')
count(engine, '_authenticated_order_from_basis')
count(engine, 'certify_global_order')
try:
    probe = NumberField(polynomial, 'counter-probe').maximal_order()
    assert probe.maximality_certificate()['certified']
finally:
    for owner, name, original in reversed(originals):
        setattr(owner, name, original)

public_values = [row['public_ns'] for row in rows]
report = {
    'schema': 'sagejs.number-fields/t8-fused-analysis-receipt-v1',
    'case_id': 'pure-bad-generator-n8-c2pow32',
    'sample_count': ${samples},
    'warmup_count': ${warmups},
    'threshold_ns': 25000000,
    'raw': rows,
    'statistics': {
        'public_median_ns': median(public_values),
        'public_min_ns': min(public_values),
        'public_max_ns': max(public_values),
        'basis_projection_median_ns': median([row['basis_projection_ns'] for row in rows]),
        'cached_median_ns': median([row['cached_ns'] for row in rows]),
        'construction_median_ns': median(construction_ns),
        'checker_median_ns': median(checker_ns),
    },
    'gate_passed': median(public_values) <= 25000000,
    'generic_external_equivalence': equivalent,
    'field_discriminant': str(last_order.discriminant()),
    'equation_order_index': str(last_order.maximality_certificate()['index']),
    'trace_counters': counters,
    'native_compiled': {
        'polynomial_discriminant': is_compiled(analysis.packed_polynomial_discriminant),
        'integer_square_root': is_compiled(analysis.packed_integer_square_root),
        'order_lattice_checker': is_compiled(analysis.packed_order_lattice_is_valid),
    },
}
print(json.dumps(report))
`;

const child = spawnSync(sagejs, [], {
  cwd: root,
  input: program,
  encoding: "utf8",
  timeout: 300_000,
});
assert.equal(child.status, 0, child.stderr || child.stdout);
const report = JSON.parse(child.stdout.trim().split("\n").at(-1));
report.environment = {
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  platform: platform(),
  release: release(),
  arch: arch(),
  cpu: cpus()[0]?.model ?? "unknown",
};

const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const output = resolve(root, process.argv[outputIndex + 1]);
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
