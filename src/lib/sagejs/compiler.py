"""Explicit contracts for Sage.js mathematical optimization.

The :func:`optimize` decorator is ordinary CPython-parseable Python. Under
CPython it validates and records the requested contract without changing the
callable. The Sage.js compiler additionally proves the contract against its
versioned optimizer IR and fails compilation when it cannot do so.

```python
from sagejs.compiler import optimize


@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
def recurrence(count: int, value: float, multiplier: float) -> float:
    for _index in range(count):
        value = value * multiplier
    return value
```
"""

from __future__ import annotations

from typing import Any

_COVERAGE = ("all-loops", "at-least-one")
_TARGETS = ("auto", "v8", "wasm", "native", "library", "generic")
_GUARD_FAILURE = ("fallback", "error")


def _choice(value: Any, name: str, choices: tuple[str, ...]) -> str:
    if not isinstance(value, str) or value not in choices:
        raise ValueError(name + " must be one of " + ", ".join(choices))
    return value


def optimize(
    *,
    require: str,
    coverage: str = "all-loops",
    target: str = "auto",
    guard_failure: str = "fallback",
) -> Any:
    """Require a named optimizer pass for a function.

    `coverage="all-loops"` requires every lexical loop in the function
    (excluding nested functions and classes) to select `require`.
    `coverage="at-least-one"` requires one such region. A non-`auto` target
    additionally fixes the selected execution family.

    `guard_failure="fallback"` preserves normal speculative behavior.
    `guard_failure="error"` makes a runtime guard mismatch fail instead of
    silently running the generic implementation; this is useful for research
    code and tests whose performance contract matters independently of input
    size.
    """
    if not isinstance(require, str) or not require:
        raise ValueError("require must be a non-empty optimizer pass ID")
    exact_coverage = _choice(coverage, "coverage", _COVERAGE)
    exact_target = _choice(target, "target", _TARGETS)
    exact_guard_failure = _choice(
        guard_failure,
        "guard_failure",
        _GUARD_FAILURE,
    )
    contract = {
        "require": require,
        "coverage": exact_coverage,
        "target": exact_target,
        "guard_failure": exact_guard_failure,
    }

    def decorate(function: Any) -> Any:
        if not callable(function):
            raise TypeError("@optimize can decorate only a callable")
        metadata_target: Any = function
        metadata_target.__sagejs_optimization_contract__ = dict(contract)
        return function

    return decorate


def optimization_contract(function: Any) -> dict[str, str] | None:
    """Return a detached declared contract, or `None` when absent.

    This reports the source declaration only. Compiler selection evidence and
    runtime route receipts are exposed by the optimizer explain interfaces;
    a mutable Python function attribute is never treated as authenticated
    proof that optimized code ran.
    """
    value = getattr(function, "__sagejs_optimization_contract__", None)
    if not isinstance(value, dict):
        return None
    return {str(key): str(item) for key, item in value.items()}


__all__ = ["optimize", "optimization_contract"]
