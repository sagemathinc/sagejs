"""Offline validation of screening identities, accounting and terminal states."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "frontier_screen", Path(__file__).with_name("screen-batch.py")
)
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)


class ScreeningContracts(unittest.TestCase):
    def state(self):
        return {
            "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
            "limit_seconds": screen.LIMIT,
            "charged_seconds": 600,
            "pending": None,
        }

    def test_budget_fails_closed(self):
        screen.validate_state(self.state(), 610)
        for change in (
            {"charged_seconds": True},
            {"charged_seconds": -1},
            {"charged_seconds": float("nan")},
            {"charged_seconds": screen.LIMIT},
            {"pending": {"label": "interrupted"}},
            {"limit_seconds": screen.LIMIT + 1},
            {"schema": "wrong"},
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                screen.validate_state(dict(self.state(), **change), 10)

    def test_pending_receipt_cannot_be_silently_restarted(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / "ledger.json"
            state = self.state()
            state["pending"] = {"label": "field", "reserved_seconds": 70}
            screen.save(ledger, state)
            screen.save(Path(directory) / "receipt.json", {"status": "ok"})
            with self.assertRaises(ValueError):
                screen.validate_state(json.loads(ledger.read_text()), 70)

    def test_terminal_matching_and_censoring(self):
        good = "FRONTIER_RESULT|field|200|1|1|1|[]|-23|[0,1]|2|1\nFRONTIER_COMPACT|field|[]\n"
        self.assertEqual(
            screen.validate_terminal(good, "", "field", 0, False, False), "ok"
        )
        for output in (
            "",
            good.replace("field", "wrong"),
            good.replace("|200|", "|100|"),
            good + good,
            good.split("FRONTIER_COMPACT|")[0],
            "FRONTIER_RESULT|field|200|1|\nFRONTIER_COMPACT|field|\n",
            good.replace("|1|1|[]|", "|-1|1|[]|"),
            good.replace("|[]|", "|garbage|"),
            good.replace("|2|1\n", "|2|0\n"),
            good.replace("FRONTIER_COMPACT|field|[]", "FRONTIER_COMPACT|field|"),
        ):
            self.assertEqual(
                screen.validate_terminal(output, "", "field", 0, False, False), "error"
            )
        self.assertEqual(
            screen.validate_terminal(good, "", "field", 137, False, False), "error"
        )
        self.assertEqual(
            screen.validate_terminal(good, "", "field", -9, True, False), "timeout"
        )
        self.assertEqual(
            screen.validate_terminal(good, "", "field", -25, False, True),
            "output-limit",
        )
        self.assertEqual(
            screen.validate_terminal(good, "*** error", "field", 0, False, False),
            "error",
        )
        warning = "  *** bnfinit: Warning: increasing stack size to 16000000.\n"
        self.assertEqual(
            screen.validate_terminal(good, warning, "field", 0, False, False), "ok"
        )
        for errors in (
            warning + "  *** bnfinit: domain error\n",
            "  *** bnfinit: Warning: insufficient precision.\n",
            "unrecognized diagnostic\n",
        ):
            self.assertEqual(
                screen.validate_terminal(good, errors, "field", 0, False, False),
                "error",
            )

    def test_exact_input_contract(self):
        screen.validate_case({"label": "field", "coefficients": ["-1", "0", "1"]})
        for coefficients in ([1, 0, 1], ["-1", "0", "2"], ["01", "0", "1"], ["0", "1"]):
            with self.assertRaises(ValueError):
                screen.validate_case({"label": "field", "coefficients": coefficients})
        with self.assertRaises(ValueError):
            screen.validate_case(
                {"label": "../escape", "coefficients": ["1", "0", "1"]}
            )

    def test_hecke_terminal_contract(self):
        result = {
            "schema": "sagejs-hecke-frontier-screen-v1",
            "id": "field",
            "bits": 200,
            "iterations": 1,
            "elapsed_ns": "100",
            "compact": {
                "class_number": "1",
                "torsion_order": "2",
                "integral_basis": [["1"]],
                "units": [[]],
                "regulator": {
                    "bits": 200,
                    "guarantee": "absolute-radius-less-than-2^-bits",
                },
            },
        }

        def check(value, **kwargs):
            return screen.validate_hecke_terminal(
                json.dumps(value),
                kwargs.get("errors", ""),
                "field",
                kwargs.get("returncode", 0),
                False,
                False,
            )

        self.assertEqual(check({"status": "ok", "result": result}), "ok")
        for mutation in (
            {"id": "wrong"},
            {"bits": 100},
            {"iterations": True},
            {"elapsed_ns": "-1"},
            {"compact": {}},
            {"schema": "wrong"},
        ):
            self.assertEqual(
                check({"status": "ok", "result": dict(result, **mutation)}), "error"
            )
        self.assertEqual(check({"status": "error", "result": result}), "error")
        self.assertEqual(
            check({"status": "ok", "result": result}, errors="warning"), "error"
        )
        self.assertEqual(
            check({"status": "ok", "result": result}, returncode=1), "error"
        )


if __name__ == "__main__":
    unittest.main()
