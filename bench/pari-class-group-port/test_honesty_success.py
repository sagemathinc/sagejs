"""CPython tests for the authenticated successful honesty scheduler."""

import importlib
import json
import pathlib
import unittest


DIRECTORY = pathlib.Path(__file__).resolve().parent
FIXTURE = json.loads((DIRECTORY / "honesty_success_fixture.json").read_text())
SCHEDULER = importlib.import_module("bench.pari-class-group-port.honesty_success")
OUTER = [value for row in FIXTURE["outerSchedule"] for value in row]
PROBES = [value for row in FIXTURE["probeSchedule"] for value in row]
NORMS = list(map(int, FIXTURE["probeNorms"]))
IDEALS = [int(value) for row in FIXTURE["probeIdeals"] for value in row]


def begin(state, ideal):
    return SCHEDULER.pari_honesty_success_begin(
        5, 3, 10, 0, OUTER, PROBES, NORMS, IDEALS, state, ideal
    )


class HonestySuccessTest(unittest.TestCase):
    def test_complete_successful_schedule_and_restoration(self):
        state = [0] * 21
        ideal = [0] * 25
        rng = list(range(1, 67))
        self.assertEqual(begin(state, ideal), 11)
        self.assertEqual(ideal, IDEALS[:25])
        before = rng.copy()
        seen = []
        for index in range(6):
            status = SCHEDULER.pari_honesty_success_resume(
                1,
                OUTER,
                PROBES,
                NORMS,
                IDEALS,
                rng,
                state,
                [0] * 25,
                ideal,
            )
            self.assertEqual(status, int(index < 5))
            seen.append(state[0])
        self.assertEqual(seen, [3, 3, 4, 5, 5, 3])
        self.assertEqual(
            state,
            [3, 3, 10, 5, 6, 6, 3, 4, 1, 1, 0, 0, 0, 0, 9, 29, 2, 0, 6, 29, 6],
        )
        self.assertEqual(rng, before)

    def test_failed_probe_rejects_without_publication(self):
        state = [0] * 21
        ideal = [0] * 25
        rng = list(range(1, 67))
        begin(state, ideal)
        before = (state.copy(), ideal.copy(), rng.copy())
        with self.assertRaisesRegex(ValueError, "diverges"):
            SCHEDULER.pari_honesty_success_resume(
                0,
                OUTER,
                PROBES,
                NORMS,
                IDEALS,
                rng,
                state,
                [0] * 25,
                ideal,
            )
        self.assertEqual((state, ideal, rng), before)

    def test_bad_successor_rejects_before_publication(self):
        state = [0] * 21
        ideal = [0] * 25
        rng = list(range(1, 67))
        begin(state, ideal)
        bad = PROBES.copy()
        bad[4] = 13
        before = (state.copy(), ideal.copy(), rng.copy())
        with self.assertRaisesRegex(ValueError, "successor"):
            SCHEDULER.pari_honesty_success_resume(
                1,
                OUTER,
                bad,
                NORMS,
                IDEALS,
                rng,
                state,
                [0] * 25,
                ideal,
            )
        self.assertEqual((state, ideal, rng), before)


if __name__ == "__main__":
    unittest.main()
