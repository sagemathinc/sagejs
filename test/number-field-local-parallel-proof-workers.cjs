"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const vector429 = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
);
const blFixture = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-buchmann-lenstra.json"),
    "utf8",
  ),
).t8_2pow32;

function runPython(source, { sage = false, timeout = 180_000 } = {}) {
  const command = sage ? process.execPath : "python3";
  const args = sage
    ? [join(root, "bin/sagejs"), "--python"]
    : ["-c", source];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: sage ? source : undefined,
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const setup = String.raw`
import random
import json
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.number_fields.local_parallel import *
from sagejs.number_fields.local_parallel import _freeze_json, _thaw_json
from sagejs.number_fields.local_parallel_worker import *
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent
`;

test("BL proof workers return parent-authenticated immutable envelopes", () => {
  const output = runPython(String.raw`
${setup}
case = json.loads(r'''${JSON.stringify(blFixture)}''')
polynomial = tuple(int(value) for value in case["coefficients_low_to_high"])
component_value = int(case["reduced_resultant_component"])
component = DiscriminantComponent(
    component_value,
    "unresolved-coprime-component",
    evidence={"source": "focused-proof-worker-test"},
)
job = make_buchmann_lenstra_proof_job(polynomial, component, 9000000, 1 << 20)
result = execute_public_local_proof_job(job)
envelope = authenticate_local_proof_result(job, result)
assert envelope is not None and envelope.certified
assert envelope.kind == "buchmann-lenstra"
assert envelope.om_selection is None and envelope.bl_projection is not None
assert authenticated_local_proof_matches(
    envelope,
    polynomial=polynomial,
    component=component,
    kind="buchmann-lenstra",
    basis_numerator=envelope.basis_numerator,
    basis_denominator=envelope.basis_denominator,
    index=envelope.index,
    equation_discriminant=envelope.equation_discriminant,
    order_discriminant=envelope.order_discriminant,
)
for field, bad in (
    ("polynomial", polynomial[:-1] + (2,)),
    ("component", DiscriminantComponent(component_value + 1, "composite")),
    ("basis_numerator", ((envelope.basis_numerator[0][0] + 1,) + envelope.basis_numerator[0][1:],) + envelope.basis_numerator[1:]),
    ("basis_denominator", envelope.basis_denominator + 1),
    ("index", envelope.index + 1),
    ("equation_discriminant", envelope.equation_discriminant + 1),
    ("order_discriminant", envelope.order_discriminant + 1),
):
    arguments = {
        "polynomial": polynomial,
        "component": component,
        "kind": "buchmann-lenstra",
        "basis_numerator": envelope.basis_numerator,
        "basis_denominator": envelope.basis_denominator,
        "index": envelope.index,
        "equation_discriminant": envelope.equation_discriminant,
        "order_discriminant": envelope.order_discriminant,
    }
    arguments[field] = bad
    assert not authenticated_local_proof_matches(envelope, **arguments), field

certificate = dict(result[7])
source = certificate["proof-source"]
bl_dict = _thaw_json(source[3])
bl_dict["evidence"]["locally_maximal"] = False
bad_source = source[:3] + (_freeze_json(bl_dict),)
bad_nested = make_local_proof_result(
    job,
    result[3],
    result[4],
    result[5],
    result[6],
    envelope.equation_discriminant,
    envelope.order_discriminant,
    bad_source,
)
assert authenticate_local_proof_result(job, bad_nested) is None
wrong_schema = bad_source[:2] + ("sagejs.number-fields.bl-worker-proof-source.v0",) + bad_source[3:]
try:
    make_local_proof_result(job, result[3], result[4], result[5], result[6], envelope.equation_discriminant, envelope.order_discriminant, wrong_schema)
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted a wrong proof schema")
try:
    envelope.index = envelope.index
except AttributeError:
    pass
else:
    raise AssertionError("authenticated envelope was mutable")
print("bl-proof-envelope-ok")
`);
  assert.equal(output, "bl-proof-envelope-ok");
});

test("OM proof workers re-authenticate type, MaxMin, and lattice evidence", () => {
  const output = runPython(
    String.raw`
${setup}
case = json.loads(r'''${JSON.stringify(vector429)}''')
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
job = make_om_proof_job(polynomial, 7, 1008, 3500000, 64 << 20)
result = execute_public_local_proof_job(job)
envelope = authenticate_local_proof_result(job, result)
assert envelope is not None and envelope.certified
assert envelope.kind == "om-maxmin"
assert envelope.om_selection[0] == "sagejs.number-fields/authenticated-om-worker-projection-v1"
assert envelope.bl_projection is None
assert envelope.om_selection[1]

certificate = dict(result[7])
source = certificate["proof-source"]
assert source[0:3] == (
    "sagejs.number-fields.local-proof-source.v1",
    "om-maxmin",
    "sagejs.number-fields.om-worker-proof-source.v1",
)
# Flip one nested MaxMin field while keeping the outer basis/index/discriminants exact.
record = list(source[5])
entries = list(record[2])
maxmin_index = [name for name, _value in entries].index("maxmin")
maxmin_record = list(entries[maxmin_index][1])
maxmin_entries = list(maxmin_record[2])
checked_index = [name for name, _value in maxmin_entries].index("maximality_checked")
maxmin_entries[checked_index] = ("maximality_checked", False)
maxmin_record[2] = tuple(maxmin_entries)
entries[maxmin_index] = ("maxmin", tuple(maxmin_record))
record[2] = tuple(entries)
bad_source = source[:5] + (tuple(record),)
bad_nested = make_local_proof_result(
    job,
    result[3],
    result[4],
    result[5],
    result[6],
    envelope.equation_discriminant,
    envelope.order_discriminant,
    bad_source,
)
assert authenticate_local_proof_result(job, bad_nested) is None
wrong_kind = source[:1] + ("buchmann-lenstra",) + source[2:]
try:
    make_local_proof_result(job, result[3], result[4], result[5], result[6], envelope.equation_discriminant, envelope.order_discriminant, wrong_kind)
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted a wrong worker kind")
print("om-proof-envelope-ok")
`,
    { sage: true },
  );
  assert.equal(output, "om-proof-envelope-ok");
});

test("proof scheduling rejects duplicates and is completion-order deterministic", () => {
  const output = runPython(String.raw`
${setup}
case = json.loads(r'''${JSON.stringify(blFixture)}''')
polynomial = tuple(int(value) for value in case["coefficients_low_to_high"])
component = DiscriminantComponent(
    int(case["reduced_resultant_component"]),
    "unresolved-coprime-component",
)
jobs = [
    make_buchmann_lenstra_proof_job(polynomial, component, 9000000, 1 << 20, component_index=index)
    for index in range(3)
]
try:
    make_schedule((jobs[0], jobs[0]))
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted duplicate proof job keys")
results = [execute_public_local_proof_job(job) for job in jobs]
schedule = make_schedule(jobs, max_workers=3, cpu_count=4)
baseline = assemble_local_run(jobs, results, schedule)
for seed in range(12):
    shuffled = list(results)
    random.Random(seed).shuffle(shuffled)
    assert assemble_local_run(reversed(jobs), shuffled, schedule) == baseline
assert all(authenticate_local_proof_result(job, result) is not None for job, result in zip(jobs, results))
decision = public_local_proof_worker_decision(
    jobs,
    parent_native_predicted_micros=2000000,
    cpu_count=4,
    memory_budget_bytes=4 << 30,
    worker_capability=True,
)
assert decision["predicted_proof_wire_bytes"] > 0
assert decision["predicted_peak_rss_bytes"] >= decision["predicted_proof_wire_bytes"]
assert decision["setup_predicted_micros"] == PUBLIC_PROOF_SETUP_MICROS
print("proof-schedule-determinism-ok")
`);
  assert.equal(output, "proof-schedule-determinism-ok");
});

test("begin/finish proof handles preserve fatal and parent cancellation", () => {
  const output = runPython(String.raw`
${setup}
jobs = [
    make_om_proof_job([1, 0, 1], prime, 1, 1000000, 4096)
    for prime in (2, 3, 5)
]
policy = (
    "sagejs.number-fields.local-policy.v1", 1, 1, 1, 3, 1 << 30, "focused-proof-handle-test"
)
class FakeHandle:
    def __init__(self, result):
        self.result = result
    def ready(self):
        return True
    def wait(self, timeout=None):
        return None
    def get(self):
        return self.result
class FakePool:
    last = None
    def __init__(self, workers):
        self.workers = workers
        self.terminated = False
        self.joined = False
        FakePool.last = self
    def apply_async(self, worker, arguments):
        return FakeHandle(make_fatal_result(arguments[0], "focused fatal proof"))
    def terminate(self):
        self.terminated = True
    def close(self):
        pass
    def join(self):
        self.joined = True
handle = start_public_local_proof_jobs(
    jobs,
    max_workers=3,
    cpu_count=4,
    policy=policy,
    pool_factory=FakePool,
)
try:
    finish_public_local_proof_jobs(handle)
except LocalCertificationError:
    pass
else:
    raise AssertionError("fatal proof did not cancel siblings")
assert FakePool.last.terminated and FakePool.last.joined
assert handle.timing_evidence[0] == "sagejs.number-fields.local-proof-worker-timing.v1"
assert handle.timing_evidence[-1] is False
second = start_public_local_proof_jobs(
    jobs,
    max_workers=3,
    cpu_count=4,
    policy=policy,
    pool_factory=FakePool,
)
cancel_public_local_proof_jobs(second)
assert FakePool.last.terminated and FakePool.last.joined
try:
    finish_public_local_proof_jobs(second)
except LocalWorkerError:
    pass
else:
    raise AssertionError("a cancelled proof handle was reusable")
print("proof-handle-cancellation-ok")
`);
  assert.equal(output, "proof-handle-cancellation-ok");
});
