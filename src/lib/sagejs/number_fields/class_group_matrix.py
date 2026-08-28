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
MAX_PACKED_PRESENTATION_DIMENSION = 256
MAX_PACKED_PRESENTATION_VALUES = 65_536
MAX_PACKED_PRESENTATION_ENTRY_BITS = 16_384
MAX_PACKED_PRESENTATION_OUTPUT_WORDS = 1_000_000
MAX_RESIDENT_HNF_ROWS = 64
MAX_RESIDENT_HNF_COLUMNS = 16
MAX_RESIDENT_HNF_VALUES = 1_024
MAX_RESIDENT_HNF_ENTRY_BITS = 4_096
MAX_RESIDENT_HNF_DELETION_TRIALS = 64
MAX_RESIDENT_HNF_WORK = 1_000_000

_presentation_replay_kernel_override: Any = None
_presentation_forms_kernel_override: Any = None
_resident_hnf_kernel_override: Any = None


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


def _readable_relation_presentation_replay(
    source: list[list[int]],
    hnf: list[list[int]],
    hnf_left: list[list[int]],
    smith: list[list[int]],
    smith_left: list[list[int]],
    smith_right: list[list[int]],
    smith_inverse: list[list[int]],
) -> bool:
    """Replay the exact matrix identities through the readable oracle."""
    if _matrix_multiply(hnf_left, source) != hnf:
        return False
    if _matrix_multiply(_matrix_multiply(smith_left, source), smith_right) != smith:
        return False
    identity = _identity(len(smith_right))
    if _matrix_multiply(smith_inverse, smith_right) != identity:
        return False
    if _matrix_multiply(smith_right, smith_inverse) != identity:
        return False
    if abs(_determinant_exact(hnf_left)) != 1:
        return False
    if abs(_determinant_exact(smith_left)) != 1:
        return False
    return abs(_determinant_exact(smith_right)) == 1


