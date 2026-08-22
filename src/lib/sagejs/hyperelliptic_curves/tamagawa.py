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
fields*.  It deliberately consumes the existing local-reduction certificate
by duck typing instead of depending on its concrete result class.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any


TAMAGAWA_CERTIFICATE_SCHEMA = "sagejs.hyperelliptic.tamagawa.v1"


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
        geometric_order: int | None = None,
        geometric_invariants: list[int] | tuple[int, ...] | None = None,
        rational_order: int | None = None,
        rational_invariants: list[int] | tuple[int, ...] | None = None,
        certificate: dict[str, Any] | None = None,
    ) -> None:
        self.prime = int(prime)
        self.status = str(status)
        self.method = str(method)
        self.reason = str(reason)
        self.certified = self.status == "certified"
        self.geometric_order = None if geometric_order is None else int(geometric_order)
        self.geometric_invariants = (
            None
            if geometric_invariants is None
            else tuple(int(value) for value in geometric_invariants)
        )
        self.rational_order = None if rational_order is None else int(rational_order)
        self.rational_invariants = (
            None
            if rational_invariants is None
            else tuple(int(value) for value in rational_invariants)
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
            "method": self.method,
            "reason": self.reason,
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


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


def _matrix(values: Any, name: str, *, square: bool = False) -> list[list[int]]:
    try:
        rows = [[int(entry) for entry in row] for row in values]
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
    return [int(value) for value in values if int(value) > 1]


def component_group_from_lattice(
    pairing_matrix: Any,
    frobenius_matrix: Any | None = None,
    *,
    prime: int = 0,
    method: str = "semistable-monodromy-lattice",
    source: dict[str, Any] | None = None,
) -> TamagawaData:
    """Compute geometric and rational component groups from a lattice.

    `pairing_matrix` is the Gram matrix on `H_1` of the geometric dual
    graph. `frobenius_matrix` acts on that homology basis.  Omitting it
    means trivial Frobenius, not an unknown Frobenius action.
    """
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
        "source": {} if source is None else dict(source),
    }
    return TamagawaData(
        prime,
        "certified",
        method=method,
        reason="exact Frobenius-fixed monodromy discriminant group",
        geometric_order=geometric_order,
        geometric_invariants=_nontrivial_invariants(geometric_smith["invariants"]),
        rational_order=rational_order,
        rational_invariants=_nontrivial_invariants(rational_smith["invariants"]),
        certificate=certificate,
    )


def _flatten_cluster_tree(top: dict[str, Any]) -> tuple[list[Any], dict[Any, Any]]:
    nodes: list[dict[str, Any]] = []
    parents: dict[tuple[int, ...], tuple[int, ...] | None] = {}

    def visit(node: dict[str, Any], parent: dict[str, Any] | None) -> None:
        roots = tuple(int(value) for value in node["root_indices"])
        if roots in parents:
            raise ValueError("the cluster certificate repeats a root set")
        copied: dict[str, Any] = {
            "roots": roots,
            "depth": node.get("depth"),
            "principal": bool(node.get("principal", False)),
            "ubereven": bool(node.get("ubereven", False)),
            "children": [],
        }
        parents[roots] = None if parent is None else parent["roots"]
        nodes.append(copied)
        for child in node.get("children", []):
            child_roots = tuple(int(value) for value in child["root_indices"])
            copied["children"].append(child_roots)
            visit(child, copied)

    visit(top, None)
    lookup = {node["roots"]: node for node in nodes}
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


def _cluster_lattice(
    local_data: Any,
) -> tuple[list[list[int]], list[list[int]], dict[str, Any]]:
    certificate = _read(local_data, "certificate", {})
    top_record = certificate.get("cluster_picture")
    toric_basis = certificate.get("toric_basis")
    if not isinstance(top_record, dict) or not isinstance(toric_basis, (list, tuple)):
        raise ValueError("the split-cluster certificate has no cluster lattice data")
    genus = int(_read(local_data, "genus", 0))
    nodes, parents = _flatten_cluster_tree(top_record)
    lookup = {node["roots"]: node for node in nodes}
    top = lookup[tuple(int(value) for value in top_record["root_indices"])]
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
            tuple(int(value) for value in item["root_indices"])
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
    for item in toric_basis:
        roots = tuple(int(value) for value in item["root_indices"])
        if roots not in positions:
            raise ValueError("a toric basis cluster is not in the homology lattice")
        column = [0 for _node in cluster_basis]
        column[positions[roots]] = 1
        relation = bool(item.get("relation_quotient", False))
        relation_roots = None
        if relation:
            if relation_origin is None:
                raise ValueError("a relation quotient occurs without an ubereven top")
            relation_roots = relation_origin["roots"]
            column[positions[relation_roots]] = -1
        sign = int(item["frobenius_sign"])
        if sign not in [-1, 1]:
            raise ValueError("a split Frobenius sign is not +1 or -1")
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
    expected_rank = int(_read(local_data, "toric_rank", len(columns)))
    if len(columns) != expected_rank:
        raise ValueError("the cluster and local-data toric ranks disagree")
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
    }
    return pairing, frobenius, source


