"""Authenticated retained-certificate checks for first-order OM type trees.

The ordinary OM construction retains enough exact data to certify a complete
first-order `p`-regular tree without constructing the same tree a second time.
This module checks those retained relations directly and issues a live sealed
projection.  Deeper types and nonlinear representative towers are deliberately
outside this fast theorem and return `None`, leaving the full reconstruction
checker as their fallback.

The mathematical implication used here is the first-order `p`-regular
completeness criterion: exact irreducible factors of the reduction, exact
Newton sides, and squarefree residual factors partition the local degree and
prove completeness.  Ore's index theorem then identifies the sum of the side
indices with the retained local index.  Same-degree representative changes
are authenticated one step at a time from their retained predecessor, side,
and residual factor.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.om_types import (
    ModularFactor,
    NewtonPoint,
    NewtonSide,
    OMLevel,
    OMType,
    OMTypeTree,
    Polynomial,
    RationalValue,
    ResidualFactor,
    _certificate_text,
    _is_prime,
    _mod_polynomial,
    _residual_gcd,
    _residual_make_monic,
    _residual_normalize,
    _residual_power_reduce,
    _residual_sort_key,
    _residual_subtract,
    _residue_multiply,
    _residue_normalize,
    coefficient_valuation,
    factor_mod_prime,
    lower_newton_polygon,
    normalize_polynomial,
    p_adic_valuation,
    phi_adic_expansion,
    polygon_index,
    polynomial_add,
    polynomial_degree,
    polynomial_multiply,
    representative_from_residual_factor,
    residual_polynomial,
    stable_certificate_id,
)

AUTHENTICATED_OM_TREE_SCHEMA = (
    "sagejs.number-fields/authenticated-first-order-om-tree-v1"
)
AUTHENTICATED_OM_TREE_THEOREM = "first-order-p-regular-ore-index-v1"
_AUTHENTICATED_OM_TREE_TOKEN = object()


def _exact_integer(value: Any, *, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise TypeError("OM certificate integers must be exact integers")
    answer = int(value)
    if minimum is not None and answer < minimum:
        raise ValueError("an OM certificate integer is below its bound")
    return answer


def _polynomial_snapshot(polynomial: Polynomial) -> tuple[int, ...]:
    if type(polynomial) is not tuple:
        raise TypeError("OM polynomials must use immutable tuple storage")
    return tuple(_exact_integer(value) for value in polynomial)


def _residual_snapshot(value: tuple[Polynomial, ...]) -> tuple[Any, ...]:
    if type(value) is not tuple:
        raise TypeError("OM residual polynomials must use immutable tuple storage")
    return tuple(_polynomial_snapshot(coefficient) for coefficient in value)


def _rational_snapshot(value: RationalValue) -> tuple[int, int]:
    if type(value) is not RationalValue:
        raise TypeError("OM slopes and values must be normalized rationals")
    return (
        _exact_integer(value.numerator),
        _exact_integer(value.denominator, minimum=1),
    )


def _level_snapshot(level: OMLevel) -> tuple[Any, ...]:
    if type(level) is not OMLevel:
        raise TypeError("an OM level has the wrong record type")
    if type(level.optimized_away) is not bool or type(level.index_evidence) is not str:
        raise TypeError("an OM level has malformed state evidence")
    return (
        _exact_integer(level.order, minimum=1),
        _polynomial_snapshot(level.key_polynomial),
        _rational_snapshot(level.key_value),
        _rational_snapshot(level.slope),
        _polynomial_snapshot(level.residual_field_modulus),
        _residual_snapshot(level.residual_polynomial),
        _residual_snapshot(level.residual_factor),
        _exact_integer(level.ramification_index, minimum=1),
        _exact_integer(level.residue_degree, minimum=1),
        _exact_integer(level.multiplicity, minimum=1),
        _exact_integer(level.index_contribution, minimum=0),
        _exact_integer(level.representative_precision, minimum=1),
        _exact_integer(level.representative_step, minimum=0),
        level.optimized_away,
        level.index_evidence,
    )


def _type_snapshot(branch: OMType) -> tuple[Any, ...]:
    if type(branch) is not OMType:
        raise TypeError("an OM branch has the wrong record type")
    if (
        type(branch.branch_id) is not str
        or type(branch.parent_id) is not str
        or type(branch.complete) is not bool
        or type(branch.refinement_state) is not str
        or type(branch.levels) is not tuple
    ):
        raise TypeError("an OM branch has malformed state evidence")
    return (
        branch.branch_id,
        branch.parent_id,
        _exact_integer(branch.prime, minimum=2),
        _polynomial_snapshot(branch.initial_factor),
        _exact_integer(branch.initial_multiplicity, minimum=1),
        tuple(_level_snapshot(level) for level in branch.levels),
        _exact_integer(branch.branch_degree, minimum=1),
        branch.complete,
        branch.refinement_state,
    )


def _tree_snapshot(tree: OMTypeTree) -> tuple[Any, ...]:
    if type(tree) is not OMTypeTree:
        raise TypeError("an OM tree has the wrong record type")
    if (
        type(tree.initial_factors) is not tuple
        or type(tree.types) is not tuple
        or type(tree.complete) is not bool
        or type(tree.certificate_id) is not str
    ):
        raise TypeError("an OM tree has malformed state evidence")
    factors = []
    for factor in tree.initial_factors:
        if type(factor) is not ModularFactor:
            raise TypeError("an initial OM factor has the wrong record type")
        factors.append(
            (
                _polynomial_snapshot(factor.polynomial),
                _exact_integer(factor.multiplicity, minimum=1),
            )
        )
    return (
        _polynomial_snapshot(tree.polynomial),
        _exact_integer(tree.prime, minimum=2),
        tuple(factors),
        tuple(_type_snapshot(branch) for branch in tree.types),
        _exact_integer(tree.expected_index_valuation, minimum=0),
        tree.complete,
        _exact_integer(tree.precision, minimum=1),
        _exact_integer(tree.max_enumerated_candidates, minimum=1),
        _exact_integer(tree.max_representative_refinements, minimum=0),
        _exact_integer(tree.max_type_depth, minimum=1),
        tree.certificate_id,
    )


def _modular_product(factors: tuple[ModularFactor, ...], prime: int) -> Polynomial:
    product: Polynomial = (1,)
    for factor in factors:
        power = factor.polynomial
        exponent = factor.multiplicity
        while exponent:
            if exponent % 2:
                product = _mod_polynomial(polynomial_multiply(product, power), prime)
            exponent //= 2
            if exponent:
                power = _mod_polynomial(polynomial_multiply(power, power), prime)
    return product


def _initial_factorization_is_exact(tree: OMTypeTree) -> bool:
    prime = tree.prime
    factors = tree.initial_factors
    keys = []
    for factor in factors:
        polynomial = factor.polynomial
        if (
            polynomial_degree(polynomial) <= 0
            or polynomial[-1] != 1
            or _mod_polynomial(polynomial, prime) != polynomial
        ):
            return False
        keys.append((polynomial_degree(polynomial), polynomial))
        proof = factor_mod_prime(
            polynomial,
            prime,
            max_enumerated_candidates=tree.max_enumerated_candidates,
        )
        if (
            len(proof) != 1
            or proof[0].polynomial != polynomial
            or proof[0].multiplicity != 1
        ):
            return False
    return (
        tuple(keys) == tuple(sorted(keys))
        and len(set(keys)) == len(keys)
        and _modular_product(factors, prime) == _mod_polynomial(tree.polynomial, prime)
    )


def _maximum_coefficient_valuation(polynomial: Polynomial, prime: int) -> int:
    maximum = 0
    for coefficient in polynomial:
        valuation = p_adic_valuation(coefficient, prime)
        if valuation is not None and valuation > maximum:
            maximum = valuation
    return maximum


def _newton_sides_from_expansion(
    expansion: tuple[Polynomial, ...], prime: int
) -> tuple[NewtonSide, ...]:
    """Reuse the retained phi-adic expansion for the exact Newton sides."""
    points = []
    for exponent, coefficient in enumerate(expansion):
        valuation = coefficient_valuation(coefficient, prime)
        if valuation is not None:
            points.append(NewtonPoint(exponent, valuation))
    if len(points) < 2:
        return ()
    return lower_newton_polygon(tuple(points))


def _prime_divisors(value: int) -> tuple[int, ...]:
    divisors = []
    remaining = value
    candidate = 2
    while candidate * candidate <= remaining:
        if remaining % candidate == 0:
            divisors.append(candidate)
            while remaining % candidate == 0:
                remaining //= candidate
        candidate += 1
    if remaining > 1:
        divisors.append(remaining)
    return tuple(divisors)


def _residual_multiply(
    left: tuple[Polynomial, ...],
    right: tuple[Polynomial, ...],
    prime: int,
    modulus: Polynomial,
) -> tuple[Polynomial, ...]:
    if left == ((0,),) or right == ((0,),):
        return ((0,),)
    product: list[Polynomial] = [(0,)] * (len(left) + len(right) - 1)
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            value = _residue_multiply(left_value, right_value, prime, modulus)
            product[left_index + right_index] = _residue_normalize(
                polynomial_add(product[left_index + right_index], value),
                prime,
                modulus,
            )
    return _residual_normalize(tuple(product), prime, modulus)


def _residual_factor_is_irreducible(
    factor: tuple[Polynomial, ...], prime: int, modulus: Polynomial
) -> bool:
    normalized = _residual_normalize(factor, prime, modulus)
    if normalized != factor:
        return False
    factor = normalized
    degree = len(factor) - 1
    if degree <= 0 or _residual_make_monic(factor, prime, modulus) != factor:
        return False
    if degree == 1:
        return True
    field_size = prime ** polynomial_degree(modulus)
    variable = ((0,), (1,))
    for divisor in _prime_divisors(degree):
        frobenius = _residual_power_reduce(
            variable,
            field_size ** (degree // divisor),
            factor,
            prime,
            modulus,
        )
        difference = _residual_subtract(frobenius, variable, prime, modulus)
        if _residual_gcd(factor, difference, prime, modulus) != ((1,),):
            return False
    return (
        _residual_power_reduce(
            variable,
            field_size**degree,
            factor,
            prime,
            modulus,
        )
        == variable
    )


def _residual_factorization_is_exact(
    residual: tuple[Polynomial, ...],
    factors: tuple[ResidualFactor, ...],
    prime: int,
    modulus: Polynomial,
) -> bool:
    residual = _residual_normalize(residual, prime, modulus)
    if (
        not factors
        or residual == ((0,),)
        or _residual_make_monic(residual, prime, modulus) != residual
    ):
        return False
    keys = []
    product: tuple[Polynomial, ...] = ((1,),)
    expected_degree = len(residual) - 1
    supplied_degree = 0
    for factor in factors:
        if (
            type(factor) is not ResidualFactor
            or type(factor.multiplicity) is not int
            or factor.multiplicity < 1
            or not _residual_factor_is_irreducible(factor.polynomial, prime, modulus)
        ):
            return False
        if polynomial_degree(modulus) == 1:
            encoded = 0
            place = 1
            for coefficient in factor.polynomial[:-1]:
                encoded += coefficient[0] * place
                place *= prime
            key = (len(factor.polynomial) - 1, encoded)
        else:
            key = _residual_sort_key(factor.polynomial, prime, modulus)
        keys.append(key)
        supplied_degree += (len(factor.polynomial) - 1) * factor.multiplicity
        if supplied_degree > expected_degree:
            return False
        power = factor.polynomial
        exponent = factor.multiplicity
        while exponent:
            if exponent % 2:
                product = _residual_multiply(product, power, prime, modulus)
            exponent //= 2
            if exponent:
                power = _residual_multiply(power, power, prime, modulus)
    return (
        tuple(keys) == tuple(sorted(keys))
        and len(set(keys)) == len(keys)
        and supplied_degree == expected_degree
        and product == residual
    )


def _first_order_level_matches(
    level: OMLevel,
    *,
    prime: int,
    key: Polynomial,
    side: Any,
    residual: tuple[Polynomial, ...],
    factor: Any,
    maximum_valuation: int,
    step: int,
    optimized: bool,
    index_contribution: int,
) -> bool:
    evidence = "representative-optimized-away" if optimized else "ore-first-order-index"
    return (
        type(level) is OMLevel
        and level.order == 1
        and level.key_polynomial == key
        and level.key_value == -side.slope
        and level.slope == side.slope
        and level.residual_field_modulus == _mod_polynomial(key, prime)
        and level.residual_polynomial == residual
        and level.residual_factor == factor.polynomial
        and level.ramification_index == side.ramification_index
        and level.residue_degree == len(factor.polynomial) - 1
        and level.multiplicity == factor.multiplicity
        and level.index_contribution == index_contribution
        and level.representative_precision == maximum_valuation + step + 1
        and level.representative_step == step
        and level.optimized_away is optimized
        and level.index_evidence == evidence
    )


def _authenticate_first_order_relations(tree: OMTypeTree) -> bool:
    polynomial = tree.polynomial
    prime = tree.prime
    degree = polynomial_degree(polynomial)
    if (
        degree <= 0
        or normalize_polynomial(polynomial) != polynomial
        or polynomial[-1] != 1
        or not _is_prime(prime)
        or not tree.complete
        or not tree.types
        or not _initial_factorization_is_exact(tree)
    ):
        return False
    maximum_valuation = _maximum_coefficient_valuation(polynomial, prime)
    branch_cursor = 0
    total_degree = 0
    total_index = 0
    maximum_precision = maximum_valuation + 1
    for factor_index, initial_factor in enumerate(tree.initial_factors):
        if branch_cursor >= len(tree.types):
            return False
        factor_degree = polynomial_degree(initial_factor.polynomial)
        key = initial_factor.polynomial
        optimized_prefix: list[OMLevel] = []
        while True:
            expansion = phi_adic_expansion(polynomial, key)
            sides = _newton_sides_from_expansion(expansion, prime)
            residual_data = []
            for side in sides:
                residual = residual_polynomial(expansion, side, prime, key)
                residual_data.append((side, residual))
            first_branch = tree.types[branch_cursor]
            step = len(optimized_prefix)
            retained = (
                first_branch.levels[step] if len(first_branch.levels) > step else None
            )
            if retained is None or not retained.optimized_away:
                break
            if len(residual_data) != 1:
                return False
            side, residual = residual_data[0]
            repeated = ResidualFactor(retained.residual_factor, retained.multiplicity)
            modulus = _mod_polynomial(key, prime)
            if (
                repeated.multiplicity <= 1
                or len(repeated.polynomial) != 2
                or not _residual_factorization_is_exact(
                    residual, (repeated,), prime, modulus
                )
            ):
                return False
            representative = representative_from_residual_factor(
                key, side, repeated.polynomial, prime
            )
            if polynomial_degree(representative) != polynomial_degree(key):
                # A degree-raising representative enters a higher type and is
                # intentionally handled by the full reconstruction fallback.
                return False
            if (
                representative == key
                or len(optimized_prefix) >= tree.max_representative_refinements
            ):
                return False
            if not _first_order_level_matches(
                retained,
                prime=prime,
                key=key,
                side=side,
                residual=residual,
                factor=repeated,
                maximum_valuation=maximum_valuation,
                step=step,
                optimized=True,
                index_contribution=0,
            ):
                return False
            optimized_prefix.append(retained)
            maximum_precision = max(
                maximum_precision, retained.representative_precision
            )
            key = representative

        branch_prefix = "f" + str(factor_index)
        if optimized_prefix:
            branch_prefix += "o" + str(len(optimized_prefix) + 1)
        if not sides:
            if optimized_prefix or initial_factor.multiplicity != 1:
                return False
            branch = tree.types[branch_cursor]
            if not (
                type(branch) is OMType
                and branch.branch_id == branch_prefix
                and branch.parent_id == "root"
                and branch.prime == prime
                and branch.initial_factor == initial_factor.polynomial
                and branch.initial_multiplicity == initial_factor.multiplicity
                and branch.levels == ()
                and branch.branch_degree == factor_degree
                and branch.complete
                and branch.refinement_state == "complete"
            ):
                return False
            total_degree += branch.branch_degree
            branch_cursor += 1
            continue

        factor_local_degree = 0
        for side_index, (side, residual) in enumerate(residual_data):
            residual_factors = []
            residual_index = 0
            while branch_cursor + residual_index < len(tree.types):
                branch = tree.types[branch_cursor + residual_index]
                expected_id = (
                    branch_prefix + "s" + str(side_index) + "r" + str(residual_index)
                )
                if branch.branch_id != expected_id:
                    break
                step = len(optimized_prefix)
                if len(branch.levels) != step + 1:
                    return False
                level = branch.levels[-1]
                residual_factors.append(
                    ResidualFactor(level.residual_factor, level.multiplicity)
                )
                residual_index += 1
            factor_tuple = tuple(residual_factors)
            if not _residual_factorization_is_exact(
                residual,
                factor_tuple,
                prime,
                _mod_polynomial(key, prime),
            ):
                return False
            for residual_index, residual_factor in enumerate(factor_tuple):
                if residual_factor.multiplicity != 1:
                    return False
                if branch_cursor >= len(tree.types):
                    return False
                branch = tree.types[branch_cursor]
                step = len(optimized_prefix)
                level_index = (
                    factor_degree * polygon_index((side,)) if residual_index == 0 else 0
                )
                branch_degree = (
                    factor_degree
                    * side.ramification_index
                    * (len(residual_factor.polynomial) - 1)
                    * residual_factor.multiplicity
                )
                if not (
                    type(branch) is OMType
                    and branch.branch_id
                    == branch_prefix + "s" + str(side_index) + "r" + str(residual_index)
                    and branch.parent_id == branch_prefix + "s" + str(side_index)
                    and branch.prime == prime
                    and branch.initial_factor == initial_factor.polynomial
                    and branch.initial_multiplicity == initial_factor.multiplicity
                    and len(branch.levels) == step + 1
                    and tuple(branch.levels[:step]) == tuple(optimized_prefix)
                    and _first_order_level_matches(
                        branch.levels[-1],
                        prime=prime,
                        key=key,
                        side=side,
                        residual=residual,
                        factor=residual_factor,
                        maximum_valuation=maximum_valuation,
                        step=step,
                        optimized=False,
                        index_contribution=level_index,
                    )
                    and branch.branch_degree == branch_degree
                    and branch.complete
                    and branch.refinement_state == "complete"
                ):
                    return False
                maximum_precision = max(
                    maximum_precision, branch.levels[-1].representative_precision
                )
                factor_local_degree += branch_degree
                total_degree += branch_degree
                branch_cursor += 1
        if factor_local_degree != factor_degree * initial_factor.multiplicity:
            return False
        total_index += factor_degree * polygon_index(sides)
    if (
        branch_cursor != len(tree.types)
        or total_degree != degree
        or total_index != tree.expected_index_valuation
        or maximum_precision != tree.precision
    ):
        return False
    certificate_text = _certificate_text(
        polynomial,
        prime,
        tree.initial_factors,
        tree.types,
        tree.expected_index_valuation,
        tree.max_enumerated_candidates,
        tree.max_representative_refinements,
        tree.max_type_depth,
    )
    return tree.certificate_id == stable_certificate_id(certificate_text)


class AuthenticatedOMTreeProjection:
    """Immutable live seal for one relation-checked first-order OM tree."""

    def __init__(self, token: object, tree: OMTypeTree) -> None:
        if token is not _AUTHENTICATED_OM_TREE_TOKEN:
            raise TypeError("authenticated OM projections are module-issued")
        self.polynomial = tree.polynomial
        self.prime = tree.prime
        self.degree = polynomial_degree(tree.polynomial)
        self.expected_index_valuation = tree.expected_index_valuation
        self.precision = tree.precision
        self.certificate_id = tree.certificate_id
        self.theorem = AUTHENTICATED_OM_TREE_THEOREM
        self.__dict__["_source_tree"] = tree
        self.__dict__["_source_snapshot"] = _tree_snapshot(tree)
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("authenticated OM projections are immutable")
        self.__dict__[name] = value

    @property
    def proof_schema(self) -> str:
        return AUTHENTICATED_OM_TREE_SCHEMA

    @property
    def certified(self) -> bool:
        try:
            source = self.__dict__.get("_source_tree")
            return (
                type(source) is OMTypeTree
                and self.theorem == AUTHENTICATED_OM_TREE_THEOREM
                and self.__dict__.get("_authentication_snapshot")
                == _projection_snapshot(self)
                and self.__dict__.get("_source_snapshot") == _tree_snapshot(source)
            )
        except (ArithmeticError, AttributeError, TypeError, ValueError):
            return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": AUTHENTICATED_OM_TREE_SCHEMA,
            "certified": self.certified,
            "theorem": self.theorem,
            "polynomial": list(self.polynomial),
            "prime": self.prime,
            "degree": self.degree,
            "expected_index_valuation": self.expected_index_valuation,
            "precision": self.precision,
            "certificate_id": self.certificate_id,
        }


def _projection_snapshot(projection: AuthenticatedOMTreeProjection) -> tuple[Any, ...]:
    return (
        AUTHENTICATED_OM_TREE_SCHEMA,
        projection.theorem,
        projection.polynomial,
        projection.prime,
        projection.degree,
        projection.expected_index_valuation,
        projection.precision,
        projection.certificate_id,
    )


def authenticate_first_order_om_type_tree(
    tree: OMTypeTree | None,
) -> AuthenticatedOMTreeProjection | None:
    """Issue a live seal after checking every retained first-order relation."""
    if type(tree) is not OMTypeTree:
        return None
    try:
        _tree_snapshot(tree)
        if not _authenticate_first_order_relations(tree):
            return None
        projection = AuthenticatedOMTreeProjection(_AUTHENTICATED_OM_TREE_TOKEN, tree)
        projection.__dict__["_authentication_snapshot"] = _projection_snapshot(
            projection
        )
        return projection if projection.certified else None
    except (ArithmeticError, AttributeError, TypeError, ValueError):
        return None


def authenticated_om_tree_projection_matches(
    projection: Any,
    *,
    tree: OMTypeTree | None,
    polynomial: Polynomial,
    prime: int,
    expected_index_valuation: int,
) -> bool:
    """Bind a live authenticated tree to exact downstream proof inputs."""
    if (
        type(projection) is not AuthenticatedOMTreeProjection
        or type(tree) is not OMTypeTree
        or not projection.certified
    ):
        return False
    try:
        return (
            projection.__dict__.get("_source_tree") is tree
            and _polynomial_snapshot(polynomial) == projection.polynomial
            and _exact_integer(prime, minimum=2) == projection.prime
            and _exact_integer(expected_index_valuation, minimum=0)
            == projection.expected_index_valuation
        )
    except (AttributeError, TypeError, ValueError):
        return False


def validate_triangular_basis_with_authenticated_tree(
    polynomial: Polynomial,
    prime: int,
    projection: AuthenticatedOMTreeProjection,
    basis: tuple[Any, ...],
    expected_index_valuation: int,
) -> Any:
    """Check containment, closure, and index once after tree authentication.

    This is the downstream half of the split proof.  It intentionally reuses
    the existing packed closure kernel and returns the established
    `BasisValidation` record, but it does not reconstruct the type tree.
    """
    from sagejs.number_fields.om_maxmin import (
        BasisValidation,
        TriangularBasisElement,
        _basis_coordinates_are_integral,
        packed_triangular_basis_is_closed,
    )

    failures: list[str] = []
    tree = (
        projection.__dict__.get("_source_tree")
        if type(projection) is AuthenticatedOMTreeProjection
        else None
    )
    tree_valid = authenticated_om_tree_projection_matches(
        projection,
        tree=tree,
        polynomial=polynomial,
        prime=prime,
        expected_index_valuation=expected_index_valuation,
    )
    if not tree_valid:
        failures.append("authenticated OM type-tree projection is stale or mismatched")
    degree = polynomial_degree(polynomial)
    contains_one = (
        bool(basis)
        and type(basis[0]) is TriangularBasisElement
        and basis[0].numerator == (1,)
        and basis[0].denominator == 1
    )
    if not contains_one:
        failures.append("basis does not begin with one")
    triangular = type(basis) is tuple and len(basis) == degree
    if not triangular:
        failures.append("basis rank differs from polynomial degree")
    else:
        for index, element in enumerate(basis):
            if (
                type(element) is not TriangularBasisElement
                or polynomial_degree(element.numerator) != index
                or element.numerator[-1] != 1
                or element.denominator != prime**element.denominator_exponent
            ):
                triangular = False
                failures.append(
                    "basis is not exact monic triangular at degree " + str(index)
                )
                break
    contains_equation_order = triangular
    if triangular:
        for exponent in range(degree):
            monomial = (0,) * exponent + (1,)
            if not _basis_coordinates_are_integral(monomial, 1, basis):
                contains_equation_order = False
                failures.append("equation-order monomial is not contained")
                break
    multiplication_closed = triangular
    if triangular and any(element.denominator != 1 for element in basis):
        packed_numerators: list[int] = []
        coefficient_bound = 1
        for coefficient in polynomial:
            coefficient_bound = max(coefficient_bound, abs(coefficient))
        for element in basis:
            packed_numerators.extend(element.numerator)
            packed_numerators.extend([0] * (degree - len(element.numerator)))
            for coefficient in element.numerator:
                coefficient_bound = max(coefficient_bound, abs(coefficient))
        workspace = [0] * (degree * 2 - 1)
        workspace[0] = (coefficient_bound + 1) ** (2 * degree + 2)
        multiplication_closed = packed_triangular_basis_is_closed(
            workspace,
            packed_numerators,
            [element.denominator for element in basis],
            list(polynomial),
            degree,
        )
        if not multiplication_closed:
            failures.append("basis multiplication is not integral")
    local_index = (
        sum(element.denominator_exponent for element in basis)
        if type(basis) is tuple
        and all(type(element) is TriangularBasisElement for element in basis)
        else -1
    )
    index_matches = local_index == expected_index_valuation
    if not index_matches:
        failures.append("basis denominator index differs from Ore polygon index")
    locally_maximal = (
        tree_valid
        and index_matches
        and contains_equation_order
        and multiplication_closed
    )
    return BasisValidation(
        not failures and locally_maximal,
        contains_one,
        contains_equation_order,
        multiplication_closed,
        index_matches,
        locally_maximal,
        tuple(failures),
    )


__all__ = [
    "AUTHENTICATED_OM_TREE_SCHEMA",
    "AUTHENTICATED_OM_TREE_THEOREM",
    "AuthenticatedOMTreeProjection",
    "authenticate_first_order_om_type_tree",
    "authenticated_om_tree_projection_matches",
    "validate_triangular_basis_with_authenticated_tree",
]
