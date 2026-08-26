// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("cubic relation publication is transactional, lazy, and replayable", () => {
  const configured = process.env.SAGEJS_TEST_EXECUTABLE;
  const executable =
    configured ||
    (process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs"));
  const arguments_ =
    process.platform === "win32" && !configured
      ? [join(root, "bin", "sagejs-source.cjs"), "--python", "-"]
      : ["--python", "-"];
  const source = String.raw`
import hashlib
import json

import sagejs.number_fields.cubic_class_number as cubic_module
from sagejs.number_fields.cubic_class_number import (
    CubicMinkowskiClassNumberCertificate,
    authenticated_cubic_class_number,
    authenticated_cubic_relation_seed,
    bounded_cubic_minkowski_class_number,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - x**2 - 6*x - 12, "d")

published = []
original_publish = cubic_module._CompactCubicRelationLedger.publish
def counted_publish(self, relation_module):
    published.append(self)
    return original_publish(self, relation_module)
cubic_module._CompactCubicRelationLedger.publish = counted_publish
try:
    result = bounded_cubic_minkowski_class_number(K)
finally:
    cubic_module._CompactCubicRelationLedger.publish = original_publish

assert result.complete and result.order() == 3
assert authenticated_cubic_class_number(result, K) == 3
assert len(published) == 1
ledger = published[0]
assert ledger._issued
assert len(ledger.rows) == len(result.relation_records) == 5
assert ledger.row(0) is ledger.rows[0]
assert tuple(record.row for record in result.relation_records) == ledger.rows
try:
    ledger.publish(__import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    ))
    raise AssertionError("a compact relation ledger published twice")
except RuntimeError:
    pass

# Scalar observation does not materialize the detached canonical certificate,
# factor-base reconstructor, identity hashes, or replay receipts.
certificate = result.certificate
assert not hasattr(certificate, "_detached_encoding")
assert not hasattr(certificate, "_encoding_cache")
relations_copy = certificate.relations
relations_copy[0]["row"][0] += 100
assert certificate.relations[0]["row"][0] == 1
assert not hasattr(certificate, "_detached_encoding")
raw = certificate.__dict__["_raw_components"]
try:
    raw[2][0]["row"][0] += 100
    raise AssertionError("live certificate internals were not recursively frozen")
except TypeError:
    pass
assert authenticated_cubic_class_number(result, K) == 3
deferred = result.__dict__.get("_deferred_relation_seed")
assert deferred is not None
collector = deferred.collector
assert collector._reconstructor is None
assert collector._deferred_identity_keys
assert collector._keys == set()
assert collector._admission_receipts == {}

# A failed first observation preserves the one-shot deferred authority and
# leaves identity hashes, receipts, and reconstruction wholly uninitialized.
retained_row = result.relation_records[0].row
result.relation_records[0].row = (99,) + retained_row[1:]
assert authenticated_cubic_relation_seed(result, K) is None
assert result.__dict__.get("_deferred_relation_seed") is deferred
assert collector._reconstructor is None
assert collector._deferred_identity_keys
assert collector._keys == set() and collector._admission_receipts == {}
result.relation_records[0].row = retained_row

# Consuming the live relation prefix performs one authenticated bulk gather.
seed = authenticated_cubic_relation_seed(result, K)
assert seed is not None
assert authenticated_cubic_relation_seed(result, K) is seed
assert result.__dict__.get("_deferred_relation_seed") is None
assert collector._reconstructor is not None
assert not collector._deferred_identity_keys
assert len(collector._keys) == len(result.relation_records)
assert len(collector._admission_receipts) == len(result.relation_records)
assert not hasattr(certificate, "_detached_encoding")

# The detached body and hash are the unchanged 411344bb canonical payload for
# this fixed field instance, and detached replay still checks the exact proof.
payload = certificate.to_dict()
assert certificate.stable_hash() == (
    "ce189cbccbe4078ba95286d62b4d501b2e7a5b842f376234da572406881a564e"
)
# A self-consistent caller encoding with forged provenance would pass the old
# cache-trusting verify; live encoding now ignores both obsolete cache state
# and a forged detached tuple in favor of recursively frozen semantics.
forged_body = json.loads(json.dumps(payload))
del forged_body["content_sha256"]
forged_body["relations"][0]["provenance"]["algorithm"] = "forged"
canonical = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"))
forged_body_json = canonical(forged_body)
forged_encoding = tuple(
    canonical(forged_body[key])
    for key in (
        "plan",
        "factor_base",
        "relations",
        "presentation",
        "obstructions",
        "caps",
    )
) + (
    forged_body_json,
    hashlib.sha256(forged_body_json.encode("utf-8")).hexdigest(),
)
try:
    certificate.__dict__["_encoding_cache"] = [forged_encoding]
except (AttributeError, TypeError):
    pass
try:
    certificate.__dict__["_detached_encoding"] = forged_encoding
except (AttributeError, TypeError):
    pass
assert certificate.to_dict() == payload
assert certificate.stable_hash() == payload["content_sha256"]
assert certificate.verify()
assert authenticated_cubic_class_number(result, K) == 3
detached = CubicMinkowskiClassNumberCertificate.from_dict(K, payload)
assert detached.to_dict() == payload and detached.verify()
try:
    detached._detached_encoding[0] = "{}"
    raise AssertionError("detached certificate encoding was mutable")
except TypeError:
    pass
assert detached.to_dict() == payload and detached.verify()
forged = json.loads(json.dumps(payload))
forged["relations"][0]["row"][0] += 1
try:
    CubicMinkowskiClassNumberCertificate.from_dict(K, forged)
    raise AssertionError("a mutated compact-ledger payload passed replay")
except ValueError:
    pass

# A cancellation after exact compact staging but before publication leaves the
# staging ledger unissued and creates no partially published relation records.
cancelled_ledgers = []
publication_attempts = []
original_init = cubic_module._CompactCubicRelationLedger.__init__
def observed_init(self, *args, **kwargs):
    original_init(self, *args, **kwargs)
    cancelled_ledgers.append(self)
def forbidden_publish(self, relation_module):
    publication_attempts.append(self)
    return original_publish(self, relation_module)
cubic_module._CompactCubicRelationLedger.__init__ = observed_init
cubic_module._CompactCubicRelationLedger.publish = forbidden_publish
try:
    cancelled_field = NumberField(x**3 - x**2 - 6*x - 12, "cancelled")
    try:
        bounded_cubic_minkowski_class_number(
            cancelled_field,
            cancelled=lambda: bool(cancelled_ledgers),
        )
        raise AssertionError("cancellation at compact publication was ignored")
    except RuntimeError as error:
        assert str(error) == "class/unit computation cancelled"
finally:
    cubic_module._CompactCubicRelationLedger.__init__ = original_init
    cubic_module._CompactCubicRelationLedger.publish = original_publish
assert len(cancelled_ledgers) == 1
assert not cancelled_ledgers[0]._issued
assert publication_attempts == []

# A callback that returns normally still cannot alter producer-owned staged
# semantics.  Each representative mutable surface either is frozen/inert or
# makes the complete ledger transaction fail before a RelationRecord is issued.
def probe_hostile_ledger_mutation(kind):
    captured = []
    changed = []
    def captured_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        captured.append(self)
    def corrupt_but_continue():
        if captured and not changed:
            ledger = captured[0]
            before = ledger._current_semantic_snapshot()
            try:
                if kind == "factor":
                    ledger.factor_base[0].presentation["modulus"][0] += 1
                elif kind == "presentation":
                    ledger.presentation.backend = "forged"
                elif kind == "obstruction":
                    ledger.obstructions[0]["forged"] = True
                elif kind == "line":
                    ledger.line_specs[0]["forged"] = True
                elif kind == "provenance":
                    ledger.entries[0][2]["algorithm"] = "forged"
                else:
                    raise AssertionError("unknown hostile mutation")
            except (AttributeError, TypeError):
                pass
            changed.append(ledger._current_semantic_snapshot() != before)
        return False
    cubic_module._CompactCubicRelationLedger.__init__ = captured_init
    rejected = False
    result = None
    try:
        hostile_field = NumberField(
            x**3 - x**2 - 6*x - 12,
            "hostile_" + kind,
        )
        try:
            result = bounded_cubic_minkowski_class_number(
                hostile_field,
                cancelled=corrupt_but_continue,
            )
        except RuntimeError as error:
            assert str(error) == (
                "compact cubic relation semantics changed during a callback"
            )
            rejected = True
    finally:
        cubic_module._CompactCubicRelationLedger.__init__ = original_init
    assert len(captured) == 1 and len(changed) == 1
    if changed[0]:
        assert rejected and not captured[0]._issued
    else:
        assert not rejected
        assert result.complete and result.certificate.verify()

for mutation_kind in (
    "factor",
    "presentation",
    "obstruction",
    "line",
    "provenance",
):
    probe_hostile_ledger_mutation(mutation_kind)

# Discriminant 23 has an empty Minkowski factor base.  Its direct path does not
# import or construct the relation ledger and retains the canonical empty body.
K23 = NumberField(x**3 - x**2 + 1, "z")
empty = bounded_cubic_minkowski_class_number(K23)
assert empty.complete and empty.order() == 1
assert empty.factor_base == () and empty.relation_records == ()
assert empty.presentation.column_count == 0 and empty.presentation.order == 1
assert empty.certificate.factor_base == []
assert empty.certificate.relations == []
assert empty.certificate.obstructions == []
assert empty.diagnostics["factor_base_size"] == 0
assert empty.diagnostics["relations"] == 0
assert empty.diagnostics["relation_search"]["relation_attempts"] == 0
assert not hasattr(empty.certificate, "_detached_encoding")
assert empty.certificate.verify()

print("cubic-compact-relation-ledger-ok")
`;
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 120_000,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    result.stdout.trim().split("\n").at(-1),
    "cubic-compact-relation-ledger-ok",
  );
});
