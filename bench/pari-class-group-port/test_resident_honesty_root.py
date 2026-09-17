"""Correctness-only tests for conditional resident honesty dispatch."""

import importlib
import hashlib
import json
import pathlib
import sys
import unittest
from collections.abc import Sequence


DIRECTORY = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY.parents[1] / "src" / "lib"))
LEAF = json.loads((DIRECTORY / "honesty_branch_fixture.json").read_text())
SCHEDULER = json.loads((DIRECTORY / "honesty_scheduler_fixture.json").read_text())
ROOT = importlib.import_module("bench.pari-class-group-port.resident_honesty_root")


def unequal_state():
    return [5, 31, 3, 2, 9, 9, 30], [7, 0, 3, 2, 1, 0, 0, 3]


class ResidentHonestyRootTest(unittest.TestCase):
    def test_real_unequal_retry_path_preserves_exact_rng_and_state(self):
        base, preparation = unequal_state()
        rng = list(map(int, LEAF["arithmetic"]["randomState"]))
        seen = []

        def failed(ideal: Sequence[int], norm: int) -> int:
            seen.append((tuple(ideal), norm))
            return 0

        result = ROOT.run_resident_honesty_root(
            base, preparation, 0, LEAF["arithmetic"], rng, failed
        )
        self.assertEqual(result.status, "restart-required-honesty-failure")
        self.assertFalse(result.success)
        self.assertEqual((result.probes, result.random_draws), (51, 50))
        self.assertEqual([str(norm) for _, norm in seen], LEAF["probeNorms"])
        rng_hash = hashlib.sha256(
            json.dumps(list(map(str, rng)), separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(rng_hash, SCHEDULER["finalRngSha256"])
        self.assertEqual((result.initial_kcz, result.final_kcz), (2, 2))

    def test_equal_bound_is_a_distinct_zero_work_path(self):
        called = []
        rng = [0] * 66

        def unexpected(ideal: Sequence[int], norm: int) -> int:
            called.append((ideal, norm))
            return 0

        result = ROOT.run_resident_honesty_root(
            [333, 333, 66, 48, 48, 66, 1],
            [7, 0, 66, 48, 4, 0, 0, 66],
            0,
            None,
            rng,
            unexpected,
        )
        self.assertEqual(result.status, "equal-bound-source-skip")
        self.assertEqual((result.probes, result.random_draws), (0, 0))
        self.assertEqual(called, [])
        self.assertEqual(rng, [0] * 66)

    def test_success_and_orbit_frontiers_do_not_consume_rng(self):
        base, preparation = unequal_state()
        start = list(map(int, LEAF["arithmetic"]["randomState"]))

        def failure(_ideal: Sequence[int], _norm: int) -> int:
            return 0

        def success(_ideal: Sequence[int], _norm: int) -> int:
            return 1

        for automorphisms, probe, status in (
            (1, failure, "unsupported-automorphism-orbit"),
            (0, success, "unsupported-success-continuation"),
        ):
            with self.subTest(status=status):
                rng = start.copy()
                result = ROOT.run_resident_honesty_root(
                    base,
                    preparation,
                    automorphisms,
                    LEAF["arithmetic"],
                    rng,
                    probe,
                )
                self.assertEqual(result.status, status)
                self.assertEqual(result.random_draws, 0)
                self.assertEqual(rng, start)

    def test_bad_probe_observation_rejects_before_retry(self):
        base, preparation = unequal_state()
        rng = list(map(int, LEAF["arithmetic"]["randomState"]))
        before = rng.copy()

        def malformed(_ideal: Sequence[int], _norm: int) -> int:
            return 2

        with self.assertRaisesRegex(ROOT.ResidentHonestyFailure, "non-Boolean"):
            ROOT.run_resident_honesty_root(
                base,
                preparation,
                0,
                LEAF["arithmetic"],
                rng,
                malformed,
            )
        self.assertEqual(rng, before)


if __name__ == "__main__":
    unittest.main()
