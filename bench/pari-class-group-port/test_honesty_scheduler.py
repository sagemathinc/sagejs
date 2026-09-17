"""CPython tests for the authenticated frozen honesty scheduler."""

import importlib
import json
import pathlib
import unittest


DIRECTORY = pathlib.Path(__file__).resolve().parent
LEAF = json.loads((DIRECTORY / "honesty_branch_fixture.json").read_text())
SCHEDULER = importlib.import_module("bench.pari-class-group-port.honesty_scheduler")


def retry_arguments(random_state, staged_random, state, staged_ideal, output):
    data = LEAF["arithmetic"]
    n = data["degree"]
    zeros = lambda size: [0] * size
    return [
        0,
        list(map(int, data["basisTable"])),
        list(map(int, data["initialIdeal"])),
        list(map(int, data["subfactor"]["generator"])),
        n,
        int(data["subfactor"]["prime"]),
        data["subfactor"]["ramification"],
        data["subfactor"]["residueDegree"],
        random_state,
        staged_random,
        state,
        zeros(n),
        zeros(n),
        zeros(n),
        zeros(3),
        zeros(3),
        zeros(n * n),
        zeros(n * n),
        zeros(2 * n * n),
        zeros(n * (3 * n + 1)),
        zeros(n * (n + 1)),
        zeros(n),
        staged_ideal,
        output,
    ]


class HonestySchedulerTest(unittest.TestCase):
    def test_complete_frozen_failure_schedule(self):
        data = LEAF["arithmetic"]
        state = [0] * 21
        ideal = [0] * 9
        norm = SCHEDULER.pari_honesty_begin_frozen(
            list(map(int, data["initialIdeal"])),
            3,
            2,
            9,
            0,
            [3, 7, 2, 1, 1, 4, 11, 3, 2, 3],
            state,
            ideal,
        )
        self.assertEqual(norm, 11)
        self.assertEqual(state[7], 1)
        self.assertEqual(state[19:21], [1, 1])
        random_state = list(map(int, data["randomState"]))
        staged_random = [0] * 66
        ideals = [ideal.copy()]
        states = [state.copy()]
        for attempt in range(50):
            staged_ideal = [0] * 9
            self.assertEqual(
                SCHEDULER.pari_honesty_resume_frozen(
                    *retry_arguments(
                        random_state, staged_random, state, staged_ideal, ideal
                    )
                ),
                1,
            )
            self.assertEqual(state[14], LEAF["randomExponents"][attempt])
            self.assertEqual(str(state[17]), LEAF["probeNorms"][attempt + 1])
            ideals.append(ideal.copy())
            states.append(state.copy())
        before_rng = random_state.copy()
        before_ideal = ideal.copy()
        self.assertEqual(
            SCHEDULER.pari_honesty_resume_frozen(
                *retry_arguments(random_state, staged_random, state, [0] * 9, ideal)
            ),
            0,
        )
        self.assertEqual(random_state, before_rng)
        self.assertEqual(ideal, before_ideal)
        self.assertEqual(state[6:10], [51, 51, 50, -1])
        self.assertEqual(state[13], 0)
        self.assertEqual(state[16], 50)
        self.assertEqual(len(ideals), 51)
        self.assertEqual(len(states), 51)

    def test_retry_publication_is_transactional(self):
        data = LEAF["arithmetic"]
        state = [0] * 21
        ideal = [0] * 9
        SCHEDULER.pari_honesty_begin_frozen(
            list(map(int, data["initialIdeal"])),
            3,
            2,
            9,
            0,
            [3, 7, 2, 1, 1, 4, 11, 3, 2, 3],
            state,
            ideal,
        )
        random_state = list(map(int, data["randomState"]))
        before_state = state.copy()
        before_rng = random_state.copy()
        before_ideal = ideal.copy()
        args = retry_arguments(random_state, [0] * 66, state, [0] * 9, ideal)
        args[5] = 5
        with self.assertRaisesRegex(ValueError, "unsupported frozen honesty retry"):
            SCHEDULER.pari_honesty_resume_frozen(*args)
        self.assertEqual(state, before_state)
        self.assertEqual(random_state, before_rng)
        self.assertEqual(ideal, before_ideal)

    def test_divergent_success_fails_closed(self):
        data = LEAF["arithmetic"]
        state = [0] * 21
        ideal = [0] * 9
        SCHEDULER.pari_honesty_begin_frozen(
            list(map(int, data["initialIdeal"])),
            3,
            2,
            9,
            0,
            [3, 7, 2, 1, 1, 4, 11, 3, 2, 3],
            state,
            ideal,
        )
        random_state = list(map(int, data["randomState"]))
        args = retry_arguments(random_state, [0] * 66, state, [0] * 9, ideal)
        args[0] = 1
        before = (state.copy(), random_state.copy(), ideal.copy())
        with self.assertRaisesRegex(ValueError, "diverges from frozen honesty"):
            SCHEDULER.pari_honesty_resume_frozen(*args)
        self.assertEqual((state, random_state, ideal), before)


if __name__ == "__main__":
    unittest.main()