def _unsupported(prime: int, status: str, reason: str) -> TamagawaData:
    return TamagawaData(
        prime,
        status,
        method="unsupported",
        reason=reason,
        certificate={
            "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
            "kind": "unsupported",
            "status": status,
            "reason": reason,
        },
    )


def tamagawa_from_local_reduction(local_data: Any) -> TamagawaData:
    """Derive `#Phi(F_p)` from a certified local-reduction record.

    The input is intentionally duck typed.  It may be the native
    `LocalReductionData` object or a deserialized record with the same exact
    fields.
    """
    prime = int(_read(local_data, "prime", 0))
    certificate = _read(local_data, "certificate", {})
    if not isinstance(certificate, dict):
        return _unsupported(
            prime, "invalid_certificate", "local certificate is not a record"
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
    jacobian_good = bool(_read(local_data, "jacobian_good_reduction", False))
    reduction_type = str(_read(local_data, "reduction_type", "unknown"))
    if jacobian_good:
        method = (
            "good-abelian-reduction"
            if reduction_type == "good"
            else "almost-good-jacobian-good-reduction"
        )
        proof = {
            "schema": TAMAGAWA_CERTIFICATE_SCHEMA,
            "kind": "trivial-component-group",
            "reduction_type": reduction_type,
            "jacobian_good_reduction": True,
            "source_theorem": certificate.get("theorem"),
            "geometric_component_group_order": 1,
            "rational_component_group_order": 1,
        }
        return TamagawaData(
            prime,
            "certified",
            method=method,
            reason="good reduction of the Jacobian has trivial component group",
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
    explicit_pairing = certificate.get("component_pairing_matrix")
    explicit_frobenius = certificate.get("component_frobenius_matrix")
    if explicit_pairing is not None and explicit_frobenius is not None:
        return component_group_from_lattice(
            explicit_pairing,
            explicit_frobenius,
            prime=prime,
            method="certified-weighted-dual-graph",
            source={
                "reduction_type": reduction_type,
                "local_theorem": certificate.get("theorem"),
            },
        )
    if reduction_type == "semistable_split_cluster":
        try:
            pairing, frobenius, source = _cluster_lattice(local_data)
            source["reduction_type"] = reduction_type
            source["local_theorem"] = certificate.get("theorem")
            return component_group_from_lattice(
                pairing,
                frobenius,
                prime=prime,
                method="split-semistable-cluster-monodromy",
                source=source,
            )
        except (ArithmeticError, KeyError, TypeError, ValueError) as error:
            return _unsupported(
                prime,
                "insufficient_component_data",
                "the split-cluster certificate does not determine a valid "
                + "integral monodromy lattice: "
                + str(error),
            )
    return _unsupported(
        prime,
        "insufficient_component_data",
        "the semistable record does not include edge thicknesses and Frobenius "
        + "on a component lattice",
    )


def local_tamagawa_data(
    curve: Any, prime: Any, algorithm: str = "auto"
) -> TamagawaData:
    """Return the structured Tamagawa result for `curve` at `prime`."""
    prime_value = int(prime)
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
    result = tamagawa_from_local_reduction(local_data)
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
    return tamagawa_from_local_reduction(split_data)


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
        results = [tamagawa_from_local_reduction(row) for row in rows]
    else:
        results = [local_tamagawa_data(curve, prime, algorithm) for prime in primes]
    answer = 1
    for result in results:
        answer *= result.tamagawa_number()
    return answer


def verify_tamagawa_certificate(value: Any) -> bool:
    """Recompute all exact lattice claims in a serialized certificate."""
    try:
        record = value.to_dict() if hasattr(value, "to_dict") else value
        outer = record if isinstance(record, dict) else {}
        certificate = outer.get("certificate", outer)
        if certificate.get("schema") != TAMAGAWA_CERTIFICATE_SCHEMA:
            return False
        kind = certificate.get("kind")
        if kind == "unsupported":
            return certificate.get("status") != "certified"
        if kind == "trivial-component-group":
            return (
                certificate.get("jacobian_good_reduction") is True
                and int(certificate.get("geometric_component_group_order")) == 1
                and int(certificate.get("rational_component_group_order")) == 1
            )
        if kind != "monodromy-lattice":
            return False
        checked = component_group_from_lattice(
            certificate["pairing_matrix"],
            certificate["frobenius_on_homology"],
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
        return all(checked[field] == certificate.get(field) for field in fields)
    except (ArithmeticError, KeyError, TypeError, ValueError):
        return False


__all__ = [
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
