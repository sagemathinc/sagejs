"""Profile one fresh general class/unit request; not a timing receipt.

Run with Sage.js in Sage mode. `SAGEJS_FRONTIER_COEFFICIENTS` contains JSON
ascending coefficients; `SAGEJS_FRONTIER_ALGORITHM` optionally names the
algorithm. Progress callbacks deliberately disable terminal
cache reuse; this instrumented run is separate from headline timing.
"""

import json
import os
import time

print("FRONTIER_PHASE|import-shared-engine", flush=True)
from sagejs.number_fields.class_unit_groups import class_unit_context

profile = {}
profiling = os.environ.get("SAGEJS_FRONTIER_PROFILE") == "1"


def instrument(owner, name, label):
    original = getattr(owner, name)
    profile[label] = {"calls": 0, "completed": 0, "inclusive_seconds": 0.0}

    def wrapped(*args, **kwargs):
        record = profile[label]
        record["calls"] += 1
        started = time.monotonic()
        try:
            return original(*args, **kwargs)
        finally:
            record["inclusive_seconds"] += time.monotonic() - started
            record["completed"] += 1

    setattr(owner, name, wrapped)


if profiling:
    engine = __import__("sagejs.number_fields.class_unit_groups", fromlist=["*"])
    arithmetic = __import__("sagejs.number_fields.ideal_arithmetic", fromlist=["*"])
    primes = __import__("sagejs.number_fields.prime_ideals", fromlist=["*"])
    relations = __import__("sagejs.number_fields.class_group_relations", fromlist=["*"])
    for name in ("_large_prime_factor", "_try_large_prime_partial"):
        instrument(engine.ClassUnitGroupEngine, name, name)
    for name in (
        "factor_integral_ideal",
        "ideal_valuation",
        "ideal_power",
        "_element_valuations_impl",
    ):
        instrument(arithmetic, name, name)
    instrument(primes, "factor_rational_prime", "factor_rational_prime")
    instrument(relations, "minkowski_lll_lattice", "minkowski_lll_lattice")
    instrument(relations, "_factor_witness_over_base_and_norm", "factor_witness")


def report(event):
    if profiling:
        event = {
            key: event[key]
            for key in (
                "event",
                "stage",
                "state",
                "elapsed_seconds",
                "attempt",
                "rank",
                "columns",
                "exact_rows",
                "pending_exact_rows",
                "search_state",
            )
            if key in event
        }
        event["diagnostic_inclusive_profile"] = profile
    print("FRONTIER_PROGRESS|" + json.dumps(event, default=str), flush=True)


coefficients = json.loads(os.environ["SAGEJS_FRONTIER_COEFFICIENTS"])
algorithm = os.environ.get("SAGEJS_FRONTIER_ALGORITHM", "buchmann-hecke")
started = time.monotonic()
print("FRONTIER_PHASE|construct-field", flush=True)
ring = PolynomialRing(QQ, "x")
field = NumberField(ring([int(value) for value in coefficients]), "a")
print("FRONTIER_PHASE|class-unit-context", flush=True)
result = class_unit_context(field, proof=False, algorithm=algorithm, progress=report)
payload = {
    "kind": "instrumented-diagnostic-not-performance-evidence",
    "coefficients": coefficients,
    "algorithm": algorithm,
    "complete": result.complete,
    "proof_status": result.proof_status,
    "context_elapsed_seconds": time.monotonic() - started,
    "request_scope": "context-and-summary-not-complete-maps",
    "class_map_probes_performed": False,
    "unit_map_probes_performed": False,
    "detached_replay_performed": False,
    "diagnostics": result.diagnostics,
    "diagnostic_inclusive_profile": profile if profiling else None,
    "tentative_invariants": list(result.tentative_invariants),
}
if result.complete:
    units = result.unit_group()
    payload["class_invariants"] = list(result.class_group().invariants())
    payload["unit_rank"] = units.unit_rank
    payload["regulator"] = result.regulator().to_dict()
    payload["has_unit_coordinate_api"] = callable(getattr(units, "log", None))
print("FRONTIER_RESULT|" + json.dumps(payload, default=str), flush=True)
