"""Sparse exact relation matrices for class and unit group computations.

This module is the host-neutral linear-algebra boundary of the Buchmann--Hecke
relation pipeline.  It accepts only exact integer rows.  Factor-base ideals,
principal witnesses, embeddings, and public group objects deliberately remain
with their owning layers.

The design follows the sparse relation and transformation strategy in Hecke's
BSD-licensed `NumFieldOrd/NfOrd/Clgp` implementation: keep relations sparse,
screen them modulo several primes, and postpone dense exact HNF/SNF work until
full rank is plausible.  Sage.js uses its existing FLINT matrix operations for
the dense exact step.  The readable Python HNF/SNF implementation is both a
portable fallback and a differential oracle.

Rows present relations in the free abelian group `ZZ^column_count`.  If `A` is
the relation matrix, the returned transforms satisfy

```
H = H_left * A
S = S_left * A * S_right
```

and `S_right_inverse * S_right = I`.  Thus an ambient row vector `x` maps to
Smith coordinates as `x * S_right`; the Smith generator in position `i` lifts
to row `i` of `S_right_inverse`.  Zero rows of `S` give exact combinations of
input relations, via the corresponding rows of `S_left`, suitable for unit
witness reconstruction.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

DEFAULT_SCREEN_PRIMES = (46337, 65521, 65519)
ACCUMULATOR_SCHEMA = "sagejs.number-fields/class-relation-matrix-v1"
PRESENTATION_SCHEMA = "sagejs.number-fields/class-relation-presentation-v1"
PRESENTATION_POLICY_SCHEMA = (
    "sagejs.number-fields/deferred-relation-presentation-policy-v1"
)
PRESENTATION_DECISION_SCHEMA = (
    "sagejs.number-fields/deferred-relation-presentation-decision-v1"
)


class RelationMatrixError(ValueError):
    """Raised when relation-matrix input or replay data is invalid."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise RelationMatrixError(label + " must be an exact integer")
    return int(value)


def _nonnegative_integer(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer < 0:
        raise RelationMatrixError(label + " must be nonnegative")
    return answer


def _json_value(value: Any, label: str = "metadata") -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_value(item, label) for item in value]
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        for key in value:
            if not isinstance(key, str):
                raise RelationMatrixError(label + " dictionary keys must be strings")
            answer[key] = _json_value(value[key], label)
        return answer
    raise RelationMatrixError(label + " must be JSON-safe exact data")


def _gcd_extended(left: int, right: int) -> tuple[int, int, int]:
    """Return positive `g, x, y` with `x*left + y*right == g`."""
    old_remainder, remainder = abs(left), abs(right)
    old_x, x = 1, 0
    old_y, y = 0, 1
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = remainder, old_remainder - quotient * remainder
        old_x, x = x, old_x - quotient * x
        old_y, y = y, old_y - quotient * y
    if left < 0:
        old_x = -old_x
    if right < 0:
        old_y = -old_y
    return old_remainder, old_x, old_y


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _checked_primes(primes: Iterable[int]) -> tuple[int, ...]:
    answer: list[int] = []
    for index, prime in enumerate(primes):
        value = _integer(prime, "screen prime " + str(index))
        if value > 2**31 - 1 or not _is_prime(value):
            raise RelationMatrixError("screen primes must be prime signed-word values")
        if value in answer:
            raise RelationMatrixError("screen primes must be distinct")
        answer.append(value)
    if not answer:
        raise RelationMatrixError("at least one modular screen prime is required")
    return tuple(answer)


class SparseRelationRow:
    """Canonical immutable sparse integer row."""

    def __init__(self, column_count: int, entries: Any = ()) -> None:
        columns = _nonnegative_integer(column_count, "column_count")
        values: dict[int, int] = {}
        if isinstance(entries, SparseRelationRow):
            if entries.column_count != columns:
                raise RelationMatrixError("sparse row has the wrong column count")
            self.column_count = columns
            self.entries = entries.entries
            return
        if isinstance(entries, dict):
            pairs = entries.items()
        else:
            sequence = list(entries)
            dense = len(sequence) == columns and all(
                isinstance(value, int) and not isinstance(value, bool)
                for value in sequence
            )
            if dense:
                pairs = enumerate(sequence)
            else:
                pairs = sequence
        for pair in pairs:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                raise RelationMatrixError(
                    "a sparse row must contain (column, exponent) pairs"
                )
            column = _nonnegative_integer(pair[0], "relation column")
            exponent = _integer(pair[1], "relation exponent")
            if column >= columns:
                raise RelationMatrixError("relation column is out of bounds")
            if exponent:
                values[column] = values.get(column, 0) + exponent
                if values[column] == 0:
                    del values[column]
        self.column_count = columns
        self.entries = tuple(sorted(values.items()))

    @property
    def nnz(self) -> int:
        return len(self.entries)

    def dense(self) -> list[int]:
        answer = [0] * self.column_count
        for column, exponent in self.entries:
            answer[column] = exponent
        return answer

    def to_dict(self) -> dict[str, Any]:
        return {
            "columns": self.column_count,
            "entries": [[column, exponent] for column, exponent in self.entries],
        }

    @classmethod
    def from_dict(cls, value: Any) -> SparseRelationRow:
        if not isinstance(value, dict):
            raise RelationMatrixError("sparse relation row must be a dictionary")
        if set(value) != {"columns", "entries"}:
            raise RelationMatrixError("sparse relation row has unknown fields")
        return cls(value["columns"], value["entries"])

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, SparseRelationRow)
            and self.column_count == other.column_count
            and self.entries == other.entries
        )

    def __repr__(self) -> str:
        return (
            "SparseRelationRow("
            + str(self.column_count)
            + ", "
            + repr(self.entries)
            + ")"
        )


class ModularInsertion:
    """Result of screening one row against every modular echelon basis."""

    def __init__(
        self,
        primes: tuple[int, ...],
        increases: tuple[bool, ...],
        pivots: tuple[int | None, ...],
        ranks: tuple[int, ...],
    ) -> None:
        self.primes = primes
        self.increases = increases
        self.pivots = pivots
        self.ranks = ranks

    @property
    def independent_somewhere(self) -> bool:
        return any(self.increases)

    @property
    def independent_everywhere(self) -> bool:
        return all(self.increases)

    @property
    def best_rank(self) -> int:
        return max(self.ranks, default=0)


