"""Checkpointable quadratic-twist families for hyperelliptic curves over `QQ`.

The family iterator is deliberately bounded and failure-preserving.  Every
fundamental discriminant in the requested interval produces exactly one row;
an unsupported local reduction or an indeterminate numerical refinement is a
row status rather than a silently omitted twist.
"""

from __future__ import annotations

import json
import math
import time
from typing import Any, Callable, Iterator, Mapping

import sagejs as sage

TWIST_FAMILY_SCHEMA = "sagejs.hyperelliptic-quadratic-twists/v2"
_MAX_DISCRIMINANT_ABS = 10**12


class QuadraticTwistFamilyCancelled(RuntimeError):
    """A twist-family scan stopped at a safe discriminant boundary."""

    def __init__(self, next_discriminant: int) -> None:
        self.next_discriminant = next_discriminant
        super().__init__(
            "quadratic-twist family cancelled before " + str(next_discriminant)
        )


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        exact = value == result
    except Exception:
        exact = False
    if exact is not True:
        raise ValueError(name + " must be an exact integer")
    return result


def _prime_squares(bound: int) -> list[int]:
    limit = 0
    while (limit + 1) * (limit + 1) <= bound:
        limit += 1
    composite = [False for _index in range(limit + 1)]
    answer = []
    for candidate in range(2, limit + 1):
        if composite[candidate]:
            continue
        answer.append(candidate * candidate)
        if candidate <= limit // candidate:
            for multiple in range(candidate * candidate, limit + 1, candidate):
                composite[multiple] = True
    return answer


