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


def report(event):
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
    "tentative_invariants": list(result.tentative_invariants),
}
if result.complete:
    units = result.unit_group()
    payload["class_invariants"] = list(result.class_group().invariants())
    payload["unit_rank"] = units.unit_rank
    payload["regulator"] = result.regulator().to_dict()
    payload["has_unit_coordinate_api"] = callable(getattr(units, "log", None))
print("FRONTIER_RESULT|" + json.dumps(payload, default=str), flush=True)
