"""Certified rational component groups for hyperelliptic Jacobians.

For a semistable Jacobian, the geometric component group is the
discriminant group of the monodromy lattice

```text
Phi(Fbar_p) = L^dual / L.
```

If `M` is the Gram matrix of the length pairing and `F` is Frobenius on
`L`, this is `coker(M)` and Frobenius on the dual coordinates is
`D = (F^-1)^transpose`.  The rational Tamagawa number is the order of
`ker(D - 1)` on `coker(M)`.  Exact self-duality identifies the invariant
factors of this kernel with those of

```text
coker([M | D - 1]).
```

The implementation below computes these presentations by determinantal
divisors.  The relevant lattices have rank at most three for genus 2 and 3,
so this small, ordinary-Python algorithm is both transparent and practical.
It has no native-host dependency and is safe to use in the dynamic and Wasm
fallbacks.

The split-cluster conversion implements Theorem D.18 of Dokchitser--
Dokchitser--Maistret--Morgan, *Arithmetic of hyperelliptic curves over local
fields*. Curve-level claims require a freshly bound internal local-reduction
record; arbitrary deserialized records and supplied lattices remain explicitly
conditional inputs.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any

TAMAGAWA_CERTIFICATE_SCHEMA = "sagejs.hyperelliptic.tamagawa.v1"
SPLIT_CLUSTER_REPLAY_SCHEMA = "sagejs.hyperelliptic.split-cluster-replay.v1"
BOUND_LOCAL_REPLAY_SCHEMA = "sagejs.hyperelliptic.bound-local-reduction.v1"


class TamagawaUnsupportedError(NotImplementedError):
    """A local reduction record does not certify a rational component group."""

    def __init__(self, result: TamagawaData) -> None:
        super().__init__(result.reason)
        self.result = result


class TamagawaData:
    """One certified or explicitly unsupported local Tamagawa result."""

    def __init__(
        self,
        prime: int,
        status: str,
        *,
        method: str,
        reason: str,
        provenance: str = "unknown",
        geometric_order: int | None = None,
        geometric_invariants: list[int] | tuple[int, ...] | None = None,
        rational_order: int | None = None,
        rational_invariants: list[int] | tuple[int, ...] | None = None,
        certificate: dict[str, Any] | None = None,
    ) -> None:
        self.prime = _exact_integer(prime, "prime")
        self.status = str(status)
        self.method = str(method)
        self.reason = str(reason)
        self.provenance = str(provenance)
        self.certified = self.status == "certified"
        self.curve_certified = self.certified and self.provenance in [
            "curve_local_good",
            "curve_local_almost_good",
            "replayed_cluster_certificate",
            "replayed_weighted_graph_certificate",
        ]
        self.geometric_order = (
            None
            if geometric_order is None
            else _exact_integer(geometric_order, "geometric_order")
        )
        self.geometric_invariants = (
            None
            if geometric_invariants is None
            else tuple(
                _exact_integer(value, "geometric invariant")
                for value in geometric_invariants
            )
        )
        self.rational_order = (
            None
            if rational_order is None
            else _exact_integer(rational_order, "rational_order")
        )
        self.rational_invariants = (
            None
            if rational_invariants is None
            else tuple(
                _exact_integer(value, "rational invariant")
                for value in rational_invariants
            )
        )
        self.certificate = {} if certificate is None else dict(certificate)

    def __getitem__(self, name: str) -> Any:
        if not hasattr(self, name):
            raise KeyError(name)
        return getattr(self, name)

    def __repr__(self) -> str:
        if self.certified:
            return (
                "TamagawaData(prime="
                + str(self.prime)
                + ", rational_order="
                + str(self.rational_order)
                + ", geometric_order="
                + str(self.geometric_order)
                + ", method="
                + repr(self.method)
                + ")"
            )
        return (
            "TamagawaData(prime="
            + str(self.prime)
            + ", status="
            + repr(self.status)
            + ", reason="
            + repr(self.reason)
            + ")"
        )

    def tamagawa_number(self) -> int:
        """Return `#Phi(F_p)`, raising when it was not certified."""
        if not self.certified or self.rational_order is None:
            raise TamagawaUnsupportedError(self)
        return self.rational_order

    def to_dict(self) -> dict[str, Any]:
        """Return a deterministic, JSON-friendly record."""
        return {
            "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
            "prime": self.prime,
            "status": self.status,
            "certified": self.certified,
            "curve_certified": self.curve_certified,
            "method": self.method,
            "reason": self.reason,
            "provenance": self.provenance,
            "geometric_component_group_order": self.geometric_order,
            "geometric_component_group_invariants": (
                None
                if self.geometric_invariants is None
                else list(self.geometric_invariants)
            ),
            "rational_component_group_order": self.rational_order,
            "rational_component_group_invariants": (
                None
                if self.rational_invariants is None
                else list(self.rational_invariants)
            ),
            "certificate": dict(self.certificate),
        }


def _read(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value[name] if name in value else default
    return getattr(value, name, default)


def _exact_integer(value: Any, name: str) -> int:
    """Coerce a provably integral exact scalar without truncation."""
    if isinstance(value, (bool, float, str, bytes)):
        raise TypeError(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError):
        raise TypeError(name + " must be an exact integer") from None
    try:
        equal = value == answer
    except Exception:
        equal = False
    if equal is not True:
        raise TypeError(name + " must be an exact integer")
    return answer


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


def _matrix(values: Any, name: str, *, square: bool = False) -> list[list[int]]:
    try:
        rows = [
            [_exact_integer(entry, name + " entry") for entry in row] for row in values
        ]
    except (TypeError, ValueError):
        raise TypeError(name + " must be an integer matrix") from None
    if not rows:
        return []
    columns = len(rows[0])
    if any(len(row) != columns for row in rows):
        raise ValueError(name + " has rows of different lengths")
    if square and len(rows) != columns:
        raise ValueError(name + " must be square")
    return rows


def _identity(size: int) -> list[list[int]]:
    return [
        [1 if row == column else 0 for column in range(size)] for row in range(size)
    ]


def _transpose(matrix: list[list[int]]) -> list[list[int]]:
    if not matrix:
        return []
    return [
        [matrix[row][column] for row in range(len(matrix))]
        for column in range(len(matrix[0]))
    ]


def _multiply(left: list[list[int]], right: list[list[int]]) -> list[list[int]]:
    if not left:
        return []
    if not right:
        if len(left[0]) != 0:
            raise ValueError("matrix dimensions do not agree")
        return [[] for _row in left]
    if len(left[0]) != len(right):
        raise ValueError("matrix dimensions do not agree")
    return [
        [
            sum(left[row][inner] * right[inner][column] for inner in range(len(right)))
            for column in range(len(right[0]))
        ]
        for row in range(len(left))
    ]


def _determinant(matrix: list[list[int]]) -> int:
    """Return an exact determinant using fraction-free elimination."""
    size = len(matrix)
    if size == 0:
        return 1
    if any(len(row) != size for row in matrix):
        raise ValueError("determinant requires a square matrix")
    work = [list(row) for row in matrix]
    sign = 1
    previous = 1
    for pivot_column in range(size - 1):
        pivot_row = pivot_column
        while pivot_row < size and work[pivot_row][pivot_column] == 0:
            pivot_row += 1
        if pivot_row == size:
            return 0
        if pivot_row != pivot_column:
            work[pivot_column], work[pivot_row] = (
                work[pivot_row],
                work[pivot_column],
            )
            sign = -sign
        pivot = work[pivot_column][pivot_column]
        for row in range(pivot_column + 1, size):
            for column in range(pivot_column + 1, size):
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_column] * work[pivot_column][column]
                )
                if numerator % previous != 0:
                    raise ArithmeticError("fraction-free determinant division failed")
                work[row][column] = numerator // previous
        previous = pivot
    return sign * work[size - 1][size - 1]


def _minor(
    matrix: list[list[int]],
    row_indices: tuple[int, ...],
    column_indices: tuple[int, ...],
) -> int:
    return _determinant(
        [[matrix[row][column] for column in column_indices] for row in row_indices]
    )


def _smith_data(matrix: list[list[int]]) -> dict[str, Any]:
    """Compute Smith invariant factors from exact determinantal divisors."""
    if not matrix:
        return {"rank": 0, "determinantal_divisors": [], "invariants": []}
    row_count = len(matrix)
    column_count = len(matrix[0])
    divisors = []
    previous = 1
    invariants = []
    for size in range(1, min(row_count, column_count) + 1):
        divisor = 0
        for rows in combinations(range(row_count), size):
            for columns in combinations(range(column_count), size):
                divisor = _gcd(divisor, _minor(matrix, rows, columns))
                if divisor == 1:
                    break
            if divisor == 1:
                break
        if divisor == 0:
            break
        if divisor % previous != 0:
            raise ArithmeticError("invalid determinantal divisors")
        invariants.append(divisor // previous)
        divisors.append(divisor)
        previous = divisor
    return {
        "rank": len(invariants),
        "determinantal_divisors": divisors,
        "invariants": invariants,
    }


def _unimodular_inverse(matrix: list[list[int]]) -> list[list[int]]:
    size = len(matrix)
    determinant = _determinant(matrix)
    if determinant not in [-1, 1]:
        raise ValueError("Frobenius on the lattice must be unimodular")
    if size == 0:
        return []
    cofactors = []
    for row in range(size):
        cofactor_row = []
        for column in range(size):
            submatrix = [
                [
                    matrix[source_row][source_column]
                    for source_column in range(size)
                    if source_column != column
                ]
                for source_row in range(size)
                if source_row != row
            ]
            cofactor_row.append(((-1) ** (row + column)) * _determinant(submatrix))
        cofactors.append(cofactor_row)
    adjugate = _transpose(cofactors)
    return [[entry // determinant for entry in row] for row in adjugate]


def _subtract_identity(matrix: list[list[int]]) -> list[list[int]]:
    return [
        [
            matrix[row][column] - (1 if row == column else 0)
            for column in range(len(matrix))
        ]
        for row in range(len(matrix))
    ]


def _horizontal(left: list[list[int]], right: list[list[int]]) -> list[list[int]]:
    if len(left) != len(right):
        raise ValueError("matrix row counts do not agree")
    return [list(left[row]) + list(right[row]) for row in range(len(left))]


def _positive_definite(matrix: list[list[int]]) -> bool:
    return all(
        _determinant([row[:size] for row in matrix[:size]]) > 0
        for size in range(1, len(matrix) + 1)
    )


def _nontrivial_invariants(values: Any) -> list[int]:
    answer = []
    for value in values:
        exact = _exact_integer(value, "Smith invariant")
        if exact > 1:
            answer.append(exact)
    return answer


def _component_group_from_lattice(
    pairing_matrix: Any,
    frobenius_matrix: Any | None = None,
    *,
    prime: int,
    method: str,
    source: dict[str, Any],
    provenance: str,
) -> TamagawaData:
    pairing = _matrix(pairing_matrix, "pairing_matrix", square=True)
    rank = len(pairing)
    frobenius = (
        _identity(rank)
        if frobenius_matrix is None
        else _matrix(frobenius_matrix, "frobenius_matrix", square=True)
    )
    if len(frobenius) != rank:
        raise ValueError("pairing and Frobenius matrices have different ranks")
    if pairing != _transpose(pairing):
        raise ValueError("the monodromy pairing must be symmetric")
    if not _positive_definite(pairing):
        raise ValueError("the monodromy pairing must be positive definite")
    inverse = _unimodular_inverse(frobenius)
    if _multiply(_multiply(_transpose(frobenius), pairing), frobenius) != pairing:
        raise ValueError("Frobenius does not preserve the monodromy pairing")
    dual_frobenius = _transpose(inverse)
    fixed_operator = _subtract_identity(dual_frobenius)
    fixed_presentation = _horizontal(pairing, fixed_operator)
    geometric_smith = _smith_data(pairing)
    rational_smith = _smith_data(fixed_presentation)
    if geometric_smith["rank"] != rank or rational_smith["rank"] != rank:
        raise ArithmeticError("a component-group presentation has deficient rank")
    geometric_order = (
        1 if rank == 0 else int(geometric_smith["determinantal_divisors"][-1])
    )
    rational_order = (
        1 if rank == 0 else int(rational_smith["determinantal_divisors"][-1])
    )
    certificate = {
        "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
        "kind": "monodromy-lattice",
        "provenance": provenance,
        "rank": rank,
        "pairing_matrix": pairing,
        "frobenius_on_homology": frobenius,
        "frobenius_on_dual": dual_frobenius,
        "fixed_operator_on_dual": fixed_operator,
        "fixed_coinvariant_presentation": fixed_presentation,
        "geometric_smith": geometric_smith,
        "rational_fixed_smith": rational_smith,
        "geometric_component_group_order": geometric_order,
        "rational_component_group_order": rational_order,
        "fixed_group_theorem": (
            "ker(F-1) is dual to coker(F-1) under the perfect "
            "Frobenius-invariant discriminant pairing"
        ),
        "source": dict(source),
    }
    return TamagawaData(
        prime,
        "certified",
        method=method,
        reason="exact Frobenius-fixed monodromy discriminant group",
        provenance=provenance,
        geometric_order=geometric_order,
        geometric_invariants=_nontrivial_invariants(geometric_smith["invariants"]),
        rational_order=rational_order,
        rational_invariants=_nontrivial_invariants(rational_smith["invariants"]),
        certificate=certificate,
    )


def component_group_from_lattice(
    pairing_matrix: Any,
    frobenius_matrix: Any | None = None,
    *,
    prime: int = 0,
    source: dict[str, Any] | None = None,
) -> TamagawaData:
    """Compute component groups conditional on a supplied exact lattice.

    `pairing_matrix` is the supplied Gram matrix on `H_1` and
    `frobenius_matrix` is the supplied Frobenius action on that basis.
    Omitting Frobenius means a supplied trivial action.  The returned group
    calculation is exact, but `curve_certified` is false: this function does
    not establish that the lattice belongs to any curve.
    """
    return _component_group_from_lattice(
        pairing_matrix,
        frobenius_matrix,
        prime=_exact_integer(prime, "prime"),
        method="supplied-monodromy-lattice",
        source={} if source is None else dict(source),
        provenance="supplied_lattice",
    )


def _certificate_bool(record: dict[str, Any], name: str) -> bool:
    value = record.get(name)
    if not isinstance(value, bool):
        raise TypeError("cluster " + name + " must be a boolean")
    return value


def _flatten_cluster_tree(
    top: dict[str, Any], genus: int
) -> tuple[list[Any], dict[Any, Any]]:
    nodes: list[dict[str, Any]] = []
    parents: dict[tuple[int, ...], tuple[int, ...] | None] = {}

    def visit(node: dict[str, Any], parent: dict[str, Any] | None) -> None:
        if not isinstance(node, dict):
            raise TypeError("every cluster node must be a record")
        root_values = node.get("root_indices")
        if not isinstance(root_values, (list, tuple)) or not root_values:
            raise ValueError("every cluster must contain root indices")
        roots = tuple(
            _exact_integer(value, "cluster root index") for value in root_values
        )
        if any(value < 0 for value in roots):
            raise ValueError("cluster root indices must be nonnegative")
        if tuple(sorted(roots)) != roots or len(set(roots)) != len(roots):
            raise ValueError("cluster root indices must be strictly increasing")
        if roots in parents:
            raise ValueError("the cluster certificate repeats a root set")
        children = node.get("children")
        if not isinstance(children, (list, tuple)):
            raise TypeError("cluster children must be a sequence")
        if len(roots) == 1:
            if node.get("depth") is not None or children:
                raise ValueError(
                    "singleton clusters must have null depth and no children"
                )
            depth = None
        else:
            depth = _exact_integer(node.get("depth"), "cluster depth")
            if len(children) < 2:
                raise ValueError("a proper cluster must have at least two children")
            if parent is not None and depth <= parent["depth"]:
                raise ValueError("proper cluster depths must increase strictly")
        copied: dict[str, Any] = {
            "roots": roots,
            "depth": depth,
            "principal": _certificate_bool(node, "principal"),
            "ubereven": _certificate_bool(node, "ubereven"),
            "children": [],
        }
        if parent is not None and not set(roots) < set(parent["roots"]):
            raise ValueError("a child cluster must be a strict subset of its parent")
        parents[roots] = None if parent is None else parent["roots"]
        nodes.append(copied)
        child_sets = []
        for child in children:
            child_values = (
                child.get("root_indices") if isinstance(child, dict) else None
            )
            if not isinstance(child_values, (list, tuple)):
                raise TypeError("every child cluster must contain root indices")
            child_roots = tuple(
                _exact_integer(value, "child cluster root index")
                for value in child_values
            )
            copied["children"].append(child_roots)
            child_set = set(child_roots)
            if any(child_set.intersection(other) for other in child_sets):
                raise ValueError("sibling clusters must be disjoint")
            child_sets.append(child_set)
            visit(child, copied)
        if child_sets:
            union = set()
            for child_set in child_sets:
                union.update(child_set)
            if union != set(roots):
                raise ValueError("cluster children must partition their parent")

    visit(top, None)
    lookup = {node["roots"]: node for node in nodes}
    top_roots = nodes[0]["roots"]
    if len(top_roots) not in [2 * genus + 1, 2 * genus + 2]:
        raise ValueError("the top cluster size does not match the stated genus")
    if top_roots != tuple(range(len(top_roots))):
        raise ValueError("the top cluster must index every root exactly once")
    top_node = nodes[0]
    for node in nodes:
        expected_ubereven = len(node["roots"]) % 2 == 0 and all(
            len(child) % 2 == 0 for child in node["children"]
        )
        if node["ubereven"] != expected_ubereven:
            raise ValueError("a cluster has an inconsistent ubereven flag")
        cotwin = not expected_ubereven and any(
            len(child) == 2 * genus for child in node["children"]
        )
        expected_principal = len(node["roots"]) > 2 and not cotwin
        if node is top_node and len(node["roots"]) % 2 == 0 and not cotwin:
            expected_principal = len(node["children"]) >= 3
        if node["principal"] != expected_principal:
            raise ValueError("a cluster has an inconsistent principal flag")
    return nodes, {
        key: (None if value is None else lookup[value])
        for key, value in parents.items()
    }


def _cluster_cotwin(node: dict[str, Any], genus: int) -> bool:
    return not node["ubereven"] and any(
        len(child) == 2 * genus for child in node["children"]
    )


def _cluster_star(
    node: dict[str, Any],
    lookup: dict[Any, Any],
    parents: dict[Any, Any],
    genus: int,
) -> dict[str, Any]:
    if _cluster_cotwin(node, genus):
        for child in node["children"]:
            if len(child) == 2 * genus:
                return lookup[child]
        raise ArithmeticError("a cotwin has no child of size 2g")
    answer = node
    parent = parents[answer["roots"]]
    while parent is not None and parent["ubereven"]:
        answer = parent
        parent = parents[answer["roots"]]
    return answer


def _cluster_meet(
    left: dict[str, Any], right: dict[str, Any], nodes: list[Any]
) -> dict[str, Any]:
    union = set(left["roots"])
    union.update(right["roots"])
    candidates = [node for node in nodes if union.issubset(set(node["roots"]))]
    if not candidates:
        raise ArithmeticError("two clusters have no common parent")
    return min(candidates, key=lambda node: len(node["roots"]))


def _rational_reduce(numerator: int, denominator: int) -> tuple[int, int]:
    if denominator == 0:
        raise ZeroDivisionError("a certified rational denominator is zero")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    divisor = _gcd(numerator, denominator)
    return numerator // divisor, denominator // divisor


def _rational_subtract(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    return _rational_reduce(left[0] * right[1] - right[0] * left[1], left[1] * right[1])


def _rational_multiply(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    return _rational_reduce(left[0] * right[0], left[1] * right[1])


def _rational_valuation(value: tuple[int, int], prime: int) -> int:
    numerator, denominator = value
    if numerator == 0:
        raise ValueError("the split branch roots are not distinct")

    def valuation(integer: int) -> int:
        integer = abs(integer)
        answer = 0
        while integer % prime == 0:
            integer //= prime
            answer += 1
        return answer

    return valuation(numerator) - valuation(denominator)


def _rational_unit_mod(value: tuple[int, int], prime: int) -> int:
    numerator, denominator = value
    valuation = _rational_valuation(value, prime)
    if valuation >= 0:
        numerator //= prime**valuation
    else:
        denominator //= prime ** (-valuation)
    if denominator % prime == 0:
        raise ValueError("a rational unit retained a prime denominator")
    return numerator % prime * pow(denominator % prime, prime - 2, prime) % prime


def _split_root_evidence(
    certificate: dict[str, Any],
    prime: int,
    nodes: list[Any],
) -> tuple[list[tuple[int, int]], int]:
    if prime <= 2:
        raise ValueError("split-cluster replay requires an odd prime")
    raw_roots = certificate.get("rational_roots")
    if not isinstance(raw_roots, (list, tuple)) or len(raw_roots) != len(
        nodes[0]["roots"]
    ):
        raise ValueError("the split-cluster root evidence has the wrong size")
    roots = []
    for raw in raw_roots:
        if not isinstance(raw, (list, tuple)) or len(raw) != 2:
            raise ValueError("a rational root must be a numerator/denominator pair")
        roots.append(
            _rational_reduce(
                _exact_integer(raw[0], "root numerator"),
                _exact_integer(raw[1], "root denominator"),
            )
        )
    for left in range(len(roots)):
        for right in range(left + 1, len(roots)):
            valuation = _rational_valuation(
                _rational_subtract(roots[left], roots[right]), prime
            )
            if valuation < 0:
                raise ValueError("the split roots are not p-integrally separated")
            meet = _cluster_meet(
                next(node for node in nodes if node["roots"] == (left,)),
                next(node for node in nodes if node["roots"] == (right,)),
                nodes,
            )
            if meet["depth"] != valuation:
                raise ValueError("the cluster tree depth disagrees with its roots")
    branch = certificate.get("completed_branch_coefficients_ascending")
    if not isinstance(branch, (list, tuple)) or len(branch) != len(roots) + 1:
        raise ValueError("the completed branch polynomial has the wrong degree")
    branch_values = [
        _exact_integer(value, "completed branch coefficient") for value in branch
    ]
    leading = branch_values[-1]
    if leading == 0:
        raise ValueError("the completed branch polynomial has zero leading coefficient")
    polynomial = [(leading, 1)]
    for root in roots:
        next_polynomial = [(0, 1) for _index in range(len(polynomial) + 1)]
        for index, coefficient in enumerate(polynomial):
            next_polynomial[index] = _rational_subtract(
                next_polynomial[index], _rational_multiply(coefficient, root)
            )
            next_polynomial[index + 1] = _rational_reduce(
                next_polynomial[index + 1][0] * coefficient[1]
                + coefficient[0] * next_polynomial[index + 1][1],
                next_polynomial[index + 1][1] * coefficient[1],
            )
        polynomial = next_polynomial
    if any(
        denominator != 1 or numerator != branch_values[index]
        for index, (numerator, denominator) in enumerate(polynomial)
    ):
        raise ValueError("the rational roots do not reconstruct the branch polynomial")
    return roots, leading


def _replayed_frobenius_sign(
    star: dict[str, Any],
    roots: list[tuple[int, int]],
    leading: int,
    prime: int,
) -> int:
    theta = (leading, 1)
    center = roots[star["roots"][0]]
    for index, root in enumerate(roots):
        if index not in star["roots"]:
            theta = _rational_multiply(theta, _rational_subtract(center, root))
    unit = _rational_unit_mod(theta, prime)
    character = pow(unit, (prime - 1) // 2, prime)
    if character == 1:
        return 1
    if character == prime - 1:
        return -1
    raise ValueError("a replayed theta value is not a p-adic unit")


def _cluster_lattice(
    local_data: Any, *, trusted_internal: bool = False
) -> tuple[list[list[int]], list[list[int]], dict[str, Any]]:
    certificate = _read(local_data, "certificate", {})
    if not trusted_internal and _read(local_data, "record_schema", None) != (
        SPLIT_CLUSTER_REPLAY_SCHEMA
    ):
        raise ValueError("the cluster record has no recognized replay schema")
    if not isinstance(certificate, dict) or certificate.get("theorem") != (
        "split semistable cluster-picture decomposition"
    ):
        raise ValueError("the cluster certificate theorem is not recognized")
    if certificate.get("frobenius_action") != "split-diagonal-with-theta-signs":
        raise ValueError("the split-cluster Frobenius schema is not recognized")
    top_record = certificate.get("cluster_picture")
    toric_basis = certificate.get("toric_basis")
    if not isinstance(top_record, dict) or not isinstance(toric_basis, (list, tuple)):
        raise ValueError("the split-cluster certificate has no cluster lattice data")
    genus = _exact_integer(_read(local_data, "genus", 0), "genus")
    if genus not in [2, 3]:
        raise ValueError("the cluster component-group path requires genus 2 or 3")
    nodes, parents = _flatten_cluster_tree(top_record, genus)
    prime = _exact_integer(_read(local_data, "prime", 0), "prime")
    rational_roots, leading = _split_root_evidence(certificate, prime, nodes)
    lookup = {node["roots"]: node for node in nodes}
    top = lookup[
        tuple(
            _exact_integer(value, "top cluster root index")
            for value in top_record["root_indices"]
        )
    ]
    proper_nodes = [node for node in nodes if len(node["roots"]) > 1]
    cluster_basis = [
        node
        for node in proper_nodes
        if node is not top and len(node["roots"]) % 2 == 0 and not node["ubereven"]
    ]
    cluster_basis.sort(key=lambda node: (len(node["roots"]), node["roots"]))
    positions = {node["roots"]: index for index, node in enumerate(cluster_basis)}
    stars = {
        node["roots"]: _cluster_star(node, lookup, parents, genus)
        for node in cluster_basis
    }
    ambient = []
    for left in cluster_basis:
        row = []
        for right in cluster_basis:
            left_star = stars[left["roots"]]
            right_star = stars[right["roots"]]
            if left_star["roots"] != right_star["roots"]:
                row.append(0)
                continue
            meet = _cluster_meet(left, right, nodes)
            if left_star is top:
                base_depth = top["depth"]
            else:
                parent = parents[left_star["roots"]]
                if parent is None:
                    raise ArithmeticError("a non-top star has no parent")
                base_depth = parent["depth"]
            if meet["depth"] is None or base_depth is None:
                raise ValueError("the cluster lattice has an unknown metric depth")
            row.append(2 * (int(meet["depth"]) - int(base_depth)))
        ambient.append(row)
    top_star = [
        node for node in cluster_basis if stars[node["roots"]]["roots"] == top["roots"]
    ]
    relation_origin = None
    if top["ubereven"]:
        represented = [
            tuple(
                _exact_integer(value, "toric basis root index")
                for value in item["root_indices"]
            )
            for item in toric_basis
            if bool(item.get("relation_quotient", False))
        ]
        missing = [
            node
            for node in top_star
            if not any(node["roots"] == roots for roots in represented)
        ]
        if len(missing) != 1:
            raise ValueError("the ubereven top relation has no unique omitted cluster")
        relation_origin = missing[0]
    columns = []
    signs = []
    basis_certificate = []
    seen_basis_roots = []
    for item in toric_basis:
        if not isinstance(item, dict):
            raise TypeError("every toric basis item must be a record")
        roots = tuple(
            _exact_integer(value, "toric basis root index")
            for value in item["root_indices"]
        )
        if any(roots == seen for seen in seen_basis_roots):
            raise ValueError("the toric basis repeats a cluster")
        seen_basis_roots.append(roots)
        if roots not in positions:
            raise ValueError("a toric basis cluster is not in the homology lattice")
        star_roots = tuple(
            _exact_integer(value, "toric star root index")
            for value in item["star_root_indices"]
        )
        if star_roots != stars[roots]["roots"]:
            raise ValueError("a toric basis item has the wrong star cluster")
        column = [0 for _node in cluster_basis]
        column[positions[roots]] = 1
        relation_value = item.get("relation_quotient", False)
        if not isinstance(relation_value, bool):
            raise TypeError("relation_quotient must be a boolean")
        relation = relation_value
        relation_roots = None
        if relation:
            if relation_origin is None:
                raise ValueError("a relation quotient occurs without an ubereven top")
            if stars[roots]["roots"] != top["roots"]:
                raise ValueError("only a top-star cluster may use the top relation")
            relation_roots = relation_origin["roots"]
            column[positions[relation_roots]] = -1
        sign = _exact_integer(item["frobenius_sign"], "Frobenius sign")
        if sign not in [-1, 1]:
            raise ValueError("a split Frobenius sign is not +1 or -1")
        if sign != _replayed_frobenius_sign(
            stars[roots], rational_roots, leading, prime
        ):
            raise ValueError("a toric Frobenius sign disagrees with theta replay")
        columns.append(column)
        signs.append(sign)
        basis_certificate.append(
            {
                "root_indices": list(roots),
                "relation_origin": None
                if relation_roots is None
                else list(relation_roots),
                "ambient_coordinates": list(column),
                "frobenius_sign": sign,
            }
        )
    expected_cluster_rank = len(cluster_basis) - (1 if top["ubereven"] else 0)
    expected_rank = _exact_integer(
        _read(local_data, "toric_rank", len(columns)), "toric rank"
    )
    if expected_rank != expected_cluster_rank:
        raise ValueError("the cluster tree and local-data toric ranks disagree")
    if len(columns) != expected_rank:
        raise ValueError("the cluster and local-data toric ranks disagree")
    nonrelation_expected = [
        node["roots"]
        for node in cluster_basis
        if not top["ubereven"] or stars[node["roots"]]["roots"] != top["roots"]
    ]
    nonrelation_actual = [
        tuple(item["root_indices"])
        for item in toric_basis
        if not item.get("relation_quotient", False)
    ]
    if sorted(nonrelation_actual) != sorted(nonrelation_expected):
        raise ValueError("the toric basis omits or adds a nonrelation cluster")
    basis_matrix = (
        []
        if not columns
        else [
            [columns[column][row] for column in range(len(columns))]
            for row in range(len(cluster_basis))
        ]
    )
    pairing = (
        []
        if not columns
        else _multiply(_multiply(_transpose(basis_matrix), ambient), basis_matrix)
    )
    frobenius = [
        [signs[row] if row == column else 0 for column in range(len(signs))]
        for row in range(len(signs))
    ]
    graph_coefficients = [1]
    for sign in signs:
        next_coefficients = [0 for _index in range(len(graph_coefficients) + 1)]
        for index, value in enumerate(graph_coefficients):
            next_coefficients[index] += value
            next_coefficients[index + 1] -= sign * value
        graph_coefficients = next_coefficients
    recorded_graph = certificate.get("dual_graph_euler_coefficients")
    if (
        not isinstance(recorded_graph, (list, tuple))
        or [
            _exact_integer(value, "dual graph Euler coefficient")
            for value in recorded_graph
        ]
        != graph_coefficients
    ):
        raise ValueError("the toric basis and dual-graph Euler factor disagree")
    replay = {
        "record_schema": SPLIT_CLUSTER_REPLAY_SCHEMA,
        "prime": prime,
        "genus": genus,
        "toric_rank": expected_rank,
        "reduction_type": "semistable_split_cluster",
        "certificate": dict(certificate),
    }
    source = {
        "theorem": "DDMM Theorem D.18 cluster homology and length pairing",
        "cluster_basis": [list(node["roots"]) for node in cluster_basis],
        "cluster_stars": {
            str(list(node["roots"])): list(stars[node["roots"]]["roots"])
            for node in cluster_basis
        },
        "ambient_pairing_matrix": ambient,
        "homology_basis": basis_certificate,
        "top_ubereven": top["ubereven"],
        "cluster_replay": replay,
    }
    return pairing, frobenius, source


def _unsupported(prime: int, status: str, reason: str) -> TamagawaData:
    return TamagawaData(
        prime,
        status,
        method="unsupported",
        reason=reason,
        provenance="unsupported",
        certificate={
            "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
            "kind": "unsupported",
            "status": status,
            "reason": reason,
        },
    )


def _curve_binding(curve: Any, prime: int) -> dict[str, Any]:
    model = curve._smalljac_integral_model_data()
    return {
        "schema": "sagejs.hyperelliptic.integral-model-binding.v1",
        "prime": prime,
        "genus": _exact_integer(curve.genus(), "curve genus"),
        "integral_f_coefficients": [
            _exact_integer(value, "integral f coefficient")
            for value in model["f_coefficients"]
        ],
        "integral_h_coefficients": [
            _exact_integer(value, "integral h coefficient")
            for value in model["h_coefficients"]
        ],
        "excluded_denominator": _exact_integer(
            model["excluded_denominator"], "excluded denominator"
        ),
        "transform_scale": _exact_integer(model["transform_scale"], "transform scale"),
        "y_weight": _exact_integer(model["y_weight"], "y weight"),
        "transform": str(model["transform"]),
    }


def _integer_polynomial_product(left: list[int], right: list[int]) -> list[int]:
    if not left or not right:
        return []
    answer = [0 for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value * right_value
    return answer


def _completed_branch_from_binding(binding: dict[str, Any]) -> list[int]:
    if binding.get("schema") != "sagejs.hyperelliptic.integral-model-binding.v1":
        raise ValueError("the integral-model binding schema is not recognized")
    f_values = [
        _exact_integer(value, "bound integral f coefficient")
        for value in binding.get("integral_f_coefficients", [])
    ]
    h_values = [
        _exact_integer(value, "bound integral h coefficient")
        for value in binding.get("integral_h_coefficients", [])
    ]
    if not f_values:
        raise ValueError("the integral-model binding has no f polynomial")
    branch = _integer_polynomial_product(h_values, h_values)
    if len(branch) < len(f_values):
        branch.extend([0 for _index in range(len(f_values) - len(branch))])
    for index, value in enumerate(f_values):
        branch[index] += 4 * value
    while len(branch) > 1 and branch[-1] == 0:
        branch.pop()
    return branch


def _valid_model_binding(binding: Any, prime: int) -> bool:
    if not isinstance(binding, dict):
        return False
    if binding.get("schema") != "sagejs.hyperelliptic.integral-model-binding.v1":
        return False
    if _exact_integer(binding.get("prime"), "bound prime") != prime:
        return False
    denominator = _exact_integer(
        binding.get("excluded_denominator"), "bound excluded denominator"
    )
    scale = _exact_integer(binding.get("transform_scale"), "bound transform scale")
    genus = _exact_integer(binding.get("genus"), "bound genus")
    y_weight = _exact_integer(binding.get("y_weight"), "bound y weight")
    return (
        denominator > 0
        and denominator == scale
        and denominator % prime != 0
        and genus in [2, 3]
        and y_weight == genus + 2
        and binding.get("transform") == "X=D*x, Y=D^M*y"
    )


def _trusted_local_record(local_data: Any) -> bool:
    module = __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["LocalReductionData"],
    )
    return isinstance(local_data, module.LocalReductionData)


def _local_boolean(local_data: Any, name: str) -> bool:
    value = _read(local_data, name, None)
    if not isinstance(value, bool):
        raise TypeError("local reduction " + name + " must be a boolean")
    return value


def _validate_bound_local_record(
    local_data: Any, curve: Any, expected_prime: int
) -> tuple[int, int, str, dict[str, Any], dict[str, Any]]:
    if not _trusted_local_record(local_data):
        raise ValueError(
            "the local reduction record is not an internal certified object"
        )
    prime = _exact_integer(_read(local_data, "prime", None), "local prime")
    if prime != expected_prime:
        raise ValueError("the local reduction record is bound to a different prime")
    genus = _exact_integer(_read(local_data, "genus", None), "local genus")
    if genus != _exact_integer(curve.genus(), "curve genus"):
        raise ValueError("the local reduction record is bound to a different genus")
    if _read(local_data, "certified", None) is not True:
        raise ValueError("the internal local reduction record is not certified")
    certificate = _read(local_data, "certificate", {})
    if not isinstance(certificate, dict):
        raise TypeError("the internal local certificate is not a record")
    reduction_type = _read(local_data, "reduction_type", None)
    backend = _read(local_data, "backend", None)
    if not isinstance(reduction_type, str) or not isinstance(backend, str):
        raise TypeError("local reduction type and backend must be strings")
    curve_good = _local_boolean(local_data, "curve_good_reduction")
    jacobian_good = _local_boolean(local_data, "jacobian_good_reduction")
    semistable = _read(local_data, "semistable", None)
    if semistable is not None and not isinstance(semistable, bool):
        raise TypeError("local semistable status must be boolean or null")
    toric_rank = _exact_integer(_read(local_data, "toric_rank", None), "toric rank")
    conductor = _exact_integer(
        _read(local_data, "conductor_exponent", None), "conductor exponent"
    )
    if toric_rank < 0 or conductor < 0:
        raise ValueError("local ranks and conductor exponents must be nonnegative")
    if curve_good and not jacobian_good:
        raise ValueError("good curve reduction contradicts bad Jacobian reduction")
    if jacobian_good and (toric_rank != 0 or conductor != 0):
        raise ValueError("good Jacobian reduction contradicts toric/conductor data")
    if reduction_type == "good":
        if not (curve_good and jacobian_good and semistable is True):
            raise ValueError("the good-reduction flags are contradictory")
        if backend != "good-reduction-frobenius" or certificate.get("theorem") != (
            "smooth proper base change"
        ):
            raise ValueError("the good-reduction certificate schema is not recognized")
    elif reduction_type.startswith("almost_good_type_"):
        kind = reduction_type[len("almost_good_type_") :]
        if (
            genus != 2
            or curve_good
            or not jacobian_good
            or backend != "maistret-sutherland"
            or certificate.get("theorem") != "Maistret-Sutherland Algorithm 7"
            or certificate.get("almost_good_type") != kind
        ):
            raise ValueError("the almost-good certificate fields are contradictory")
    elif reduction_type == "semistable_split_cluster":
        if (
            curve_good
            or semistable is not True
            or backend != "semistable-split-cluster-picture"
            or conductor != toric_rank
            or certificate.get("theorem")
            != "split semistable cluster-picture decomposition"
        ):
            raise ValueError("the split-cluster certificate fields are contradictory")
    elif reduction_type in ["semistable_nodal", "semistable_nodal_two_components"]:
        if (
            curve_good
            or jacobian_good
            or semistable is not True
            or backend != "semistable-normalization-graph"
            or conductor != toric_rank
            or certificate.get("theorem")
            != "normalization-dual-graph semistable factorization"
        ):
            raise ValueError("the nodal certificate fields are contradictory")
    else:
        raise ValueError("the internal local certificate schema is not recognized")
    binding = _curve_binding(curve, prime)
    return prime, genus, reduction_type, certificate, binding


def _bound_local_replay(local_data: Any) -> dict[str, Any]:
    return {
        "record_schema": BOUND_LOCAL_REPLAY_SCHEMA,
        "prime": _exact_integer(_read(local_data, "prime", None), "local prime"),
        "genus": _exact_integer(_read(local_data, "genus", None), "local genus"),
        "reduction_type": str(_read(local_data, "reduction_type", None)),
        "backend": str(_read(local_data, "backend", None)),
        "curve_good_reduction": _local_boolean(local_data, "curve_good_reduction"),
        "jacobian_good_reduction": _local_boolean(
            local_data, "jacobian_good_reduction"
        ),
        "semistable": _read(local_data, "semistable", None),
        "toric_rank": _exact_integer(
            _read(local_data, "toric_rank", None), "toric rank"
        ),
        "conductor_exponent": _exact_integer(
            _read(local_data, "conductor_exponent", None), "conductor exponent"
        ),
        "certificate": dict(_read(local_data, "certificate", {})),
    }


def _tamagawa_from_bound_local_reduction(
    local_data: Any, curve: Any, expected_prime: Any
) -> TamagawaData:
    """Derive `#Phi(F_p)` from a freshly curve-bound internal record.

    A duck-typed or deserialized record is never promoted to a curve-level
    certificate. Use `component_group_from_lattice` for an exact computation
    conditional on supplied lattice data.
    """
    try:
        displayed_prime = _exact_integer(_read(local_data, "prime", 0), "prime")
    except TypeError:
        displayed_prime = 0
    try:
        bound_prime = _exact_integer(expected_prime, "expected prime")
        prime, _genus, reduction_type, certificate, binding = (
            _validate_bound_local_record(local_data, curve, bound_prime)
        )
    except (ArithmeticError, KeyError, TypeError, ValueError) as error:
        return _unsupported(
            displayed_prime,
            "contradictory_local_record",
            "the local reduction record failed trust/binding checks: " + str(error),
        )
    if (
        certificate.get("model_is_minimal") is False
        or certificate.get("minimal_model_certified") is False
    ):
        return _unsupported(
            prime,
            "model_not_minimal",
            "the local record explicitly says that the model is not minimal",
        )
    if reduction_type == "semistable_split_cluster":
        try:
            pairing, frobenius, source = _cluster_lattice(
                local_data, trusted_internal=True
            )
            source["reduction_type"] = reduction_type
            source["local_theorem"] = certificate.get("theorem")
            source["model_binding"] = binding
            return _component_group_from_lattice(
                pairing,
                frobenius,
                prime=prime,
                method="split-semistable-cluster-monodromy",
                source=source,
                provenance="replayed_cluster_certificate",
            )
        except (ArithmeticError, KeyError, TypeError, ValueError) as error:
            return _unsupported(
                prime,
                "insufficient_component_data",
                "the split-cluster certificate does not determine a valid "
                + "integral monodromy lattice: "
                + str(error),
            )
    jacobian_good = _local_boolean(local_data, "jacobian_good_reduction")
    if jacobian_good and reduction_type in ["good"] + [
        "almost_good_type_" + kind for kind in ["1", "2a", "2b", "4"]
    ]:
        method = (
            "good-abelian-reduction"
            if reduction_type == "good"
            else "almost-good-jacobian-good-reduction"
        )
        proof = {
            "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
            "kind": "trivial-component-group",
            "provenance": (
                "curve_local_good"
                if reduction_type == "good"
                else "curve_local_almost_good"
            ),
            "reduction_type": reduction_type,
            "jacobian_good_reduction": True,
            "source_theorem": certificate.get("theorem"),
            "source_local_record": _bound_local_replay(local_data),
            "model_binding": binding,
            "geometric_component_group_order": 1,
            "rational_component_group_order": 1,
        }
        return TamagawaData(
            prime,
            "certified",
            method=method,
            reason="good reduction of the Jacobian has trivial component group",
            provenance=(
                "curve_local_good"
                if reduction_type == "good"
                else "curve_local_almost_good"
            ),
            geometric_order=1,
            geometric_invariants=[],
            rational_order=1,
            rational_invariants=[],
            certificate=proof,
        )
    if prime == 2:
        return _unsupported(
            prime,
            "unsupported_at_2",
            "bad reduction at 2 is outside the odd-prime component-group envelope",
        )
    if certificate.get("wild_inertia") is True:
        return _unsupported(
            prime,
            "unsupported_wild",
            "wild reduction is outside the certified component-group envelope",
        )
    if _read(local_data, "semistable", None) is not True:
        return _unsupported(
            prime,
            "unsupported_nonsemistable",
            "the Jacobian is neither good nor certified semistable",
        )
    return _unsupported(
        prime,
        "insufficient_component_data",
        "the semistable record does not include edge thicknesses and Frobenius "
        + "on a component lattice",
    )


def tamagawa_from_local_reduction(local_data: Any) -> TamagawaData:
    """Reject an unbound local record as a curve-level certificate.

    Deserialized records are useful provenance, but cannot prove which curve
    and prime produced them. Use `local_tamagawa_data(curve, prime)` to replay
    reduction while binding both inputs.
    """
    try:
        prime = _exact_integer(_read(local_data, "prime", 0), "prime")
    except TypeError:
        prime = 0
    return _unsupported(
        prime,
        "untrusted_local_record",
        "curve-level certification requires local_tamagawa_data(curve, prime)",
    )


def local_tamagawa_data(
    curve: Any, prime: Any, algorithm: str = "auto"
) -> TamagawaData:
    """Return the structured Tamagawa result for `curve` at `prime`."""
    prime_value = _exact_integer(prime, "prime")
    if prime_value == 2:
        try:
            local_data = curve.local_reduction(prime, "good")
        except Exception:
            return _unsupported(
                2,
                "unsupported_at_2",
                "bad reduction at 2 is outside the odd-prime component-group envelope",
            )
    else:
        local_data = curve.local_reduction(prime, algorithm)
    result = _tamagawa_from_bound_local_reduction(local_data, curve, prime_value)
    if result.status != "insufficient_component_data" or algorithm not in [
        "auto",
        "semistable",
    ]:
        return result
    module = __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["_semistable_split_cluster_data"],
    )
    try:
        split_data = module._semistable_split_cluster_data(curve, prime_value)
    except (ArithmeticError, module.LocalReductionUnsupportedError):
        return result
    return _tamagawa_from_bound_local_reduction(split_data, curve, prime_value)


def tamagawa_number(curve: Any, prime: Any, algorithm: str = "auto") -> int:
    """Return the certified rational Tamagawa number at one prime."""
    return local_tamagawa_data(curve, prime, algorithm).tamagawa_number()


def tamagawa_product(
    curve: Any, primes: Any | None = None, algorithm: str = "auto"
) -> int:
    """Return the atomic product of certified rational Tamagawa numbers.

    If `primes` is omitted, the certified global-reduction object supplies
    the complete bad-prime list.  A single unsupported factor raises
    `TamagawaUnsupportedError`; partial products are never returned.
    """
    if primes is None:
        rows = list(curve.global_reduction(algorithm).local_data)
        results = [
            _tamagawa_from_bound_local_reduction(row, curve, _read(row, "prime", None))
            for row in rows
        ]
    else:
        results = [local_tamagawa_data(curve, prime, algorithm) for prime in primes]
    answer = 1
    for result in results:
        answer *= result.tamagawa_number()
    return answer


def _exact_invariant_list(value: Any, name: str) -> list[int]:
    if not isinstance(value, (list, tuple)):
        raise TypeError(name + " must be an exact integer sequence")
    return [_exact_integer(entry, name + " entry") for entry in value]


def _outer_matches_certificate(
    outer: dict[str, Any],
    certificate: dict[str, Any],
    provenance: str,
    geometric_invariants: list[int],
    rational_invariants: list[int],
    *,
    curve_certified: bool,
) -> bool:
    return (
        outer.get("schema") == TAMAGAWA_CERTIFICATE_SCHEMA
        and outer.get("status") == "certified"
        and outer.get("certified") is True
        and outer.get("curve_certified") is curve_certified
        and outer.get("provenance") == provenance
        and _exact_integer(
            outer.get("geometric_component_group_order"), "outer geometric order"
        )
        == _exact_integer(
            certificate.get("geometric_component_group_order"),
            "certificate geometric order",
        )
        and _exact_integer(
            outer.get("rational_component_group_order"), "outer rational order"
        )
        == _exact_integer(
            certificate.get("rational_component_group_order"),
            "certificate rational order",
        )
        and _exact_invariant_list(
            outer.get("geometric_component_group_invariants"),
            "outer geometric invariants",
        )
        == geometric_invariants
        and _exact_invariant_list(
            outer.get("rational_component_group_invariants"),
            "outer rational invariants",
        )
        == rational_invariants
    )


def _verify_trivial_local_replay(
    replay: Any, binding: Any, reduction_type: str, prime: int
) -> bool:
    if not isinstance(replay, dict) or not isinstance(binding, dict):
        return False
    if replay.get("record_schema") != BOUND_LOCAL_REPLAY_SCHEMA:
        return False
    replay_prime = _exact_integer(replay.get("prime"), "replayed local prime")
    replay_genus = _exact_integer(replay.get("genus"), "replayed local genus")
    if (
        replay_prime != prime
        or replay_genus != _exact_integer(binding.get("genus"), "bound genus")
        or replay.get("reduction_type") != reduction_type
    ):
        return False
    toric_rank = _exact_integer(replay.get("toric_rank"), "replayed toric rank")
    conductor = _exact_integer(
        replay.get("conductor_exponent"), "replayed conductor exponent"
    )
    if toric_rank != 0 or conductor != 0:
        return False
    curve_good = replay.get("curve_good_reduction")
    jacobian_good = replay.get("jacobian_good_reduction")
    if not isinstance(curve_good, bool) or not isinstance(jacobian_good, bool):
        return False
    source_certificate = replay.get("certificate")
    if not isinstance(source_certificate, dict):
        return False
    if reduction_type == "good":
        return (
            replay.get("backend") == "good-reduction-frobenius"
            and curve_good
            and jacobian_good
            and replay.get("semistable") is True
            and source_certificate.get("theorem") == "smooth proper base change"
        )
    almost_good_type = reduction_type[len("almost_good_type_") :]
    return (
        replay_genus == 2
        and replay.get("backend") == "maistret-sutherland"
        and not curve_good
        and jacobian_good
        and replay.get("semistable") is None
        and source_certificate.get("theorem") == "Maistret-Sutherland Algorithm 7"
        and source_certificate.get("almost_good_type") == almost_good_type
    )


def verify_tamagawa_certificate(value: Any) -> bool:
    """Recompute all exact lattice claims in a serialized certificate."""
    try:
        record = value.to_dict() if hasattr(value, "to_dict") else value
        outer = record if isinstance(record, dict) else {}
        has_outer = "certificate" in outer
        certificate = outer.get("certificate", outer)
        if certificate.get("schema") != TAMAGAWA_CERTIFICATE_SCHEMA:
            return False
        kind = certificate.get("kind")
        if kind == "unsupported":
            if certificate.get("status") == "certified":
                return False
            return not has_outer or (
                outer.get("schema") == TAMAGAWA_CERTIFICATE_SCHEMA
                and outer.get("status") == certificate.get("status")
                and outer.get("certified") is False
                and outer.get("curve_certified") is False
                and outer.get("provenance") == "unsupported"
            )
        if kind == "trivial-component-group":
            if not has_outer:
                return False
            reduction_type = certificate.get("reduction_type")
            if reduction_type not in [
                "good",
                "almost_good_type_1",
                "almost_good_type_2a",
                "almost_good_type_2b",
                "almost_good_type_4",
            ]:
                return False
            expected_provenance = (
                "curve_local_good"
                if reduction_type == "good"
                else "curve_local_almost_good"
            )
            source = certificate.get("source_local_record")
            binding = certificate.get("model_binding")
            theorem = (
                "smooth proper base change"
                if reduction_type == "good"
                else "Maistret-Sutherland Algorithm 7"
            )
            outer_prime = _exact_integer(outer.get("prime"), "outer prime")
            return (
                certificate.get("jacobian_good_reduction") is True
                and _exact_integer(
                    certificate.get("geometric_component_group_order"),
                    "geometric order",
                )
                == 1
                and _exact_integer(
                    certificate.get("rational_component_group_order"),
                    "rational order",
                )
                == 1
                and _verify_trivial_local_replay(
                    source, binding, reduction_type, outer_prime
                )
                and source["certificate"].get("theorem") == theorem
                and certificate.get("source_theorem") == theorem
                and certificate.get("provenance") == expected_provenance
                and _valid_model_binding(binding, outer_prime)
                and bool(_completed_branch_from_binding(binding))
                and _outer_matches_certificate(
                    outer,
                    certificate,
                    expected_provenance,
                    [],
                    [],
                    curve_certified=True,
                )
            )
        if kind != "monodromy-lattice":
            return False
        provenance = certificate.get("provenance")
        if provenance not in ["supplied_lattice", "replayed_cluster_certificate"]:
            return False
        source = certificate.get("source")
        if not isinstance(source, dict):
            return False
        checked = _component_group_from_lattice(
            certificate["pairing_matrix"],
            certificate["frobenius_on_homology"],
            prime=0,
            method="certificate-replay",
            source=source,
            provenance=provenance,
        ).certificate
        fields = [
            "rank",
            "frobenius_on_dual",
            "fixed_operator_on_dual",
            "fixed_coinvariant_presentation",
            "geometric_smith",
            "rational_fixed_smith",
            "geometric_component_group_order",
            "rational_component_group_order",
        ]
        if not all(checked[field] == certificate.get(field) for field in fields):
            return False
        geometric_invariants = _nontrivial_invariants(
            checked["geometric_smith"]["invariants"]
        )
        rational_invariants = _nontrivial_invariants(
            checked["rational_fixed_smith"]["invariants"]
        )
        if provenance == "supplied_lattice":
            return not has_outer or _outer_matches_certificate(
                outer,
                certificate,
                "supplied_lattice",
                geometric_invariants,
                rational_invariants,
                curve_certified=False,
            )
        if not has_outer:
            return False
        if not _outer_matches_certificate(
            outer,
            certificate,
            provenance,
            geometric_invariants,
            rational_invariants,
            curve_certified=True,
        ):
            return False
        replay = source.get("cluster_replay")
        binding = source.get("model_binding")
        if not isinstance(replay, dict) or not isinstance(binding, dict):
            return False
        replay_pairing, replay_frobenius, _replay_source = _cluster_lattice(replay)
        replay_prime = _exact_integer(replay.get("prime"), "replay prime")
        if not _valid_model_binding(binding, replay_prime):
            return False
        replay_certificate = replay.get("certificate")
        if not isinstance(replay_certificate, dict):
            return False
        branch = [
            _exact_integer(value, "replayed completed branch coefficient")
            for value in replay_certificate.get(
                "completed_branch_coefficients_ascending", []
            )
        ]
        return (
            replay_pairing == certificate["pairing_matrix"]
            and replay_frobenius == certificate["frobenius_on_homology"]
            and source.get("theorem")
            == "DDMM Theorem D.18 cluster homology and length pairing"
            and source.get("reduction_type") == "semistable_split_cluster"
            and source.get("local_theorem")
            == "split semistable cluster-picture decomposition"
            and branch == _completed_branch_from_binding(binding)
            and replay_prime
            == _exact_integer(binding.get("prime"), "bound prime")
            == _exact_integer(outer.get("prime"), "outer prime")
            and _exact_integer(replay.get("genus"), "replay genus")
            == _exact_integer(binding.get("genus"), "bound genus")
        )
    except (ArithmeticError, KeyError, TypeError, ValueError):
        return False


__all__ = [
    "BOUND_LOCAL_REPLAY_SCHEMA",
    "SPLIT_CLUSTER_REPLAY_SCHEMA",
    "TAMAGAWA_CERTIFICATE_SCHEMA",
    "TamagawaData",
    "TamagawaUnsupportedError",
    "component_group_from_lattice",
    "local_tamagawa_data",
    "tamagawa_from_local_reduction",
    "tamagawa_number",
    "tamagawa_product",
    "verify_tamagawa_certificate",
]