def _packed_relation_presentation_replay(
    source: list[list[int]],
    hnf: list[list[int]],
    hnf_left: list[list[int]],
    smith: list[list[int]],
    smith_left: list[list[int]],
    smith_right: list[list[int]],
    smith_inverse: list[list[int]],
) -> bool | None:
    """Use one bounded isolated FLINT call, or decline to the exact oracle."""
    rows = len(source)
    columns = len(source[0]) if source else 0
    if (
        rows < 1
        or columns < 1
        or rows > MAX_PACKED_PRESENTATION_DIMENSION
        or columns > MAX_PACKED_PRESENTATION_DIMENSION
        or rows * columns > MAX_PACKED_PRESENTATION_VALUES
        or rows * rows > MAX_PACKED_PRESENTATION_VALUES
        or columns * columns > MAX_PACKED_PRESENTATION_VALUES
        or _presentation_replay_kernel_override is False
    ):
        return None
    matrices = (
        source,
        hnf,
        hnf_left,
        smith,
        smith_left,
        smith_right,
        smith_inverse,
    )
    maximum_bits = 1
    for matrix in matrices:
        for row in matrix:
            for value in row:
                maximum_bits = max(maximum_bits, abs(value).bit_length())
    if maximum_bits > MAX_PACKED_PRESENTATION_ENTRY_BITS:
        return None
    largest_dimension = max(rows, columns)
    product_bits = 3 * maximum_bits + 2 * largest_dimension.bit_length() + 3
    determinant_bits = largest_dimension * (
        maximum_bits + largest_dimension.bit_length() + 2
    )
    product_words = max(8, (product_bits + 63) // 64 + 2)
    determinant_words = max(8, (determinant_bits + 63) // 64 + 2)
    output_words = (
        2 * rows * columns + columns * columns
    ) * product_words + determinant_words
    if output_words > MAX_PACKED_PRESENTATION_OUTPUT_WORDS:
        return None
    try:
        kernel_module = __import__(
            "sagejs.kernels.matrix.dense_integer_flint",
            fromlist=["dense_integer_flint"],
        )
        native_module = __import__("sagejs.native", fromlist=["native"])
        kernel = (
            _presentation_replay_kernel_override
            if callable(_presentation_replay_kernel_override)
            else kernel_module.flint_relation_presentation_replay
        )
        packed = [
            native_module.kernel_integer_buffer(
                kernel, [value for row in matrix for value in row]
            )
            for matrix in matrices
        ]
        status = kernel(
            native_module.kernel_integer_zeros(kernel, rows * columns, product_words),
            native_module.kernel_integer_zeros(kernel, rows * columns, product_words),
            native_module.kernel_integer_zeros(
                kernel, columns * columns, product_words
            ),
            native_module.kernel_integer_zeros(kernel, 1, determinant_words),
            *packed,
            rows,
            columns,
            1,
        )
    except (
        ImportError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
        ArithmeticError,
    ):
        return None
    if status == 1:
        return True
    if status == 0:
        return False
    return None


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


def _packed_flint_forms(
    source: list[list[int]], columns: int
) -> (
    tuple[
        list[list[int]],
        list[list[int]],
        list[list[int]],
        list[list[int]],
        list[list[int]],
    ]
    | None
):
    """Extract FLINT transforms directly through bounded integer buffers.

    The general matrix API owns cached native matrix resources and is the
    right boundary for public matrix objects.  Relation presentations only
    need five canonical integer arrays once, so constructing seven Matrix
    wrappers and reading their entries back dominates FLINT on the small
    matrices used by class-group relation collection.  This path calls the
    same source-transparent HNF/SNF kernels directly.  Any unsupported shape,
    output-capacity failure, or unavailable kernel falls back to `_flint_forms`.
    """
    rows = len(source)
    if (
        rows < 1
        or columns < 1
        or rows > MAX_PACKED_PRESENTATION_DIMENSION
        or columns > MAX_PACKED_PRESENTATION_DIMENSION
        or rows * columns > MAX_PACKED_PRESENTATION_VALUES
        or rows * rows > MAX_PACKED_PRESENTATION_VALUES
        or columns * columns > MAX_PACKED_PRESENTATION_VALUES
        or _presentation_forms_kernel_override is False
    ):
        return None
    maximum_bits = 1
    for row in source:
        if len(row) != columns:
            return None
        for value in row:
            if isinstance(value, bool) or not isinstance(value, int):
                return None
            maximum_bits = max(maximum_bits, abs(value).bit_length())
    if maximum_bits > MAX_PACKED_PRESENTATION_ENTRY_BITS:
        return None
    largest_dimension = max(rows, columns)
    output_bits = largest_dimension * (
        maximum_bits + largest_dimension.bit_length() + 2
    )
    word_capacity = max(8, (output_bits + 63) // 64 + 2)
    output_entries = 2 * rows * columns + 2 * rows * rows + columns * columns
    if output_entries * word_capacity > MAX_PACKED_PRESENTATION_OUTPUT_WORDS:
        return None

    def reshape(values: Any, row_count: int, column_count: int) -> list[list[int]]:
        materialized = list(values)
        if len(materialized) != row_count * column_count:
            raise ArithmeticError("packed matrix form has the wrong size")
        return [
            materialized[index * column_count : (index + 1) * column_count]
            for index in range(row_count)
        ]

    try:
        kernel_module = __import__(
            "sagejs.kernels.matrix.dense_integer_flint",
            fromlist=["dense_integer_flint"],
        )
        native_module = __import__("sagejs.native", fromlist=["native"])
        override = _presentation_forms_kernel_override
        if isinstance(override, tuple) and len(override) == 2:
            hnf_kernel, smith_kernel = override
        else:
            hnf_kernel = kernel_module.flint_dense_integer_matrix_hnf_transform
            smith_kernel = kernel_module.flint_dense_integer_matrix_snf_transform
        flat = [entry for row in source for entry in row]

        hnf_source = native_module.kernel_integer_buffer(hnf_kernel, flat)
        hnf = native_module.kernel_integer_zeros(
            hnf_kernel, rows * columns, word_capacity
        )
        hnf_left = native_module.kernel_integer_zeros(
            hnf_kernel, rows * rows, word_capacity
        )
        if not hnf_kernel(hnf, hnf_left, hnf_source, rows, columns):
            return None

        smith_source = native_module.kernel_integer_buffer(smith_kernel, flat)
        smith = native_module.kernel_integer_zeros(
            smith_kernel, rows * columns, word_capacity
        )
        smith_left = native_module.kernel_integer_zeros(
            smith_kernel, rows * rows, word_capacity
        )
        smith_right = native_module.kernel_integer_zeros(
            smith_kernel, columns * columns, word_capacity
        )
        if not smith_kernel(
            smith,
            smith_left,
            smith_right,
            smith_source,
            rows,
            columns,
        ):
            return None
        values = native_module.integer_buffer_values
        return (
            reshape(values(hnf), rows, columns),
            reshape(values(hnf_left), rows, rows),
            reshape(values(smith), rows, columns),
            reshape(values(smith_left), rows, rows),
            reshape(values(smith_right), columns, columns),
        )
    except (
        ImportError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
        ArithmeticError,
    ):
        return None


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
        matrix_replay = _packed_relation_presentation_replay(
            source,
            hnf,
            hnf_left,
            smith,
            smith_left,
            smith_right,
            smith_inverse,
        )
        if matrix_replay is None:
            matrix_replay = _readable_relation_presentation_replay(
                source,
                hnf,
                hnf_left,
                smith,
                smith_left,
                smith_right,
                smith_inverse,
            )
        if not matrix_replay:
            return False
        expected_diagonal = tuple(
            self.smith[index][index]
            for index in range(min(self.row_count, self.column_count))
        )
        expected_rank = sum(1 for value in expected_diagonal if value != 0)
        expected_diagonal = expected_diagonal[:expected_rank]
        expected_positions = tuple(
            index for index, value in enumerate(expected_diagonal) if value > 1
        )
        expected_invariants = tuple(
            expected_diagonal[index] for index in expected_positions
        )
        expected_order = (
            None if self.column_count - expected_rank else _product(expected_diagonal)
        )
        expected_generator_positions = expected_positions + tuple(
            range(expected_rank, self.column_count)
        )
        expected_generator_transforms = tuple(
            self.smith_right_inverse[position]
            for position in expected_generator_positions
        )
        expected_dependencies = tuple(
            self.smith_left_transform[index]
            for index in range(expected_rank, self.row_count)
        )
        if (
            self.rank != expected_rank
            or self.diagonal != expected_diagonal
            or self.free_rank != self.column_count - expected_rank
            or self.invariant_positions != expected_positions
            or self.invariants != expected_invariants
            or self.order != expected_order
            or self.generator_positions != expected_generator_positions
            or self.generator_transforms != expected_generator_transforms
            or self.dependency_transforms != expected_dependencies
            or self.unit_transforms != expected_dependencies
        ):
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


def extend_relation_presentation_with_duplicate_rows(
    presentation: RelationPresentation,
    rows: Iterable[Any],
) -> RelationPresentation:
    """Extend exact transforms when each appended relation duplicates a row.

    A new row equal to source row `j` contributes the primitive dependency
    `new - j = 0`.  Appending that dependency to both left transforms and a
    zero row to HNF/SNF preserves unimodularity and every invariant without
    recomputing either normal form.  This is useful for unit witnesses: two
    distinct principal generators with the same valuation row differ by an
    exact unit.
    """
    if not isinstance(presentation, RelationPresentation):
        raise RelationMatrixError("a duplicate-row extension needs a presentation")
    columns = presentation.column_count
    retained = list(presentation.relation_rows)
    duplicate_sources: list[int] = []
    appended: list[SparseRelationRow] = []
    for raw_row in rows:
        row = SparseRelationRow(columns, raw_row)
        source = next(
            (index for index, existing in enumerate(retained) if existing == row),
            None,
        )
        if source is None:
            raise RelationMatrixError("an appended relation is not a duplicate row")
        duplicate_sources.append(source)
        appended.append(row)
        retained.append(row)
    if not appended:
        return presentation
    old_count = presentation.row_count
    new_count = len(retained)

    def extend_left(transform: tuple[tuple[int, ...], ...]) -> list[list[int]]:
        answer = [list(row) + [0] * len(appended) for row in transform]
        for offset, source in enumerate(duplicate_sources):
            row = [0] * new_count
            row[source] = -1
            row[old_count + offset] = 1
            answer.append(row)
        return answer

    zero_rows = [[0] * columns for _row in appended]
    answer = RelationPresentation(
        columns,
        retained,
        [list(row) for row in presentation.hnf] + zero_rows,
        extend_left(presentation.hnf_left_transform),
        [list(row) for row in presentation.smith] + zero_rows,
        extend_left(presentation.smith_left_transform),
        presentation.smith_right_transform,
        presentation.smith_right_inverse,
        presentation.backend,
    )
    if not answer.verify():
        raise RelationMatrixError(
            "a duplicate-row presentation extension failed replay"
        )
    return answer


def _product(values: Iterable[int]) -> int:
    answer = 1
    for value in values:
        answer *= value
    return answer


class ResidentRelationHNFSelection:
    """Exact result of one resident HNF selection boundary."""

    def __init__(
        self,
        basis: Iterable[Iterable[int]],
        source_support: Iterable[int],
        selected_candidate_indices: Iterable[int],
        *,
        rank: int,
        deletion_trials: int,
        hnf_calls: int,
        deletion_complete: bool,
        backend: str,
        boundary_calls: int,
        packed_input_bytes: int,
        published_output_values: int,
        work_units: int,
    ) -> None:
        self.basis = tuple(tuple(int(value) for value in row) for row in basis)
        self.source_support = tuple(int(index) for index in source_support)
        self.selected_candidate_indices = tuple(
            int(index) for index in selected_candidate_indices
        )
        self.rank = int(rank)
        self.deletion_trials = int(deletion_trials)
        self.hnf_calls = int(hnf_calls)
        self.deletion_complete = bool(deletion_complete)
        self.backend = str(backend)
        self.boundary_calls = int(boundary_calls)
        self.packed_input_bytes = int(packed_input_bytes)
        self.published_output_values = int(published_output_values)
        self.work_units = int(work_units)

    def to_dict(self) -> dict[str, Any]:
        """Return deterministic exact data suitable for benchmark receipts."""
        return {
            "basis": [list(row) for row in self.basis],
            "source_support": list(self.source_support),
            "selected_candidate_indices": list(self.selected_candidate_indices),
            "rank": self.rank,
            "deletion_trials": self.deletion_trials,
            "hnf_calls": self.hnf_calls,
            "deletion_complete": self.deletion_complete,
            "backend": self.backend,
            "boundary_calls": self.boundary_calls,
            "packed_input_bytes": self.packed_input_bytes,
            "published_output_values": self.published_output_values,
            "work_units": self.work_units,
        }

    def __eq__(self, other: object) -> bool:
        return isinstance(other, ResidentRelationHNFSelection) and (
            self.basis,
            self.source_support,
            self.selected_candidate_indices,
            self.rank,
            self.deletion_trials,
            self.deletion_complete,
        ) == (
            other.basis,
            other.source_support,
            other.selected_candidate_indices,
            other.rank,
            other.deletion_trials,
            other.deletion_complete,
        )

    def __repr__(self) -> str:
        return (
            "ResidentRelationHNFSelection(basis="
            + repr(self.basis)
            + ", source_support="
            + repr(self.source_support)
            + ", selected_candidate_indices="
            + repr(self.selected_candidate_indices)
            + ", rank="
            + repr(self.rank)
            + ", backend="
            + repr(self.backend)
            + ")"
        )


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
            packed_forms = _packed_flint_forms(source, columns)
            if packed_forms is None:
                packed_forms = _flint_forms(source, columns)
            hnf, hnf_left, smith, smith_left, smith_right = packed_forms
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


def exact_relation_hnf_support(
    rows: Iterable[Any], column_count: int
) -> tuple[tuple[tuple[int, ...], ...], tuple[int, ...]]:
    """Return the exact nonzero row-HNF basis and its source-row support.

    This is the HNF-only boundary for relation proposal selection.  It avoids
    computing an SNF, while still replaying the left transform and checking
    that it is unimodular.  The returned support contains every source row
    used by a nonzero canonical HNF row.
    """
    columns = _nonnegative_integer(column_count, "column_count")
    source: list[list[int]] = []
    for raw_row in rows:
        if isinstance(raw_row, SparseRelationRow):
            if raw_row.column_count != columns:
                raise RelationMatrixError("relation row has the wrong column count")
            source.append(raw_row.dense())
            continue
        if isinstance(raw_row, (list, tuple)):
            row = list(raw_row)
            if len(row) != columns or any(
                not isinstance(value, int) or isinstance(value, bool) for value in row
            ):
                raise RelationMatrixError(
                    "dense relation rows require exact integer entries"
                )
            source.append(row)
            continue
        source.append(SparseRelationRow(columns, raw_row).dense())
    if not source:
        return (), ()
    native_replayed = False
    try:
        row_count = len(source)
        flat = [entry for row in source for entry in row]
        matrix_module = __import__("sagejs._baselib.matrix", fromlist=["matrix"])
        algebra_module = __import__("sagejs._baselib.algebra", fromlist=["ZZ"])
        matrix = matrix_module.matrix(algebra_module.ZZ, row_count, columns, flat)
        hermite, hermite_left = matrix.hermite_form(transformation=True)
        if hermite_left * matrix != hermite:
            raise ArithmeticError("exact relation HNF transform failed replay")
        if abs(int(hermite_left.determinant())) != 1:
            raise ArithmeticError("exact relation HNF transform is not unimodular")
        rank = int(hermite.rank())
        hnf = _sage_rows(hermite, rank, columns)
        left = _sage_rows(hermite_left, rank, row_count)
        native_replayed = True
    except (ImportError, RuntimeError, TypeError, ValueError, ArithmeticError):
        hnf, left = _python_hnf_transform(source, columns)
    if not native_replayed:
        if _matrix_multiply(left, source) != hnf:
            raise ArithmeticError("exact relation HNF transform failed replay")
        if abs(_determinant_exact(left)) != 1:
            raise ArithmeticError("exact relation HNF transform is not unimodular")
    nonzero = [index for index, row in enumerate(hnf) if any(row)]
    basis = tuple(tuple(int(value) for value in hnf[index]) for index in nonzero)
    support = tuple(
        sorted(
            {
                source_index
                for index in nonzero
                for source_index, coefficient in enumerate(left[index])
                if coefficient != 0
            }
        )
    )
    return basis, support


def exact_relation_hnf_basis(
    rows: Iterable[Any], column_count: int
) -> tuple[tuple[int, ...], ...]:
    """Return the exact nonzero row-HNF basis without computing an SNF."""
    columns = _nonnegative_integer(column_count, "column_count")
    sparse_rows = tuple(SparseRelationRow(columns, row) for row in rows)
    source = [row.dense() for row in sparse_rows]
    if not source:
        return ()
    try:
        row_count = len(source)
        flat = [entry for row in source for entry in row]
        matrix_module = __import__("sagejs._baselib.matrix", fromlist=["matrix"])
        algebra_module = __import__("sagejs._baselib.algebra", fromlist=["ZZ"])
        matrix = matrix_module.matrix(algebra_module.ZZ, row_count, columns, flat)
        hermite = matrix.hermite_form(include_zero_rows=False)
        return tuple(
            tuple(int(hermite[row, column]) for column in range(columns))
            for row in range(hermite.nrows())
        )
    except (ImportError, RuntimeError, TypeError, ValueError, ArithmeticError):
        hnf, _left = _python_hnf_transform(source, columns)
        return tuple(tuple(int(value) for value in row) for row in hnf if any(row))


def _resident_hnf_rows(
    rows: Iterable[Any], columns: int, label: str, maximum_rows: int
) -> tuple[tuple[int, ...], ...]:
    answer: list[tuple[int, ...]] = []
    for raw_row in rows:
        if len(answer) >= maximum_rows:
            raise RelationMatrixError("resident HNF matrix exceeds its shape bound")
        try:
            sparse = SparseRelationRow(columns, raw_row)
        except (TypeError, ValueError) as error:
            raise RelationMatrixError(label + " contains an invalid row") from error
        answer.append(tuple(sparse.dense()))
    return tuple(answer)


def _resident_hnf_cancelled(cancelled: Any) -> None:
    try:
        runtime_module = __import__("sagejs.runtime", fromlist=["runtime"])
        runtime_module.check_interrupt()
    except ImportError:
        # Ordinary CPython intentionally has no Sage.js host runtime.
        pass
    if cancelled is not None and cancelled():
        raise RuntimeError("class/unit computation cancelled")


def _python_resident_relation_hnf_selection(
    initial: tuple[tuple[int, ...], ...],
    candidates: tuple[tuple[int, ...], ...],
    columns: int,
    maximum_trials: int,
    cancelled: Any,
) -> ResidentRelationHNFSelection:
    """Ordinary exact oracle for resident HNF support and deletion."""
    _resident_hnf_cancelled(cancelled)
    source = [list(row) for row in initial + candidates]
    if not source:
        return ResidentRelationHNFSelection(
            (),
            (),
            (),
            rank=0,
            deletion_trials=0,
            hnf_calls=0,
            deletion_complete=True,
            backend="python",
            boundary_calls=0,
            packed_input_bytes=0,
            published_output_values=0,
            work_units=0,
        )
    hnf, left = _python_hnf_transform(source, columns)
    if _matrix_multiply(left, source) != hnf:
        raise ArithmeticError("resident HNF transform failed exact replay")
    if abs(_determinant_exact(left)) != 1:
        raise ArithmeticError("resident HNF transform is not unimodular")
    nonzero = [index for index, row in enumerate(hnf) if any(row)]
    basis = tuple(tuple(int(value) for value in hnf[index]) for index in nonzero)
    support = tuple(
        sorted(
            {
                source_index
                for index in nonzero
                for source_index, coefficient in enumerate(left[index])
                if coefficient != 0
            }
        )
    )
    initial_count = len(initial)
    selected = sorted(
        index - initial_count for index in support if index >= initial_count
    )
    cursor = 0
    trials = 0
    while cursor < len(selected) and trials < maximum_trials:
        _resident_hnf_cancelled(cancelled)
        trial_indices = selected[:cursor] + selected[cursor + 1 :]
        trial_rows = list(initial) + [candidates[index] for index in trial_indices]
        if len(trial_rows) < len(basis):
            cursor += 1
            continue
        trial_hnf, _trial_left = _python_hnf_transform(trial_rows, columns)
        trial_basis = tuple(tuple(row) for row in trial_hnf if any(row))
        trials += 1
        if trial_basis == basis:
            selected = trial_indices
        else:
            cursor += 1
    _resident_hnf_cancelled(cancelled)
    row_count = len(source)
    row_entries = row_count * columns
    work_units = (
        3 * row_entries + row_count * row_count + trials * (row_entries + 2 * columns)
    )
    return ResidentRelationHNFSelection(
        basis,
        support,
        selected,
        rank=len(basis),
        deletion_trials=trials,
        hnf_calls=1 + trials,
        deletion_complete=cursor >= len(selected),
        backend="python",
        boundary_calls=0,
        packed_input_bytes=0,
        published_output_values=(
            len(basis) * columns + len(support) + len(selected) + 7
        ),
        work_units=work_units,
    )


def resident_exact_relation_hnf_selection(
    initial_rows: Iterable[Any],
    candidate_rows: Iterable[Any],
    column_count: int,
    *,
    backend: str = "auto",
    maximum_deletion_trials: int = MAX_RESIDENT_HNF_DELETION_TRIALS,
    work_limit: int = MAX_RESIDENT_HNF_WORK,
    cancelled: Any = None,
) -> ResidentRelationHNFSelection:
    """Return canonical HNF support, retained candidates, and exact rank.

    The accelerated path packs the full source once and performs support
    extraction plus the stable deletion schedule in one isolated call.  The
    independent `python` backend uses the ordinary exact HNF implementation.
    A cancellation callback selects that interruptible backend and is polled
    before every HNF deletion trial.
    """
    if backend not in ("auto", "native", "javascript", "python"):
        raise RelationMatrixError(
            "resident HNF backend must be auto, native, javascript, or python"
        )
    if cancelled is not None and not callable(cancelled):
        raise TypeError("cancelled must be callable")
    columns = _nonnegative_integer(column_count, "column_count")
    maximum_trials = _nonnegative_integer(
        maximum_deletion_trials, "maximum_deletion_trials"
    )
    maximum_work = _nonnegative_integer(work_limit, "work_limit")
    if columns < 1 or columns > MAX_RESIDENT_HNF_COLUMNS:
        raise RelationMatrixError("resident HNF column count exceeds its bound")
    if maximum_trials > MAX_RESIDENT_HNF_DELETION_TRIALS:
        raise RelationMatrixError("resident HNF deletion-trial bound is too large")
    if maximum_work > MAX_RESIDENT_HNF_WORK:
        raise RelationMatrixError("resident HNF work bound is too large")

    _resident_hnf_cancelled(cancelled)
    initial = _resident_hnf_rows(
        initial_rows, columns, "initial_rows", MAX_RESIDENT_HNF_ROWS
    )
    candidates = _resident_hnf_rows(
        candidate_rows,
        columns,
        "candidate_rows",
        MAX_RESIDENT_HNF_ROWS - len(initial),
    )
    source = initial + candidates
    row_count = len(source)
    row_entries = row_count * columns
    if row_count > MAX_RESIDENT_HNF_ROWS or row_entries > MAX_RESIDENT_HNF_VALUES:
        raise RelationMatrixError("resident HNF matrix exceeds its shape bound")
    maximum_bits = max(
        (abs(value).bit_length() for row in source for value in row), default=1
    )
    if maximum_bits > MAX_RESIDENT_HNF_ENTRY_BITS:
        raise RelationMatrixError("resident HNF entry exceeds its bit bound")
    bounded_trials = min(maximum_trials, len(candidates))
    required_work = (
        3 * row_entries
        + row_count * row_count
        + bounded_trials * (row_entries + 2 * columns)
    )
    if required_work > maximum_work:
        raise RelationMatrixError("resident HNF work limit is insufficient")

    largest_dimension = max(row_count, columns)
    output_bits = largest_dimension * (
        maximum_bits + largest_dimension.bit_length() + 2
    )
    word_capacity = max(8, (output_bits + 63) // 64 + 2)
    input_word_capacity = max(8, (maximum_bits + 63) // 64)
    output_entries = (
        3 * row_entries + row_count * row_count + row_count + len(candidates) + 8
    )
    if output_entries * word_capacity > MAX_PACKED_PRESENTATION_OUTPUT_WORDS:
        raise RelationMatrixError("resident HNF output exceeds its storage bound")
    if backend == "python" or cancelled is not None or not source:
        return _python_resident_relation_hnf_selection(
            initial, candidates, columns, bounded_trials, cancelled
        )

    try:
        kernel_module = __import__(
            "sagejs.kernels.matrix.class_group_hnf",
            fromlist=["class_group_hnf"],
        )
        native_module = __import__("sagejs.native", fromlist=["native"])
        base_kernel: Any = (
            _resident_hnf_kernel_override
            if callable(_resident_hnf_kernel_override)
            else kernel_module.resident_exact_relation_hnf_select
        )
        if backend == "javascript":
            kernel = base_kernel.javascript
        else:
            kernel = base_kernel
        if backend == "native" and not native_module.is_compiled(kernel):
            raise RuntimeError("resident HNF native kernel is unavailable")
        packing_kernel = base_kernel if backend == "javascript" else kernel

        def zeros(length: int, words: int = word_capacity) -> Any:
            return native_module.kernel_integer_zeros(packing_kernel, length, words)

        flat = [value for row in source for value in row]
        metadata_buffer = zeros(7, 2)
        basis_buffer = zeros(row_entries)
        transform_buffer = zeros(row_count * row_count)
        support_buffer = zeros(row_count, 2)
        selected_buffer = zeros(len(candidates), 2)
        trial_hnf_buffer = zeros(row_entries)
        replay_buffer = zeros(row_entries)
        # Exact replay is complete before deletion starts, so one bounded
        # workspace can safely serve as both replay output and trial source.
        trial_source_buffer = replay_buffer
        determinant_buffer = zeros(1)
        source_buffer = native_module.kernel_integer_buffer(packing_kernel, flat)
        status = kernel(
            metadata_buffer,
            basis_buffer,
            transform_buffer,
            support_buffer,
            selected_buffer,
            trial_source_buffer,
            trial_hnf_buffer,
            replay_buffer,
            determinant_buffer,
            source_buffer,
            row_count,
            len(initial),
            columns,
            bounded_trials,
            maximum_work,
            1,
        )
        if status == 0:
            raise ArithmeticError("resident HNF kernel failed exact replay")
        if status != 1:
            raise RuntimeError("resident HNF kernel declined its packed input")
        metadata = tuple(
            int(value) for value in native_module.integer_buffer_values(metadata_buffer)
        )
        basis_values = tuple(
            int(value) for value in native_module.integer_buffer_values(basis_buffer)
        )
        support_values = tuple(
            int(value) for value in native_module.integer_buffer_values(support_buffer)
        )
        selected_values = tuple(
            int(value) for value in native_module.integer_buffer_values(selected_buffer)
        )
        mode = native_module.execution_mode(kernel)
        _resident_hnf_cancelled(None)
    except ArithmeticError:
        raise
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        if backend != "auto":
            raise
        return _python_resident_relation_hnf_selection(
            initial, candidates, columns, bounded_trials, cancelled
        )

    if len(metadata) != 7:
        raise ArithmeticError("resident HNF metadata has the wrong size")
    rank = metadata[0]
    if rank < 0 or rank > min(row_count, columns):
        raise ArithmeticError("resident HNF rank is outside its bounds")
    if any(value not in (0, 1) for value in support_values + selected_values):
        raise ArithmeticError("resident HNF support masks are not boolean")
    basis = tuple(
        basis_values[index * columns : (index + 1) * columns] for index in range(rank)
    )
    source_support = tuple(
        index for index, value in enumerate(support_values) if value == 1
    )
    selected_indices = tuple(
        index for index, value in enumerate(selected_values) if value == 1
    )
    if metadata[1] != len(source_support) or metadata[2] != len(selected_indices):
        raise ArithmeticError("resident HNF support counts failed replay")
    if any(index + len(initial) not in source_support for index in selected_indices):
        raise ArithmeticError("resident HNF selected a row outside exact support")
    if metadata[3] < 0 or metadata[3] > bounded_trials:
        raise ArithmeticError("resident HNF deletion count is outside its bound")
    if metadata[4] != metadata[3] + 1:
        raise ArithmeticError("resident HNF call count failed replay")
    if metadata[5] < 0 or metadata[5] > maximum_work:
        raise ArithmeticError("resident HNF work count is outside its bound")
    if metadata[6] not in (0, 1):
        raise ArithmeticError("resident HNF completion flag is invalid")
    reported_backend = mode
    if backend == "javascript":
        reported_backend = backend
    elif mode == "native-capable":
        reported_backend = "native"
    published_values = (
        7 + len(basis_values) + len(support_values) + len(selected_values)
    )
    return ResidentRelationHNFSelection(
        basis,
        source_support,
        selected_indices,
        rank=rank,
        deletion_trials=metadata[3],
        hnf_calls=metadata[4],
        deletion_complete=metadata[6] == 1,
        backend=reported_backend,
        boundary_calls=1,
        packed_input_bytes=row_entries * (4 + 8 * input_word_capacity),
        published_output_values=published_values,
        work_units=metadata[5],
    )


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
    "MAX_RESIDENT_HNF_COLUMNS",
    "MAX_RESIDENT_HNF_DELETION_TRIALS",
    "MAX_RESIDENT_HNF_ENTRY_BITS",
    "MAX_RESIDENT_HNF_ROWS",
    "MAX_RESIDENT_HNF_VALUES",
    "MAX_RESIDENT_HNF_WORK",
    "PRESENTATION_DECISION_SCHEMA",
    "PRESENTATION_POLICY_SCHEMA",
    "PRESENTATION_SCHEMA",
    "PresentationDecision",
    "PresentationUpdate",
    "RelationInsertion",
    "RelationMatrixAccumulator",
    "RelationMatrixError",
    "RelationPresentation",
    "ResidentRelationHNFSelection",
    "SparseRelationRow",
    "exact_relation_hnf_basis",
    "exact_relation_hnf_support",
    "extend_relation_presentation_with_duplicate_rows",
    "extract_relation_presentation",
    "modular_rank_and_pivots",
    "resident_exact_relation_hnf_selection",
]
