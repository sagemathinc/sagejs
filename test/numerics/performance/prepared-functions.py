"""Public prepared expression ownership, fallback and numerical semantics."""

import copy
import math

from sagejs.numerics.evaluators import PreparedFunction
from sagejs.numerics.frontends.expressions import evaluate_expression, expression_record
from sagejs.numerics.frontends.model import UnsupportedFrontendError


def rejects(function, exception=ValueError):
    try:
        function()
    except exception:
        return
    raise AssertionError("expected rejection")


names = ["x", "a"]
f = PreparedFunction("x*x-a", inputs=names, backend="native")
names[0] = "changed"
assert f(3.0, 2.0) == 7.0
assert f(4.0, 3.0) == 13.0
assert f.to_dict()["execution_target"] == EXPECTED_TARGET
assert f.to_dict()["compiled_eligible"]
detached = f.to_dict()
detached["expression"]["tree"]["operator"] = "add"
assert f(3.0, 2.0) == 7.0
assert f.to_dict()["id"] == PreparedFunction("x*x-a", inputs=["x", "a"]).to_dict()["id"]
rejects(lambda: f(3.0))
rejects(lambda: f(float("inf"), 0.0))
rejects(lambda: copy.copy(f), TypeError)
rejects(lambda: copy.deepcopy(f), TypeError)

for language, source in [
    ("python", "sqrt(x*x)+a"),
    ("sage", "sqrt(x*x)+a"),
    ("matlab", "sqrt(x.*x)+a"),
    ("wolfram", "Sqrt[x*x]+a"),
]:
    g = PreparedFunction(source, inputs=["x", "a"], language=language, backend="native")
    assert g(-3.0, 2.0) == 5.0
    assert g.to_dict()["execution_target"] == EXPECTED_TARGET
    g.close()
    g.close()
    rejects(lambda: g(1.0, 2.0))

for backend in ("dynamic", "native"):
    assert (
        PreparedFunction("9007199254740993-9007199254740992", backend=backend)(0.0)
        == 0.0
    )
    assert math.copysign(1.0, PreparedFunction("-x", backend=backend)(0.0)) == -1.0
    for source in ("-abs(x)", "-sqrt(x*x)", "x/(-1.0)"):
        assert (
            math.copysign(1.0, PreparedFunction(source, backend=backend)(0.0)) == -1.0
        )
    for source in ("1/x", "sqrt(-1)", "1/(1e308*1e308)"):
        rejects(lambda: PreparedFunction(source, backend=backend)(0.0))
    h = PreparedFunction("sin(x)", backend=backend)
    assert h(0.0) == 0.0
    assert not h.to_dict()["compiled_eligible"]
    assert h.to_dict()["execution_target"] == "dynamic"

# The new finite-intermediate policy is explicit; existing replay callers keep
# their existing semantics unless they opt in.
record = expression_record("1/(1e308*1e308)", language="python")
assert evaluate_expression(record, {"x": 0.0}) == 0.0
rejects(lambda: evaluate_expression(record, {"x": 0.0}, finite_intermediates=True))
rejects(lambda: PreparedFunction("x+x+x", max_instructions=2))
rejects(lambda: PreparedFunction("x", max_instructions=True))
rejects(lambda: PreparedFunction("x", inputs=[]))
rejects(lambda: PreparedFunction("pi", inputs=["pi"]))
rejects(lambda: PreparedFunction("sin(x)+1e999"), UnsupportedFrontendError)

for sign_source, sign in [
    (0.0, 1.0),
    (-0.0, -1.0),
    (2.0, 1.0),
    (-2.0, -1.0),
    (float("inf"), 1.0),
    (-float("inf"), -1.0),
    (float("nan"), 1.0),
    (-float("nan"), -1.0),
]:
    assert math.copysign(3.0, sign_source) == 3.0 * sign
    assert math.copysign(-3.0, sign_source) == 3.0 * sign
    assert math.copysign(1.0, math.copysign(0.0, sign_source)) == sign


class Reentrant:
    def __float__(self):
        return f(1.0, 2.0)


rejects(lambda: f(Reentrant(), 2.0), RuntimeError)
assert f(3.0, 2.0) == 7.0
f.close()
rejects(f.to_dict)
with PreparedFunction("x+1") as context_function:
    assert context_function(2.0) == 3.0
rejects(lambda: context_function(2.0))
print("prepared functions passed")
