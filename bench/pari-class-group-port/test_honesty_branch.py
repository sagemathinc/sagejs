"""CPython differential checks for the bounded unequal-bound honesty cut."""

import importlib
import json
import pathlib
import unittest


DIRECTORY = pathlib.Path(__file__).resolve().parent
FIXTURE = json.loads((DIRECTORY / "honesty_branch_fixture.json").read_text())
HONESTY = importlib.import_module("bench.pari-class-group-port.honesty_branch")


class HonestyBranchTest(unittest.TestCase):
    def test_random_bits_four_transcript(self):
        state = list(map(int, FIXTURE["arithmetic"]["randomState"]))
        output = [0] * 50
        self.assertEqual(HONESTY.pari_honesty_random_powers(state, 50, output), 50)
        self.assertEqual(output, FIXTURE["randomExponents"])

    def test_retry_ideal_norms(self):
        data = FIXTURE["arithmetic"]
        n = data["degree"]
        zeros = lambda size: [0] * size
        expected = FIXTURE["probeNorms"][1:]
        for exponent, norm in zip(FIXTURE["randomExponents"], expected):
            output = zeros(n * n)
            got = HONESTY.pari_honesty_retry_ideal(
                list(map(int, data["basisTable"])),
                list(map(int, data["initialIdeal"])),
                list(map(int, data["subfactor"]["generator"])),
                n,
                int(data["subfactor"]["prime"]),
                data["subfactor"]["ramification"],
                data["subfactor"]["residueDegree"],
                exponent,
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
                output,
            )
            self.assertEqual(str(got), norm)

    def test_fail_closed_domains(self):
        with self.assertRaisesRegex(ValueError, "invalid honesty random-power"):
            HONESTY.pari_honesty_random_powers([0] * 66, 52, [0] * 52)
        data = FIXTURE["arithmetic"]
        n = data["degree"]
        zeros = lambda size: [0] * size
        args = [
            list(map(int, data["basisTable"])),
            list(map(int, data["initialIdeal"])),
            list(map(int, data["subfactor"]["generator"])),
            n,
            int(data["subfactor"]["prime"]),
            data["subfactor"]["ramification"],
            data["subfactor"]["residueDegree"],
            16,
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
            zeros(n * n),
        ]
        with self.assertRaisesRegex(ValueError, "unsupported bounded honesty retry"):
            HONESTY.pari_honesty_retry_ideal(*args)


if __name__ == "__main__":
    unittest.main()
