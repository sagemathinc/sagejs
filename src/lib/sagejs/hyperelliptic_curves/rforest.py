"""Checked private boundary to batched rforest Hasse--Witt residues.

rforest computes `det(I-T*W_p) mod p`; it does not by itself compute a full
integer local polynomial.  This module therefore exposes modular rows and an
explicit exact-completion diagnostic, never a public local-factor backend.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
)

_capability_cache: Any = runtime.undefined
_SIGNED64_MIN = -(2**63)
_SIGNED64_MAX = 2**63 - 1


class _RforestPackedBatch:
    """Validated compact rforest rows retained in their native buffers."""

    __slots__ = (
        "normalization",
        "backend_version",
        "genus",
        "excluded_denominator",
        "truncated",
        "required_rows",
        "row_count",
        "start",
        "stop",
        "primes",
        "good",
        "coefficient_counts",
        "coefficients",
        "row_status",
        "forest_status",
        "direct_status",
        "singular_status",
        "unsupported_characteristic_status",
        "resource_limit_status",
    )

    def __init__(
        self,
        *,
        normalization: str,
        backend_version: str,
        genus: int,
        excluded_denominator: int,
        truncated: bool,
        required_rows: int,
        row_count: int,
        start: int,
        stop: int,
        primes: Any,
        good: Any,
        coefficient_counts: Any,
        coefficients: Any,
        row_status: Any,
        forest_status: int,
        direct_status: int,
        singular_status: int,
        unsupported_characteristic_status: int,
        resource_limit_status: int,
    ) -> None:
        self.normalization = normalization
        self.backend_version = backend_version
        self.genus = genus
        self.excluded_denominator = excluded_denominator
        self.truncated = truncated
        self.required_rows = required_rows
        self.row_count = row_count
        self.start = start
        self.stop = stop
        self.primes = primes
        self.good = good
        self.coefficient_counts = coefficient_counts
        self.coefficients = coefficients
        self.row_status = row_status
        self.forest_status = forest_status
        self.direct_status = direct_status
        self.singular_status = singular_status
        self.unsupported_characteristic_status = unsupported_characteristic_status
        self.resource_limit_status = resource_limit_status
        runtime.object.freeze(self)


def _property(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def _checked_nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        integer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        exact = value == integer
    except Exception:
        exact = False
    if exact is not True:
        raise ValueError(name + " must be an exact integer")
    if integer < 0:
        raise ValueError(name + " must be nonnegative")
    return integer


def rforest_capabilities() -> Any:
    """Return the validated private rforest capability object, or `None`."""
    global _capability_cache
    if _capability_cache is not runtime.undefined:
        return _capability_cache
    try:
        backend = runtime.flint_backend()
        function = _property(backend, "rforestCapabilities")
        if function is runtime.undefined:
            _capability_cache = None
            return None
        capability = runtime.reflect.apply(function, backend, [])
        if (
            not bool(_property(capability, "available"))
            or _property(capability, "normalization") != "det(I-T*W) mod p"
        ):
            _capability_cache = None
            return None
        genera = _property(capability, "genera")
        supported = {int(genera[index]) for index in range(len(genera))}
        if supported != {2, 3}:
            _capability_cache = None
            return None
        if runtime.integer_bigint(_property(capability, "primeUpperBound")) < 3:
            _capability_cache = None
            return None
        _capability_cache = capability
        return capability
    except Exception:
        _capability_cache = None
        return None


def _status(name: str) -> int:
    capability = rforest_capabilities()
    if capability is None:
        raise NotImplementedError("the native rforest backend is unavailable")
    value = _property(_property(capability, "statuses"), name)
    if value is runtime.undefined:
        raise RuntimeError("the rforest status contract is incomplete")
    return int(value)


def _completed_square_model(curve: Any) -> tuple[Any, int]:
    """Pack `h^2+4f` and return the denominator excluded by its transform."""
    if (
        curve.base_ring() is not sage.QQ
        and getattr(curve.base_ring(), "_kind", None) != "QQ"
    ):
        raise TypeError("rforest batches require a curve over QQ")
    genus = int(curve.genus())
    if genus not in [2, 3]:
        raise NotImplementedError("rforest batches support genus 2 or 3")
    data = curve._smalljac_integral_model_data()
    f_values = [int(value) for value in data["f_coefficients"]]
    h_values = [int(value) for value in data["h_coefficients"]]
    length = max(len(f_values), 2 * len(h_values) - 1)
    values = [0 for _index in range(length)]
    for index in range(len(f_values)):
        values[index] += 4 * f_values[index]
    for left in range(len(h_values)):
        for right in range(len(h_values)):
            values[left + right] += h_values[left] * h_values[right]
    while len(values) > 1 and values[-1] == 0:
        values.pop()
    if len(values) - 1 not in [2 * genus + 1, 2 * genus + 2]:
        raise NotImplementedError(
            "rforest requires an integral completed-square model of degree 2g+1 or 2g+2"
        )
    if any(value < _SIGNED64_MIN or value > _SIGNED64_MAX for value in values):
        raise OverflowError(
            "the integral rforest model has a coefficient outside int64"
        )
    coefficients = runtime.uint64_buffer([runtime.bigint(value) for value in values])
    return coefficients, int(data["excluded_denominator"])


def _raise_batch_error(status: int, status_name: str) -> None:
    message = "rforest batch failed with status " + repr(status_name)
    if status == _status("UNAVAILABLE"):
        raise NotImplementedError("the native rforest backend is unavailable")
    if status == _status("UNSUPPORTED_MODEL"):
        raise NotImplementedError("rforest does not support this integral model")
    if status in [_status("INVALID_ARGUMENT"), _status("INVALID_INTERVAL")]:
        raise ValueError(message)
    if status == _status("ALLOCATION_FAILED"):
        raise MemoryError(message)
    raise RuntimeError(message)


def _rforest_hasse_witt_packed(
    curve: Any,
    start: Any,
    stop: Any,
    *,
    max_rows: int = 0,
) -> _RforestPackedBatch:
    """Return a checked compact view of one native rforest traversal.

    A row is `available` only when residues were computed for the original
    rational model. Other statuses distinguish a singular supplied model, an
    unsupported characteristic, a resource limit, and primes excluded by
    denominator clearing; none of the unavailable statuses alone proves bad
    reduction of the rational curve.

    The retained typed buffers are private implementation data. This internal
    view avoids eagerly publishing thousands of Python dictionaries when a
    streaming consumer needs only a bounded current window.
    """
    capability = rforest_capabilities()
    if capability is None:
        raise NotImplementedError("the native rforest backend is unavailable")
    start_exact = runtime.integer_bigint(start)
    stop_exact = runtime.integer_bigint(stop)
    upper_bound = runtime.integer_bigint(_property(capability, "primeUpperBound"))
    if start_exact < 2 or stop_exact < start_exact:
        raise ValueError("rforest needs a nonempty closed interval starting at 2")
    if stop_exact > upper_bound:
        raise OverflowError("the prime interval exceeds the rforest range")
    max_rows = _checked_nonnegative_integer(max_rows, "max_rows")
    genus = int(curve.genus())
    backend = runtime.flint_backend()
    function = _property(backend, "rforestHasseWittBatch")
    if function is runtime.undefined:
        raise NotImplementedError("the native rforest backend is unavailable")
    coefficients, excluded_denominator = _completed_square_model(curve)
    arguments: list[Any] = [
        coefficients,
        genus,
        start_exact,
        stop_exact,
    ]
    if max_rows:
        options = runtime.object.create(None)
        runtime.reflect.set(options, "maxRows", max_rows)
        arguments.append(options)
    batch = runtime.reflect.apply(function, backend, arguments)
    status = int(_property(batch, "status"))
    status_name = str(_property(batch, "statusName"))
    allowed = [_status("OK"), _status("TRUNCATED")]
    if status not in allowed:
        _raise_batch_error(status, status_name)
    truncated = bool(_property(batch, "truncated"))
    if (
        status_name != ("truncated" if truncated else "ok")
        or (status == _status("TRUNCATED")) != truncated
    ):
        raise RuntimeError("rforest returned inconsistent truncation metadata")
    row_count = int(_property(batch, "rowCount"))
    required_rows = int(_property(batch, "requiredRows"))
    if (
        int(_property(batch, "genus")) != genus
        or _property(batch, "normalization") != "det(I-T*W) mod p"
        or _property(batch, "backendVersion") != _property(capability, "backendVersion")
        or row_count < 0
        or required_rows < row_count
        or (truncated and required_rows <= row_count)
        or (not truncated and required_rows != row_count)
        or (truncated and (max_rows == 0 or row_count != max_rows))
    ):
        raise RuntimeError("rforest returned inconsistent batch metadata")

    primes = _property(batch, "primes")
    good = _property(batch, "good")
    counts = _property(batch, "coefficientCounts")
    coefficients = _property(batch, "coefficients")
    row_status = _property(batch, "rowStatus")
    if [len(primes), len(good), len(counts), len(coefficients), len(row_status)] != [
        row_count,
        row_count,
        row_count,
        3 * row_count,
        row_count,
    ]:
        raise RuntimeError("rforest returned malformed packed arrays")

    forest_status = _status("ROW_FOREST")
    direct_status = _status("ROW_DIRECT")
    singular_status = _status("ROW_SINGULAR_MODEL")
    unsupported_characteristic_status = _status("ROW_UNSUPPORTED_CHARACTERISTIC")
    resource_limit_status = _status("ROW_RESOURCE_LIMIT")
    allowed_row_statuses = [
        forest_status,
        direct_status,
        singular_status,
        unsupported_characteristic_status,
        resource_limit_status,
    ]
    previous = 0
    for index in range(row_count):
        prime = int(runtime.integer_bigint(primes[index]))
        row_code = int(row_status[index])
        is_good = int(good[index])
        count = int(counts[index])
        if (
            prime < int(start_exact)
            or prime > int(stop_exact)
            or prime <= previous
            or not sage.is_prime(prime)
            or row_code not in allowed_row_statuses
            or is_good not in [0, 1]
        ):
            raise RuntimeError("rforest returned an invalid prime row")
        previous = prime
        residue_values = tuple(
            int(runtime.integer_bigint(coefficients[3 * index + offset]))
            for offset in range(3)
        )
        if is_good:
            if row_code not in [forest_status, direct_status]:
                raise RuntimeError("rforest marked a failed row as good")
            if count != genus or any(
                value < 0 or value >= prime for value in residue_values[:genus]
            ):
                raise RuntimeError("rforest returned noncanonical residues")
            if any(value != 0 for value in residue_values[genus:]):
                raise RuntimeError("rforest returned nonzero unused coefficients")
        else:
            if count != 0 or any(value != 0 for value in residue_values):
                raise RuntimeError("rforest returned inconsistent failed-row data")
    return _RforestPackedBatch(
        normalization="det(I-T*W) mod p",
        backend_version=str(_property(batch, "backendVersion")),
        genus=genus,
        excluded_denominator=excluded_denominator,
        truncated=truncated,
        required_rows=required_rows,
        row_count=row_count,
        start=int(start_exact),
        stop=int(stop_exact),
        primes=primes,
        good=good,
        coefficient_counts=counts,
        coefficients=coefficients,
        row_status=row_status,
        forest_status=forest_status,
        direct_status=direct_status,
        singular_status=singular_status,
        unsupported_characteristic_status=unsupported_characteristic_status,
        resource_limit_status=resource_limit_status,
    )


def _rforest_packed_status_name(batch: _RforestPackedBatch, row_code: int) -> str:
    if row_code == batch.forest_status:
        return "forest"
    if row_code == batch.direct_status:
        return "direct"
    if row_code == batch.singular_status:
        return "singular_model"
    if row_code == batch.unsupported_characteristic_status:
        return "unsupported_characteristic"
    if row_code == batch.resource_limit_status:
        return "resource_limit"
    raise RuntimeError("rforest retained an invalid row status")


def _rforest_packed_row(batch: _RforestPackedBatch, index: int) -> dict[str, Any]:
    """Materialize one already-validated public row from a compact batch."""
    if index < 0 or index >= batch.row_count:
        raise IndexError("rforest packed row index is out of range")
    prime = int(runtime.integer_bigint(batch.primes[index]))
    is_good = int(batch.good[index])
    row_code = int(batch.row_status[index])
    if is_good:
        residues: tuple[int, ...] | None = tuple(
            int(runtime.integer_bigint(batch.coefficients[3 * index + offset]))
            for offset in range(batch.genus)
        )
    else:
        residues = None
    if batch.excluded_denominator % prime == 0:
        available = False
        residues = None
        public_status = "excluded_model"
    else:
        available = bool(is_good)
        public_status = _rforest_packed_status_name(batch, row_code)
    return {
        "prime": prime,
        "available": available,
        "residues": residues,
        "status": public_status,
    }


def rforest_hasse_witt_rows(
    curve: Any,
    start: Any,
    stop: Any,
    *,
    max_rows: int = 0,
) -> dict[str, Any]:
    """Return checked modular Hasse--Witt rows in a closed prime interval.

    This public function preserves the eager row-dictionary contract. Internal
    streaming consumers use the same checked packed boundary and materialize
    only a bounded current window.
    """
    packed = _rforest_hasse_witt_packed(curve, start, stop, max_rows=max_rows)
    rows = [_rforest_packed_row(packed, index) for index in range(packed.row_count)]
    return {
        "normalization": packed.normalization,
        "backend_version": packed.backend_version,
        "genus": packed.genus,
        "excluded_denominator": packed.excluded_denominator,
        "truncated": packed.truncated,
        "required_rows": packed.required_rows,
        "rows": rows,
    }


def complete_rforest_genus3_rows(
    curve: Any,
    start: Any,
    stop: Any,
    *,
    jacobian_orders: Mapping[int, int] | None = None,
    twist_orders: Mapping[int, int] | None = None,
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
) -> list[dict[str, Any]]:
    """Run exact completion diagnostics for each available genus-3 modular row.

    Exact order mappings are optional development-oracle evidence. Without
    sufficient evidence, a row remains explicitly `indeterminate` and is not
    converted into a local polynomial.
    """
    if int(curve.genus()) != 3:
        raise ValueError("genus-3 completion requires a genus-3 curve")
    orders = {} if jacobian_orders is None else jacobian_orders
    twists = {} if twist_orders is None else twist_orders
    batch = rforest_hasse_witt_rows(curve, start, stop)
    answer = []
    for row in batch["rows"]:
        if not row["available"]:
            answer.append(dict(row))
            continue
        prime = row["prime"]
        completion = complete_genus3_lpolynomial(
            prime,
            row["residues"],
            jacobian_order=orders.get(prime),
            twist_order=twists.get(prime),
            max_candidates=max_candidates,
            max_combinations=max_combinations,
        )
        answer.append({**row, "completion": completion})
    return answer


__all__ = [
    "complete_rforest_genus3_rows",
    "rforest_capabilities",
    "rforest_hasse_witt_rows",
]
