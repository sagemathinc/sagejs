"""Host-neutral contracts for certified maximal-order algorithms.

The records in this module deliberately contain only integers, strings, lists,
and dictionaries.  They may cross a worker or native boundary after explicit
serialization; they never contain a field element, host object, or native
pointer.
"""

from __future__ import annotations

import time
from typing import Any

COMPONENT_STATES = (
    "proven-prime",
    "probable-prime-awaiting-proof",
    "composite",
    "unresolved-coprime-component",
)
LOCAL_RESULT_STATES = (
    "complete",
    "split",
    "not-applicable",
    "resource-error",
    "certification-error",
)
LOCAL_ALGORITHMS = (
    "dedekind",
    "round2",
    "polygon",
    "round4",
    "buchmann-lenstra",
    "om-maxmin",
)


def _checked_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be an integer")
    return value


def _checked_positive_integer(value: Any, name: str) -> int:
    answer = _checked_integer(value, name)
    if answer <= 0:
        raise ValueError(name + " must be positive")
    return answer


def _checked_nonnegative_integer(value: Any, name: str) -> int:
    answer = _checked_integer(value, name)
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


def _checked_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(name + " must be a nonempty string")
    return value


def _json_value(value: Any, path: str = "$") -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list) or isinstance(value, tuple):
        return [_json_value(item, path + "[]") for item in value]
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        for key in value:
            if not isinstance(key, str):
                raise TypeError(path + " keys must be strings")
            answer[key] = _json_value(value[key], path + "." + key)
        return answer
    raise TypeError(path + " is not JSON-safe")


