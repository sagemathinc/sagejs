"""Research-grade streams of exact hyperelliptic local data over `QQ`.

The stream keeps the local polynomial as the mathematical source of truth.
Jacobian orders, twist orders, extension point counts, p-ranks, and normalized
coefficients are derived from that exact polynomial.  Native backends are
consumed in bounded windows and every unsupported row remains explicit.

JSONL exports use decimal strings for unbounded integers.  The header records
the curve, request, normalization, and backend versions; a complete record is
the restart checkpoint.  Timing data is deliberately excluded from canonical
exports unless requested because it is not deterministic mathematical data.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable, Iterable, Iterator, Mapping

import sagejs as sage
import sagejs.runtime as runtime

LOCAL_DATA_SCHEMA = "sagejs.hyperelliptic-local-data/v1"

ProgressCallback = Callable[[str, Mapping[str, Any]], None]
CancellationCallback = Callable[[], bool]


class LocalDataCancelled(RuntimeError):
    """A local-data stream stopped at a safe prime boundary."""

    def __init__(self, next_prime: int) -> None:
        self.next_prime = next_prime
        super().__init__("local-data stream cancelled before " + str(next_prime))


def _frobenius() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["lpolynomial"],
    )


def _certified_genus3() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.certified_genus3",
        fromlist=["rforest_genus3_local_factors"],
    )


def _exact_integer(value: Any, name: str) -> int:
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
    return integer


def _nonnegative_integer(value: Any, name: str) -> int:
    integer = _exact_integer(value, name)
    if integer < 0:
        raise ValueError(name + " must be nonnegative")
    return integer


def _extension_degrees(value: Any) -> tuple[int, ...]:
    if value is None:
        return ()
    if not isinstance(value, (tuple, list, set, range)):
        try:
            count = _nonnegative_integer(value, "extension_degrees")
        except TypeError:
            pass
        else:
            return tuple(range(1, count + 1))
    try:
        source = list(value)
    except TypeError as error:
        raise TypeError(
            "extension_degrees must be a nonnegative integer or an iterable"
        ) from error
    answer: list[int] = []
    for raw_degree in source:
        degree = _exact_integer(raw_degree, "extension degree")
        if degree < 1:
            raise ValueError("extension degrees must be positive")
        if degree not in answer:
            answer.append(degree)
    answer.sort()
    return tuple(answer)


def _next_prime(start: int, stop: int) -> int | None:
    for candidate in range(max(2, start), stop + 1):
        if sage.is_prime(candidate):
            return candidate
    return None


def _factor_summary(result: Mapping[str, Any]) -> dict[str, Any]:
    status = str(result["status"])
    if status != "unique":
        diagnostics = result.get("diagnostics", {})
        return {
            "status": status,
            "reason": diagnostics.get("fallback_reason"),
        }
    certificate = result.get("certificate")
    if not isinstance(certificate, dict):
        raise ArithmeticError("a unique local factor has no certificate")
    summary: dict[str, Any] = {
        "status": "unique",
        "initial_candidate_count": int(certificate["initial_candidate_count"]),
    }
    for stage in ["jacobian", "twist"]:
        details = certificate.get(stage)
        if not isinstance(details, dict):
            continue
        certificates = details.get("certificates", ())
        summary[stage] = {
            "backend": str(details.get("backend", "unknown")),
            "certificate_count": int(details.get("certificate_count", 0)),
            "element_orders": tuple(
                int(item["element_order"]) for item in certificates
            ),
            "surviving_candidates": int(details.get("surviving_candidates", 0)),
            "scalar_multiplications": int(details.get("scalar_multiplications", 0)),
        }
    return summary


class LocalDataRecord:
    """One immutable-style snapshot from a hyperelliptic local-data stream."""

    def __init__(
        self,
        prime: Any,
        genus: Any,
        coefficients: Iterable[Any] | None,
        *,
        status: str,
        selected_algorithm: str,
        backend: str,
        reason: str | None = None,
        extension_degrees: Iterable[int] = (),
        certificate_summary: Mapping[str, Any] | None = None,
        full_certificate: Any = None,
        timings: Mapping[str, float] | None = None,
    ) -> None:
        self.prime = sage.ZZ(_exact_integer(prime, "prime"))
        self.genus = _exact_integer(genus, "genus")
        if self.genus < 1:
            raise ValueError("genus must be positive")
        if not sage.is_prime(int(self.prime)):
            raise ValueError("a local-data record requires a prime")
        self.status = str(status)
        self.selected_algorithm = str(selected_algorithm)
        self.backend = str(backend)
        self.reason = None if reason is None else str(reason)
        self.certificate_summary = dict(
            {} if certificate_summary is None else certificate_summary
        )
        self.full_certificate = full_certificate
        self.timings = dict({} if timings is None else timings)

        if coefficients is None:
            self.coefficients = None
            self.lpolynomial = None
            self.jacobian_order = None
            self.twist_order = None
            self.curve_point_counts: dict[int, Any] = {}
            self.jacobian_extension_orders: dict[int, Any] = {}
            self.p_rank = None
            self.ordinary = None
            self.normalized_frobenius_coefficients = None
            return

        values = tuple(
            sage.ZZ(_exact_integer(value, "coefficient")) for value in coefficients
        )
        if len(values) != 2 * self.genus + 1:
            raise ArithmeticError("a local polynomial has the wrong degree")
        _frobenius()._validate_lpolynomial(
            int(self.prime), self.genus, list(values), []
        )
        self.coefficients = runtime.math_tuple(list(values))
        self.lpolynomial = _frobenius().lpolynomial(list(values))
        self.jacobian_order = sage.ZZ(sum(values))
        self.twist_order = sage.ZZ(
            sum(
                value if index % 2 == 0 else -value
                for index, value in enumerate(values)
            )
        )
        self.curve_point_counts = {
            degree: sage.ZZ(
                _frobenius().cardinality_from_lpolynomial(
                    int(self.prime), list(values), degree
                )
            )
            for degree in extension_degrees
        }
        self.jacobian_extension_orders = {
            degree: self._jacobian_order_over(degree) for degree in extension_degrees
        }
        p_rank = 0
        for index in range(1, self.genus + 1):
            if values[index] % self.prime != 0:
                p_rank = index
        self.p_rank = p_rank
        self.ordinary = p_rank == self.genus
        self.normalized_frobenius_coefficients = runtime.math_tuple(
            [
                float(values[index]) / (float(self.prime) ** (index / 2))
                for index in range(1, self.genus + 1)
            ]
        )

    @property
    def available(self) -> bool:
        return self.coefficients is not None

    def curve_point_count(self, extension_degree: Any = 1) -> Any:
        """Return `#C(F_(p^n))`, derived from the exact local polynomial."""
        degree = _exact_integer(extension_degree, "extension_degree")
        if degree < 1:
            raise ValueError("extension_degree must be positive")
        if not self.available or self.coefficients is None:
            raise ArithmeticError("this local-data record has no local polynomial")
        if degree not in self.curve_point_counts:
            self.curve_point_counts[degree] = sage.ZZ(
                _frobenius().cardinality_from_lpolynomial(
                    int(self.prime), list(self.coefficients), degree
                )
            )
        return self.curve_point_counts[degree]

    def _jacobian_order_over(self, extension_degree: int) -> Any:
        if self.coefficients is None:
            raise ArithmeticError("this local-data record has no local polynomial")
        polynomial = _frobenius().frobenius_polynomial(list(self.coefficients))
        variable = polynomial.parent().gen()
        answer = polynomial.resultant(variable**extension_degree - 1)
        return sage.ZZ(-answer if answer < 0 else answer)

    def jacobian_order_over(self, extension_degree: Any = 1) -> Any:
        """Return `#J(F_(p^n))`, derived from the exact local polynomial."""
        degree = _exact_integer(extension_degree, "extension_degree")
        if degree < 1:
            raise ValueError("extension_degree must be positive")
        if not self.available:
            raise ArithmeticError("this local-data record has no local polynomial")
        if degree not in self.jacobian_extension_orders:
            self.jacobian_extension_orders[degree] = self._jacobian_order_over(degree)
        return self.jacobian_extension_orders[degree]

    def matches(
        self,
        *,
        available: bool | None = None,
        ordinary: bool | None = None,
        p_rank: int | None = None,
        status: str | None = None,
    ) -> bool:
        """Return whether this row has the requested inexpensive local behavior."""
        if available is not None and self.available != available:
            return False
        if ordinary is not None and self.ordinary != ordinary:
            return False
        if p_rank is not None and self.p_rank != p_rank:
            return False
        if status is not None and self.status != status:
            return False
        return True

    def __getitem__(self, name: str) -> Any:
        if not hasattr(self, name):
            raise KeyError(name)
        return getattr(self, name)

    def __repr__(self) -> str:
        if self.available:
            return (
                "LocalDataRecord(prime="
                + str(self.prime)
                + ", status="
                + repr(self.status)
                + ", lpolynomial="
                + repr(self.lpolynomial)
                + ")"
            )
        return (
            "LocalDataRecord(prime="
            + str(self.prime)
            + ", status="
            + repr(self.status)
            + ", reason="
            + repr(self.reason)
            + ")"
        )


class _StageTimer:
    def __init__(self, stream: LocalDataStream, start: int, stop: int) -> None:
        self.stream = stream
        self.start = start
        self.stop = stop
        self.active: dict[tuple[str, int], float] = {}
        self.durations: dict[int, dict[str, float]] = {}
        self.batch_durations: dict[str, float] = {}

    def observe(self, event: str, details: Mapping[str, Any]) -> None:
        prime = int(details.get("prime", 0))
        self.stream._check_cancel(prime if prime else self.start)
        if event.endswith("_start"):
            stage = event[: -len("_start")]
            self.active[(stage, prime)] = time.perf_counter()
            return
        if not event.endswith("_end"):
            return
        stage = event[: -len("_end")]
        started = self.active.pop((stage, prime), None)
        if started is None:
            return
        elapsed = max(0.0, time.perf_counter() - started)
        if prime:
            self.durations.setdefault(prime, {})[stage + "_seconds"] = elapsed
        else:
            self.batch_durations[stage + "_batch_seconds"] = elapsed

    def for_prime(self, prime: int) -> dict[str, float]:
        return {**self.batch_durations, **self.durations.get(prime, {})}


class LocalDataStream:
    """A reusable lazy stream of exact local records for a curve over `QQ`."""

    def __init__(
        self,
        curve: Any,
        start: Any,
        stop: Any,
        *,
        algorithm: str = "auto",
        chunk_size: Any = 100_000,
        extension_degrees: Any = 0,
        cache_size: Any = 0,
        include_certificates: bool = False,
        progress: ProgressCallback | None = None,
        cancel: CancellationCallback | None = None,
    ) -> None:
        if getattr(curve.base_ring(), "_kind", None) != "QQ":
            raise TypeError("local_data is defined for hyperelliptic curves over QQ")
        frobenius = _frobenius()
        checked_start, checked_stop, checked_chunk = frobenius._checked_interval(
            start, stop, chunk_size
        )
        if progress is not None and not callable(progress):
            raise TypeError("progress must be callable")
        if cancel is not None and not callable(cancel):
            raise TypeError("cancel must be callable")
        if not isinstance(include_certificates, bool):
            raise TypeError("include_certificates must be boolean")
        self.curve = curve
        self.start = checked_start
        self.stop = checked_stop
        self.algorithm = str(algorithm)
        self.chunk_size = checked_chunk
        self.extension_degrees = _extension_degrees(extension_degrees)
        self.cache_size = _nonnegative_integer(cache_size, "cache_size")
        self.include_certificates = include_certificates
        self.progress = progress
        self.cancel = cancel
        self._native_after_two = (
            self.algorithm == "auto"
            and self.start == 2
            and frobenius._rational_smalljac_supported(curve, 3, self.stop)
        )
        selection_start = 3 if self._native_after_two else self.start
        self.selected_algorithm = frobenius._select_rational_algorithm(
            curve, self.algorithm, selection_start, self.stop
        )
        self._added_cache_keys: list[tuple[str, int]] = []

    def _emit(self, event: str, details: Mapping[str, Any]) -> None:
        if self.progress is not None:
            self.progress(event, details)

    def _check_cancel(self, next_prime: int) -> None:
        if self.cancel is not None and bool(self.cancel()):
            raise LocalDataCancelled(next_prime)

    def _store_cache(
        self, prime: int, algorithm: str, coefficients: Iterable[Any]
    ) -> None:
        if self.cache_size == 0:
            return
        frobenius = _frobenius()
        key = (algorithm, prime)
        existing = frobenius._cached_local_coefficients(self.curve, prime, algorithm)
        values = [sage.ZZ(value) for value in coefficients]
        if existing is not None:
            if list(existing) != values:
                raise ArithmeticError("the local-data stream disagrees with its cache")
            return
        frobenius._store_local_coefficients(self.curve, prime, algorithm, values)
        self._added_cache_keys.append(key)
        while len(self._added_cache_keys) > self.cache_size:
            old_key = self._added_cache_keys.pop(0)
            self.curve._local_lpolynomial_cache.pop(old_key, None)

    def _make_record(
        self,
        prime: int,
        coefficients: Iterable[Any] | None,
        *,
        status: str,
        backend: str,
        reason: str | None = None,
        summary: Mapping[str, Any] | None = None,
        certificate: Any = None,
        timings: Mapping[str, float] | None = None,
        cache_algorithm: str | None = None,
    ) -> LocalDataRecord:
        record = LocalDataRecord(
            prime,
            self.curve.genus(),
            coefficients,
            status=status,
            selected_algorithm=self.selected_algorithm,
            backend=backend,
            reason=reason,
            extension_degrees=self.extension_degrees,
            certificate_summary=summary,
            full_certificate=certificate if self.include_certificates else None,
            timings=timings,
        )
        if record.available:
            stored_coefficients = record.coefficients
            if stored_coefficients is None:
                raise RuntimeError("an available local-data record has no coefficients")
            self._store_cache(
                prime,
                self.selected_algorithm if cache_algorithm is None else cache_algorithm,
                stored_coefficients,
            )
        self._emit(
            "record",
            {
                "prime": prime,
                "status": record.status,
                "backend": record.backend,
                "available": record.available,
            },
        )
        return record

    def _exhaustive_records(
        self, start: int, stop: int, algorithm: str
    ) -> Iterator[LocalDataRecord]:
        frobenius = _frobenius()
        for prime in range(start, stop + 1):
            if not sage.is_prime(prime):
                continue
            self._check_cancel(prime)
            started = time.perf_counter()
            try:
                reduced = frobenius._rational_reduction(self.curve, prime)
                coefficients = reduced._lpolynomial_coefficients(algorithm)
            except ArithmeticError as error:
                yield self._make_record(
                    prime,
                    None,
                    status="omitted",
                    backend=algorithm,
                    reason="reduction_unavailable: " + str(error),
                    timings={"total_seconds": time.perf_counter() - started},
                )
                continue
            yield self._make_record(
                prime,
                coefficients,
                status="exact",
                backend=algorithm,
                timings={"total_seconds": time.perf_counter() - started},
                cache_algorithm=algorithm,
            )

    def _smalljac_records(self, start: int, stop: int) -> Iterator[LocalDataRecord]:
        frobenius = _frobenius()
        if self._native_after_two and start <= 2 <= stop:
            yield from self._exhaustive_records(2, 2, "exhaustive")
            start = 3
        if start > stop:
            return
        model = frobenius.rational_smalljac_model(self.curve)
        excluded = int(model["excluded_denominator"])
        cursor = start
        while cursor <= stop:
            self._check_cancel(cursor)
            window_stop = min(stop, cursor + 2 * self.chunk_size - 2)
            self._emit("batch_start", {"start": cursor, "stop": window_stop})
            started = time.perf_counter()
            rows, truncated = frobenius._smalljac_rows(
                model["curve_text"], cursor, window_stop, 0
            )
            elapsed = time.perf_counter() - started
            if truncated:
                raise RuntimeError("a bounded smalljac window was truncated")
            for prime, coefficients in rows:
                self._check_cancel(prime)
                if excluded % prime == 0:
                    yield self._make_record(
                        prime,
                        None,
                        status="omitted",
                        backend="smalljac",
                        reason="excluded_model",
                        timings={"batch_seconds": elapsed},
                    )
                elif coefficients is None:
                    yield self._make_record(
                        prime,
                        None,
                        status="omitted",
                        backend="smalljac",
                        reason="singular_model",
                        timings={"batch_seconds": elapsed},
                    )
                else:
                    yield self._make_record(
                        prime,
                        coefficients,
                        status="exact",
                        backend="smalljac",
                        timings={"batch_seconds": elapsed},
                    )
            self._emit(
                "batch_end",
                {"start": cursor, "stop": window_stop, "rows": len(rows)},
            )
            cursor = window_stop + 1

    def _rforest_records(self, start: int, stop: int) -> Iterator[LocalDataRecord]:
        certified = _certified_genus3()
        cursor = start
        while cursor <= stop:
            self._check_cancel(cursor)
            window_stop = min(stop, cursor + 2 * self.chunk_size - 2)
            self._emit("batch_start", {"start": cursor, "stop": window_stop})
            tracker = _StageTimer(self, cursor, window_stop)
            rows = certified.rforest_genus3_local_factors(
                self.curve,
                cursor,
                window_stop,
                stage_observer=tracker.observe,
            )
            row_count = 0
            for prime, result in rows:
                row_count += 1
                self._check_cancel(prime)
                status = str(result["status"])
                diagnostics = result.get("diagnostics", {})
                reason = diagnostics.get("fallback_reason")
                coefficients = result.get("coefficients")
                backend = "rforest" if status != "fallback" else "exhaustive"
                yield self._make_record(
                    prime,
                    coefficients,
                    status=status,
                    backend=backend,
                    reason=reason,
                    summary=_factor_summary(result),
                    certificate=result.get("certificate"),
                    timings=tracker.for_prime(prime),
                )
            self._emit(
                "batch_end",
                {"start": cursor, "stop": window_stop, "rows": row_count},
            )
            cursor = window_stop + 1

    def _iter_from(self, start: int) -> Iterator[LocalDataRecord]:
        start = max(self.start, start)
        self._emit(
            "start",
            {
                "start": start,
                "stop": self.stop,
                "algorithm": self.selected_algorithm,
            },
        )
        try:
            if start <= self.stop:
                if self.selected_algorithm == "rforest":
                    yield from self._rforest_records(start, self.stop)
                elif self.selected_algorithm == "smalljac":
                    yield from self._smalljac_records(start, self.stop)
                else:
                    yield from self._exhaustive_records(
                        start, self.stop, self.selected_algorithm
                    )
        except LocalDataCancelled as error:
            self._emit("cancelled", {"next_prime": error.next_prime})
            raise
        self._emit("complete", {"start": start, "stop": self.stop})

    def __iter__(self) -> Iterator[LocalDataRecord]:
        return self._iter_from(self.start)

    def where(
        self,
        predicate: Callable[[LocalDataRecord], bool] | None = None,
        *,
        available: bool | None = None,
        ordinary: bool | None = None,
        p_rank: int | None = None,
        status: str | None = None,
    ) -> Iterator[LocalDataRecord]:
        """Yield records matching local behavior without recomputing them."""
        if predicate is not None and not callable(predicate):
            raise TypeError("predicate must be callable")
        for record in self:
            if not record.matches(
                available=available,
                ordinary=ordinary,
                p_rank=p_rank,
                status=status,
            ):
                continue
            if predicate is None or bool(predicate(record)):
                yield record

    def statistics(self, max_moment: Any = 4) -> Any:
        """Consume the stream into exact coefficient and behavior accumulators."""
        module = __import__(
            "sagejs.hyperelliptic_curves.statistics",
            fromlist=["LocalDataStatistics"],
        )
        result = module.LocalDataStatistics(max_moment=max_moment)
        for record in self:
            result.add(record)
        return result

    def provenance(self) -> dict[str, Any]:
        """Return deterministic curve, request, and backend metadata."""
        return _stream_header(self)

    def export_jsonl(
        self,
        path: Any,
        *,
        resume: bool = False,
        include_timings: bool = False,
        include_certificates: bool | None = None,
        flush: bool = True,
    ) -> dict[str, Any]:
        """Export canonical JSONL and optionally resume its verified prefix."""
        if not isinstance(resume, bool) or not isinstance(include_timings, bool):
            raise TypeError("resume and include_timings must be boolean")
        if include_certificates is None:
            include_certificates = self.include_certificates
        if not isinstance(include_certificates, bool) or not isinstance(flush, bool):
            raise TypeError("include_certificates and flush must be boolean")
        if include_certificates and not self.include_certificates:
            raise ValueError(
                "the stream must retain certificates before they can be exported"
            )
        header = _stream_header(
            self,
            include_timings=include_timings,
            include_certificates=include_certificates,
        )
        existing_count = 0
        last_prime: int | None = None
        if resume:
            existing_count, last_prime = _verify_resume_file(path, header)
        else:
            with open(path, "w", encoding="utf-8", newline="\n") as output:
                output.write(_canonical_json(header) + "\n")
                if flush:
                    output.flush()
        if resume and existing_count == 0 and last_prime is None:
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
        next_start = self.start if last_prime is None else last_prime + 1
        written = 0
        status = "complete"
        with open(path, "a", encoding="utf-8", newline="\n") as output:
            try:
                for record in self._iter_from(next_start):
                    output.write(
                        _canonical_json(
                            _record_payload(
                                record,
                                include_timings=include_timings,
                                include_certificates=include_certificates,
                            )
                        )
                        + "\n"
                    )
                    written += 1
                    last_prime = int(record.prime)
                    if flush:
                        output.flush()
            except LocalDataCancelled:
                status = "cancelled"
        return {
            "status": status,
            "path": str(path),
            "records_written": written,
            "records_total": existing_count + written,
            "last_prime": last_prime,
            "next_prime": (
                None
                if last_prime is not None
                and _next_prime(last_prime + 1, self.stop) is None
                else _next_prime(
                    self.start if last_prime is None else last_prime + 1, self.stop
                )
            ),
            "schema": LOCAL_DATA_SCHEMA,
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


def _backend_versions(stream: LocalDataStream) -> dict[str, Any]:
    result: dict[str, Any] = {"reference": "sagejs-exhaustive-v1"}
    frobenius = _frobenius()
    if stream.selected_algorithm == "smalljac":
        capability = frobenius._smalljac_capabilities()
        if capability is not None:
            result["smalljac"] = str(runtime.reflect.get(capability, "backendVersion"))
    if stream.selected_algorithm == "rforest":
        rforest = __import__(
            "sagejs.hyperelliptic_curves.rforest",
            fromlist=["rforest_capabilities"],
        )
        capability = rforest.rforest_capabilities()
        if capability is not None:
            result["rforest"] = str(runtime.reflect.get(capability, "backendVersion"))
        backend = runtime.flint_backend()
        function = runtime.reflect.get(backend, "genus3JacobianCapabilities")
        if function is not runtime.undefined:
            native = runtime.reflect.apply(function, backend, [])
            result["genus3_jacobian"] = {
                "model": str(runtime.reflect.get(native, "model")),
                "integer_bytes": int(runtime.reflect.get(native, "integerBytes")),
                "prime_upper_bound": str(
                    runtime.integer_bigint(
                        runtime.reflect.get(native, "primeUpperBound")
                    )
                ),
            }
    return result


def _stream_header(
    stream: LocalDataStream,
    *,
    include_timings: bool = False,
    include_certificates: bool | None = None,
) -> dict[str, Any]:
    if include_certificates is None:
        include_certificates = stream.include_certificates
    return {
        "schema": LOCAL_DATA_SCHEMA,
        "type": "header",
        "normalization": "det(1-T*Frob)",
        "curve": _curve_payload(stream.curve),
        "request": {
            "start": str(stream.start),
            "stop": str(stream.stop),
            "algorithm": stream.algorithm,
            "selected_algorithm": stream.selected_algorithm,
            "chunk_size": stream.chunk_size,
            "extension_degrees": list(stream.extension_degrees),
            "include_certificates": stream.include_certificates,
        },
        "export": {
            "include_timings": include_timings,
            "include_certificates": include_certificates,
            "integer_encoding": "decimal-string",
        },
        "backends": _backend_versions(stream),
    }


def _lift_coefficient(value: Any) -> int:
    lift = getattr(value, "lift", None)
    if callable(lift):
        value = lift()
    return _exact_integer(value, "serialized coefficient")


def _wire_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return {"$integer": str(value)}
    if isinstance(value, float):
        return {"$float": repr(value)}
    if isinstance(value, dict):
        return {str(key): _wire_value(value[key]) for key in sorted(value)}
    if isinstance(value, (tuple, list)):
        return [_wire_value(item) for item in value]
    uv = getattr(value, "uv", None)
    if callable(uv):
        pair: Any = uv()
        u_value = pair[0]
        v_value = pair[1]
        return {
            "$mumford": {
                "u_coefficients_ascending": [
                    {"$integer": str(_lift_coefficient(item))}
                    for item in u_value.list()
                ],
                "v_coefficients_ascending": [
                    {"$integer": str(_lift_coefficient(item))}
                    for item in v_value.list()
                ],
            }
        }
    raise TypeError(
        "local-data certificate contains an unsupported value of type "
        + type(value).__name__
    )


def _unwire_value(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(_unwire_value(item) for item in value)
    if not isinstance(value, dict):
        return value
    if list(value) == ["$integer"]:
        return int(value["$integer"])
    if list(value) == ["$float"]:
        return float(value["$float"])
    if list(value) == ["$mumford"]:
        data = value["$mumford"]
        return {
            "type": "mumford_divisor",
            "u_coefficients_ascending": tuple(
                _unwire_value(item) for item in data["u_coefficients_ascending"]
            ),
            "v_coefficients_ascending": tuple(
                _unwire_value(item) for item in data["v_coefficients_ascending"]
            ),
        }
    return {str(key): _unwire_value(value[key]) for key in value}


def _record_payload(
    record: LocalDataRecord,
    *,
    include_timings: bool,
    include_certificates: bool,
) -> dict[str, Any]:
    coefficients = (
        None
        if record.coefficients is None
        else [str(value) for value in record.coefficients]
    )
    payload: dict[str, Any] = {
        "schema": LOCAL_DATA_SCHEMA,
        "type": "record",
        "prime": str(record.prime),
        "genus": record.genus,
        "status": record.status,
        "selected_algorithm": record.selected_algorithm,
        "backend": record.backend,
        "reason": record.reason,
        "coefficients_ascending": coefficients,
        "jacobian_order": (
            None if record.jacobian_order is None else str(record.jacobian_order)
        ),
        "twist_order": None if record.twist_order is None else str(record.twist_order),
        "curve_point_counts": {
            str(degree): str(value)
            for degree, value in sorted(record.curve_point_counts.items())
        },
        "p_rank": record.p_rank,
        "ordinary": record.ordinary,
        "normalized_frobenius": (
            None
            if record.coefficients is None
            else [
                {
                    "numerator": str(record.coefficients[index]),
                    "denominator": "p^(" + str(index) + "/2)",
                }
                for index in range(1, record.genus + 1)
            ]
        ),
        "certificate_summary": _wire_value(record.certificate_summary),
    }
    if include_timings:
        payload["timings"] = _wire_value(record.timings)
    if include_certificates:
        payload["certificate"] = _wire_value(record.full_certificate)
    return payload


def _record_from_payload(payload: Mapping[str, Any]) -> LocalDataRecord:
    if payload.get("schema") != LOCAL_DATA_SCHEMA or payload.get("type") != "record":
        raise ValueError("invalid hyperelliptic local-data record")
    coefficients = payload.get("coefficients_ascending")
    values = (
        None if coefficients is None else tuple(int(value) for value in coefficients)
    )
    point_counts = payload.get("curve_point_counts", {})
    degrees = tuple(sorted(int(degree) for degree in point_counts))
    record = LocalDataRecord(
        int(payload["prime"]),
        int(payload["genus"]),
        values,
        status=str(payload["status"]),
        selected_algorithm=str(payload["selected_algorithm"]),
        backend=str(payload["backend"]),
        reason=payload.get("reason"),
        extension_degrees=degrees,
        certificate_summary=_unwire_value(payload.get("certificate_summary", {})),
        full_certificate=_unwire_value(payload.get("certificate")),
        timings=_unwire_value(payload.get("timings", {})),
    )
    if record.jacobian_order is None:
        expected_order = None
        expected_twist = None
    else:
        expected_order = str(record.jacobian_order)
        expected_twist = str(record.twist_order)
    if (
        payload.get("jacobian_order") != expected_order
        or payload.get("twist_order") != expected_twist
        or payload.get("p_rank") != record.p_rank
        or payload.get("ordinary") != record.ordinary
        or {
            str(degree): str(value)
            for degree, value in sorted(record.curve_point_counts.items())
        }
        != point_counts
    ):
        raise ArithmeticError("local-data derived invariants do not verify")
    return record


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def local_data_jsonl_header(path: Any) -> dict[str, Any]:
    """Read and validate the versioned header from a local-data JSONL file."""
    with open(path, "r", encoding="utf-8") as source:
        line = source.readline()
    if not line:
        raise ValueError("a local-data JSONL file is empty")
    header = json.loads(line)
    if (
        not isinstance(header, dict)
        or header.get("schema") != LOCAL_DATA_SCHEMA
        or header.get("type") != "header"
    ):
        raise ValueError("invalid hyperelliptic local-data JSONL header")
    return header


def iter_local_data_jsonl(path: Any) -> Iterator[LocalDataRecord]:
    """Lazily load and verify all complete records from a JSONL export."""
    with open(path, "r", encoding="utf-8") as source:
        header_line = source.readline()
        if not header_line:
            raise ValueError("a local-data JSONL file is empty")
        header = json.loads(header_line)
        if (
            not isinstance(header, dict)
            or header.get("schema") != LOCAL_DATA_SCHEMA
            or header.get("type") != "header"
        ):
            raise ValueError("invalid hyperelliptic local-data JSONL header")
        request = header.get("request", {})
        expected_cursor = int(request["start"])
        stop = int(request["stop"])
        for line in source:
            if not line.endswith("\n"):
                raise ValueError("the local-data JSONL file has a partial final record")
            payload = json.loads(line)
            record = _record_from_payload(payload)
            expected_prime = _next_prime(expected_cursor, stop)
            if expected_prime is None or int(record.prime) != expected_prime:
                raise ValueError("the local-data JSONL file has a missing prime row")
            if record.selected_algorithm != request["selected_algorithm"]:
                raise ValueError("the local-data JSONL file changed algorithms")
            expected_cursor = int(record.prime) + 1
            yield record


def _verify_resume_file(
    path: Any, expected_header: Mapping[str, Any]
) -> tuple[int, int | None]:
    try:
        source = open(path, "r+", encoding="utf-8", newline="")
    except FileNotFoundError:
        return 0, None
    with source:
        offset = source.tell()
        header_line = source.readline()
        if not header_line:
            return 0, None
        if not header_line.endswith("\n"):
            source.seek(0)
            source.truncate()
            return 0, None
        header = json.loads(header_line)
        if header != expected_header:
            raise ValueError("the local-data checkpoint belongs to a different request")
        request = expected_header["request"]
        expected_cursor = int(request["start"])
        stop = int(request["stop"])
        count = 0
        last_prime: int | None = None
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
            record = _record_from_payload(payload)
            expected_prime = _next_prime(expected_cursor, stop)
            if expected_prime is None or int(record.prime) != expected_prime:
                raise ValueError("the local-data checkpoint has a missing prime row")
            if record.selected_algorithm != request["selected_algorithm"]:
                raise ValueError("the local-data checkpoint changed algorithms")
            last_prime = int(record.prime)
            expected_cursor = last_prime + 1
            count += 1
            offset = next_offset
        return count, last_prime


__all__ = [
    "LOCAL_DATA_SCHEMA",
    "LocalDataCancelled",
    "LocalDataRecord",
    "LocalDataStream",
    "iter_local_data_jsonl",
    "local_data_jsonl_header",
]