class ModularPivotScreen:
    """Incremental sparse row-echelon bases over several prime fields."""

    def __init__(
        self,
        column_count: int,
        primes: Iterable[int] = DEFAULT_SCREEN_PRIMES,
    ) -> None:
        self.column_count = _nonnegative_integer(column_count, "column_count")
        self.primes = _checked_primes(primes)
        self._bases: list[dict[int, dict[int, int]]] = [{} for _ in self.primes]

    @staticmethod
    def _reduce(
        row: SparseRelationRow,
        prime: int,
        basis: dict[int, dict[int, int]],
    ) -> tuple[dict[int, int], int | None]:
        work = {
            column: exponent % prime
            for column, exponent in row.entries
            if exponent % prime
        }
        while work:
            pivot = min(work)
            known = basis.get(pivot)
            if known is None:
                inverse = pow(work[pivot], prime - 2, prime)
                normalized = {
                    column: (value * inverse) % prime for column, value in work.items()
                }
                return normalized, pivot
            factor = work[pivot]
            for column, value in known.items():
                reduced = (work.get(column, 0) - factor * value) % prime
                if reduced:
                    work[column] = reduced
                elif column in work:
                    del work[column]
        return {}, None

    def preview(self, row: Any) -> ModularInsertion:
        sparse = SparseRelationRow(self.column_count, row)
        increases: list[bool] = []
        pivots: list[int | None] = []
        for prime, basis in zip(self.primes, self._bases, strict=False):
            _, pivot = self._reduce(sparse, prime, basis)
            increases.append(pivot is not None)
            pivots.append(pivot)
        return ModularInsertion(
            self.primes,
            tuple(increases),
            tuple(pivots),
            tuple(len(basis) for basis in self._bases),
        )

    def insert(self, row: Any) -> ModularInsertion:
        sparse = SparseRelationRow(self.column_count, row)
        increases: list[bool] = []
        pivots: list[int | None] = []
        for prime, basis in zip(self.primes, self._bases, strict=False):
            reduced, pivot = self._reduce(sparse, prime, basis)
            if pivot is not None:
                basis[pivot] = reduced
            increases.append(pivot is not None)
            pivots.append(pivot)
        return ModularInsertion(
            self.primes,
            tuple(increases),
            tuple(pivots),
            tuple(len(basis) for basis in self._bases),
        )

    def rebuild(self, rows: Iterable[Any]) -> None:
        self._bases = [{} for _ in self.primes]
        for row in rows:
            self.insert(row)

    @property
    def ranks(self) -> tuple[int, ...]:
        return tuple(len(basis) for basis in self._bases)

    @property
    def rank_lower_bound(self) -> int:
        return max(self.ranks, default=0)

    @property
    def full_column_rank_certified(self) -> bool:
        return self.rank_lower_bound == self.column_count

    @property
    def best_prime(self) -> int:
        ranks = self.ranks
        best = max(range(len(ranks)), key=lambda index: ranks[index])
        return self.primes[best]

    @property
    def pivots(self) -> tuple[int, ...]:
        ranks = self.ranks
        best = max(range(len(ranks)), key=lambda index: ranks[index])
        return tuple(sorted(self._bases[best]))

    @property
    def missing_pivots(self) -> tuple[int, ...]:
        present = set(self.pivots)
        return tuple(
            column for column in range(self.column_count) if column not in present
        )


class RelationInsertion:
    """Storage and modular-screen result for one admitted exact relation."""

    def __init__(
        self, index: int, row: SparseRelationRow, modular: ModularInsertion
    ) -> None:
        self.index = index
        self.row = row
        self.modular = modular

    @property
    def adds_modular_rank(self) -> bool:
        return self.modular.independent_somewhere


def _relation_prefix_fingerprint(
    rows: Sequence[SparseRelationRow], row_count: int
) -> tuple[int, int]:
    """Return a deterministic non-certificate binding for one relation prefix."""
    first = 1469598103934665603
    second = 1099511628211
    mask = 2**64 - 1
    for row_index, row in enumerate(rows[:row_count]):
        first ^= (row_index + 1) * 0x9E3779B185EBCA87
        first = (first * 1099511628211) & mask
        second = (second + row.nnz + 0x517CC1B727220A95) & mask
        for column, exponent in row.entries:
            encoded = (
                (column + 1) * 0x94D049BB133111EB
                + (exponent & mask) * 0xBF58476D1CE4E5B9
            ) & mask
            first = ((first ^ encoded) * 1099511628211) & mask
            second = ((second ^ (encoded >> 1)) * 0x9E3779B185EBCA87) & mask
    return first, second


class PresentationDecision:
    """Immutable signal describing whether deferred exact extraction is due."""

    def __init__(
        self,
        *,
        should_extract: bool,
        required_level: str,
        reason: str,
        row_count: int,
        pending_rows: int,
        batch_size: int,
        modular_ranks: Sequence[int],
        full_column_rank_certified: bool,
        stale: bool,
    ) -> None:
        if required_level not in ("hnf", "snf"):
            raise RelationMatrixError("required_level must be hnf or snf")
        if not isinstance(reason, str) or reason == "":
            raise RelationMatrixError("presentation decision reason must be nonempty")
        self.should_extract = bool(should_extract)
        self.required_level = required_level
        self.reason = reason
        self.row_count = _nonnegative_integer(row_count, "decision row_count")
        self.pending_rows = _nonnegative_integer(pending_rows, "decision pending_rows")
        self.batch_size = _nonnegative_integer(batch_size, "decision batch_size")
        self.modular_ranks = tuple(
            _nonnegative_integer(rank, "decision modular rank")
            for rank in modular_ranks
        )
        self.full_column_rank_certified = bool(full_column_rank_certified)
        self.stale = bool(stale)

    @property
    def needs_exact_hnf(self) -> bool:
        return self.should_extract

    @property
    def needs_exact_snf(self) -> bool:
        return self.should_extract and self.required_level == "snf"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PRESENTATION_DECISION_SCHEMA,
            "should_extract": self.should_extract,
            "required_level": self.required_level,
            "reason": self.reason,
            "row_count": self.row_count,
            "pending_rows": self.pending_rows,
            "batch_size": self.batch_size,
            "modular_ranks": list(self.modular_ranks),
            "full_column_rank_certified": self.full_column_rank_certified,
            "stale": self.stale,
        }

    @classmethod
    def from_dict(cls, value: Any) -> PresentationDecision:
        if (
            not isinstance(value, dict)
            or value.get("schema") != PRESENTATION_DECISION_SCHEMA
        ):
            raise RelationMatrixError("unsupported presentation-decision schema")
        expected = {
            "schema",
            "should_extract",
            "required_level",
            "reason",
            "row_count",
            "pending_rows",
            "batch_size",
            "modular_ranks",
            "full_column_rank_certified",
            "stale",
        }
        if set(value) != expected:
            raise RelationMatrixError(
                "presentation-decision payload has unknown fields"
            )
        return cls(
            should_extract=value["should_extract"],
            required_level=value["required_level"],
            reason=value["reason"],
            row_count=value["row_count"],
            pending_rows=value["pending_rows"],
            batch_size=value["batch_size"],
            modular_ranks=value["modular_ranks"],
            full_column_rank_certified=value["full_column_rank_certified"],
            stale=value["stale"],
        )


