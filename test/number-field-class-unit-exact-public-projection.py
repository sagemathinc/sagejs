"""Exact public projection regression executed as an ordinary Python program."""

import json
import time

from sagejs.number_fields import class_group_maps

CASES = (
    ("3.1.588.1", (1, 5, -1, 1), (3,)),
    ("3.1.5448.1", (30, -14, -1, 1), (8,)),
    ("3.1.4027.2", (8, 7, -1, 1), (6,)),
)
R = PolynomialRing(QQ, "x")
x = R.gen()
original_adapter = class_group_maps.class_group_from_engine_result


def make_field(coefficients, name):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    field = NumberField(polynomial, name)
    field.maximal_order()
    return field


def check_case(case_index, label, coefficients, invariants, proof):
    K = make_field(coefficients, "a" + str(case_index) + str(int(proof)))
    result = K.class_unit_group(proof=proof)
    assert result.complete
    raw_group = result.class_group()
    live = result.context._live_artifacts
    assert live is not None

    # The combined standard adapter/sealer owns one reservation. A failure
    # below that identity-checked helper must roll the reservation back.
    if label == "3.1.588.1" and proof:
        projection_type = class_group_maps._SealedIdealClassGroupProjection
        original_canonical_json = class_group_maps._canonical_json

        def failing_canonical_json(_value):
            raise ArithmeticError("injected exact sealing failure")

        class_group_maps._canonical_json = failing_canonical_json
        try:
            K.class_group(proof=proof)
            raise AssertionError("the injected exact sealing failure disappeared")
        except ArithmeticError as error:
            assert "injected exact sealing failure" in str(error)
        finally:
            class_group_maps._canonical_json = original_canonical_json
        assert live.public_class_group_projection is None
        assert not live.public_class_group_projection_reserved

        # Interposing the combined helper disables projection and leaves the
        # ordinary fully verified adapter in charge.
        original_combined = (
            class_group_maps.adapt_and_seal_public_class_group_projection
        )

        def interposed_combined(_result):
            raise AssertionError("an interposed combined helper was invoked")

        class_group_maps.adapt_and_seal_public_class_group_projection = (
            interposed_combined
        )
        try:
            assert K.class_group(proof=proof).verify()
        finally:
            class_group_maps.adapt_and_seal_public_class_group_projection = (
                original_combined
            )
        assert live.public_class_group_projection is None

        # The public source-taking sealer still independently verifies and
        # rejects mutation; only the no-source combined helper skips replay.
        mutated = original_adapter(result)
        mutated._invariants = (2,)
        try:
            class_group_maps.seal_public_class_group_projection(mutated)
            raise AssertionError("a mutated exact source was sealed")
        except ArithmeticError:
            pass

        # Replacing a private class hook while the four public module helpers
        # retain their standard identities used to mutate the locally verified
        # group after replay and publish a false capsule. The combined helper
        # now owns the original initializer in a closure, so the replacement
        # is never dispatched and both the retry and fresh view stay exact.
        original_initialize = projection_type._initialize
        original_verify = class_group_maps.IdealClassGroup.verify
        original_proof_payload = class_group_maps.IdealClassGroup.proof_payload
        replacement_calls = []

        def mutating_initialize(projection, source, **options):
            replacement_calls.append(True)
            source._invariants = (2,)
            return original_initialize(projection, source, **options)

        def replaced_verify(_source):
            replacement_calls.append("verify")
            return True

        def replaced_proof_payload(_source):
            replacement_calls.append("proof-payload")
            return {"schema": "interposed"}

        projection_type._initialize = mutating_initialize
        class_group_maps.IdealClassGroup.verify = replaced_verify
        class_group_maps.IdealClassGroup.proof_payload = replaced_proof_payload
        try:
            guarded_first = K.class_group(proof=proof)
            guarded_fresh = K.class_group(proof=proof)
        finally:
            projection_type._initialize = original_initialize
            class_group_maps.IdealClassGroup.verify = original_verify
            class_group_maps.IdealClassGroup.proof_payload = original_proof_payload
        assert replacement_calls == []
        assert guarded_first.invariants() == invariants
        assert guarded_fresh.invariants() == invariants
        assert guarded_first.verify()
        assert guarded_fresh.verify()

    counters = {
        "engine_discrete_logs": 0,
        "representative_ideals": 0,
        "representative_reconstructions": 0,
        "principal_ideal_builds": 0,
        "witness_verifications": 0,
        "proof_record_rebuilds": 0,
    }
    original_discrete_log = raw_group.discrete_log
    original_representative = raw_group.representative_ideal
    collector = raw_group._relation_reconstructor
    original_reconstruct = collector.reconstruct_factor_base_ideal
    original_principal = class_group_maps._principal_ideal
    original_witness_verify = class_group_maps.PrincipalIdealWitness.verify
    proof_type = class_group_maps.UnconditionalMinkowskiProofRecord
    original_record_from_dict = proof_type.from_dict

    def counted_discrete_log(ideal):
        counters["engine_discrete_logs"] += 1
        return original_discrete_log(ideal)

    def counted_representative(coordinates):
        counters["representative_ideals"] += 1
        return original_representative(coordinates)

    def counted_reconstruct(row):
        counters["representative_reconstructions"] += 1
        return original_reconstruct(row)

    def counted_principal(generator, order):
        counters["principal_ideal_builds"] += 1
        return original_principal(generator, order)

    def counted_witness_verify(witness, order=None):
        counters["witness_verifications"] += 1
        return original_witness_verify(witness, order)

    def counted_record_from_dict(*args):
        counters["proof_record_rebuilds"] += 1
        return original_record_from_dict(*args)

    raw_group.discrete_log = counted_discrete_log
    raw_group.representative_ideal = counted_representative
    collector.reconstruct_factor_base_ideal = counted_reconstruct
    class_group_maps._principal_ideal = counted_principal
    class_group_maps.PrincipalIdealWitness.verify = counted_witness_verify
    proof_type.from_dict = counted_record_from_dict

    first = K.class_group(proof=proof)
    assert first.invariants() == invariants
    assert first.proof_status == result.proof_status
    assert live.public_class_group_projection is not None
    assert not hasattr(first._projection_core, "_proof_context")

    ordinary = original_adapter(result)
    assert ordinary.invariants() == first.invariants()
    assert ordinary.proof_status == first.proof_status
    assert ordinary.proof_payload() == first.proof_payload()

    for name in counters:
        counters[name] = 0
    repeats = []
    previous = first
    for _index in range(9):
        started = time.monotonic()
        current = K.class_group(proof=proof)
        repeats.append(time.monotonic() - started)
        assert current is not previous
        assert current._projection_core is not previous._projection_core
        assert current.gen(0).parent() is current
        assert current.invariants() == invariants
        assert current.proof_payload() == first.proof_payload()
        previous = current
    assert counters == {
        "engine_discrete_logs": 0,
        "representative_ideals": 0,
        "representative_reconstructions": 0,
        "principal_ideal_builds": 0,
        "witness_verifications": 0,
        "proof_record_rebuilds": 0,
    }
    repeat_counters = dict(counters)
    assert sorted(repeats)[len(repeats) // 2] <= 0.025

    # Detached payload and wrapper mutations cannot reach the retained core.
    payload = previous.proof_payload()
    payload["theorem"] = "mutated"
    previous._invariants = (2,)
    if first.gens_ideals():
        first.gens_ideals()[0]._basis_rows = (
            tuple(QQ(1) if index == 0 else QQ(0) for index in range(3)),
        )
    fresh = K.class_group(proof=proof)
    assert fresh.invariants() == invariants
    assert fresh.proof_payload() == ordinary.proof_payload()

    # Cancellation is checked by full detached replay. Explicit verification
    # stays independent of the repeat-observation capsule construction.
    exact_payload = fresh.proof_payload()
    assert not fresh.verify_proof_payload(exact_payload, cancelled=lambda: True)
    started = time.monotonic()
    assert fresh.verify()
    verify_seconds = time.monotonic() - started
    assert fresh.verify_proof_payload(exact_payload)

    retained = live.public_class_group_projection
    live.public_class_group_projection = object()
    try:
        K.class_group(proof=proof)
        raise AssertionError("a replaced exact projection was accepted")
    except ArithmeticError as error:
        assert "projection changed type" in str(error)
    live.public_class_group_projection = retained
    assert K.class_group(proof=proof).invariants() == invariants

    raw_group.discrete_log = original_discrete_log
    raw_group.representative_ideal = original_representative
    collector.reconstruct_factor_base_ideal = original_reconstruct
    class_group_maps._principal_ideal = original_principal
    class_group_maps.PrincipalIdealWitness.verify = original_witness_verify
    proof_type.from_dict = original_record_from_dict
    return {
        "label": label,
        "proof": proof,
        "proof_status": result.proof_status,
        "repeat_median_seconds": sorted(repeats)[len(repeats) // 2],
        "verify_seconds": verify_seconds,
        "counters": repeat_counters,
    }


rows = []
for case_index, case in enumerate(CASES):
    for proof in (False, True):
        rows.append(check_case(case_index, case[0], case[1], case[2], proof))

# Callback-bearing exact work never gains access to an existing projection.
callback_field = make_field((1, 5, -1, 1), "callback")
events = []
callback_result = callback_field.class_unit_group(proof=True, progress=events.append)
assert callback_result.context._live_artifacts is not None
assert callback_result.context._live_artifacts.public_class_group_projection is None
if callback_result.complete:
    assert original_adapter(callback_result).verify()

print(json.dumps({"rows": rows, "status": "ok"}, sort_keys=True))
