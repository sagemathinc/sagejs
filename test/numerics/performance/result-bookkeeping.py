"""Problem/result binding avoids redundant hashes, never validation or provenance."""

import math

from sagejs.numerics.model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
)


class ObservedProblem(NumericalProblem):
    def __init__(self, marker="original"):
        NumericalProblem.__init__(
            self, "test", "binding_witness", metadata={"marker": marker}
        )
        self.snapshots = 0

    def to_dict(self):
        self.snapshots += 1
        return NumericalProblem.to_dict(self)


def plan_for(problem):
    return NumericalPlan(
        problem,
        method="witness",
        backend="ordinary-python",
        reason="binding witness",
        capability={},
    )


def result_for(problem, selected, **options):
    settings = {
        "success": True,
        "status": "converged",
        "value": 2.0,
        "validation": NumericalValidation("validated_approximate", True),
    }
    settings.update(options)
    return NumericalResult(problem, selected, **settings)


def raises(expected, call):
    try:
        call()
    except expected:
        return
    raise AssertionError("expected " + expected.__name__)


problem = ObservedProblem()
selected = plan_for(problem)
result = result_for(problem, selected)
assert result.problem is problem and selected.problem is problem
assert problem.snapshots == 0

# Outward communication still includes independently recomputable wire hashes.
record = result.to_dict()
assert record["problem_digest"] == problem.digest
assert record["reproducibility"]["plan"]["problem_digest"] == problem.digest
assert record["reproducibility"]["problem"] == problem.to_dict()
record["reproducibility"]["problem"]["metadata"]["marker"] = "changed view"
assert problem.to_dict()["metadata"]["marker"] == "original"

# Equivalent but distinct objects are accepted by the existing content guard.
left = ObservedProblem()
right = ObservedProblem()
result_for(right, plan_for(left))
assert left.snapshots == 1 and right.snapshots == 1, (left.snapshots, right.snapshots)
result_for(right, plan_for(left))
assert left.snapshots == 2 and right.snapshots == 2, (left.snapshots, right.snapshots)

different = ObservedProblem("different")
raises(ValueError, lambda: result_for(different, plan_for(left)))
assert left.snapshots == 3 and different.snapshots == 1, (
    left.snapshots,
    different.snapshots,
)

# This optimization does not add a mutable-content cache: distinct bindings are
# rechecked on every construction, including subclasses with changing records.
right._metadata["marker"] = "different"
raises(ValueError, lambda: result_for(right, plan_for(left)))
assert left.snapshots == 4 and right.snapshots == 3, (left.snapshots, right.snapshots)

# Binding by identity must not bypass any of the other result invariants.
raises(TypeError, lambda: result_for(None, selected))
raises(TypeError, lambda: result_for(problem, None))
raises(TypeError, lambda: result_for(problem, selected, success=1))
raises(ValueError, lambda: result_for(problem, selected, status="cancelled"))
raises(
    ValueError,
    lambda: result_for(
        problem,
        selected,
        validation=NumericalValidation("indeterminate", False),
    ),
)
raises(ValueError, lambda: result_for(problem, selected, value=math.inf))
raises(ValueError, lambda: result_for(problem, selected, evaluations=10000))
raises(ValueError, lambda: result_for(problem, selected, iterations=10000))
raises(ValueError, lambda: result_for(problem, selected, elapsed_ms=-1))

print("result bookkeeping passed")
