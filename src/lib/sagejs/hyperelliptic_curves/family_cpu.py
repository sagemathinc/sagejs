"""Persistent exact prefixes and isolated CPU workers for twist families.

The public family iterator owns ordering, cancellation, and checkpointing.
This module owns only two bounded implementation details: immutable,
content-addressed coefficient-prefix files and pointer-free worker jobs.  A
worker result is untrusted transport data; the parent reconstructs the public
record and checks its exact discriminant binding before yielding it.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from typing import Any, Mapping

import sagejs.runtime as runtime

COEFFICIENT_CACHE_SCHEMA = "sagejs.hyperelliptic-coefficient-prefix/v1"
CPU_FAMILY_ENGINE_SCHEMA = "sagejs.hyperelliptic-cpu-family-engine/v1"
_CACHE_ALGORITHM = "global-euler-coefficients-v1"


class FamilyCoefficientCacheError(RuntimeError):
    """A persistent coefficient entry is malformed or fails authentication."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def default_family_cache_directory() -> str:
    """Return the platform-neutral default cache directory."""
    root = os.environ.get("XDG_CACHE_HOME")
    if not root:
        root = os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(root, "sagejs", "hyperelliptic-families")


def coefficient_cache_identity(
    curve_payload: Mapping[str, Any], reduction_payload: Mapping[str, Any]
) -> dict[str, Any]:
    """Return the exact mathematical identity of one coefficient stream."""
    return {
        "schema": COEFFICIENT_CACHE_SCHEMA,
        "algorithm": _CACHE_ALGORITHM,
        "curve": dict(curve_payload),
        "global_reduction": dict(reduction_payload),
    }


def central_coefficient_cutoff(
    conductor: int, genus: int, precision: int, maximum_order: int
) -> int:
    """Return the native central plan cutoff, with a conservative fallback."""
    if conductor < 1 or genus not in (2, 3):
        raise ValueError("invalid hyperelliptic L-function normalization")
    try:
        backend = runtime.flint_backend()
        function = runtime.reflect.get(backend, "hyperellipticCentralWeights")
        if runtime.jstype(function) != "undefined":
            planned = runtime.reflect.apply(
                function,
                backend,
                [
                    runtime.bigint(conductor),
                    1,
                    genus,
                    [0, 1],
                    precision,
                    maximum_order,
                ],
            )
            required = int(runtime.reflect.get(planned, "requiredCutoff"))
            if required >= 1:
                return required
    except Exception:
        pass
    demand = (precision + 18) * math.log(2)
    cutoff = max(
        64.0,
        2.0 * math.sqrt(conductor) * (demand / (2.0 * math.pi * genus)) ** genus,
    )
    cutoff *= max(1.0, precision / 64.0)
    if not math.isfinite(cutoff):
        raise OverflowError("the central coefficient cutoff is not finite")
    return int(math.ceil(cutoff))