def _integer_gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def fundamental_discriminants(
    start: Any, stop: Any, *, block_size: Any = 65536
) -> Iterator[int]:
    """Yield fundamental quadratic discriminants in a closed interval."""
    lower = _exact_integer(start, "start")
    upper = _exact_integer(stop, "stop")
    block = _exact_integer(block_size, "block_size")
    if lower > upper:
        raise ValueError("the discriminant interval must be nonempty")
    if max(abs(lower), abs(upper)) > _MAX_DISCRIMINANT_ABS:
        raise ValueError("the absolute discriminant bound exceeds 10^12")
    if block < 1 or block > 10_000_000:
        raise ValueError("block_size must be from 1 through 10000000")
    squares = _prime_squares(max(abs(lower), abs(upper)))
    cursor = lower
    while cursor <= upper:
        block_stop = min(upper, cursor + block - 1)
        squarefree = [True for _index in range(block_stop - cursor + 1)]
        for square in squares:
            first = -((-cursor) // square) * square
            for multiple in range(first, block_stop + 1, square):
                squarefree[multiple - cursor] = False
        for discriminant in range(cursor, block_stop + 1):
            if discriminant == 0:
                continue
            if discriminant % 4 == 1:
                if squarefree[discriminant - cursor]:
                    yield discriminant
                continue
            if discriminant % 4 != 0:
                continue
            quotient = discriminant // 4
            if quotient % 4 not in (2, 3):
                continue
            absolute = abs(quotient)
            quotient_squarefree = True
            for square in squares:
                if square > absolute:
                    break
                if quotient % square == 0:
                    quotient_squarefree = False
                    break
            if quotient_squarefree:
                yield discriminant
        cursor = block_stop + 1


def is_fundamental_discriminant(value: Any) -> bool:
    """Return whether `value` is a fundamental quadratic discriminant."""
    discriminant = _exact_integer(value, "discriminant")
    return next(fundamental_discriminants(discriminant, discriminant), None) is not None


def quadratic_twist(curve: Any, discriminant: Any, *, check: bool = True) -> Any:
    """Return the quadratic twist by a fundamental discriminant.

    If `C` has generalized model `y^2+h*y=f`, the returned generalized model

    ```text
    y^2 + d*h*y = d*f + d*(1-d)*h^2/4
    ```

    has completed square `d*(h^2+4*f)`.  This preserves the original equation
    when `d=1` and often preserves much better integral behavior at 2 than
    discarding `h` after completing the square.
    """
    d_value = _exact_integer(discriminant, "discriminant")
    if d_value == 0:
        raise ValueError("a quadratic twist discriminant must be nonzero")
    if check and not is_fundamental_discriminant(d_value):
        raise ValueError("the twist parameter must be a fundamental discriminant")
    if (
        curve.base_ring() is not sage.QQ
        and getattr(curve.base_ring(), "_kind", None) != "QQ"
    ):
        raise TypeError("quadratic twists require a curve over QQ")
    f_value, h_value = curve.hyperelliptic_polynomials()
    new_h = d_value * h_value
    new_f = d_value * f_value + d_value * (1 - d_value) * h_value * h_value / 4
    module = __import__(
        "sagejs.hyperelliptic_curves.model", fromlist=["HyperellipticCurve"]
    )
    return module.HyperellipticCurve(new_f, new_h)


def _quadratic_character(discriminant: int, value: int) -> int:
    """Return the Kronecker character `(discriminant/value)` exactly."""
    if value == 0:
        return 1 if abs(discriminant) == 1 else 0
    sign = 1
    denominator = value
    if denominator < 0:
        denominator = -denominator
        if discriminant < 0:
            sign = -sign
    numerator = discriminant
    while denominator % 2 == 0:
        denominator //= 2
        residue = numerator % 8
        if residue in (3, 5):
            sign = -sign
        elif residue not in (1, 7):
            return 0
    numerator %= denominator
    while numerator:
        while numerator % 2 == 0:
            numerator //= 2
            if denominator % 8 in (3, 5):
                sign = -sign
        numerator, denominator = denominator, numerator
        if numerator % 4 == 3 and denominator % 4 == 3:
            sign = -sign
        numerator %= denominator
    return sign if denominator == 1 else 0


class _QuadraticTwistCoefficientPrefix:
    """Exact `a_n*chi_D(n)` view sharing one base coefficient cache."""

    def __init__(self, base: Any, discriminant: int) -> None:
        self.base = base
        self.discriminant = discriminant
        self.values = [0, 1]
        self.extensions = 0

    @property
    def backend_counts(self) -> dict[str, int]:
        return self.base.backend_counts

    def through(self, cutoff: int) -> list[int]:
        if cutoff < len(self.values):
            return self.values[: cutoff + 1]
        base_values = self.base.through(cutoff)
        self.values = [0] + [
            int(base_values[index]) * _quadratic_character(self.discriminant, index)
            for index in range(1, cutoff + 1)
        ]
        self.extensions += 1
        return self.values


class _QuadraticTwistAnalyticCurve:
    """Minimal exact global data consumed by `HyperellipticLSeries`."""

    def __init__(
        self, source: Any, discriminant: int, conductor: int, root_number: int
    ) -> None:
        self.source = source
        self.discriminant = discriminant
        self._conductor = conductor
        self._root_number = root_number

    def genus(self) -> Any:
        return self.source.genus()

    def conductor(self) -> Any:
        return sage.ZZ(self._conductor)

    def root_number(self) -> Any:
        return sage.ZZ(self._root_number)

    def __repr__(self) -> str:
        return (
            "quadratic twist by " + str(self.discriminant) + " of " + repr(self.source)
        )


class QuadraticTwistRecord:
    """One exact-global and numerical-central record in a twist scan."""

    def __init__(
        self,
        discriminant: int,
        *,
        status: str,
        conductor: Any = None,
        root_number: Any = None,
        central_derivatives: Any = (),
        reason: str | None = None,
        algorithm: str | None = None,
        rigorous: bool = False,
        arithmetic_balls_rigorous: bool = False,
        refinement_stable: bool = False,
        screening: Mapping[str, Any] | None = None,
        timings: Mapping[str, float] | None = None,
    ) -> None:
        self.discriminant = sage.ZZ(discriminant)
        self.status = str(status)
        self.conductor = None if conductor is None else sage.ZZ(conductor)
        self.root_number = None if root_number is None else sage.ZZ(root_number)
        self.central_derivatives = tuple(central_derivatives)
        self.reason = None if reason is None else str(reason)
        self.algorithm = None if algorithm is None else str(algorithm)
        self.rigorous = bool(rigorous)
        self.arithmetic_balls_rigorous = bool(arithmetic_balls_rigorous)
        self.refinement_stable = bool(refinement_stable)
        self.screening = dict({} if screening is None else screening)
        self.timings = dict({} if timings is None else timings)

    @property
    def central_value(self) -> Any:
        return self.central_derivatives[0] if self.central_derivatives else None

    @property
    def available(self) -> bool:
        return self.status == "ok"

    def __repr__(self) -> str:
        return (
            "QuadraticTwistRecord(discriminant="
            + str(self.discriminant)
            + ", status="
            + repr(self.status)
            + ", conductor="
            + str(self.conductor)
            + ", root_number="
            + str(self.root_number)
            + ")"
        )


def _complex_payload(value: Any) -> dict[str, str]:
    return {"real": str(value.real()), "imaginary": str(value.imag())}


def _record_payload(record: QuadraticTwistRecord) -> dict[str, Any]:
    return {
        "type": "record",
        "discriminant": str(record.discriminant),
        "status": record.status,
        "conductor": None if record.conductor is None else str(record.conductor),
        "root_number": (
            None if record.root_number is None else str(record.root_number)
        ),
        "central_derivatives": [
            _complex_payload(value) for value in record.central_derivatives
        ],
        "reason": record.reason,
        "algorithm": record.algorithm,
        "rigorous": record.rigorous,
        "arithmetic_balls_rigorous": record.arithmetic_balls_rigorous,
        "refinement_stable": record.refinement_stable,
        "screening": record.screening,
        "timings": record.timings,
    }


def _rational_payload(value: Any) -> dict[str, str]:
    numerator = getattr(value, "_numerator", value)
    denominator = getattr(value, "_denominator", 1)
    return {"numerator": str(numerator), "denominator": str(denominator)}


def _curve_payload(curve: Any) -> dict[str, Any]:
    f_value, h_value = curve.hyperelliptic_polynomials()
    return {
        "genus": int(curve.genus()),
        "variable": str(f_value.parent().variable_name()),
        "f_coefficients_ascending": [
            _rational_payload(value) for value in f_value.list()
        ],
        "h_coefficients_ascending": [
            _rational_payload(value) for value in h_value.list()
        ],
    }


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


class QuadraticTwistFamily:
    """A bounded, restartable stream of fundamental quadratic twists."""

    def __init__(
        self,
        curve: Any,
        start: Any,
        stop: Any,
        *,
        prec: Any = 53,
        max_order: Any = 0,
        algorithm: str = "auto",
        mode: str = "values",
        backend: str = "auto",
        candidate_threshold: Any = 1e-6,
        block_size: Any = 65536,
        progress: Callable[[str, Mapping[str, Any]], None] | None = None,
        cancel: Callable[[], bool] | None = None,
    ) -> None:
        self.curve = curve
        self.start = _exact_integer(start, "start")
        self.stop = _exact_integer(stop, "stop")
        self.precision = _exact_integer(prec, "prec")
        self.max_order = _exact_integer(max_order, "max_order")
        self.block_size = _exact_integer(block_size, "block_size")
        self.algorithm = str(algorithm)
        self.mode = str(mode)
        self.backend = str(backend)
        self.candidate_threshold = float(candidate_threshold)
        self.progress = progress
        self.cancel = cancel
        if self.start > self.stop:
            raise ValueError("the discriminant interval must be nonempty")
        if self.precision < 16 or self.precision > 512:
            raise ValueError("prec must be from 16 through 512")
        if self.max_order < 0 or self.max_order > 16:
            raise ValueError("max_order must be from 0 through 16")
        if self.algorithm not in ("auto", "native", "reference"):
            raise ValueError("algorithm must be 'auto', 'native', or 'reference'")
        if self.mode not in ("values", "candidates"):
            raise ValueError("mode must be 'values' or 'candidates'")
        if self.backend not in ("auto", "cpu", "gpu"):
            raise ValueError("backend must be 'auto', 'cpu', or 'gpu'")
        if not math.isfinite(self.candidate_threshold) or self.candidate_threshold < 0:
            raise ValueError("candidate_threshold must be a finite nonnegative number")
        if progress is not None and not callable(progress):
            raise TypeError("progress must be callable")
        if cancel is not None and not callable(cancel):
            raise TypeError("cancel must be callable")
        self._base_reduction = curve.global_reduction()
        self._lseries_module = __import__(
            "sagejs.hyperelliptic_curves.lseries",
            fromlist=["GlobalCoefficientPrefix"],
        )
        self._base_coefficient_prefix = self._lseries_module.GlobalCoefficientPrefix(
            curve
        )
        self._gpu_capability: dict[str, Any] | None = None
        if self.backend == "gpu":
            gpu_module = __import__(
                "sagejs.hyperelliptic_curves.gpu_twists",
                fromlist=["gpu_twist_capabilities"],
            )
            capability = dict(gpu_module.gpu_twist_capabilities())
            self._gpu_capability = capability
            if not capability["available"]:
                raise gpu_module.GpuTwistUnavailableError(
                    str(capability.get("reason", "no GPU is available"))
                )
            raise gpu_module.GpuTwistUnavailableError(
                "this WebGPU device has not passed the physical candidate-safety "
                "and 5x crossover acceptance gate; use backend='cpu'"
            )

    def _emit(self, event: str, payload: Mapping[str, Any]) -> None:
        if self.progress is not None:
            self.progress(event, dict(payload))

    def _record(self, discriminant: int) -> QuadraticTwistRecord:
        started = time.monotonic()
        try:
            exact_started = time.monotonic()
            base_conductor = int(self._base_reduction.conductor)
            if _integer_gcd(discriminant, base_conductor) != 1:
                raise ArithmeticError(
                    "certified twist assembly currently requires gcd(D,N)=1"
                )
            genus = int(self.curve.genus())
            conductor = base_conductor * abs(discriminant) ** (2 * genus)
            root_number = int(self._base_reduction.root_number) * _quadratic_character(
                discriminant, ((-1) ** genus) * base_conductor
            )
            if root_number not in (-1, 1):
                raise ArithmeticError("the coprime twist sign was not determined")
            exact_elapsed = time.monotonic() - exact_started
            analytic_started = time.monotonic()
            analytic_curve = _QuadraticTwistAnalyticCurve(
                self.curve, discriminant, conductor, root_number
            )
            if root_number == -1 and self.max_order == 0:
                zero = self._lseries_module.HyperellipticLSeries._coerce(
                    ("0", "0"), self.precision
                )
                return QuadraticTwistRecord(
                    discriminant,
                    status="ok",
                    conductor=conductor,
                    root_number=root_number,
                    central_derivatives=(zero,),
                    algorithm="functional-equation-parity",
                    rigorous=True,
                    arithmetic_balls_rigorous=True,
                    refinement_stable=True,
                    screening={
                        "mode": self.mode,
                        "backend": "cpu",
                        "candidate": self.mode == "candidates",
                        "threshold": self.candidate_threshold,
                        "reason": "exact functional-equation parity zero",
                    },
                    timings={
                        "exact_global": exact_elapsed,
                        "analytic": time.monotonic() - analytic_started,
                        "total": time.monotonic() - started,
                    },
                )
            prefix = _QuadraticTwistCoefficientPrefix(
                self._base_coefficient_prefix, discriminant
            )
            lseries = self._lseries_module.HyperellipticLSeries(analytic_curve, prefix)
            derivatives = lseries.central_jet(
                self.max_order,
                prec=self.precision,
                algorithm=self.algorithm,
            )
            analytic_elapsed = time.monotonic() - analytic_started
            diagnostics = lseries.last_diagnostics()
            candidate = False
            if self.mode == "candidates":
                permitted = 0 if root_number == 1 else 1
                candidate = any(
                    abs(derivatives[order]) <= self.candidate_threshold
                    for order in range(permitted, len(derivatives), 2)
                )
            return QuadraticTwistRecord(
                discriminant,
                status="ok",
                conductor=conductor,
                root_number=root_number,
                central_derivatives=derivatives,
                algorithm=diagnostics["algorithm"],
                rigorous=diagnostics["rigorous"],
                arithmetic_balls_rigorous=diagnostics.get(
                    "arithmetic_balls_rigorous", False
                ),
                refinement_stable=diagnostics["refinement_stable"],
                screening={
                    "mode": self.mode,
                    "backend": "cpu",
                    "candidate": candidate,
                    "threshold": self.candidate_threshold,
                    "gpu_auto_selected": False,
                    "gpu_auto_reason": "physical crossover gate not recorded",
                },
                timings={
                    "exact_global": exact_elapsed,
                    "analytic": analytic_elapsed,
                    "total": time.monotonic() - started,
                },
            )
        except Exception as error:
            if isinstance(
                error, self._lseries_module.HyperellipticLseriesResourceError
            ):
                status = "resource_limit"
            elif isinstance(
                error,
                self._lseries_module.HyperellipticLseriesNumericalIndeterminacyError,
            ):
                status = "numerical_indeterminacy"
            else:
                status = "unsupported"
            return QuadraticTwistRecord(
                discriminant,
                status=status,
                reason=str(error),
                timings={"total": time.monotonic() - started},
            )

    def _iter_from(self, start: int) -> Iterator[QuadraticTwistRecord]:
        for discriminant in fundamental_discriminants(
            max(self.start, start), self.stop, block_size=self.block_size
        ):
            if self.cancel is not None and bool(self.cancel()):
                raise QuadraticTwistFamilyCancelled(discriminant)
            self._emit("twist_start", {"discriminant": discriminant})
            record = self._record(discriminant)
            self._emit(
                "twist_end",
                {"discriminant": discriminant, "status": record.status},
            )
            yield record

    def __iter__(self) -> Iterator[QuadraticTwistRecord]:
        return self._iter_from(self.start)

    def provenance(self) -> dict[str, Any]:
        return {
            "type": "header",
            "schema": TWIST_FAMILY_SCHEMA,
            "curve": _curve_payload(self.curve),
            "request": {
                "start": str(self.start),
                "stop": str(self.stop),
                "precision_bits": self.precision,
                "max_order": self.max_order,
                "algorithm": self.algorithm,
                "mode": self.mode,
                "backend": self.backend,
                "candidate_threshold": self.candidate_threshold,
                "fundamental_discriminants_only": True,
            },
            "twist_assembly": {
                "scope": "gcd(D,N)=1",
                "conductor": "N*abs(D)^(2*g)",
                "root_number": "w*chi_D((-1)^g*N)",
                "dirichlet_coefficients": "a_n*chi_D(n)",
            },
        }

    def export_jsonl(
        self, path: Any, *, resume: bool = False, flush: bool = True
    ) -> dict[str, Any]:
        """Write a deterministic checkpoint and resume at a verified row."""
        if not isinstance(resume, bool) or not isinstance(flush, bool):
            raise TypeError("resume and flush must be boolean")
        header = self.provenance()
        count = 0
        last: int | None = None
        if resume:
            count, last = _verify_checkpoint(path, header)
        else:
            with open(path, "w", encoding="utf-8", newline="\n") as output:
                output.write(_canonical_json(header) + "\n")
                if flush:
                    output.flush()
        if resume and count == 0 and last is None:
            try:
                with open(path, "r", encoding="utf-8") as source:
                    empty = source.read(1) == ""
            except FileNotFoundError:
                empty = True
            if empty:
                with open(path, "w", encoding="utf-8", newline="\n") as output:
                    output.write(_canonical_json(header) + "\n")
                    if flush:
                        output.flush()
        written = 0
        status = "complete"
        with open(path, "a", encoding="utf-8", newline="\n") as output:
            try:
                for record in self._iter_from(self.start if last is None else last + 1):
                    output.write(_canonical_json(_record_payload(record)) + "\n")
                    written += 1
                    last = int(record.discriminant)
                    if flush:
                        output.flush()
            except QuadraticTwistFamilyCancelled:
                status = "cancelled"
        next_start = self.start if last is None else last + 1
        next_value = (
            None
            if next_start > self.stop
            else next(
                fundamental_discriminants(
                    next_start,
                    self.stop,
                    block_size=self.block_size,
                ),
                None,
            )
        )
        return {
            "status": status,
            "path": str(path),
            "records_written": written,
            "records_total": count + written,
            "last_discriminant": last,
            "next_discriminant": next_value,
            "schema": TWIST_FAMILY_SCHEMA,
        }


def _verify_checkpoint(
    path: Any, expected_header: Mapping[str, Any]
) -> tuple[int, int | None]:
    try:
        source = open(path, "r+", encoding="utf-8", newline="")
    except FileNotFoundError:
        return 0, None
    with source:
        header_line = source.readline()
        if not header_line:
            return 0, None
        if not header_line.endswith("\n"):
            source.seek(0)
            source.truncate()
            return 0, None
        if json.loads(header_line) != expected_header:
            raise ValueError("the twist checkpoint belongs to a different request")
        expected = iter(
            fundamental_discriminants(
                int(expected_header["request"]["start"]),
                int(expected_header["request"]["stop"]),
            )
        )
        count = 0
        last: int | None = None
        offset = source.tell()
        while True:
            line = source.readline()
            if line == "":
                break
            next_offset = source.tell()
            if not line.endswith("\n"):
                source.seek(offset)
                source.truncate()
                break
            payload = json.loads(line)
            try:
                expected_discriminant = next(expected)
            except StopIteration as error:
                raise ValueError("the twist checkpoint has excess rows") from error
            if (
                payload.get("type") != "record"
                or int(payload["discriminant"]) != expected_discriminant
            ):
                raise ValueError("the twist checkpoint has a missing discriminant row")
            last = expected_discriminant
            count += 1
            offset = next_offset
        return count, last


__all__ = [
    "QuadraticTwistFamily",
    "QuadraticTwistFamilyCancelled",
    "QuadraticTwistRecord",
    "TWIST_FAMILY_SCHEMA",
    "fundamental_discriminants",
    "is_fundamental_discriminant",
    "quadratic_twist",
]