def _gcd(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


def _determinant(rows: list[list[int]]) -> int:
    """Return the exact determinant by fraction-free elimination."""
    degree = len(rows)
    if degree == 0:
        return 1
    matrix = [list(row) for row in rows]
    sign = 1
    previous = 1
    for pivot_index in range(degree - 1):
        pivot_row = pivot_index
        while pivot_row < degree and matrix[pivot_row][pivot_index] == 0:
            pivot_row += 1
        if pivot_row == degree:
            return 0
        if pivot_row != pivot_index:
            matrix[pivot_index], matrix[pivot_row] = (
                matrix[pivot_row],
                matrix[pivot_index],
            )
            sign = -sign
        pivot = matrix[pivot_index][pivot_index]
        for row in range(pivot_index + 1, degree):
            for column in range(pivot_index + 1, degree):
                numerator = (
                    matrix[row][column] * pivot
                    - matrix[row][pivot_index] * matrix[pivot_index][column]
                )
                if previous != 1:
                    if numerator % previous != 0:
                        raise ArithmeticError(
                            "fraction-free determinant division failed"
                        )
                    numerator //= previous
                matrix[row][column] = numerator
            matrix[row][pivot_index] = 0
        previous = pivot
    return sign * matrix[degree - 1][degree - 1]


class OrderBasis:
    """Canonical integer numerator matrix over one positive denominator."""

    def __init__(
        self,
        numerator: list[list[int]],
        denominator: int,
        *,
        canonical: bool = True,
    ) -> None:
        denominator_value = _checked_positive_integer(denominator, "denominator")
        rows = [list(row) for row in numerator]
        degree = len(rows)
        if degree == 0:
            raise ValueError("an order basis must have positive degree")
        for row in rows:
            if len(row) != degree:
                raise ValueError("an order basis numerator must be square")
            for value in row:
                _checked_integer(value, "order basis numerator entry")
        common = denominator_value
        for row in rows:
            for value in row:
                common = _gcd(common, value)
        if common > 1:
            denominator_value //= common
            rows = [[value // common for value in row] for row in rows]
        determinant = _determinant(rows)
        if determinant == 0:
            raise ValueError("an order basis numerator must be nonsingular")
        self.numerator = rows
        self.denominator = denominator_value
        self.degree = degree
        self.determinant_numerator = determinant
        self.canonical = bool(canonical)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/order-basis-v1",
            "numerator": [list(row) for row in self.numerator],
            "denominator": self.denominator,
            "degree": self.degree,
            "determinant_numerator": self.determinant_numerator,
            "canonical": self.canonical,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> OrderBasis:
        if value.get("schema") != "sagejs.number-fields/order-basis-v1":
            raise ValueError("unsupported order-basis schema")
        answer = cls(
            value["numerator"],
            value["denominator"],
            canonical=bool(value.get("canonical", False)),
        )
        if value.get("degree") != answer.degree:
            raise ValueError("order-basis degree does not match its matrix")
        if value.get("determinant_numerator") != answer.determinant_numerator:
            raise ValueError("order-basis determinant evidence is stale")
        return answer

    def rational_pairs(self) -> list[list[list[int]]]:
        return [[[entry, self.denominator] for entry in row] for row in self.numerator]

    def canonical_key(self) -> tuple[Any, ...]:
        return (
            self.denominator,
            tuple(tuple(entry for entry in row) for row in self.numerator),
        )


class DiscriminantComponent:
    """One pairwise-coprime discriminant component with explicit proof state."""

    def __init__(
        self,
        value: int,
        state: str,
        *,
        base: int | None = None,
        exponent: int = 1,
        evidence: dict[str, Any] | None = None,
    ) -> None:
        self.value = _checked_positive_integer(value, "component value")
        if state not in COMPONENT_STATES:
            raise ValueError("unknown discriminant component state: " + str(state))
        self.state = state
        self.base = (
            self.value
            if base is None
            else _checked_positive_integer(base, "component base")
        )
        self.exponent = _checked_positive_integer(exponent, "component exponent")
        if self.base**self.exponent != self.value:
            raise ValueError("component base and exponent do not reproduce its value")
        self.evidence = _json_value({} if evidence is None else evidence)

    @property
    def is_proven_prime(self) -> bool:
        return self.state == "proven-prime" and self.exponent == 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "state": self.state,
            "base": self.base,
            "exponent": self.exponent,
            "evidence": _json_value(self.evidence),
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> DiscriminantComponent:
        return cls(
            value["value"],
            value["state"],
            base=value.get("base"),
            exponent=value.get("exponent", 1),
            evidence=value.get("evidence", {}),
        )


class ComponentSplit:
    """A certified nontrivial split discovered during one local branch."""

    def __init__(
        self,
        source: int,
        left: int,
        right: int,
        evidence: dict[str, Any] | None = None,
    ) -> None:
        self.source = _checked_positive_integer(source, "split source")
        self.left = _checked_positive_integer(left, "split left factor")
        self.right = _checked_positive_integer(right, "split right factor")
        if self.left == 1 or self.right == 1 or self.left * self.right != self.source:
            raise ValueError("a component split must be nontrivial and exact")
        self.evidence = _json_value({} if evidence is None else evidence)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "left": self.left,
            "right": self.right,
            "evidence": _json_value(self.evidence),
        }


class LocalOrderResult:
    """One local solver outcome with basis and independently checkable evidence."""

    def __init__(
        self,
        state: str,
        algorithm: str,
        component: DiscriminantComponent,
        *,
        basis: OrderBasis | None = None,
        index: int = 1,
        discriminant: int | None = None,
        split: ComponentSplit | None = None,
        evidence: dict[str, Any] | None = None,
        trace: list[dict[str, Any]] | None = None,
        message: str | None = None,
    ) -> None:
        if state not in LOCAL_RESULT_STATES:
            raise ValueError("unknown local result state: " + str(state))
        if algorithm not in LOCAL_ALGORITHMS:
            raise ValueError("unknown local maximal-order algorithm: " + str(algorithm))
        if not isinstance(component, DiscriminantComponent):
            raise TypeError("local result component must be DiscriminantComponent")
        if basis is not None and not isinstance(basis, OrderBasis):
            raise TypeError("local result basis must be OrderBasis or None")
        if split is not None and not isinstance(split, ComponentSplit):
            raise TypeError("local result split must be ComponentSplit or None")
        if state == "complete" and basis is None:
            raise ValueError("a complete local result requires a basis")
        if state == "split" and split is None:
            raise ValueError("a split local result requires split evidence")
        if state != "split" and split is not None:
            raise ValueError("only a split local result may contain a split")
        self.state = state
        self.algorithm = algorithm
        self.component = component
        self.basis = basis
        self.index = _checked_positive_integer(index, "local index")
        self.discriminant = (
            None
            if discriminant is None
            else _checked_integer(discriminant, "local discriminant")
        )
        self.split = split
        self.evidence = _json_value({} if evidence is None else evidence)
        self.trace = _json_value([] if trace is None else trace)
        self.message = None if message is None else str(message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "algorithm": self.algorithm,
            "component": self.component.to_dict(),
            "basis": None if self.basis is None else self.basis.to_dict(),
            "index": self.index,
            "discriminant": self.discriminant,
            "split": None if self.split is None else self.split.to_dict(),
            "evidence": _json_value(self.evidence),
            "trace": _json_value(self.trace),
            "message": self.message,
        }


class SelectionDecision:
    """An inspectable deterministic local-algorithm selection."""

    def __init__(
        self,
        algorithm: str,
        reason: str,
        metrics: dict[str, Any],
        *,
        forced: bool = False,
    ) -> None:
        if algorithm not in LOCAL_ALGORITHMS:
            raise ValueError("unknown selected algorithm: " + str(algorithm))
        self.algorithm = algorithm
        self.reason = _checked_string(reason, "selection reason")
        self.metrics = _json_value(metrics)
        self.forced = bool(forced)

    def to_dict(self) -> dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "reason": self.reason,
            "metrics": _json_value(self.metrics),
            "forced": self.forced,
        }


class MaximalOrderTrace:
    """Low-overhead stage trace which is inert unless explicitly enabled."""

    def __init__(self, enabled: bool = False) -> None:
        self.enabled = bool(enabled)
        self._events: list[dict[str, Any]] = []
        self._started: dict[int, tuple[str, int, dict[str, Any]]] = {}
        self._next_token = 0

    def emit(
        self,
        stage: str,
        state: str,
        details: dict[str, Any] | None = None,
        *,
        duration_ns: int | None = None,
    ) -> None:
        if not self.enabled:
            return
        event: dict[str, Any] = {
            "sequence": len(self._events),
            "stage": _checked_string(stage, "trace stage"),
            "state": _checked_string(state, "trace state"),
            "details": _json_value({} if details is None else details),
        }
        if duration_ns is not None:
            event["duration_ns"] = _checked_nonnegative_integer(
                duration_ns, "trace duration"
            )
        self._events.append(event)

    def begin(self, stage: str, details: dict[str, Any] | None = None) -> int:
        if not self.enabled:
            return -1
        token = self._next_token
        self._next_token += 1
        self._started[token] = (
            _checked_string(stage, "trace stage"),
            time.perf_counter_ns(),
            _json_value({} if details is None else details),
        )
        return token

    def end(
        self,
        token: int,
        state: str = "complete",
        details: dict[str, Any] | None = None,
    ) -> None:
        if not self.enabled:
            return
        if token not in self._started:
            raise KeyError("unknown maximal-order trace token")
        stage, started, initial = self._started.pop(token)
        merged = dict(initial)
        if details is not None:
            for key in details:
                merged[key] = _json_value(details[key], "$.trace." + key)
        self.emit(
            stage,
            state,
            merged,
            duration_ns=time.perf_counter_ns() - started,
        )

    def to_dict(self) -> dict[str, Any]:
        if len(self._started):
            raise RuntimeError("maximal-order trace has unfinished stages")
        return {
            "schema": "sagejs.number-fields/maximal-order-trace-v1",
            "enabled": self.enabled,
            "events": _json_value(self._events),
        }


class MaximalOrderCertificate:
    """Global evidence envelope; mathematical checking lives in a separate module."""

    def __init__(
        self,
        equation_discriminant: int,
        order_discriminant: int,
        index: int,
        basis: OrderBasis,
        components: list[DiscriminantComponent],
        local_results: list[LocalOrderResult],
        checks: dict[str, Any],
    ) -> None:
        self.equation_discriminant = _checked_integer(
            equation_discriminant, "equation discriminant"
        )
        self.order_discriminant = _checked_integer(
            order_discriminant, "order discriminant"
        )
        self.index = _checked_positive_integer(index, "global order index")
        if not isinstance(basis, OrderBasis):
            raise TypeError("certificate basis must be OrderBasis")
        self.basis = basis
        self.components = list(components)
        self.local_results = list(local_results)
        for component in self.components:
            if not isinstance(component, DiscriminantComponent):
                raise TypeError("certificate components must be typed records")
        for result in self.local_results:
            if not isinstance(result, LocalOrderResult):
                raise TypeError("certificate local results must be typed records")
        if (
            self.order_discriminant * self.index * self.index
            != self.equation_discriminant
        ):
            raise ValueError("certificate discriminant/index identity does not hold")
        self.checks = _json_value(checks)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/maximal-order-certificate-v1",
            "equation_discriminant": self.equation_discriminant,
            "order_discriminant": self.order_discriminant,
            "index": self.index,
            "basis": self.basis.to_dict(),
            "components": [component.to_dict() for component in self.components],
            "local_results": [result.to_dict() for result in self.local_results],
            "checks": _json_value(self.checks),
        }