class PersistentCoefficientCache:
    """Bounded content-addressed storage for exact Dirichlet coefficients."""

    def __init__(
        self,
        directory: str,
        identity: Mapping[str, Any],
        *,
        max_entries: int = 8,
    ) -> None:
        if isinstance(max_entries, bool) or not isinstance(max_entries, int):
            raise TypeError("max_cache_entries must be an integer")
        if max_entries < 1 or max_entries > 128:
            raise ValueError("max_cache_entries must be from 1 through 128")
        self.directory = str(directory)
        self.identity = dict(identity)
        self.identity_digest = _digest(self.identity)
        self.curve_directory = os.path.join(self.directory, self.identity_digest)
        self.max_entries = max_entries
        self.hits = 0
        self.misses = 0
        self.writes = 0
        self.corruptions = 0
        self.bytes_read = 0
        self.bytes_written = 0
        os.makedirs(self.curve_directory, exist_ok=True)

    def _candidate_paths(self) -> list[tuple[int, str]]:
        answer: list[tuple[int, str]] = []
        try:
            names = os.listdir(self.curve_directory)
        except FileNotFoundError:
            return answer
        for name in names:
            if not name.endswith(".json"):
                continue
            pieces = name[:-5].split("-")
            if len(pieces) != 2 or not pieces[0].isdigit():
                continue
            if len(pieces[1]) != 64:
                continue
            answer.append((int(pieces[0]), os.path.join(self.curve_directory, name)))
        answer.sort(key=lambda item: item[0])
        return answer

    def _read(self, path: str) -> tuple[list[int], dict[str, int], str]:
        try:
            with open(path, "r", encoding="utf-8") as source:
                text = source.read()
            self.bytes_read += len(text.encode("utf-8"))
            payload = json.loads(text)
            digest = str(payload.pop("sha256"))
            if _digest(payload) != digest:
                raise FamilyCoefficientCacheError(
                    "coefficient cache payload checksum mismatch"
                )
            if not path.endswith("-" + digest + ".json"):
                raise FamilyCoefficientCacheError(
                    "coefficient cache filename does not match its content"
                )
            if payload.get("schema") != COEFFICIENT_CACHE_SCHEMA:
                raise FamilyCoefficientCacheError("unknown coefficient cache schema")
            if payload.get("identity") != self.identity:
                raise FamilyCoefficientCacheError(
                    "coefficient cache belongs to another L-function"
                )
            coefficients = [int(value) for value in payload["coefficients"]]
            cutoff = int(payload["cutoff"])
            if cutoff != len(coefficients) - 1:
                raise FamilyCoefficientCacheError(
                    "coefficient cache cutoff does not match its payload"
                )
            if len(coefficients) < 2 or coefficients[:2] != [0, 1]:
                raise FamilyCoefficientCacheError(
                    "coefficient cache has an invalid initial prefix"
                )
            backend_counts = {
                str(name): int(count)
                for name, count in dict(payload.get("backend_counts", {})).items()
            }
            return coefficients, backend_counts, digest
        except FamilyCoefficientCacheError:
            self.corruptions += 1
            raise
        except Exception as error:
            self.corruptions += 1
            raise FamilyCoefficientCacheError(
                "unable to decode coefficient cache entry " + path
            ) from error

    def load(
        self, required_cutoff: int, *, largest: bool = False
    ) -> tuple[list[int], dict[str, int], str, str] | None:
        """Load the smallest sufficient entry, or the largest entry if asked."""
        candidates = self._candidate_paths()
        if largest:
            candidates = list(reversed(candidates))
        else:
            candidates = [item for item in candidates if item[0] >= required_cutoff]
        for cutoff, path in candidates:
            if not largest and cutoff < required_cutoff:
                continue
            try:
                coefficients, backend_counts, digest = self._read(path)
            except FamilyCoefficientCacheError:
                try:
                    os.remove(path)
                except (FileNotFoundError, OSError):
                    pass
                continue
            if len(coefficients) - 1 < required_cutoff:
                self.corruptions += 1
                continue
            self.hits += 1
            return coefficients, backend_counts, digest, path
        self.misses += 1
        return None

    def store(
        self, coefficients: list[int], backend_counts: Mapping[str, int]
    ) -> tuple[str, str]:
        """Atomically publish one immutable content-addressed entry."""
        checked = [int(value) for value in coefficients]
        if len(checked) < 2 or checked[:2] != [0, 1]:
            raise ValueError("an exact coefficient prefix must begin with [0, 1]")
        payload: dict[str, Any] = {
            "schema": COEFFICIENT_CACHE_SCHEMA,
            "identity": self.identity,
            "cutoff": len(checked) - 1,
            "backend_counts": {
                str(name): int(count) for name, count in backend_counts.items()
            },
            "coefficients": checked,
        }
        digest = _digest(payload)
        complete = dict(payload)
        complete["sha256"] = digest
        text = _canonical_json(complete) + "\n"
        path = os.path.join(
            self.curve_directory, str(len(checked) - 1) + "-" + digest + ".json"
        )
        if not os.path.exists(path):
            temporary = (
                path
                + ".pending-"
                + str(os.getpid())
                + "-"
                + str(int(time.time() * 1_000_000))
            )
            try:
                with open(temporary, "w", encoding="utf-8", newline="\n") as output:
                    output.write(text)
                    output.flush()
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.remove(temporary)
            self.writes += 1
            self.bytes_written += len(text.encode("utf-8"))
        self._prune(path)
        return digest, path

    def _prune(self, retained_path: str) -> None:
        candidates = self._candidate_paths()
        while len(candidates) > self.max_entries:
            removable = next(
                (item for item in candidates if item[1] != retained_path), None
            )
            if removable is None:
                break
            candidates.remove(removable)
            _cutoff, path = removable
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

    def info(self) -> dict[str, Any]:
        entries = self._candidate_paths()
        return {
            "enabled": True,
            "directory": self.directory,
            "identity_sha256": self.identity_digest,
            "entries": len(entries),
            "largest_cutoff": max((item[0] for item in entries), default=0),
            "hits": self.hits,
            "misses": self.misses,
            "writes": self.writes,
            "corruptions": self.corruptions,
            "bytes_read": self.bytes_read,
            "bytes_written": self.bytes_written,
            "max_entries": self.max_entries,
        }


