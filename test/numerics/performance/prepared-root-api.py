"""Public root candidate verification and resource accounting."""

import math

from sagejs.numerics.evaluators import PreparedFunction
from sagejs.numerics.prepared_roots import solve_prepared_root

f = PreparedFunction("x*x-a", inputs=("x", "a"), backend="native")
r = solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,))
d = r.to_dict()
assert d["success"], d
assert abs(d["value"] - math.sqrt(2.0)) < 1e-12
assert d["validation"]["truth_level"] == "validated_approximate"
assert d["measurements"]["validation_evaluations"] == 3
assert d["evaluations"] == d["measurements"]["solver_evaluations"] + 3
assert d["backend"] == EXPECTED_BACKEND
assert f(3.0, 2.0) == 7.0
workspace = f._root_workspace
changed = solve_prepared_root(f, 1.0, 2.0, parameters=(3.0,)).to_dict()
assert changed["success"] and abs(changed["value"] - math.sqrt(3.0)) < 1e-12
assert f._root_workspace is workspace
for source, lo, hi, expected in [
    ("x", 0.0, 2.0, "converged"),
    ("x", -2.0, 0.0, "converged"),
    ("x*x+1", -2.0, 2.0, "invalid_bracket"),
    ("1/x", -1.0, 1.0, "nonfinite_evaluation"),
    ("sin(x)", -1.0, 1.0, "converged"),
]:
    result = solve_prepared_root(
        PreparedFunction(source, backend="native"), lo, hi
    ).to_dict()
    assert result["status"] == expected, result
    if source == "sin(x)":
        assert result["backend"] == "ordinary-python"
    assert result["evaluations"] <= 256
limited = solve_prepared_root(
    f, 1.0, 2.0, parameters=(2.0,), max_evaluations=6
).to_dict()
assert limited["status"] == "maximum_evaluations"
assert not limited["success"]
assert limited["evaluations"] <= 6
assert (
    solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,), maxiter=1).to_dict()["status"]
    == "maximum_iterations"
)
# A backend success status and claimed zero residual are not trusted.
import sagejs.numerics._evaluation_root as core

original = core.bisect_program


def forged(*args):
    args[6][1] = 2.0
    args[7][0] = 1.5
    args[7][1] = 0.0
    args[7][3] = 1.5
    args[7][4] = 1.5
    return 0.0


forged.__sagejs_native_compiled__ = True
forged.nativeAvailable = True
core.bisect_program = forged
try:
    rejected = solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,)).to_dict()
    assert rejected["status"] == "validation_failed", rejected
    assert not rejected["success"]
finally:
    core.bisect_program = original
assert f(3.0, 2.0) == 7.0
recovered = solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,))
assert recovered.success and abs(recovered.value - math.sqrt(2.0)) < 1e-12
assert abs(d["value"] - math.sqrt(2.0)) < 1e-12

# An incomplete success on the same callable must not inherit old output.
backend_calls = [0]


def incomplete(*args):
    backend_calls[0] += 1
    if backend_calls[0] == 1:
        return original(*args)
    return 0.0


incomplete.__sagejs_native_compiled__ = True
incomplete.nativeAvailable = True
core.bisect_program = incomplete
try:
    assert solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,)).success
    stale = solve_prepared_root(f, 1.0, 2.0, parameters=(2.0,))
    assert not stale.success and stale.status == "backend_failure"
finally:
    core.bisect_program = original
f.close()
assert f._root_workspace is None and f._root_function is None
print("prepared root API passed")
