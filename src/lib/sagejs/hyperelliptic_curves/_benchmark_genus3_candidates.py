"""Reproducible benchmark for exact genus-3 Weil-candidate enumeration."""

from __future__ import annotations

from time import perf_counter

from sagejs.hyperelliptic_curves.genus3_completion import (
    _candidate_iterator,
    _is_genus3_weil_candidate_sturm,
    enumerate_genus3_weil_candidates,
)


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _time(callable_object, samples: int) -> tuple[float, object]:
    durations = []
    answer = None
    for _index in range(samples):
        started = perf_counter()
        answer = callable_object()
        durations.append(perf_counter() - started)
    return _median(durations), answer


def _sturm_scan(prime: int, residues: tuple[int, int, int]):
    return tuple(
        candidate
        for candidate in _candidate_iterator(prime, residues)
        if _is_genus3_weil_candidate_sturm(prime, *candidate)
    )


def run() -> None:
    print("prime optimized_s sturm_s speedup candidates combinations")
    for prime in (101, 1009, 10_007):
        residues = (12 % prime, 56 % prime, 85 % prime)
        enumerate_genus3_weil_candidates(prime, residues)
        optimized_seconds, optimized = _time(
            lambda: enumerate_genus3_weil_candidates(prime, residues), 5
        )
        sturm_seconds, sturm = _time(lambda: _sturm_scan(prime, residues), 3)
        assert tuple(optimized["candidates"]) == sturm
        print(
            prime,
            f"{optimized_seconds:.9f}",
            f"{sturm_seconds:.9f}",
            f"{sturm_seconds / optimized_seconds:.2f}",
            optimized["candidate_count"],
            optimized["diagnostics"]["combinations_examined"],
        )

    # Production-scale optimized-only rows expose sqrt(p) scaling without
    # making the deliberately slow general-Sturm baseline dominate the run.
    for prime in (100_003, 1_000_003):
        residues = (12, 56, 85)
        seconds, answer = _time(
            lambda: enumerate_genus3_weil_candidates(prime, residues), 5
        )
        print(
            prime,
            f"{seconds:.9f}",
            "-",
            "-",
            answer["candidate_count"],
            answer["diagnostics"]["combinations_examined"],
        )


if __name__ == "__main__":
    run()
