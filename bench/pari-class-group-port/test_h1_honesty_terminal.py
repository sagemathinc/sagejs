"""Focused live-owner tests for the h=1 honesty terminal root."""

import copy
import importlib
import unittest
from typing import Any


ROOT = importlib.import_module("bench.pari-class-group-port.h1_honesty_terminal")


def live_attempt() -> dict[str, Any]:
    """Return shaped live owners, not a terminal-status fixture."""
    return {
        "prep_base_state": [
            333,
            333,
            66,
            48,
            48,
            66,
            33305723793961172309794353671961864459781409056283352022593315566492501865020800513844122052778,
        ],
        "prep_state": [7, 0, 66, 48, 4, 1833, 2270, 66],
        "attempt_state": [4, 0, 0, 1],
        "class_number": [1],
        "class_invariants": [0] * 73,
        "relation_state": [73, 780, 0, 0, 0, 73],
    }


class H1HonestyTerminalTest(unittest.TestCase):
    def test_composes_from_live_owners(self):
        root = ROOT.compose_h1_honesty_terminal(live_attempt())
        self.assertEqual(root.class_number, 1)
        self.assertEqual(root.invariant_count, 0)
        self.assertEqual(root.accepted_relations, 73)
        self.assertEqual(root.honesty_status, "equal-bound-source-skip")
        self.assertEqual((root.relation_groups, root.checking_groups), (48, 48))

    def test_unequal_live_counts_block_terminal_publication(self):
        value = live_attempt()
        value["prep_base_state"][4] = 49
        with self.assertRaisesRegex(ROOT.H1TerminalFailure, "still requires"):
            ROOT.compose_h1_honesty_terminal(value)

    def test_no_terminal_status_input_is_read(self):
        value = live_attempt()
        value["honesty_status"] = "verified"
        value["equal_bound_honesty"] = "injected"
        root = ROOT.compose_h1_honesty_terminal(value)
        self.assertEqual(root.honesty_status, "equal-bound-source-skip")

    def test_class_and_relation_mutations_fail_closed(self):
        cases = (
            ("class_number", 0, 2, "not trivial"),
            ("attempt_state", 0, 3, "not terminal"),
            ("relation_state", 5, 72, "incomplete"),
        )
        for owner, index, replacement, message in cases:
            with self.subTest(message=message):
                value = live_attempt()
                before = copy.deepcopy(value)
                value[owner][index] = replacement
                changed = copy.deepcopy(value)
                with self.assertRaisesRegex(ROOT.H1TerminalFailure, message):
                    ROOT.compose_h1_honesty_terminal(value)
                self.assertEqual(value, changed)
                self.assertNotEqual(value, before)


if __name__ == "__main__":
    unittest.main()
