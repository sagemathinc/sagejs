"""Differential checks for the exact genus-3 candidate kernel.

Run this file with either CPython or Sage.js.  A compiled Sage.js artifact
exercises the isolated native body; CPython exercises its same-source fallback.
"""

from __future__ import annotations

from sagejs.hyperelliptic_curves.genus3_candidate_kernel import (
    scan_genus3_weil_candidates,
    scan_genus3_weil_candidates_batch,
)
from sagejs.hyperelliptic_curves.genus3_completion import (
    _candidate_iterator,
    _host_buffer_length,
    _is_genus3_weil_candidate,
    _is_genus3_weil_candidate_sturm,
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
)
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
)


def _next_state(state: int) -> int:
    return (6364136223846793005 * state + 1442695040888963407) % (1 << 64)


def _sturm_candidates(
    prime: int, residues: tuple[int, int, int]
) -> tuple[tuple[int, int, int], ...]:
    return tuple(
        candidate
        for candidate in _candidate_iterator(prime, residues)
        if _is_genus3_weil_candidate_sturm(prime, *candidate)
    )


def _kernel_candidates(
    prime: int,
    residues: tuple[int, int, int],
    capacity: int,
    max_combinations: int = 2_000_000,
) -> tuple[int, int, int, tuple[tuple[int, int, int], ...]]:
    output = kernel_integer_zeros(
        scan_genus3_weil_candidates, _host_buffer_length(2 + 3 * capacity)
    )
    stored = int(
        scan_genus3_weil_candidates(
            output, prime, residues[0], residues[1], residues[2], max_combinations
        )
    )
    values = integer_buffer_values(output)
    count = int(values[0])
    combinations = int(values[1])
    if stored < 0:
        candidates: tuple[tuple[int, int, int], ...] = ()
    else:
        candidates = tuple(
            (
                int(values[2 + 3 * index]),
                int(values[3 + 3 * index]),
                int(values[4 + 3 * index]),
            )
            for index in range(stored)
        )
    return stored, count, combinations, candidates


def run(*, dense: bool = False) -> dict[str, int | bool]:
    # Dense arbitrary coefficient checks protect the cubic-specific proof from
    # accidentally relying on iterator bounds.  They also cover singular real
    # cubics, repeated roots, and many non-Weil triples.
    state = 0x243F6A8885A308D3
    criterion_checks = 0
    samples_per_prime = 20_000 if dense else 2_000
    for prime in (3, 5, 7, 11, 17, 101):
        for _index in range(samples_per_prime):
            state = _next_state(state)
            coefficient1 = state % (40 * prime + 1) - 20 * prime
            state = _next_state(state)
            coefficient2 = state % (40 * prime + 1) - 20 * prime
            state = _next_state(state)
            coefficient3 = state % (200 * prime * prime + 1) - 100 * prime * prime
            expected = _is_genus3_weil_candidate_sturm(
                prime, coefficient1, coefficient2, coefficient3
            )
            actual = _is_genus3_weil_candidate(
                prime, coefficient1, coefficient2, coefficient3
            )
            assert actual == expected
            criterion_checks += 1

    # Explicit endpoint and repeated-root examples from the public completion
    # regression test.
    assert _is_genus3_weil_candidate(5, 0, -5, 0)
    assert _is_genus3_weil_candidate(5, -1, 15, -10)

    scan_checks = 0
    scans_per_prime = 24 if dense else 6
    for prime in (3, 5, 7, 11, 17, 101, 1009):
        for _index in range(scans_per_prime):
            state = _next_state(state)
            residues = (
                state % prime,
                (state >> 17) % prime,
                (state >> 41) % prime,
            )
            expected = _sturm_candidates(prime, residues)
            stored, count, _combinations, actual = _kernel_candidates(
                prime, residues, len(expected) + 2
            )
            assert stored == len(expected)
            assert count == len(expected)
            assert actual == expected
            scan_checks += 1

    # A short output buffer reports the exhaustive count but stores only its
    # declared prefix.  Combination exhaustion never exposes partial data.
    expected = _sturm_candidates(101, (12, 56, 85))
    stored, count, _combinations, prefix = _kernel_candidates(101, (12, 56, 85), 7)
    assert stored == 7
    assert count == len(expected) == 50
    assert prefix == expected[:7]
    stored, count, combinations, partial = _kernel_candidates(
        101, (12, 56, 85), 100, 10
    )
    assert stored == -1
    assert combinations == 10
    assert partial == ()
    assert count <= len(expected)

    limited = enumerate_genus3_weil_candidates(101, (12, 56, 85), max_candidates=1)
    assert limited["status"] == "resource_limit"
    assert limited["candidate_count"] == 50
    assert limited["candidates"] == ()
    filtered = complete_genus3_lpolynomial(
        101, (12, 56, 85), jacobian_order=1_158_624, max_candidates=1
    )
    assert filtered["status"] == "unique"
    assert filtered["coefficients"] == (12, 56, 186)

    batch_rows = [
        (5, (3, 4, 2)),
        (7, (0, 0, 0)),
        (11, (1, 8, 0)),
        (101, (12, 56, 85)),
    ]
    capacity = 256
    stride = 3 + 3 * capacity
    batch_output = kernel_integer_zeros(
        scan_genus3_weil_candidates_batch, stride * len(batch_rows)
    )
    batch_input = kernel_integer_buffer(
        scan_genus3_weil_candidates_batch,
        [value for prime, residues in batch_rows for value in (prime, *residues)],
    )
    assert scan_genus3_weil_candidates_batch(
        batch_output, batch_input, len(batch_rows), capacity, 2_000_000
    ) == len(batch_rows)
    batch_values = integer_buffer_values(batch_output)
    for row_index, (prime, residues) in enumerate(batch_rows):
        expected_batch = enumerate_genus3_weil_candidates(prime, residues)
        offset = stride * row_index
        assert int(batch_values[offset]) == 0
        assert int(batch_values[offset + 1]) == expected_batch["candidate_count"]
        actual_batch = tuple(
            (
                int(batch_values[offset + 3 + 3 * index]),
                int(batch_values[offset + 4 + 3 * index]),
                int(batch_values[offset + 5 + 3 * index]),
            )
            for index in range(expected_batch["candidate_count"])
        )
        assert actual_batch == expected_batch["candidates"]

    # The source-transparent exact kernel must promote beyond signed 64-bit
    # intermediates rather than silently wrapping.  A tiny combination cap
    # keeps this full-word prime test bounded while exercising p^3 and square
    # root arithmetic well beyond machine range.
    stored, _count, combinations, partial = _kernel_candidates(
        2**61 - 1, (1, 2, 3), 0, 10
    )
    assert stored == -1
    assert combinations == 10
    assert partial == ()

    return {
        "compiled": is_compiled(scan_genus3_weil_candidates),
        "criterion_checks": criterion_checks,
        "scan_checks": scan_checks,
    }


if __name__ == "__main__":
    print(run())