class PresentationUpdate:
    """One policy decision and its optional newly extracted presentation."""

    def __init__(
        self,
        decision: PresentationDecision,
        presentation: RelationPresentation | None,
    ) -> None:
        if presentation is not None and not decision.should_extract:
            raise RelationMatrixError("a deferred decision cannot carry a presentation")
        self.decision = decision
        self.presentation = presentation

    @property
    def extracted(self) -> bool:
        return self.presentation is not None


class DeferredPresentationPolicy:
    """Stateful batching policy for expensive exact relation presentations.

    Modular insertion remains incremental in `RelationMatrixAccumulator`.
    This policy is queried after an admitted relation or at an explicit
    consumer boundary.  It requests the first exact presentation only after a
    modular full-column-rank certificate, then batches later exact refreshes.
    `force=True` is reserved for finalization/checkpoint boundaries and never
    bypasses the configured full-rank requirement.
    """

    def __init__(
        self,
        column_count: int,
        *,
        batch_size: int | None = None,
        require_full_rank: bool = True,
    ) -> None:
        columns = _nonnegative_integer(column_count, "column_count")
        if batch_size is None:
            batch = max(8, min(256, (columns + 7) // 8))
        else:
            batch = _nonnegative_integer(batch_size, "batch_size")
            if batch == 0:
                raise RelationMatrixError("batch_size must be positive")
        self.column_count = columns
        self.batch_size = batch
        self.require_full_rank = bool(require_full_rank)
        self.last_exact_row_count = 0
        self.last_exact_level: str | None = None
        self.last_exact_rank: int | None = None
        self.last_exact_prefix_fingerprint: tuple[int, int] | None = None
        self.extraction_count = 0

    def _check_accumulator(self, accumulator: RelationMatrixAccumulator) -> None:
        if not isinstance(accumulator, RelationMatrixAccumulator):
            raise RelationMatrixError(
                "presentation policy requires a RelationMatrixAccumulator"
            )
        if accumulator.column_count != self.column_count:
            raise RelationMatrixError(
                "presentation policy and accumulator column counts differ"
            )
        if self.last_exact_row_count > accumulator.row_count:
            raise RelationMatrixError(
                "presentation policy is ahead of the relation accumulator"
            )
        if self.last_exact_prefix_fingerprint is not None:
            actual = _relation_prefix_fingerprint(
                accumulator.rows, self.last_exact_row_count
            )
            if actual != self.last_exact_prefix_fingerprint:
                raise RelationMatrixError(
                    "the previously extracted relation prefix has changed"
                )

    def decision(
        self,
        accumulator: RelationMatrixAccumulator,
        *,
        required_level: str = "snf",
        force: bool = False,
    ) -> PresentationDecision:
        """Signal an exact update without performing any dense conversion."""
        self._check_accumulator(accumulator)
        if required_level not in ("hnf", "snf"):
            raise RelationMatrixError("required_level must be hnf or snf")
        pending = accumulator.row_count - self.last_exact_row_count
        full_rank = accumulator.full_rank_plausible
        stale = pending > 0
        if self.require_full_rank and not full_rank:
            should_extract = False
            reason = "awaiting-modular-full-rank"
        elif self.last_exact_level is None:
            should_extract = accumulator.row_count > 0 or force
            reason = "first-full-rank" if should_extract else "empty-matrix"
        elif required_level == "snf" and self.last_exact_level == "hnf":
            should_extract = True
            reason = "upgrade-to-smith"
        elif not stale:
            should_extract = False
            reason = "exact-presentation-current"
        elif force:
            should_extract = True
            reason = "forced-finalization"
        elif pending >= self.batch_size:
            should_extract = True
            reason = "pending-batch-ready"
        else:
            should_extract = False
            reason = "batching-new-relations"
        return PresentationDecision(
            should_extract=should_extract,
            required_level=required_level,
            reason=reason,
            row_count=accumulator.row_count,
            pending_rows=pending,
            batch_size=self.batch_size,
            modular_ranks=accumulator.modular_ranks,
            full_column_rank_certified=full_rank,
            stale=stale,
        )

    def note_exact_presentation(
        self,
        accumulator: RelationMatrixAccumulator,
        presentation: RelationPresentation,
        *,
        extracted_level: str = "snf",
    ) -> None:
        """Authenticate and record a presentation of the current exact rows."""
        self._check_accumulator(accumulator)
        if extracted_level not in ("hnf", "snf"):
            raise RelationMatrixError("extracted_level must be hnf or snf")
        if not isinstance(presentation, RelationPresentation):
            raise RelationMatrixError("exact update requires a RelationPresentation")
        if presentation.column_count != accumulator.column_count:
            raise RelationMatrixError("exact presentation has the wrong column count")
        if presentation.relation_rows != tuple(accumulator.rows):
            raise RelationMatrixError(
                "exact presentation does not match current relations"
            )
        if not presentation.verify():
            raise RelationMatrixError("exact presentation replay failed")
        if self.require_full_rank and presentation.rank != self.column_count:
            raise RelationMatrixError("exact presentation is not full column rank")
        self.last_exact_row_count = accumulator.row_count
        self.last_exact_level = extracted_level
        self.last_exact_rank = presentation.rank
        self.last_exact_prefix_fingerprint = _relation_prefix_fingerprint(
            accumulator.rows, accumulator.row_count
        )
        self.extraction_count += 1

    def extract_if_due(
        self,
        accumulator: RelationMatrixAccumulator,
        *,
        required_level: str = "snf",
        force: bool = False,
        backend: str = "auto",
    ) -> PresentationUpdate:
        """Perform at most one exact extraction when the current signal is due."""
        decision = self.decision(
            accumulator, required_level=required_level, force=force
        )
        if not decision.should_extract:
            return PresentationUpdate(decision, None)
        presentation = accumulator.presentation(
            backend=backend, require_full_rank=self.require_full_rank
        )
        # Current extraction produces both exact forms and all SNF transforms,
        # even when an HNF consumer triggered it. Recording the actual level
        # prevents an unnecessary upgrade extraction at the same revision.
        self.note_exact_presentation(accumulator, presentation, extracted_level="snf")
        return PresentationUpdate(decision, presentation)

    def verify_against(self, accumulator: RelationMatrixAccumulator) -> bool:
        try:
            self._check_accumulator(accumulator)
        except RelationMatrixError:
            return False
        if self.last_exact_level is None:
            return (
                self.last_exact_row_count == 0
                and self.last_exact_rank is None
                and self.last_exact_prefix_fingerprint is None
                and self.extraction_count == 0
            )
        return (
            self.last_exact_rank is not None
            and self.last_exact_prefix_fingerprint is not None
            and self.extraction_count > 0
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PRESENTATION_POLICY_SCHEMA,
            "columns": self.column_count,
            "batch_size": self.batch_size,
            "require_full_rank": self.require_full_rank,
            "last_exact_row_count": self.last_exact_row_count,
            "last_exact_level": self.last_exact_level,
            "last_exact_rank": self.last_exact_rank,
            "last_exact_prefix_fingerprint": (
                None
                if self.last_exact_prefix_fingerprint is None
                else list(self.last_exact_prefix_fingerprint)
            ),
            "extraction_count": self.extraction_count,
        }

    @classmethod
    def from_dict(
        cls,
        value: Any,
        accumulator: RelationMatrixAccumulator | None = None,
    ) -> DeferredPresentationPolicy:
        if (
            not isinstance(value, dict)
            or value.get("schema") != PRESENTATION_POLICY_SCHEMA
        ):
            raise RelationMatrixError("unsupported presentation-policy schema")
        expected = {
            "schema",
            "columns",
            "batch_size",
            "require_full_rank",
            "last_exact_row_count",
            "last_exact_level",
            "last_exact_rank",
            "last_exact_prefix_fingerprint",
            "extraction_count",
        }
        if set(value) != expected:
            raise RelationMatrixError("presentation-policy payload has unknown fields")
        answer = cls(
            value["columns"],
            batch_size=value["batch_size"],
            require_full_rank=value["require_full_rank"],
        )
        answer.last_exact_row_count = _nonnegative_integer(
            value["last_exact_row_count"], "last_exact_row_count"
        )
        level = value["last_exact_level"]
        if level is not None and level not in ("hnf", "snf"):
            raise RelationMatrixError("last_exact_level must be hnf, snf, or None")
        answer.last_exact_level = level
        rank = value["last_exact_rank"]
        answer.last_exact_rank = (
            None if rank is None else _nonnegative_integer(rank, "last_exact_rank")
        )
        fingerprint = value["last_exact_prefix_fingerprint"]
        if fingerprint is None:
            answer.last_exact_prefix_fingerprint = None
        else:
            if not isinstance(fingerprint, list) or len(fingerprint) != 2:
                raise RelationMatrixError(
                    "last_exact_prefix_fingerprint must contain two integers"
                )
            answer.last_exact_prefix_fingerprint = (
                _nonnegative_integer(fingerprint[0], "prefix fingerprint"),
                _nonnegative_integer(fingerprint[1], "prefix fingerprint"),
            )
        answer.extraction_count = _nonnegative_integer(
            value["extraction_count"], "extraction_count"
        )
        if accumulator is not None and not answer.verify_against(accumulator):
            raise RelationMatrixError(
                "presentation policy does not replay against the relation accumulator"
            )
        return answer


class RelationMatrixAccumulator:
    """Sparse relation storage with incremental modular rank/pivot screening."""

    def __init__(
        self,
        column_count: int,
        primes: Iterable[int] = DEFAULT_SCREEN_PRIMES,
    ) -> None:
        self.column_count = _nonnegative_integer(column_count, "column_count")
        self.rows: list[SparseRelationRow] = []
        self.witness_keys: list[str | None] = []
        self.provenance: list[Any] = []
        self.modular = ModularPivotScreen(self.column_count, primes)

    def add_relation(
        self,
        row: Any,
        *,
        witness_key: str | None = None,
        provenance: Any = None,
    ) -> RelationInsertion:
        sparse = SparseRelationRow(self.column_count, row)
        if witness_key is not None and (
            not isinstance(witness_key, str) or witness_key == ""
        ):
            raise RelationMatrixError("witness_key must be a nonempty string or None")
        metadata = _json_value(provenance, "relation provenance")
        modular = self.modular.insert(sparse)
        index = len(self.rows)
        self.rows.append(sparse)
        self.witness_keys.append(witness_key)
        self.provenance.append(metadata)
        return RelationInsertion(index, sparse, modular)

    @property
    def row_count(self) -> int:
        return len(self.rows)

    @property
    def nonzero_count(self) -> int:
        return sum(row.nnz for row in self.rows)

    @property
    def density(self) -> float:
        size = self.row_count * self.column_count
        return 0.0 if size == 0 else self.nonzero_count / size

    @property
    def modular_ranks(self) -> tuple[int, ...]:
        return self.modular.ranks

    @property
    def rank_lower_bound(self) -> int:
        return self.modular.rank_lower_bound

    @property
    def full_rank_plausible(self) -> bool:
        # Full rank modulo one prime is an exact full-column-rank certificate.
        return self.modular.full_column_rank_certified

    @property
    def missing_pivots(self) -> tuple[int, ...]:
        return self.modular.missing_pivots

    def prioritize(self, rows: Iterable[Any]) -> list[int]:
        """Return candidate indices, modular-rank gains first, stably ordered."""
        scored: list[tuple[int, int, int]] = []
        for index, row in enumerate(rows):
            sparse = SparseRelationRow(self.column_count, row)
            preview = self.modular.preview(sparse)
            gain = sum(1 for value in preview.increases if value)
            uncovered = sum(
                1 for column, _ in sparse.entries if column in self.missing_pivots
            )
            scored.append((-gain, -uncovered, index))
        scored.sort()
        return [entry[2] for entry in scored]

    def replace_unlucky_primes(
        self,
        tentative_order: int,
        candidates: Iterable[int] = (
            65497,
            65479,
            65449,
            65447,
            65437,
            65423,
            65393,
        ),
    ) -> tuple[int, ...]:
        """Replace primes dividing a tentative finite quotient order.

        A modular rank drop at a prime dividing the quotient order is expected
        and must not drive relation collection.  Replacement replays the same
        sparse rows, so it does not alter exact relation storage.
        """
        order = abs(_integer(tentative_order, "tentative_order"))
        available = list(_checked_primes(candidates))
        chosen: list[int] = []
        for prime in self.modular.primes:
            if order == 0 or order % prime != 0:
                chosen.append(prime)
                continue
            replacement = None
            while available:
                candidate = available.pop(0)
                if candidate not in chosen and (order == 0 or order % candidate != 0):
                    replacement = candidate
                    break
            if replacement is None:
                raise RelationMatrixError("not enough safe modular screen primes")
            chosen.append(replacement)
        self.modular = ModularPivotScreen(self.column_count, chosen)
        self.modular.rebuild(self.rows)
        return self.modular.primes

    def dense_rows(self) -> list[list[int]]:
        return [row.dense() for row in self.rows]

    def presentation(
        self,
        *,
        backend: str = "auto",
        require_full_rank: bool = False,
    ) -> RelationPresentation:
        return extract_relation_presentation(
            self.rows,
            self.column_count,
            backend=backend,
            require_full_rank=require_full_rank,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": ACCUMULATOR_SCHEMA,
            "columns": self.column_count,
            "primes": list(self.modular.primes),
            "rows": [row.to_dict() for row in self.rows],
            "witness_keys": list(self.witness_keys),
            "provenance": _json_value(self.provenance),
        }

    @classmethod
    def from_dict(cls, value: Any) -> RelationMatrixAccumulator:
        if not isinstance(value, dict) or value.get("schema") != ACCUMULATOR_SCHEMA:
            raise RelationMatrixError("unsupported relation-matrix schema")
        expected = {
            "schema",
            "columns",
            "primes",
            "rows",
            "witness_keys",
            "provenance",
        }
        if set(value) != expected:
            raise RelationMatrixError("relation-matrix payload has unknown fields")
        rows = value["rows"]
        witness_keys = value["witness_keys"]
        provenance = value["provenance"]
        if not isinstance(rows, list) or not isinstance(witness_keys, list):
            raise RelationMatrixError(
                "relation-matrix rows and witnesses must be lists"
            )
        if not isinstance(provenance, list):
            raise RelationMatrixError("relation-matrix provenance must be a list")
        if len(rows) != len(witness_keys) or len(rows) != len(provenance):
            raise RelationMatrixError("relation-matrix side data has the wrong length")
        answer = cls(value["columns"], value["primes"])
        for row, witness_key, metadata in zip(
            rows, witness_keys, provenance, strict=False
        ):
            sparse = SparseRelationRow.from_dict(row)
            answer.add_relation(
                sparse, witness_key=witness_key, provenance=_json_value(metadata)
            )
        return answer


def _identity(size: int) -> list[list[int]]:
    return [
        [1 if row == column else 0 for column in range(size)] for row in range(size)
    ]


def _matrix_multiply(
    left: Sequence[Sequence[int]], right: Sequence[Sequence[int]]
) -> list[list[int]]:
    if not left:
        return []
    middle = len(left[0])
    if len(right) != middle:
        raise RelationMatrixError("matrix multiplication dimensions are incompatible")
    columns = len(right[0]) if right else 0
    if any(len(row) != middle for row in left) or any(
        len(row) != columns for row in right
    ):
        raise RelationMatrixError("matrix rows have inconsistent dimensions")
    answer = [[0] * columns for _ in left]
    for row_index, row in enumerate(left):
        for index, coefficient in enumerate(row):
            if coefficient:
                for column in range(columns):
                    answer[row_index][column] += coefficient * right[index][column]
    return answer


def _row_vector_multiply(
    vector: Sequence[int], matrix: Sequence[Sequence[int]]
) -> list[int]:
    if len(vector) != len(matrix):
        raise RelationMatrixError("coordinate vector has the wrong length")
    columns = len(matrix[0]) if matrix else 0
    answer = [0] * columns
    for row, coefficient in zip(matrix, vector, strict=False):
        if coefficient:
            for column in range(columns):
                answer[column] += coefficient * row[column]
    return answer


def _determinant(rows: Sequence[Sequence[int]]) -> int:
    size = len(rows)
    if any(len(row) != size for row in rows):
        raise RelationMatrixError("determinant requires a square matrix")
    if size == 0:
        return 1
    matrix = [list(row) for row in rows]
    sign = 1
    previous = 1
    for pivot_column in range(size - 1):
        pivot_row = pivot_column
        while pivot_row < size and matrix[pivot_row][pivot_column] == 0:
            pivot_row += 1
        if pivot_row == size:
            return 0
        if pivot_row != pivot_column:
            matrix[pivot_column], matrix[pivot_row] = (
                matrix[pivot_row],
                matrix[pivot_column],
            )
            sign = -sign
        pivot = matrix[pivot_column][pivot_column]
        for row in range(pivot_column + 1, size):
            for column in range(pivot_column + 1, size):
                numerator = (
                    matrix[row][column] * pivot
                    - matrix[row][pivot_column] * matrix[pivot_column][column]
                )
                if previous != 1:
                    if numerator % previous:
                        raise ArithmeticError(
                            "fraction-free determinant division failed"
                        )
                    numerator //= previous
                matrix[row][column] = numerator
            matrix[row][pivot_column] = 0
        previous = pivot
    return sign * matrix[-1][-1]


def _determinant_exact(rows: Sequence[Sequence[int]]) -> int:
    """Use mature FLINT for a large determinant, with the Python oracle fallback."""
    size = len(rows)
    if size < 16:
        return _determinant(rows)
    try:
        matrix_module = __import__("sagejs._baselib.matrix", fromlist=["matrix"])
        algebra_module = __import__("sagejs._baselib.algebra", fromlist=["ZZ"])
        matrix = matrix_module.matrix(
            algebra_module.ZZ,
            size,
            size,
            [entry for row in rows for entry in row],
        )
        return int(matrix.det())
    except (ImportError, RuntimeError, TypeError, ValueError, ArithmeticError):
        return _determinant(rows)


def _invert_unimodular(rows: Sequence[Sequence[int]]) -> list[list[int]]:
    size = len(rows)
    if any(len(row) != size for row in rows):
        raise RelationMatrixError("unimodular inverse requires a square matrix")
    smith, left, right = _python_snf_transform(rows, size)
    if smith != _identity(size):
        raise RelationMatrixError("Smith right transform is not unimodular")
    # `left * rows * right = I`, hence `rows^-1 = right * left`.
    return _matrix_multiply(right, left)


def _combine_rows(
    matrix: list[list[int]],
    transform: list[list[int]],
    first: int,
    second: int,
    a: int,
    b: int,
    c: int,
    d: int,
) -> None:
    old_first = list(matrix[first])
    old_second = list(matrix[second])
    matrix[first] = [a * x + b * y for x, y in zip(old_first, old_second, strict=False)]
    matrix[second] = [
        c * x + d * y for x, y in zip(old_first, old_second, strict=False)
    ]
    old_first = list(transform[first])
    old_second = list(transform[second])
    transform[first] = [
        a * x + b * y for x, y in zip(old_first, old_second, strict=False)
    ]
    transform[second] = [
        c * x + d * y for x, y in zip(old_first, old_second, strict=False)
    ]


def _combine_columns(
    matrix: list[list[int]],
    transform: list[list[int]],
    first: int,
    second: int,
    a: int,
    b: int,
    c: int,
    d: int,
) -> None:
    # New columns are (a*first + c*second, b*first + d*second), so the
    # accumulated right transform is multiplied by the same 2-by-2 block.
    for row in matrix:
        old_first, old_second = row[first], row[second]
        row[first] = a * old_first + c * old_second
        row[second] = b * old_first + d * old_second
    for row in transform:
        old_first, old_second = row[first], row[second]
        row[first] = a * old_first + c * old_second
        row[second] = b * old_first + d * old_second


def _python_hnf_transform(
    source: Sequence[Sequence[int]], columns: int
) -> tuple[list[list[int]], list[list[int]]]:
    matrix = [list(row) for row in source]
    row_count = len(matrix)
    transform = _identity(row_count)
    pivot_row = 0
    for column in range(columns):
        candidate = pivot_row
        while candidate < row_count and matrix[candidate][column] == 0:
            candidate += 1
        if candidate == row_count:
            continue
        if candidate != pivot_row:
            matrix[pivot_row], matrix[candidate] = matrix[candidate], matrix[pivot_row]
            transform[pivot_row], transform[candidate] = (
                transform[candidate],
                transform[pivot_row],
            )
        for row in range(pivot_row + 1, row_count):
            entry = matrix[row][column]
            if entry == 0:
                continue
            pivot = matrix[pivot_row][column]
            common, left, right = _gcd_extended(pivot, entry)
            _combine_rows(
                matrix,
                transform,
                pivot_row,
                row,
                left,
                right,
                -entry // common,
                pivot // common,
            )
        if matrix[pivot_row][column] < 0:
            matrix[pivot_row] = [-value for value in matrix[pivot_row]]
            transform[pivot_row] = [-value for value in transform[pivot_row]]
        pivot = matrix[pivot_row][column]
        for row in range(pivot_row):
            quotient = matrix[row][column] // pivot
            if quotient:
                matrix[row] = [
                    value - quotient * pivot_value
                    for value, pivot_value in zip(
                        matrix[row], matrix[pivot_row], strict=False
                    )
                ]
                transform[row] = [
                    value - quotient * pivot_value
                    for value, pivot_value in zip(
                        transform[row], transform[pivot_row], strict=False
                    )
                ]
        pivot_row += 1
        if pivot_row == row_count:
            break
    return matrix, transform


def _python_snf_transform(
    source: Sequence[Sequence[int]], columns: int
) -> tuple[list[list[int]], list[list[int]], list[list[int]]]:
    matrix = [list(row) for row in source]
    row_count = len(matrix)
    left = _identity(row_count)
    right = _identity(columns)
    limit = min(row_count, columns)
    pivot_index = 0
    while pivot_index < limit:
        position: tuple[int, int] | None = None
        for row in range(pivot_index, row_count):
            for column in range(pivot_index, columns):
                if matrix[row][column] != 0 and (
                    position is None
                    or abs(matrix[row][column]) < abs(matrix[position[0]][position[1]])
                ):
                    position = (row, column)
        if position is None:
            break
        row, column = position
        if row != pivot_index:
            matrix[pivot_index], matrix[row] = matrix[row], matrix[pivot_index]
            left[pivot_index], left[row] = left[row], left[pivot_index]
        if column != pivot_index:
            for target in matrix:
                target[pivot_index], target[column] = (
                    target[column],
                    target[pivot_index],
                )
            for target in right:
                target[pivot_index], target[column] = (
                    target[column],
                    target[pivot_index],
                )

        while True:
            changed = False
            for row in range(pivot_index + 1, row_count):
                entry = matrix[row][pivot_index]
                if entry == 0:
                    continue
                pivot = matrix[pivot_index][pivot_index]
                if entry % pivot == 0:
                    quotient = entry // pivot
                    matrix[row] = [
                        value - quotient * pivot_value
                        for value, pivot_value in zip(
                            matrix[row], matrix[pivot_index], strict=False
                        )
                    ]
                    left[row] = [
                        value - quotient * pivot_value
                        for value, pivot_value in zip(
                            left[row], left[pivot_index], strict=False
                        )
                    ]
                    changed = True
                    continue
                common, x, y = _gcd_extended(pivot, entry)
                _combine_rows(
                    matrix,
                    left,
                    pivot_index,
                    row,
                    x,
                    y,
                    -entry // common,
                    pivot // common,
                )
                changed = True
            for column in range(pivot_index + 1, columns):
                entry = matrix[pivot_index][column]
                if entry == 0:
                    continue
                pivot = matrix[pivot_index][pivot_index]
                if entry % pivot == 0:
                    quotient = entry // pivot
                    for row in matrix:
                        row[column] -= quotient * row[pivot_index]
                    for row in right:
                        row[column] -= quotient * row[pivot_index]
                    changed = True
                    continue
                common, x, y = _gcd_extended(pivot, entry)
                _combine_columns(
                    matrix,
                    right,
                    pivot_index,
                    column,
                    x,
                    -entry // common,
                    y,
                    pivot // common,
                )
                changed = True
            if changed:
                continue
            pivot = matrix[pivot_index][pivot_index]
            bad: tuple[int, int] | None = None
            for row in range(pivot_index + 1, row_count):
                for column in range(pivot_index + 1, columns):
                    if matrix[row][column] % pivot:
                        bad = (row, column)
                        break
                if bad is not None:
                    break
            if bad is None:
                break
            row, _ = bad
            matrix[pivot_index] = [
                value + extra
                for value, extra in zip(matrix[pivot_index], matrix[row], strict=False)
            ]
            left[pivot_index] = [
                value + extra
                for value, extra in zip(left[pivot_index], left[row], strict=False)
            ]
        if matrix[pivot_index][pivot_index] < 0:
            matrix[pivot_index] = [-value for value in matrix[pivot_index]]
            left[pivot_index] = [-value for value in left[pivot_index]]
        pivot_index += 1
    return matrix, left, right


def _sage_rows(matrix: Any, rows: int, columns: int) -> list[list[int]]:
    return [
        [int(matrix[row, column]) for column in range(columns)] for row in range(rows)
    ]


def _flint_forms(
    source: list[list[int]], columns: int
) -> tuple[
    list[list[int]],
    list[list[int]],
    list[list[int]],
    list[list[int]],
    list[list[int]],
]:
    row_count = len(source)
    flat = [entry for row in source for entry in row]
    matrix_module = __import__("sagejs._baselib.matrix", fromlist=["matrix"])
    algebra_module = __import__("sagejs._baselib.algebra", fromlist=["ZZ"])
    matrix = matrix_module.matrix(algebra_module.ZZ, row_count, columns, flat)
    hermite, hermite_left = matrix.hermite_form(transformation=True)
    smith, smith_left, smith_right = matrix.smith_form()
    return (
        _sage_rows(hermite, row_count, columns),
        _sage_rows(hermite_left, row_count, row_count),
        _sage_rows(smith, row_count, columns),
        _sage_rows(smith_left, row_count, row_count),
        _sage_rows(smith_right, columns, columns),
    )


def _checked_matrix(
    value: Any, rows: int, columns: int, label: str
) -> tuple[tuple[int, ...], ...]:
    if not isinstance(value, (list, tuple)) or len(value) != rows:
        raise RelationMatrixError(label + " has the wrong row count")
    answer: list[tuple[int, ...]] = []
    for row in value:
        if not isinstance(row, (list, tuple)) or len(row) != columns:
            raise RelationMatrixError(label + " has the wrong column count")
        answer.append(tuple(_integer(entry, label + " entry") for entry in row))
    return tuple(answer)


class RelationPresentation:
    """Replayable exact HNF/SNF presentation of a relation lattice."""

    def __init__(
        self,
        column_count: int,
        relation_rows: Sequence[SparseRelationRow],
        hnf: Any,
        hnf_left: Any,
        smith: Any,
        smith_left: Any,
        smith_right: Any,
        smith_right_inverse: Any,
        backend: str,
    ) -> None:
        self.column_count = _nonnegative_integer(column_count, "column_count")
        self.relation_rows = tuple(
            SparseRelationRow(self.column_count, row) for row in relation_rows
        )
        self.row_count = len(self.relation_rows)
        self.hnf = _checked_matrix(hnf, self.row_count, self.column_count, "HNF")
        self.hnf_left_transform = _checked_matrix(
            hnf_left, self.row_count, self.row_count, "HNF left transform"
        )
        self.smith = _checked_matrix(smith, self.row_count, self.column_count, "SNF")
        self.smith_left_transform = _checked_matrix(
            smith_left, self.row_count, self.row_count, "SNF left transform"
        )
        self.smith_right_transform = _checked_matrix(
            smith_right, self.column_count, self.column_count, "SNF right transform"
        )
        self.smith_right_inverse = _checked_matrix(
            smith_right_inverse,
            self.column_count,
            self.column_count,
            "SNF right inverse",
        )
        if backend not in ("flint", "python"):
            raise RelationMatrixError("presentation backend must be flint or python")
        self.backend = backend
        diagonal = tuple(
            self.smith[index][index]
            for index in range(min(self.row_count, self.column_count))
        )
        self.rank = sum(1 for value in diagonal if value != 0)
        self.diagonal = diagonal[: self.rank]
        self.free_rank = self.column_count - self.rank
        self.invariant_positions = tuple(
            index for index, value in enumerate(self.diagonal) if value > 1
        )
        self.invariants = tuple(
            self.diagonal[index] for index in self.invariant_positions
        )
        self.order = None if self.free_rank else _product(self.diagonal)
        generator_positions = self.invariant_positions + tuple(
            range(self.rank, self.column_count)
        )
        self.generator_positions = generator_positions
        self.generator_transforms = tuple(
            self.smith_right_inverse[position] for position in generator_positions
        )
        self.dependency_transforms = tuple(
            self.smith_left_transform[index]
            for index in range(self.rank, self.row_count)
        )
        self.unit_transforms = self.dependency_transforms

    def smith_coordinates(self, vector: Sequence[int]) -> tuple[int, ...]:
        checked = tuple(_integer(value, "ambient coordinate") for value in vector)
        if len(checked) != self.column_count:
            raise RelationMatrixError("ambient coordinate vector has the wrong length")
        return tuple(_row_vector_multiply(checked, self.smith_right_transform))

    def class_coordinates(self, vector: Sequence[int]) -> tuple[int, ...]:
        smith = self.smith_coordinates(vector)
        torsion = tuple(
            smith[position] % self.diagonal[position]
            for position in self.invariant_positions
        )
        return torsion + smith[self.rank :]

    def lift_class_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        checked = tuple(_integer(value, "class coordinate") for value in coordinates)
        if len(checked) != len(self.generator_positions):
            raise RelationMatrixError("class coordinate vector has the wrong length")
        smith = [0] * self.column_count
        for position, value in zip(self.generator_positions, checked, strict=False):
            if position < self.rank:
                value %= self.diagonal[position]
            smith[position] = value
        return tuple(_row_vector_multiply(smith, self.smith_right_inverse))

    def reduce_ambient(self, vector: Sequence[int]) -> tuple[int, ...]:
        return self.lift_class_coordinates(self.class_coordinates(vector))

    def relation_combination(self, smith_row: int) -> tuple[int, ...]:
        index = _nonnegative_integer(smith_row, "smith_row")
        if index >= self.row_count:
            raise RelationMatrixError("smith_row is out of bounds")
        return self.smith_left_transform[index]

    def dependency_combination(self, index: int) -> tuple[int, ...]:
        position = _nonnegative_integer(index, "dependency index")
        if position >= len(self.dependency_transforms):
            raise RelationMatrixError("dependency index is out of bounds")
        return self.dependency_transforms[position]

    def verify(self) -> bool:
        source = [row.dense() for row in self.relation_rows]
        hnf = [list(row) for row in self.hnf]
        smith = [list(row) for row in self.smith]
        hnf_left = [list(row) for row in self.hnf_left_transform]
        smith_left = [list(row) for row in self.smith_left_transform]
        smith_right = [list(row) for row in self.smith_right_transform]
        smith_inverse = [list(row) for row in self.smith_right_inverse]
        if _matrix_multiply(hnf_left, source) != hnf:
            return False
        if _matrix_multiply(_matrix_multiply(smith_left, source), smith_right) != smith:
            return False
        identity = _identity(self.column_count)
        if _matrix_multiply(smith_inverse, smith_right) != identity:
            return False
        if _matrix_multiply(smith_right, smith_inverse) != identity:
            return False
        if abs(_determinant_exact(hnf_left)) != 1:
            return False
        if abs(_determinant_exact(smith_left)) != 1:
            return False
        if abs(_determinant_exact(smith_right)) != 1:
            return False
        diagonal_limit = min(self.row_count, self.column_count)
        previous = 1
        seen_zero = False
        for row in range(self.row_count):
            for column in range(self.column_count):
                if row != column and smith[row][column] != 0:
                    return False
            if row < diagonal_limit:
                entry = smith[row][row]
                if entry < 0:
                    return False
                if entry == 0:
                    seen_zero = True
                elif seen_zero or entry % previous:
                    return False
                else:
                    previous = entry
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PRESENTATION_SCHEMA,
            "columns": self.column_count,
            "rows": [row.to_dict() for row in self.relation_rows],
            "hnf": [list(row) for row in self.hnf],
            "hnf_left": [list(row) for row in self.hnf_left_transform],
            "smith": [list(row) for row in self.smith],
            "smith_left": [list(row) for row in self.smith_left_transform],
            "smith_right": [list(row) for row in self.smith_right_transform],
            "smith_right_inverse": [list(row) for row in self.smith_right_inverse],
            "backend": self.backend,
        }

    @classmethod
    def from_dict(cls, value: Any) -> RelationPresentation:
        if not isinstance(value, dict) or value.get("schema") != PRESENTATION_SCHEMA:
            raise RelationMatrixError("unsupported relation-presentation schema")
        expected = {
            "schema",
            "columns",
            "rows",
            "hnf",
            "hnf_left",
            "smith",
            "smith_left",
            "smith_right",
            "smith_right_inverse",
            "backend",
        }
        if set(value) != expected:
            raise RelationMatrixError(
                "relation-presentation payload has unknown fields"
            )
        if not isinstance(value["rows"], list):
            raise RelationMatrixError("relation-presentation rows must be a list")
        answer = cls(
            value["columns"],
            [SparseRelationRow.from_dict(row) for row in value["rows"]],
            value["hnf"],
            value["hnf_left"],
            value["smith"],
            value["smith_left"],
            value["smith_right"],
            value["smith_right_inverse"],
            value["backend"],
        )
        if not answer.verify():
            raise RelationMatrixError("relation-presentation replay failed")
        return answer


def _product(values: Iterable[int]) -> int:
    answer = 1
    for value in values:
        answer *= value
    return answer


def extract_relation_presentation(
    rows: Iterable[Any],
    column_count: int | None = None,
    *,
    backend: str = "auto",
    require_full_rank: bool = False,
) -> RelationPresentation:
    """Compute exact HNF/SNF and replay transforms for integer relation rows."""
    if backend not in ("auto", "flint", "python"):
        raise RelationMatrixError("backend must be auto, flint, or python")
    materialized = list(rows)
    if column_count is None:
        if not materialized:
            raise RelationMatrixError("column_count is required for an empty matrix")
        first = materialized[0]
        if isinstance(first, SparseRelationRow):
            column_count = first.column_count
        else:
            sequence = list(first)
            if not all(
                isinstance(value, int) and not isinstance(value, bool)
                for value in sequence
            ):
                raise RelationMatrixError(
                    "column_count is required when rows use sparse pairs"
                )
            column_count = len(sequence)
            materialized[0] = sequence
    columns = _nonnegative_integer(column_count, "column_count")
    sparse_rows = tuple(SparseRelationRow(columns, row) for row in materialized)
    source = [row.dense() for row in sparse_rows]
    selected = backend
    hnf: list[list[int]] = []
    hnf_left: list[list[int]] = []
    smith: list[list[int]] = []
    smith_left: list[list[int]] = []
    smith_right: list[list[int]] = []
    if backend in ("auto", "flint") and source:
        try:
            hnf, hnf_left, smith, smith_left, smith_right = _flint_forms(
                source, columns
            )
            selected = "flint"
        except (ImportError, RuntimeError, TypeError, ValueError, ArithmeticError):
            if backend == "flint":
                raise
            selected = "python"
    else:
        selected = "python"
    if selected == "python":
        hnf, hnf_left = _python_hnf_transform(source, columns)
        smith, smith_left, smith_right = _python_snf_transform(source, columns)
    smith_right_inverse = _invert_unimodular(smith_right)
    answer = RelationPresentation(
        columns,
        sparse_rows,
        hnf,
        hnf_left,
        smith,
        smith_left,
        smith_right,
        smith_right_inverse,
        selected,
    )
    if require_full_rank and answer.rank != columns:
        raise ArithmeticError("relation matrix does not have full column rank")
    if not answer.verify():
        raise ArithmeticError("exact relation presentation failed replay verification")
    return answer


def modular_rank_and_pivots(
    rows: Iterable[Any],
    column_count: int,
    primes: Iterable[int] = DEFAULT_SCREEN_PRIMES,
) -> dict[str, Any]:
    """Return deterministic modular ranks and best-prime pivot diagnostics."""
    screen = ModularPivotScreen(column_count, primes)
    screen.rebuild(rows)
    return {
        "primes": screen.primes,
        "ranks": screen.ranks,
        "rank_lower_bound": screen.rank_lower_bound,
        "full_column_rank_certified": screen.full_column_rank_certified,
        "best_prime": screen.best_prime,
        "pivots": screen.pivots,
        "missing_pivots": screen.missing_pivots,
    }


__all__ = [
    "ACCUMULATOR_SCHEMA",
    "DEFAULT_SCREEN_PRIMES",
    "DeferredPresentationPolicy",
    "ModularInsertion",
    "ModularPivotScreen",
    "PRESENTATION_DECISION_SCHEMA",
    "PRESENTATION_POLICY_SCHEMA",
    "PRESENTATION_SCHEMA",
    "PresentationDecision",
    "PresentationUpdate",
    "RelationInsertion",
    "RelationMatrixAccumulator",
    "RelationMatrixError",
    "RelationPresentation",
    "SparseRelationRow",
    "extract_relation_presentation",
    "modular_rank_and_pivots",
]
