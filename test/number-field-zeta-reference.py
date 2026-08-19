#!/usr/bin/env python3
"""CPython differential tests for quadratic Dedekind-zeta internals."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src" / "lib"))

from mpmath import mp

from sagejs.number_fields.dedekind_zeta import DedekindZetaFunction
from sagejs.number_fields.quadratic_characters import (
    fundamental_discriminant,
    is_fundamental_discriminant,
    kronecker_character,
    kronecker_character_logs,
    kronecker_symbol,
    squarefree_part,
)
from sagejs.number_fields.riemann_zeta import (
    RiemannZetaEvaluator,
    ZetaPoleError,
    reference_riemann_xi,
    reference_riemann_zeta_jet,
)


class FakeField:
    def __init__(self, discriminant: int) -> None:
        self._discriminant = discriminant

    def degree(self) -> int:
        return 2

    def discriminant(self) -> int:
        return self._discriminant

    def __repr__(self) -> str:
        return f"quadratic field of discriminant {self._discriminant}"


class FakeCharacter:
    def __init__(self, group: "FakeGroup", logs: list[int]) -> None:
        self._group = group
        self.logs = logs

    def modulus(self) -> int:
        return self._group.modulus

    def conductor(self) -> int:
        return self._group.modulus

    def is_primitive(self) -> bool:
        return True

    def is_real(self) -> bool:
        return True

    def is_even(self) -> bool:
        return self._group.discriminant > 0


class FakeGroup:
    def __init__(
        self, discriminant: int, generators: list[int], orders: list[int]
    ) -> None:
        self.discriminant = discriminant
        self.modulus = abs(discriminant)
        self._generators = generators
        self._orders = orders
        self.enumerated = False

    def unit_gens(self) -> tuple[int, ...]:
        return tuple(self._generators)

    def _from_logs(self, logs: list[int]) -> FakeCharacter:
        return FakeCharacter(self, logs)

    def __iter__(self):
        self.enumerated = True
        raise AssertionError("the direct constructor must not enumerate the group")


class QuadraticCharacterTests(unittest.TestCase):
    def test_kronecker_symbol_extensions(self) -> None:
        self.assertEqual(kronecker_symbol(-8, 4), 0)
        self.assertEqual(kronecker_symbol(-20, 4), 0)
        self.assertEqual(kronecker_symbol(5, 2), -1)
        self.assertEqual(kronecker_symbol(-3, -1), -1)
        self.assertEqual(kronecker_symbol(1, 0), 1)
        self.assertEqual(kronecker_symbol(3, 0), 0)

    def test_fundamental_discriminants_and_reduction(self) -> None:
        for value in (-24, -23, -20, -8, -7, -4, -3, 1, 5, 8, 12, 13, 24, 28):
            self.assertTrue(is_fundamental_discriminant(value), value)
        for value in (-16, -12, 0, 4, 9, 16, 20, 45):
            self.assertFalse(is_fundamental_discriminant(value), value)
        self.assertEqual(squarefree_part(-72), -2)
        self.assertEqual(squarefree_part(45), 5)
        self.assertEqual(fundamental_discriminant(-72), -8)
        self.assertEqual(fundamental_discriminant(45), 5)
        with self.assertRaises(ValueError):
            fundamental_discriminant(144)

    def test_direct_logs_and_constructor_do_not_enumerate(self) -> None:
        logs = kronecker_character_logs(5, [2, 4], [4, 2])
        self.assertEqual(logs, [2, 0])
        holder: dict[str, FakeGroup] = {}

        def factory(modulus: int) -> FakeGroup:
            self.assertEqual(modulus, 5)
            holder["group"] = FakeGroup(5, [2], [4])
            return holder["group"]

        character = kronecker_character(5, group_factory=factory)
        self.assertEqual(character.logs, [2])
        self.assertFalse(holder["group"].enumerated)


class RiemannZetaTests(unittest.TestCase):
    def test_values_derivatives_deflation_and_xi(self) -> None:
        mp.dps = 70
        point = mp.mpc("0.5", "14")
        jet = reference_riemann_zeta_jet(point, 3, precision_bits=200)
        for derivative, value in enumerate(jet):
            self.assertLess(
                abs(value - mp.diff(mp.zeta, point, derivative)), mp.mpf("1e-55")
            )

        deflated = reference_riemann_zeta_jet(1, 2, precision_bits=200, deflate=True)
        self.assertLess(abs(deflated[0] - mp.euler), mp.mpf("1e-55"))
        evaluator = RiemannZetaEvaluator(200)
        reconstructed = evaluator.reconstruct_raw_from_deflated(
            mp.mpf("1.125"),
            evaluator.deflated_jet(mp.mpf("1.125"), 2)[2],
            2,
        )
        self.assertLess(
            abs(reconstructed - mp.diff(mp.zeta, mp.mpf("1.125"), 2)), mp.mpf("1e-50")
        )
        self.assertEqual(reference_riemann_xi(0, precision_bits=200), 1)
        self.assertEqual(reference_riemann_xi(1, precision_bits=200), 1)
        self.assertLess(
            abs(
                reference_riemann_xi(point, precision_bits=200)
                - reference_riemann_xi(1 - point, precision_bits=200)
            ),
            mp.mpf("1e-55"),
        )
        with self.assertRaises(ZetaPoleError):
            evaluator.value(1)
        with self.assertRaises(ZetaPoleError):
            evaluator.value("1.000000000000000000000000000000000000")
        self.assertGreater(
            abs(evaluator.value("1.000000000000000000000000000000000001")),
            mp.mpf("1e35"),
        )
        self.assertGreater(
            abs(evaluator.value(mp.mpf(1) + mp.mpf("1e-20"))), mp.mpf("1e19")
        )


class DedekindZetaTests(unittest.TestCase):
    def test_real_and_imaginary_quadratic_products(self) -> None:
        mp.dps = 70
        point = mp.mpc("0.5", "2.25")
        for discriminant in (5, -3, -20):
            zeta = DedekindZetaFunction(
                FakeField(discriminant),
                precision=200,
                algorithm="reference",
            )
            chi = [kronecker_symbol(discriminant, n) for n in range(abs(discriminant))]
            expected = mp.zeta(point) * mp.dirichlet(point, chi)
            self.assertLess(abs(zeta(point) - expected), mp.mpf("1e-55"))
            for derivative in range(3):
                expected_derivative = mp.diff(
                    lambda s: mp.zeta(s) * mp.dirichlet(s, chi),
                    point,
                    derivative,
                )
                self.assertLess(
                    abs(zeta.derivative(point, derivative) - expected_derivative),
                    mp.mpf("1e-48"),
                )
            self.assertLess(abs(zeta.residue() - mp.dirichlet(1, chi)), mp.mpf("1e-55"))
            self.assertLess(
                abs(zeta.completed_value(point) - zeta.completed_value(1 - point)),
                mp.mpf("1e-48"),
            )
            self.assertLess(abs(zeta.xi(point) - zeta.xi(1 - point)), mp.mpf("1e-48"))
            self.assertLess(abs(zeta.xi(0) - zeta.xi(1)), mp.mpf("1e-55"))
            self.assertLess(
                abs(zeta.completed_value(-2) - zeta.completed_value(3)),
                mp.mpf("1e-55"),
            )

    def test_pole_deflated_taylor_batch_and_conjugation(self) -> None:
        mp.dps = 70
        discriminant = 5
        zeta = DedekindZetaFunction(
            FakeField(discriminant),
            precision=200,
            algorithm="reference",
        )
        with self.assertRaises(ZetaPoleError):
            zeta(1)
        with self.assertRaises(ZetaPoleError):
            zeta.derivative(1)
        nearby = mp.mpf(1) + mp.mpf("1e-20")
        self.assertGreater(abs(zeta(nearby)), mp.mpf("1e19"))
        coefficients = zeta.deflated_taylor_series(3)
        chi = [kronecker_symbol(discriminant, n) for n in range(discriminant)]
        offset = mp.mpf("1e-6")
        reconstructed = sum(
            coefficient * offset**degree
            for degree, coefficient in enumerate(coefficients)
        )
        expected = offset * mp.zeta(1 + offset) * mp.dirichlet(1 + offset, chi)
        self.assertLess(abs(reconstructed - expected), mp.mpf("1e-24"))
        points = [mp.mpc("0.75", "1.5"), mp.mpc("0.75", "-1.5"), 2]
        values = zeta.values(points)
        self.assertEqual(len(values), 3)
        self.assertLess(abs(values[1] - mp.conj(values[0])), mp.mpf("1e-55"))
        self.assertEqual(zeta.last_diagnostics()["point_count"], 3)
        tile = zeta._plot_complex_batch([[0.75, 1.5], [0.75, -1.5]], 30)
        self.assertEqual(len(tile["fine"]), 2)
        self.assertEqual(tile["diagnostics"]["tile_count"], 1)
        self.assertLess(
            abs(tile["fine"][0][0] - tile["fine"][1][0]),
            1e-12,
        )
        self.assertLess(
            abs(tile["fine"][0][1] + tile["fine"][1][1]),
            1e-12,
        )


if __name__ == "__main__":
    unittest.main()
