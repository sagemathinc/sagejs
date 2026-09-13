r"""Integral monodromy lattices and component groups from Brandt modules.

For level $pM$ with $p\nmid M$, the degree-zero lattice in the right ideal
classes of the Eichler order of discriminant $p$ and conductor $M$ is the
toric character lattice at $p$.  This module computes its exact pairing,
Smith cokernel, Hecke action, and geometric Frobenius action.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


class DegreeZeroBrandtLattice:
    """The saturated kernel of the augmentation on an ideal-class lattice."""

    def __init__(self, module: Any) -> None:
        if module.realization() != "eichler-ideal-classes":
            raise ValueError(
                "a degree-zero Brandt lattice needs the ideal-class realization"
            )
        dimension = module.dimension()
        if dimension <= 1:
            basis = _global("matrix")(sage.ZZ, 0, dimension, [])
        else:
            rows = []
            for index in range(dimension - 1):
                row = [0 for _column in range(dimension)]
                row[index] = 1
                row[-1] = -1
                rows.append(row)
            basis = _global("matrix")(sage.ZZ, rows)
        self._module = module
        self._basis = basis
        self._pairing = (
            basis * module.pairing_matrix().change_ring(sage.ZZ) * basis.transpose()
        )
        if basis.nrows() and basis.rank() != dimension - 1:
            raise ArithmeticError("the degree-zero Brandt basis has the wrong rank")
        if any(sum(row) != 0 for row in basis.rows()):
            raise ArithmeticError("the degree-zero Brandt basis is not augmented zero")

    def ambient_module(self) -> Any:
        return self._module

    def rank(self) -> int:
        return self._basis.nrows()

    dimension = rank

    def basis_matrix(self) -> Any:
        return self._basis

    def pairing_matrix(self) -> Any:
        return self._pairing

    monodromy_pairing_matrix = pairing_matrix

    def _restrict(self, ambient: Any) -> Any:
        images = self._basis * ambient
        if self.rank() == 0:
            return _global("matrix")(sage.ZZ, 0, 0, [])
        restricted = images.matrix_from_columns(range(self.rank()))
        if restricted * self._basis != images:
            raise ArithmeticError(
                "an ambient Brandt operator does not preserve degree zero"
            )
        return restricted

    def hecke_matrix(self, index: Any) -> Any:
        return self._restrict(self._module.hecke_matrix(index).change_ring(sage.ZZ))

    def atkin_lehner_matrix(self, prime: Any) -> Any:
        return self._restrict(
            self._module.atkin_lehner_matrix(prime).change_ring(sage.ZZ)
        )

    def frobenius_matrix(self) -> Any:
        prime = self._module.discriminant()
        if not sage.is_prime(prime):
            raise NotImplementedError(
                "the first component-group consumer requires prime discriminant"
            )
        # For p exactly dividing the modular level, geometric Frobenius is
        # -W_p on the character lattice.
        result = -self.atkin_lehner_matrix(prime)
        identity = _global("identity_matrix")(sage.ZZ, self.rank())
        if result * result != identity:
            raise ArithmeticError("geometric Frobenius is not an involution")
        if result * self._pairing * result.transpose() != self._pairing:
            raise ArithmeticError(
                "geometric Frobenius does not preserve the monodromy pairing"
            )
        return result

    def smith_form(self) -> Any:
        return self._pairing.smith_form()

    def invariant_factors(self) -> tuple[Any, ...]:
        smith = self.smith_form()[0]
        answer = []
        for value in smith.diagonal():
            absolute = -value if value < 0 else value
            if absolute > 1:
                answer.append(absolute)
        return tuple(answer)

    def component_group(self) -> BrandtComponentGroup:
        return BrandtComponentGroup(self)


class BrandtComponentGroup:
    """The finite cokernel of an exact Brandt monodromy pairing."""

    def __init__(self, lattice: DegreeZeroBrandtLattice) -> None:
        self._lattice = lattice
        self._smith, self._smith_left, self._smith_right = lattice.smith_form()
        self._invariants = lattice.invariant_factors()
        self._lattice_frobenius = lattice.frobenius_matrix()
        # The component group is coker(X -> X^vee).  If row vectors on X
        # transform by F, dual row coordinates transform by F^(-t).  With
        # S*G*T = diagonal Smith form, right multiplication by T identifies
        # the original dual coordinates with Smith coordinates.
        dual_frobenius = self._lattice_frobenius.inverse().transpose()
        pairing = lattice.pairing_matrix()
        relation_action = pairing * dual_frobenius * pairing.inverse()
        if any(sage.QQ(value)._denominator != 1 for value in relation_action.list()):
            raise ArithmeticError(
                "Frobenius does not preserve the monodromy relation lattice"
            )
        self._frobenius = (
            self._smith_right.inverse() * dual_frobenius * self._smith_right
        )
        if any(sage.QQ(value)._denominator != 1 for value in self._frobenius.list()):
            raise ArithmeticError("Frobenius has nonintegral Smith coordinates")
        if self._smith.nrows() != lattice.rank():
            raise ArithmeticError("the monodromy Smith form has the wrong rank")

    def character_lattice(self) -> DegreeZeroBrandtLattice:
        return self._lattice

    def invariant_factors(self) -> tuple[Any, ...]:
        return self._invariants

    invariants = invariant_factors

    def order(self) -> Any:
        answer = sage.ZZ(1)
        for invariant in self._invariants:
            answer *= invariant
        return answer

    cardinality = order

    def abelian_group(self) -> Any:
        return _global("AbelianGroup")(list(self._invariants))

    def frobenius_matrix(self) -> Any:
        """Return Frobenius on the full Smith-coordinate presentation."""

        return self._frobenius

    def character_lattice_frobenius_matrix(self) -> Any:
        """Return Frobenius on the degree-zero character lattice."""

        return self._lattice_frobenius

    def certificate(self) -> BrandtComponentGroupCertificate:
        return BrandtComponentGroupCertificate(self)

    def _certificate_data(self) -> dict[str, Any]:
        module = self._lattice.ambient_module()
        return {
            "schema": "sagejs.modular-forms/brandt-component-group-v1",
            "discriminant": module.discriminant(),
            "conductor": module.conductor(),
            "class_fingerprints": module.class_fingerprints(),
            "weights": module.monodromy_weights(),
            "degree_zero_basis": tuple(
                tuple(value for value in row)
                for row in self._lattice.basis_matrix().rows()
            ),
            "pairing": tuple(
                tuple(value for value in row)
                for row in self._lattice.pairing_matrix().rows()
            ),
            "smith_diagonal": tuple(self._smith.diagonal()),
            "invariant_factors": self._invariants,
            "character_lattice_frobenius": tuple(
                tuple(value for value in row) for row in self._lattice_frobenius.rows()
            ),
            "smith_coordinate_frobenius": tuple(
                tuple(value for value in row) for row in self._frobenius.rows()
            ),
            "mass": module.mass(),
        }

    def __repr__(self) -> str:
        return "Brandt component group with invariants " + repr(self._invariants)

    __str__ = __repr__
    toString = __repr__


class BrandtComponentGroupCertificate:
    """Replayable exact certificate for a Brandt monodromy cokernel."""

    def __init__(self, group: BrandtComponentGroup) -> None:
        self._group = group
        self._data = group._certificate_data()

    def as_dict(self) -> dict[str, Any]:
        return dict(self._data)

    def verify(self) -> bool:
        group = self._group
        lattice = group.character_lattice()
        module = lattice.ambient_module()
        if not module.mass_certificate().verify():
            return False
        if lattice.rank() != module.dimension() - 1:
            return False
        if any(sum(row) != 0 for row in lattice.basis_matrix().rows()):
            return False
        replay = BrandtComponentGroup(lattice)
        return replay._certificate_data() == self._data

    def __repr__(self) -> str:
        return "Brandt component-group certificate for invariants " + repr(
            self._group.invariant_factors()
        )

    __str__ = __repr__
    toString = __repr__


def brandt_component_group(module: Any) -> BrandtComponentGroup:
    """Return the full modular-Jacobian component group at prime $D$."""

    return DegreeZeroBrandtLattice(module).component_group()


__all__ = [
    "BrandtComponentGroup",
    "BrandtComponentGroupCertificate",
    "DegreeZeroBrandtLattice",
    "brandt_component_group",
]