def evaluate_twist_tile(job: tuple[Any, ...]) -> tuple[dict[str, Any], ...]:
    """Evaluate one immutable tile in an isolated task runtime.

    Pool workers receive this function's source rather than its module globals.
    Keep the complete boundary self-contained: standard-library decoding, exact
    Kronecker arithmetic, cache authentication, and the one native Arb call.
    """
    json_module = __import__("json")
    runtime_module = __import__("sagejs.runtime", fromlist=["flint_backend"])
    crypto_module = runtime_module.require_module("node:crypto")

    def canonical_json(value: object) -> str:
        return json_module.dumps(value, sort_keys=True, separators=(",", ":"))

    def digest_value(value: object) -> str:
        create_hash = runtime_module.reflect.get(crypto_module, "createHash")
        state = runtime_module.reflect.apply(create_hash, crypto_module, ["sha256"])
        update = runtime_module.reflect.get(state, "update")
        runtime_module.reflect.apply(update, state, [canonical_json(value)])
        finish = runtime_module.reflect.get(state, "digest")
        return str(runtime_module.reflect.apply(finish, state, ["hex"]))

    def quadratic_character(discriminant: int, value: int) -> int:
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

    if not isinstance(job, tuple) or len(job) != 11:
        raise ValueError("invalid CPU family worker job")
    (
        schema,
        path,
        digest,
        identity_digest,
        genus,
        base_conductor,
        base_root_number,
        discriminants,
        precision,
        maximum_order,
        mode_and_threshold,
    ) = job
    if schema != "sagejs.hyperelliptic-cpu-family-engine/v1":
        raise ValueError("unknown CPU family worker schema")
    with open(str(path), "r", encoding="utf-8") as source:
        payload = json_module.loads(source.read())
    payload_digest = str(payload.pop("sha256"))
    if payload_digest != str(digest) or digest_value(payload) != payload_digest:
        raise RuntimeError("worker coefficient checksum mismatch")
    if payload.get("schema") != "sagejs.hyperelliptic-coefficient-prefix/v1":
        raise RuntimeError("unknown worker coefficient cache schema")
    if digest_value(payload.get("identity")) != str(identity_digest):
        raise RuntimeError("worker coefficient identity mismatch")
    coefficients = [int(value) for value in payload["coefficients"]]
    if int(payload["cutoff"]) != len(coefficients) - 1:
        raise RuntimeError("worker coefficient cutoff mismatch")
    if len(coefficients) < 2 or coefficients[:2] != [0, 1]:
        raise RuntimeError("worker coefficient prefix is invalid")

    mode, threshold = mode_and_threshold
    backend = runtime_module.flint_backend()
    function = runtime_module.reflect.get(backend, "hyperellipticCentralWeights")
    if runtime_module.jstype(function) == "undefined":
        raise NotImplementedError(
            "the native Arb central-weight backend is unavailable"
        )
    answer = []
    for discriminant in discriminants:
        started = runtime_module.wall_time()
        d_value = int(discriminant)
        conductor = int(base_conductor) * abs(d_value) ** (2 * int(genus))
        root_number = int(base_root_number) * quadratic_character(
            d_value, ((-1) ** int(genus)) * int(base_conductor)
        )
        try:
            arguments = [
                runtime_module.bigint(conductor),
                root_number,
                int(genus),
                [0, 1],
                int(precision),
                int(maximum_order),
            ]
            planned = runtime_module.reflect.apply(function, backend, arguments)
            required = int(runtime_module.reflect.get(planned, "requiredCutoff"))
            if required >= len(coefficients):
                raise RuntimeError(
                    "worker coefficient cache is shorter than the analytic plan"
                )
            twisted = [0]
            for index in range(1, required + 1):
                twisted.append(
                    int(coefficients[index]) * quadratic_character(d_value, index)
                )
            arguments[3] = twisted
            native = runtime_module.reflect.apply(function, backend, arguments)
            if str(runtime_module.reflect.get(native, "status")) != "ok":
                raise RuntimeError(
                    "the worker did not satisfy the native coefficient plan"
                )
            stable = bool(runtime_module.reflect.get(native, "refinementStable"))
            if not stable:
                status = "numerical_indeterminacy"
                reason = "the hyperelliptic L-series refinement did not stabilize"
                derivatives = []
            else:
                status = "ok"
                reason = None
                raw = runtime_module.reflect.get(native, "rawDerivatives")
                derivatives = [
                    {
                        "real": str(
                            runtime_module.reflect.get(raw[index], "realMidpoint")
                        ),
                        "imaginary": str(
                            runtime_module.reflect.get(raw[index], "imagMidpoint")
                        ),
                    }
                    for index in range(len(raw))
                ]
            candidate = False
            if mode == "candidates" and derivatives:
                permitted = 0 if root_number == 1 else 1
                candidate = any(
                    abs(
                        complex(
                            float(derivatives[index]["real"]),
                            float(derivatives[index]["imaginary"]),
                        )
                    )
                    <= float(threshold)
                    for index in range(permitted, len(derivatives), 2)
                )
            answer.append(
                {
                    "type": "record",
                    "discriminant": str(d_value),
                    "status": status,
                    "conductor": str(conductor),
                    "root_number": str(root_number),
                    "central_derivatives": derivatives,
                    "reason": reason,
                    "algorithm": "native-arb-central-mellin-weights",
                    "rigorous": False,
                    "arithmetic_balls_rigorous": True,
                    "refinement_stable": stable,
                    "screening": {
                        "mode": str(mode),
                        "backend": "cpu",
                        "candidate": candidate,
                        "threshold": float(threshold),
                        "gpu_auto_selected": False,
                        "gpu_auto_reason": "physical crossover gate not recorded",
                    },
                    "timings": {
                        "analytic": runtime_module.wall_time() - started,
                        "total": runtime_module.wall_time() - started,
                    },
                }
            )
        except Exception as error:
            answer.append(
                {
                    "type": "record",
                    "discriminant": str(d_value),
                    "status": "unsupported",
                    "conductor": None,
                    "root_number": None,
                    "central_derivatives": [],
                    "reason": str(error),
                    "algorithm": None,
                    "rigorous": False,
                    "arithmetic_balls_rigorous": False,
                    "refinement_stable": False,
                    "screening": {"mode": str(mode), "backend": "cpu"},
                    "timings": {"total": runtime_module.wall_time() - started},
                }
            )
    return tuple(answer)


__all__ = [
    "COEFFICIENT_CACHE_SCHEMA",
    "CPU_FAMILY_ENGINE_SCHEMA",
    "FamilyCoefficientCacheError",
    "PersistentCoefficientCache",
    "central_coefficient_cutoff",
    "coefficient_cache_identity",
    "default_family_cache_directory",
    "evaluate_twist_tile",
]
