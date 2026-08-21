"""Deterministic orchestration for general class and unit groups.

The producers used here live in separate lazy modules.  This module owns the
policy joining them: factor-base selection, adaptive exact relation search,
Smith presentation extraction, unit recovery, analytic index validation, and
the unconditional Minkowski upgrade.  Optional producers are imported only
when a general computation reaches their stage.  This keeps the module usable
while the independently claimable producers are integrated, and makes every
fallback fail with an honest incomplete result instead of blessing a guess.

The algorithm follows Hecke's class/unit context and adaptive relation loop in
`NumFieldOrd/NfOrd/Clgp.jl` and `Clgp/Main_LLL.jl`.  PARI's `buch2.c` informed
the retry policy and the separation between exact relation work and analytic
index validation.  Neither system is a runtime dependency.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Iterable, Sequence

EXACT_UNCONDITIONAL = "exact-unconditional"
EXACT_RELATIONS_CONDITIONAL_GRH = "exact-relations-conditional-grh"
INCOMPLETE_RESOURCE_LIMIT = "incomplete-resource-limit"


def _optional_module(name: str) -> Any:
    try:
        return __import__(name, fromlist=[name.rsplit(".", 1)[-1]])
    except ImportError:
        return None


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    answer = int(value)
    if answer != value:
        raise TypeError(name + " must be an integer")
    return answer


def _positive(value: Any, name: str) -> int:
    answer = _integer(value, name)
    if answer < 1:
        raise ValueError(name + " must be positive")
    return answer


def _product(values: Iterable[int]) -> int:
    answer = 1
    for value in values:
        answer *= int(value)
    return answer


def _value(owner: Any, names: Sequence[str], default: Any = None) -> Any:
    for name in names:
        if hasattr(owner, name):
            answer = getattr(owner, name)
            return answer() if callable(answer) else answer
    return default


def _ideal_power(ideal: Any, exponent: int) -> Any:
    return ideal**exponent


def _is_cancellation(error: BaseException) -> bool:
    return str(error) == "class/unit computation cancelled" or (
        type(error).__name__ == "ClassUnitCancellationError"
    )


class ClassUnitEngineLimits:
    """Portable resource policy for one adaptive computation."""

    def __init__(
        self,
        *,
        max_factor_base_bound: int = 100_000,
        max_factor_base_size: int = 4_096,
        max_relation_attempts: int = 512,
        max_relations: int = 2_048,
        max_candidates_per_ideal: int = 64,
        max_random_terms: int = 5,
        max_coefficient_bound: int = 3,
        max_partial_relations: int = 512,
        large_prime_bound_multiplier: int = 20,
        precision_bits: int = 128,
        max_precision_bits: int = 1_024,
        max_analytic_prime_bound: int = 1_000_000,
        max_memory_bytes: int = 512 * 1024 * 1024,
    ) -> None:
        self.max_factor_base_bound = _positive(
            max_factor_base_bound, "max_factor_base_bound"
        )
        self.max_factor_base_size = _positive(
            max_factor_base_size, "max_factor_base_size"
        )
        self.max_relation_attempts = _positive(
            max_relation_attempts, "max_relation_attempts"
        )
        self.max_relations = _positive(max_relations, "max_relations")
        self.max_candidates_per_ideal = _positive(
            max_candidates_per_ideal, "max_candidates_per_ideal"
        )
        self.max_random_terms = _positive(max_random_terms, "max_random_terms")
        self.max_coefficient_bound = _positive(
            max_coefficient_bound, "max_coefficient_bound"
        )
        self.max_partial_relations = _positive(
            max_partial_relations, "max_partial_relations"
        )
        self.large_prime_bound_multiplier = _positive(
            large_prime_bound_multiplier, "large_prime_bound_multiplier"
        )
        self.precision_bits = _positive(precision_bits, "precision_bits")
        self.max_precision_bits = _positive(max_precision_bits, "max_precision_bits")
        if self.precision_bits > self.max_precision_bits:
            raise ValueError("precision_bits cannot exceed max_precision_bits")
        self.max_analytic_prime_bound = _positive(
            max_analytic_prime_bound, "max_analytic_prime_bound"
        )
        self.max_memory_bytes = _positive(max_memory_bytes, "max_memory_bytes")

    def to_dict(self) -> dict[str, int]:
        return {
            name: int(getattr(self, name))
            for name in (
                "max_factor_base_bound",
                "max_factor_base_size",
                "max_relation_attempts",
                "max_relations",
                "max_candidates_per_ideal",
                "max_random_terms",
                "max_coefficient_bound",
                "max_partial_relations",
                "large_prime_bound_multiplier",
                "precision_bits",
                "max_precision_bits",
                "max_analytic_prime_bound",
                "max_memory_bytes",
            )
        }


class ClassUnitStage:
    """One deterministic stage transition and its compact diagnostics."""

    def __init__(self, name: str, state: str, details: dict[str, Any]) -> None:
        self.name = name
        self.state = state
        self.details = dict(details)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "state": self.state, "details": self.details}


class UnitGroupComputation:
    """Exact unit generators plus explicit completeness and regulator state."""

    def __init__(
        self,
        torsion: Any,
        generators: Iterable[Any],
        unit_rank: int,
        *,
        complete: bool,
        regulator: Any = None,
        reason: str = "",
        proof_status: str | None = None,
    ) -> None:
        self.torsion = torsion
        self.generators = tuple(generators)
        self.unit_rank = int(unit_rank)
        self.complete = bool(complete)
        self.regulator_enclosure = regulator
        self.reason = reason
        self.proof_status = (
            (EXACT_UNCONDITIONAL if proof_status is None else proof_status)
            if self.complete
            else INCOMPLETE_RESOURCE_LIMIT
        )

    def gens(self) -> tuple[Any, ...]:
        return self.generators


class _EngineClassElement:
    def __init__(self, parent: Any, coordinates: Iterable[int]) -> None:
        self._parent = parent
        values = tuple(int(value) for value in coordinates)
        if len(values) != len(parent._invariants):
            raise ValueError("ideal-class coordinates have the wrong length")
        normalized = []
        for index in range(len(values)):
            normalized.append(values[index] % parent._invariants[index])
        self._coordinates = tuple(normalized)

    def parent(self) -> Any:
        return self._parent

    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    def ideal(self) -> Any:
        return self._parent.representative_ideal(self._coordinates)

    def order(self) -> int:
        answer = 1
        for coordinate, modulus in zip(
            self._coordinates, self._parent._invariants, strict=False
        ):
            if coordinate:
                common = _gcd(coordinate, modulus)
                answer = _lcm(answer, modulus // common)
        return answer

    def is_one(self) -> bool:
        return not any(self._coordinates)

    def __mul__(self, other: Any) -> Any:
        if (
            not isinstance(other, _EngineClassElement)
            or other._parent is not self._parent
        ):
            return NotImplemented
        return _EngineClassElement(
            self._parent,
            [
                left + right
                for left, right in zip(
                    self._coordinates, other._coordinates, strict=False
                )
            ],
        )

    def __pow__(self, exponent: Any) -> Any:
        power = _integer(exponent, "class-group exponent")
        return _EngineClassElement(
            self._parent, [power * value for value in self._coordinates]
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, _EngineClassElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def __repr__(self) -> str:
        return "Ideal class with coordinates " + str(self._coordinates)


def _gcd(left: int, right: int) -> int:
    a, b = abs(int(left)), abs(int(right))
    while b:
        a, b = b, a % b
    return a


def _lcm(left: int, right: int) -> int:
    return abs(left // _gcd(left, right) * right) if left and right else 0


class _EngineClassGroup:
    """Small exact ideal-class map backed by an authenticated SNF presentation."""

    Element = _EngineClassElement

    def __init__(
        self,
        order: Any,
        invariants: Iterable[int],
        generator_ideals: Iterable[Any],
        generator_rows: Iterable[Iterable[int]],
        presentation: Any,
        factor_base: Iterable[Any],
        relation_records: Iterable[Any],
        combine_relations: Callable[[Sequence[int]], Any],
        factor_over_base: Callable[[Any, Iterable[Any]], Sequence[int]],
        reduce_over_base: Callable[[Any, Iterable[Any]], Any],
        combine_reduction_witness: Callable[[Any, Any], Any],
        proof_status: str,
        theorem: str,
    ) -> None:
        self._order = order
        self._invariants = tuple(int(value) for value in invariants)
        self._generator_ideals = tuple(generator_ideals)
        checked_generator_rows = []
        for row in generator_rows:
            checked_generator_rows.append(tuple(int(value) for value in row))
        self._generator_rows = tuple(checked_generator_rows)
        self._presentation = presentation
        self._factor_base = tuple(factor_base)
        self._relations = tuple(relation_records)
        self._combine_relations = combine_relations
        self._factor_over_base = factor_over_base
        self._reduce_over_base = reduce_over_base
        self._combine_reduction_witness = combine_reduction_witness
        self.proof_status = proof_status
        self.factor_base_theorem = theorem
        self._gens = tuple(
            _EngineClassElement(
                self,
                [
                    1 if index == position else 0
                    for index in range(len(self._invariants))
                ],
            )
            for position in range(len(self._invariants))
        )

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        return _product(self._invariants)

    cardinality = order

    def one(self) -> _EngineClassElement:
        return _EngineClassElement(self, [0] * len(self._invariants))

    def gen(self, index: int = 0) -> _EngineClassElement:
        return self._gens[index]

    def gens(self) -> tuple[_EngineClassElement, ...]:
        return self._gens

    def gens_ideals(self) -> tuple[Any, ...]:
        return self._generator_ideals

    def representative_ideal(self, coordinates: Iterable[int]) -> Any:
        element = _EngineClassElement(self, coordinates)
        answer = self._order.ideal(1)
        for coordinate, ideal in zip(
            element.coordinates(), self._generator_ideals, strict=False
        ):
            if coordinate:
                answer *= _ideal_power(ideal, coordinate)
        return answer

    def _relation_coefficients(self, ambient: Sequence[int]) -> tuple[int, ...]:
        smith = tuple(self._presentation.smith_coordinates(ambient))
        coefficients = [0] * len(self._relations)
        for index in range(self._presentation.rank):
            diagonal = int(self._presentation.diagonal[index])
            if smith[index] % diagonal:
                raise ArithmeticError(
                    "an ideal quotient is not in the relation lattice"
                )
            multiple = smith[index] // diagonal
            transform = self._presentation.relation_combination(index)
            for position in range(len(coefficients)):
                coefficients[position] += multiple * int(transform[position])
        if any(smith[index] for index in range(self._presentation.rank, len(smith))):
            raise ArithmeticError("an ideal quotient has a nonzero free class")
        return tuple(coefficients)

    def discrete_log(self, ideal: Any) -> tuple[tuple[int, ...], Any]:
        reduction_witness = None
        try:
            row = tuple(
                int(value) for value in self._factor_over_base(ideal, self._factor_base)
            )
        except ArithmeticError:
            quotient_row, reduction_witness = self._reduce_over_base(
                ideal, self._factor_base
            )
            row = tuple(-int(value) for value in quotient_row)
        coordinates = tuple(self._presentation.class_coordinates(row))
        reduced = tuple(self._presentation.lift_class_coordinates(coordinates))
        delta_values = []
        for index in range(len(row)):
            delta_values.append(row[index] - reduced[index])
        delta = tuple(delta_values)
        witness = self._combine_relations(self._relation_coefficients(delta))
        if reduction_witness is not None:
            witness = self._combine_reduction_witness(witness, reduction_witness)
        return coordinates, witness

    def __call__(self, ideal: Any) -> _EngineClassElement:
        if isinstance(ideal, _EngineClassElement):
            if ideal.parent() is not self:
                raise TypeError("the ideal class belongs to another group")
            return ideal
        coordinates, _witness = self.discrete_log(ideal)
        return _EngineClassElement(self, coordinates)

    def is_principal(self, ideal: Any, proof: bool = True) -> bool:
        del proof
        return self(ideal).is_one()

    def verify(self) -> bool:
        if not self._presentation.verify():
            return False
        for generator in self._gens:
            if self(generator.ideal()) != generator:
                return False
            if not (generator ** generator.order()).is_one():
                return False
        return True


class ClassUnitComputation:
    """Terminal result; incomplete states never expose a proved class group."""

    def __init__(
        self,
        field: Any,
        *,
        proof_status: str,
        complete: bool,
        reason: str,
        algorithm: str,
        stages: Iterable[ClassUnitStage],
        class_group: Any = None,
        unit_group: Any = None,
        tentative_invariants: Iterable[int] = (),
        context: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> None:
        self.field = field
        self.proof_status = proof_status
        self.complete = bool(complete)
        self.reason = reason
        self.algorithm = algorithm
        self.stages = tuple(stages)
        self._class_group = class_group
        self._unit_group = unit_group
        self.tentative_invariants = tuple(int(value) for value in tentative_invariants)
        self.context = context
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)
        if self.complete and (class_group is None or unit_group is None):
            raise ValueError("a complete class/unit computation needs both groups")

    def class_group(self) -> Any:
        if not self.complete:
            raise ValueError(
                "an incomplete class/unit computation has no proved class group"
            )
        return self._class_group

    def class_number(self) -> int:
        return int(self.class_group().order())

    def unit_group(self) -> Any:
        if self._unit_group is None:
            raise ValueError("the computation did not produce a unit subgroup")
        return self._unit_group

    def units(self) -> tuple[Any, ...]:
        return tuple(_value(self.unit_group(), ("generators", "gens"), ()))

    def regulator(self) -> Any:
        unit_group = self.unit_group()
        value = _value(unit_group, ("regulator_enclosure",), None)
        if value is None:
            regulator = getattr(unit_group, "regulator", None)
            if callable(regulator):
                return regulator()
            raise ValueError("the unit computation has no regulator")
        return value

    def __repr__(self) -> str:
        if self.complete:
            return (
                "Class/unit computation with class number "
                + str(self.class_number())
                + " ("
                + self.proof_status
                + ")"
            )
        return "Incomplete class/unit computation (" + self.reason + ")"


class _Components:
    def __init__(self) -> None:
        self.context = _optional_module("sagejs.number_fields.class_unit_context")
        self.factored = _optional_module("sagejs.number_fields.factored_elements")
        self.factor_base = _optional_module(
            "sagejs.number_fields.class_group_factor_base"
        )
        self.relations = _optional_module("sagejs.number_fields.class_group_relations")
        self.matrix = _optional_module("sagejs.number_fields.class_group_matrix")
        self.analytic = _optional_module("sagejs.number_fields.class_unit_analytic")

    def missing(self) -> tuple[str, ...]:
        return tuple(
            name
            for name in (
                "factor_base",
                "relations",
                "matrix",
                "analytic",
            )
            if getattr(self, name) is None
        )


def _prime_ideal_key(prime_ideal: Any) -> tuple[Any, ...]:
    """Return a stable in-process identity for an exact prime ideal."""
    rows = []
    for row in prime_ideal.basis_matrix().rows():
        rows.append(
            tuple((int(value._numerator), int(value._denominator)) for value in row)
        )
    return (
        int(prime_ideal.rational_prime()),
        int(prime_ideal.ramification_index()),
        int(prime_ideal.residue_class_degree()),
        tuple(rows),
    )


class _LargePrimePartial:
    def __init__(
        self,
        witness: Any,
        source_ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
    ) -> None:
        self.witness = witness
        self.source_ideal = source_ideal
        self.source_row = tuple(int(value) for value in source_row)
        self.provenance = dict(provenance)


class ClassUnitGroupEngine:
    """Adaptive Buchmann--Hecke driver with exact terminal-state checks."""

    def __init__(
        self,
        field: Any,
        *,
        proof: bool = True,
        algorithm: str = "auto",
        limits: ClassUnitEngineLimits | None = None,
        seed: int = 0,
        cancelled: Callable[[], bool] | None = None,
        progress: Callable[[dict[str, Any]], None] | None = None,
        checkpoint: Any = None,
        resume_from: Any = None,
        checkpoint_controller: Any = None,
        max_checkpoint_bytes: int | None = None,
        components: Any = None,
    ) -> None:
        if algorithm not in ("auto", "minkowski", "buchmann-hecke"):
            raise ValueError("unknown class/unit algorithm: " + str(algorithm))
        self.field = field
        self.order = field.maximal_order()
        if not self.order.is_maximal():
            raise ValueError("class/unit arithmetic requires a certified maximal order")
        self.proof = bool(proof)
        self.algorithm = algorithm
        self.limits = ClassUnitEngineLimits() if limits is None else limits
        if not isinstance(self.limits, ClassUnitEngineLimits):
            raise TypeError("limits must be ClassUnitEngineLimits")
        self.seed = _integer(seed, "deterministic seed")
        self.cancelled = (lambda: False) if cancelled is None else cancelled
        if not callable(self.cancelled):
            raise TypeError("cancelled must be callable")
        self.progress = progress
        if self.progress is not None and not callable(self.progress):
            raise TypeError("progress must be callable")
        self.components = _Components() if components is None else components
        self.checkpoint_controller = checkpoint_controller
        if self.checkpoint_controller is None and (
            checkpoint is not None or resume_from is not None
        ):
            context_module = self.components.context
            if context_module is None:
                raise ImportError("the class/unit checkpoint controller is unavailable")
            controller_type = getattr(context_module, "ClassUnitCheckpoint", None)
            if controller_type is None:
                raise ImportError("the class/unit checkpoint controller is unavailable")
            prime_module = _optional_module("sagejs.number_fields.prime_ideals")

            def decode_factor_base(payload: Any) -> Any:
                return prime_module.prime_ideal_from_dict(self.order, payload)

            def decode_search_state(payload: Any) -> Any:
                if payload is None:
                    return None
                return self.components.relations.RelationSearchState.from_dict(payload)

            def decode_matrix_state(payload: Any) -> Any:
                if payload is None:
                    return None
                return self.components.matrix.RelationPresentation.from_dict(payload)

            decoders = {
                "factor_base": decode_factor_base,
                "relations": self.components.relations.RelationRecord.from_dict,
                "search_state": decode_search_state,
                "matrix_state": decode_matrix_state,
            }
            proof_state = context_module.ClassUnitProofState.incomplete(
                "class/unit computation in progress"
            )
            self.checkpoint_controller = controller_type(
                self.field,
                self.order,
                proof_state,
                algorithm=self.algorithm,
                random_seed=self.seed,
                destination=checkpoint,
                resume_from=resume_from,
                component_decoders=decoders,
                max_checkpoint_bytes=max_checkpoint_bytes,
            )
        self.stages: list[ClassUnitStage] = []
        self._started_ns = time.perf_counter_ns()
        self._phase_timings: dict[str, float] = {}
        self._resource_usage: dict[str, Any] = {
            "relation_attempts": 0,
            "relation_candidates": 0,
            "ideals_tested": 0,
            "relations": 0,
            "partial_relations": 0,
            "partial_matches": 0,
            "partial_discards": 0,
        }
        self._partials: dict[tuple[Any, ...], _LargePrimePartial] = {}

    def _stage(self, name: str, state: str, **details: Any) -> None:
        if name in self._phase_timings and "elapsed_seconds" not in details:
            details["elapsed_seconds"] = self._phase_timings[name]
        self.stages.append(ClassUnitStage(name, state, details))
        if self.checkpoint_controller is not None:
            try:
                self.checkpoint_controller.stage(name, state, details)
            except RuntimeError as error:
                if state != "incomplete" or not _is_cancellation(error):
                    raise
            self.checkpoint_controller.capture(
                {"diagnostics": self._diagnostics({"stage": name, "state": state})}
            )
            self.checkpoint_controller.save(force=False)
        self._emit_progress(
            "stage",
            stage=name,
            state=state,
            details=dict(details),
        )

    def _phase_start(self) -> int:
        return time.perf_counter_ns()

    def _phase_finish(self, name: str, started_ns: int) -> float:
        if name == "total" and name in self._phase_timings:
            return self._phase_timings[name]
        elapsed = (time.perf_counter_ns() - started_ns) / 1_000_000_000
        self._phase_timings[name] = self._phase_timings.get(name, 0.0) + elapsed
        return elapsed

    def _elapsed_seconds(self) -> float:
        return (time.perf_counter_ns() - self._started_ns) / 1_000_000_000

    def _emit_progress(self, event: str, **details: Any) -> None:
        if self.progress is None:
            return
        payload = {
            "event": event,
            "elapsed_seconds": self._elapsed_seconds(),
            "resources": dict(self._resource_usage),
        }
        payload.update(details)
        self.progress(payload)

    def _diagnostics(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        answer = {
            "elapsed_seconds": self._elapsed_seconds(),
            "phase_timings": dict(self._phase_timings),
            "resources": dict(self._resource_usage),
            "limits": self.limits.to_dict(),
        }
        if extra:
            answer.update(extra)
        return answer

    def _check_cancelled(self) -> None:
        if self.checkpoint_controller is not None:
            stage = self.stages[-1].name if self.stages else "initialization"
            self.checkpoint_controller.check_cancelled(
                stage, dict(self._resource_usage)
            )
        if self.cancelled():
            self._emit_progress("cancelled")
            raise RuntimeError("class/unit computation cancelled")

    def _checkpoint_capture(self, payload: dict[str, Any]) -> None:
        if self.checkpoint_controller is not None:
            self.checkpoint_controller.capture(payload)

    def _checkpoint_save(self, *, force: bool = False) -> None:
        if self.checkpoint_controller is not None:
            self.checkpoint_controller.save(force=force)

    def _incomplete(
        self,
        reason: str,
        *,
        invariants: Iterable[int] = (),
        unit_group: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> ClassUnitComputation:
        self._phase_finish("total", self._started_ns)
        self._stage("terminal", "incomplete", reason=reason)
        self._checkpoint_capture({"diagnostics": self._diagnostics(diagnostics)})
        self._checkpoint_save(force=True)
        return ClassUnitComputation(
            self.field,
            proof_status=INCOMPLETE_RESOURCE_LIMIT,
            complete=False,
            reason=reason,
            algorithm=self.algorithm,
            stages=self.stages,
            unit_group=unit_group,
            tentative_invariants=invariants,
            diagnostics=self._diagnostics(diagnostics),
        )

    def _specialized(self) -> ClassUnitComputation | None:
        if self.algorithm != "auto" or self.field.degree() > 3:
            return None
        started = self._phase_start()
        classes_module = _optional_module("sagejs.number_fields.class_groups")
        units_module = _optional_module("sagejs.number_fields.units")
        if classes_module is None or units_module is None:
            return None
        try:
            classes = classes_module.bounded_class_group(self.field)
            units = units_module.bounded_unit_subgroup(self.field)
        except (TypeError, ValueError, ArithmeticError):
            return None
        if not classes.complete or not units.complete:
            return None
        self._phase_finish("specialized", started)
        self._stage(
            "specialized",
            "complete",
            class_number=int(classes.order()),
            unit_rank=int(units.unit_rank),
        )
        self._phase_finish("total", self._started_ns)
        self._stage("terminal", "complete", class_number=int(classes.order()))
        self._checkpoint_capture({"diagnostics": self._diagnostics()})
        self._checkpoint_save(force=True)
        return ClassUnitComputation(
            self.field,
            proof_status=EXACT_UNCONDITIONAL,
            complete=True,
            reason="bounded specialized exact algorithm",
            algorithm="specialized",
            stages=self.stages,
            class_group=classes.group,
            unit_group=units,
            tentative_invariants=classes.invariants(),
            diagnostics=self._diagnostics(),
        )

    def _factor_base(
        self, *, proof: bool, record_stage: bool = True
    ) -> tuple[Any, tuple[Any, ...]]:
        started = self._phase_start()
        module = self.components.factor_base
        plan = module.factor_base_plan(
            self.order,
            proof=proof,
            theorem=("minkowski" if proof else "auto"),
            max_bound=self.limits.max_factor_base_bound,
            max_prime_ideals=self.limits.max_factor_base_size,
            max_memory_bytes=self.limits.max_memory_bytes,
        )
        plan.require_feasible()
        records = module.build_factor_base(plan)
        primes = tuple(_value(record, ("prime_ideal", "ideal")) for record in records)
        if any(prime is None for prime in primes):
            raise TypeError("factor-base records do not expose exact prime ideals")
        if self.checkpoint_controller is not None:
            restored = tuple(self.checkpoint_controller.restore_factor_base())
            if restored:
                if len(restored) != len(primes) or any(
                    left != right for left, right in zip(restored, primes, strict=True)
                ):
                    raise ValueError(
                        "the checkpoint factor base differs from the deterministic plan"
                    )
                primes = restored
            else:
                self._checkpoint_capture({"factor_base": primes})
        if record_stage:
            self._phase_finish("factor-base", started)
        if record_stage:
            self._stage(
                "factor-base",
                "complete",
                theorem=plan.theorem,
                assumptions=list(plan.assumptions),
                bound=int(plan.bound),
                size=len(primes),
            )
        return plan, primes

    def _large_prime_factor(
        self, quotient: Any, factor_base: tuple[Any, ...], bound: int
    ) -> Any:
        """Return the sole bounded outside prime in an integral quotient."""
        outside = []
        for prime_ideal, exponent in quotient.factor():
            if any(prime_ideal == base_prime for base_prime in factor_base):
                continue
            outside.append((prime_ideal, int(exponent)))
        if len(outside) != 1 or outside[0][1] != 1:
            return None
        prime_ideal = outside[0][0]
        norm = prime_ideal.norm()
        if norm._denominator != 1 or int(norm._numerator) > bound:
            return None
        return prime_ideal

    def _combine_partial_witnesses(self, left: Any, right: Any) -> Any:
        factors = list(left.factors())
        for element, exponent in right.factors():
            factors.append((element, -int(exponent)))
        return self.components.relations.FactoredPrincipalWitness(self.field, factors)

    def _try_large_prime_partial(
        self,
        collector: Any,
        witness: Any,
        source_ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
        large_prime_bound: int,
    ) -> Any:
        """Match one exact one-large-prime partial, if available."""
        principal = witness.principal_ideal(self.order)
        quotient = principal / source_ideal
        try:
            large_prime = self._large_prime_factor(
                quotient, collector.factor_base, large_prime_bound
            )
        except (AttributeError, NotImplementedError, TypeError, ValueError):
            self._resource_usage["partial_discards"] += 1
            return None
        if large_prime is None:
            self._resource_usage["partial_discards"] += 1
            return None
        key = _prime_ideal_key(large_prime)
        previous = self._partials.pop(key, None)
        if previous is None:
            if len(self._partials) >= self.limits.max_partial_relations:
                self._resource_usage["partial_discards"] += 1
                return None
            self._partials[key] = _LargePrimePartial(
                witness, source_ideal, source_row, provenance
            )
            self._resource_usage["partial_relations"] = len(self._partials)
            return None
        combined = self._combine_partial_witnesses(previous.witness, witness)
        combined_source = previous.source_ideal / source_ideal
        combined_values = []
        for left, right in zip(previous.source_row, source_row, strict=True):
            combined_values.append(int(left) - int(right))
        combined_row = tuple(combined_values)
        try:
            admission = collector.admit_witness(
                combined,
                source_ideal=combined_source,
                source_row=combined_row,
                provenance={
                    "algorithm": "one-large-prime-match",
                    "large_prime_norm": int(large_prime.norm()._numerator),
                    "left": previous.provenance,
                    "right": provenance,
                },
            )
        except ValueError as error:
            if "already admitted" not in str(error):
                raise
            admission = None
        self._resource_usage["partial_matches"] += 1
        self._resource_usage["partial_relations"] = len(self._partials)
        return admission

    def _relation_ideal(
        self,
        search: Any,
        factor_base: tuple[Any, ...],
        attempt: int,
        coefficient_bound: int,
    ) -> tuple[Any, tuple[int, ...], str]:
        """Choose a targeted product ideal before falling back to the PRNG."""
        width = len(factor_base)
        missing = tuple(search.collector.rank_screen.missing_pivots())
        row = [0] * width
        if attempt < width:
            index = (attempt + (self.seed % width)) % width
            row[index] = 1
            strategy = "single-prime-sweep"
        elif attempt % 3 != 2:
            target = missing[attempt % len(missing)] if missing else attempt % width
            row[target] = 1 + ((attempt // max(1, width)) % coefficient_bound)
            if width > 1:
                stride = 1 + ((attempt // width) % (width - 1))
                row[(target + stride) % width] += 1
            strategy = "targeted-prime-product"
        else:
            ideal, random_row = search.random_factor_base_ideal(
                terms=search.random_terms,
                max_exponent=min(3, coefficient_bound + 1),
            )
            return ideal, random_row, "seeded-random-product"
        source_row = tuple(row)
        ideal = self.components.relations.reconstruct_factor_base_ideal(
            self.order, factor_base, source_row
        )
        return ideal, source_row, strategy

    def _search_relation_ideal(
        self,
        search: Any,
        ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
        large_prime_bound: int,
        stop_after: int = 2,
    ) -> int:
        """Search one ideal while retaining bounded exact partial relations."""
        search.state.ideals_tested += 1
        admitted = 0
        for sequence, element in enumerate(search.short_elements(ideal)):
            self._check_cancelled()
            search.state.candidates_tested += 1
            candidate_provenance = {
                "algorithm": "exact-coefficient-lll",
                "seed": search.state.seed,
                "ideal_sequence": search.state.ideals_tested - 1,
                "candidate_sequence": sequence,
            }
            candidate_provenance.update(provenance)
            witness = self.components.relations.FactoredPrincipalWitness.from_element(
                element
            )
            try:
                admission = search.collector.admit_witness(
                    witness,
                    source_ideal=ideal,
                    source_row=source_row,
                    provenance=candidate_provenance,
                )
            except self.components.relations.RelationNotSmoothError:
                admission = self._try_large_prime_partial(
                    search.collector,
                    witness,
                    ideal,
                    source_row,
                    candidate_provenance,
                    large_prime_bound,
                )
            except ValueError as error:
                if "already admitted" not in str(error):
                    raise
                admission = None
            if admission is not None:
                admitted += 1
                search.state.relations_admitted += 1
                if admitted >= stop_after:
                    break
        return admitted

    def _unconditional_proof_pass(self, group: Any) -> tuple[Any, ...]:
        started = self._phase_start()
        plan, proof_primes = self._factor_base(proof=True, record_stage=False)
        if tuple(plan.assumptions):
            raise ArithmeticError("the Minkowski proof pass recorded an assumption")
        records = []
        for index, prime_ideal in enumerate(proof_primes):
            self._check_cancelled()
            coordinates, witness = group.discrete_log(prime_ideal)
            representative = group.representative_ideal(coordinates)
            quotient = prime_ideal / representative
            if witness.principal_ideal(self.order) != quotient:
                raise ArithmeticError(
                    "a Minkowski proof-prime discrete log failed principal replay"
                )
            norm = prime_ideal.norm()
            if norm._denominator != 1:
                raise ArithmeticError("a proof-prime ideal has nonintegral norm")
            records.append(
                {
                    "index": index,
                    "norm": int(norm._numerator),
                    "coordinates": tuple(int(value) for value in coordinates),
                    "ideal": prime_ideal.to_dict(),
                    "witness": witness.to_dict(),
                }
            )
            self._emit_progress(
                "proof-prime", completed=index + 1, total=len(proof_primes)
            )
        self._phase_finish("unconditional-proof", started)
        self._stage(
            "unconditional-proof",
            "complete",
            theorem=str(plan.theorem),
            bound=int(plan.bound),
            prime_ideals=len(records),
        )
        return tuple(records)

    def _relations(
        self, factor_base: tuple[Any, ...], unit_rank: int
    ) -> tuple[Any, Any]:
        started = self._phase_start()
        relations = self.components.relations
        matrix_module = self.components.matrix
        collector = relations.ExactRelationCollector(self.order, factor_base)
        restored_relations = ()
        restored_state = None
        if self.checkpoint_controller is not None:
            restored_relations = tuple(self.checkpoint_controller.restore_relations())
            restored_state = self.checkpoint_controller.restore_search_state()
        for record in restored_relations:
            collector.add_relation(record)
        if not restored_relations:
            relations.initial_rational_prime_relations(collector)
            self._checkpoint_capture({"relations": tuple(collector.records)})
        if isinstance(restored_state, dict):
            restored_state = relations.RelationSearchState.from_dict(restored_state)
        attempts = 0
        presentation = matrix_module.extract_relation_presentation(
            [record.row for record in collector.records],
            len(factor_base),
            require_full_rank=False,
        )
        coefficient_bound = 1
        search = relations.LLLRelationSearch(
            collector,
            seed=self.seed,
            max_candidates_per_ideal=min(8, self.limits.max_candidates_per_ideal),
            random_terms=min(3, self.limits.max_random_terms),
            coefficient_bound=coefficient_bound,
            state=restored_state,
        )
        # One accepted relation can require seconds of exact ideal arithmetic,
        # so recompute the tiny presentation after each success.  Degree-many
        # redundant dependencies are nevertheless important: the first full
        # rank presentation can still describe a strict class/unit overgroup,
        # and the extra exact relations are what saturate both lattices before
        # the analytic index-one check.
        dependency_target = unit_rank + max(2, int(self.field.degree()))
        factor_norms = [int(prime.norm()._numerator) for prime in factor_base]
        largest_factor_norm = max(factor_norms) if factor_norms else 2
        large_prime_bound = (
            largest_factor_norm * self.limits.large_prime_bound_multiplier
        )
        while (
            presentation.rank < len(factor_base)
            or len(presentation.dependency_transforms) < dependency_target
        ):
            self._check_cancelled()
            if attempts >= self.limits.max_relation_attempts:
                break
            search.max_candidates_per_ideal = min(
                self.limits.max_candidates_per_ideal,
                8 * coefficient_bound,
            )
            search.random_terms = min(
                self.limits.max_random_terms, 2 + coefficient_bound
            )
            search.coefficient_bound = coefficient_bound
            ideal, source_row, strategy = self._relation_ideal(
                search, factor_base, attempts, coefficient_bound
            )
            before = len(collector.records)
            self._search_relation_ideal(
                search,
                ideal,
                source_row,
                {
                    "relation_attempt": attempts,
                    "ideal_strategy": strategy,
                },
                large_prime_bound,
            )
            attempts += 1
            if len(collector.records) > self.limits.max_relations:
                raise ValueError("exact relation count exceeds max_relations")
            if len(collector.records) != before:
                presentation = matrix_module.extract_relation_presentation(
                    [record.row for record in collector.records],
                    len(factor_base),
                    require_full_rank=False,
                )
            coefficient_bound = min(
                self.limits.max_coefficient_bound,
                1 + attempts // max(1, len(factor_base)),
            )
            self._resource_usage.update(
                {
                    "relation_attempts": attempts,
                    "relation_candidates": int(search.state.candidates_tested),
                    "ideals_tested": int(search.state.ideals_tested),
                    "relations": len(collector.records),
                    "partial_relations": len(self._partials),
                }
            )
            if len(collector.records) != before:
                for record in collector.records[before:]:
                    self._checkpoint_capture({"relation": record})
            self._checkpoint_capture(
                {
                    "search_state": search.state,
                    "matrix_state": presentation,
                }
            )
            if attempts % 8 == 0:
                self._checkpoint_save(force=False)
            self._emit_progress(
                "relation-search",
                attempt=attempts,
                strategy=strategy,
                rank=int(presentation.rank),
                columns=len(factor_base),
                dependencies=len(presentation.dependency_transforms),
                search_state=search.state.to_dict(),
            )
        self._phase_finish("relations", started)
        self._stage(
            "relations",
            "complete" if presentation.rank == len(factor_base) else "bounded",
            attempts=attempts,
            relations=len(collector.records),
            rank=int(presentation.rank),
            columns=len(factor_base),
            dependencies=len(presentation.dependency_transforms),
            candidates=int(search.state.candidates_tested),
            ideals=int(search.state.ideals_tested),
            partials_retained=len(self._partials),
            partial_matches=int(self._resource_usage["partial_matches"]),
            partial_discards=int(self._resource_usage["partial_discards"]),
            large_prime_bound=large_prime_bound,
            search_state=search.state.to_dict(),
        )
        return collector, presentation

    def _decode_relation_witness(self, record: Any) -> Any:
        return self.components.relations.FactoredPrincipalWitness.from_dict(
            self.field, record.witness
        )

    def _combine(self, records: Sequence[Any], coefficients: Sequence[int]) -> Any:
        factors = []
        for record, coefficient in zip(records, coefficients, strict=False):
            if coefficient == 0:
                continue
            witness = self._decode_relation_witness(record)
            for element, exponent in witness.factors():
                factors.append((element, exponent * int(coefficient)))
        if self.components.factored is not None:
            return self.components.factored.FactoredNumberFieldElement(
                self.field, factors
            )
        return self.components.relations.FactoredPrincipalWitness(self.field, factors)

    def _independent_units(
        self, records: Sequence[Any], presentation: Any, unit_rank: int
    ) -> tuple[Any, ...]:
        started = self._phase_start()
        if unit_rank == 0:
            self._phase_finish("unit-recovery", started)
            self._stage("unit-recovery", "complete", rank=0, candidates=0)
            return ()
        if not presentation.verify():
            raise ArithmeticError("the relation presentation failed exact replay")
        candidates: list[Any] = []
        logarithms: list[list[Any]] = []
        for dependency in presentation.dependency_transforms:
            unit = self._combine(records, dependency)
            candidates.append(unit)
            logarithms.append(list(unit.archimedean_logarithms(80)[:-1]))

        # A basis of the exact relation kernel can map to a highly nonreduced
        # generating set of the rank-r unit lattice.  Taking the first r
        # independent images may therefore introduce a large artificial unit
        # index.  Among the bounded dependency set, choose the full-rank subset
        # with smallest logarithmic covolume; the subsequent rigorous hR check
        # is still the authority that certifies index one.
        best: tuple[int, ...] = ()
        best_volume: float | None = None
        checked = 0
        for indices in _index_combinations(len(candidates), unit_rank):
            checked += 1
            if checked > 50_000:
                break
            volume = _floating_determinant_absolute(
                [logarithms[index] for index in indices]
            )
            if volume <= 1e-12:
                continue
            if best_volume is None or volume < best_volume:
                best = indices
                best_volume = volume
        if not best:
            self._phase_finish("unit-recovery", started)
            self._stage(
                "unit-recovery",
                "bounded",
                rank=unit_rank,
                candidates=len(candidates),
            )
            return ()
        units = tuple(candidates[index] for index in best)
        one = self.order.ideal(1)
        for unit in units:
            if unit.principal_ideal(self.order) != one:
                raise ArithmeticError("a relation dependency is not an exact unit")
        self._phase_finish("unit-recovery", started)
        self._stage(
            "unit-recovery",
            "complete",
            rank=unit_rank,
            candidates=len(candidates),
        )
        return units

    def _analytic_index(
        self, presentation: Any, units: tuple[Any, ...], unit_rank: int
    ) -> tuple[Any, Any, Any]:
        started = self._phase_start()
        analytic = self.components.analytic
        if len(units) != unit_rank:
            raise ArithmeticError(
                "relations did not yield the full Dirichlet unit rank"
            )
        regulator = analytic.regulator_from_factored_units(
            units,
            unit_rank=unit_rank,
            precision_bits=self.limits.precision_bits,
            maximum_precision_bits=self.limits.max_precision_bits,
        )
        zeta_limits = analytic.ZetaLogResidueLimits(
            maximum_prime_bound=self.limits.max_analytic_prime_bound,
            maximum_precision_bits=self.limits.max_precision_bits,
        )
        zeta = analytic.zeta_log_residue_bound(
            int(self.order.discriminant()),
            int(self.field.degree()),
            self.order.splitting_records,
            precision_bits=self.limits.precision_bits,
            limits=zeta_limits,
        )
        units_module = _optional_module("sagejs.number_fields.units")
        torsion = units_module.roots_of_unity(self.field)
        if not torsion.complete or not torsion.verify():
            raise ArithmeticError("roots of unity are incomplete")
        index = analytic.validate_hr_index(
            signature=_value(self.field, ("signature",)),
            discriminant=int(self.order.discriminant()),
            class_number=int(presentation.order),
            roots_of_unity=int(torsion.order),
            regulator=regulator,
            zeta_log_residue=zeta,
            precision_bits=self.limits.precision_bits,
        )
        self._phase_finish("analytic-index", started)
        self._stage(
            "analytic-index",
            "complete" if index.index_one else "bounded",
            lower_index=int(index.lower_index),
            upper_index=int(index.upper_index),
            rigorous=bool(index.rigorous),
            zeta_threshold=int(zeta.threshold),
        )
        return torsion, regulator, index

    def _class_group(
        self,
        factor_base: tuple[Any, ...],
        collector: Any,
        presentation: Any,
        proof_status: str,
        theorem: str,
    ) -> _EngineClassGroup:
        started = self._phase_start()
        positions = tuple(presentation.invariant_positions)
        generator_rows = tuple(
            tuple(int(value) for value in presentation.smith_right_inverse[position])
            for position in positions
        )
        reconstruct = self.components.relations.reconstruct_factor_base_ideal
        generator_ideals = tuple(
            reconstruct(self.order, factor_base, row) for row in generator_rows
        )
        group = _EngineClassGroup(
            self.order,
            presentation.invariants,
            generator_ideals,
            generator_rows,
            presentation,
            factor_base,
            collector.records,
            lambda coefficients: self._combine(collector.records, coefficients),
            self.components.relations.factor_ideal_over_base,
            self.components.relations.reduce_ideal_over_base,
            lambda relation_witness, reduction_witness: (
                self.components.factored.FactoredNumberFieldElement(
                    self.field,
                    list(relation_witness.factors())
                    + list(reduction_witness.factors()),
                )
            ),
            proof_status,
            theorem,
        )
        if not group.verify():
            raise ArithmeticError("class-group ideal maps failed exact replay")
        self._phase_finish("class-group", started)
        self._stage(
            "class-group",
            "complete",
            invariants=tuple(int(value) for value in presentation.invariants),
        )
        return group

    def run(self) -> ClassUnitComputation:
        self._check_cancelled()
        specialized = self._specialized()
        if specialized is not None:
            return specialized
        missing = self.components.missing()
        if missing:
            return self._incomplete(
                "general class/unit producers are not installed: " + ", ".join(missing)
            )
        try:
            embedding_module = _optional_module("sagejs.number_fields.embeddings")
            signature = embedding_module.exact_signature(self.field)
            unit_rank = int(signature[0] + signature[1] - 1)
            # Relation discovery uses the much smaller BDF factor base.  A
            # proof=True request is upgraded afterward by expressing every
            # Minkowski-required prime ideal in this exact presentation.
            discovery_proof = self.algorithm == "minkowski"
            plan, factor_base = self._factor_base(proof=discovery_proof)
            collector, presentation = self._relations(factor_base, unit_rank)
            if presentation.rank != len(factor_base) or presentation.order is None:
                return self._incomplete(
                    "relation search exhausted before full rank",
                    invariants=presentation.invariants,
                    diagnostics={"relations": len(collector.records)},
                )
            units = self._independent_units(collector.records, presentation, unit_rank)
            torsion, regulator, index = self._analytic_index(
                presentation, units, unit_rank
            )
            unit_group = UnitGroupComputation(
                torsion,
                units,
                unit_rank,
                complete=bool(index.index_one),
                regulator=regulator,
                reason="rigorous hR index-one validation",
                proof_status=EXACT_RELATIONS_CONDITIONAL_GRH,
            )
            if not index.index_one:
                return self._incomplete(
                    "analytic hR validation did not isolate index one",
                    invariants=presentation.invariants,
                    unit_group=unit_group,
                )
            conditional_discovery = bool(tuple(plan.assumptions))
            if not conditional_discovery and not discovery_proof:
                raise ArithmeticError("a conditional run did not record its assumption")
            initial_proof_status = (
                EXACT_RELATIONS_CONDITIONAL_GRH
                if conditional_discovery
                else EXACT_UNCONDITIONAL
            )
            group = self._class_group(
                factor_base,
                collector,
                presentation,
                initial_proof_status,
                str(plan.theorem),
            )
            proof_records: tuple[Any, ...] = ()
            proof_status = initial_proof_status
            if self.proof or discovery_proof:
                proof_records = self._unconditional_proof_pass(group)
                proof_status = EXACT_UNCONDITIONAL
                group.proof_status = proof_status
                group.factor_base_theorem = "Minkowski ideal-class theorem"
                unit_group.proof_status = proof_status
            self._stage(
                "proof",
                "complete",
                proof_status=proof_status,
                minkowski_primes=len(proof_records),
                exact_relations=len(collector.records),
            )
            self._phase_finish("total", self._started_ns)
            self._stage("terminal", "complete", class_number=group.order())
            self._checkpoint_capture(
                {
                    "matrix_state": presentation,
                    "proof_progress": {
                        "proof_status": proof_status,
                        "unconditional_prime_records": proof_records,
                    },
                    "diagnostics": self._diagnostics(),
                }
            )
            self._checkpoint_save(force=True)
            result = ClassUnitComputation(
                self.field,
                proof_status=proof_status,
                complete=True,
                reason="exact relations and rigorous class/unit index one",
                algorithm="buchmann-hecke",
                stages=self.stages,
                class_group=group,
                unit_group=unit_group,
                tentative_invariants=presentation.invariants,
                diagnostics=self._diagnostics(
                    {
                        "factor_base_bound": int(plan.bound),
                        "factor_base_size": len(factor_base),
                        "relations": len(collector.records),
                        "unconditional_prime_records": proof_records,
                    }
                ),
            )
            return result
        except RuntimeError as error:
            if _is_cancellation(error):
                return self._incomplete(
                    "class/unit computation cancelled",
                    diagnostics={
                        "cancelled_stage": getattr(error, "stage", ""),
                        "cancelled_details": getattr(error, "details", None),
                    },
                )
            raise
        except (ImportError, TypeError, ValueError, ArithmeticError) as error:
            return self._incomplete(str(error))


def _floating_value(value: Any) -> float:
    midpoint: Any = getattr(value, "midpoint", None)
    selected: Any = midpoint() if callable(midpoint) else value
    return float(selected)


def _index_combinations(count: int, size: int) -> Iterable[tuple[int, ...]]:
    if size < 0 or size > count:
        return
    if size == 0:
        yield ()
        return
    indices = list(range(size))
    while True:
        yield tuple(indices)
        position = size - 1
        while position >= 0 and indices[position] == count - size + position:
            position -= 1
        if position < 0:
            return
        indices[position] += 1
        for index in range(position + 1, size):
            indices[index] = indices[index - 1] + 1


def _floating_determinant_absolute(rows: Sequence[Sequence[Any]]) -> float:
    size = len(rows)
    if size == 0:
        return 1.0
    if any(len(row) != size for row in rows):
        return 0.0
    matrix = [[_floating_value(value) for value in row] for row in rows]
    determinant = 1.0
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) <= 1e-14:
            return 0.0
        if pivot != column:
            matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
            determinant = -determinant
        value = matrix[column][column]
        determinant *= value
        for row in range(column + 1, size):
            multiple = matrix[row][column] / value
            for index in range(column + 1, size):
                matrix[row][index] -= multiple * matrix[column][index]
    return abs(determinant)


def compute_class_unit_group(
    field: Any,
    *,
    proof: bool = True,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    components: Any = None,
) -> ClassUnitComputation:
    """Run one deterministic shared class-and-unit computation."""
    engine = ClassUnitGroupEngine(
        field,
        proof=proof,
        algorithm=algorithm,
        limits=limits,
        seed=seed,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        components=components,
    )
    try:
        return engine.run()
    except RuntimeError as error:
        if not _is_cancellation(error):
            raise
        return engine._incomplete("class/unit computation cancelled")


class_unit_group = compute_class_unit_group


def class_unit_context(
    field: Any,
    *,
    proof: bool | None = None,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    components: Any = None,
    **limit_overrides: Any,
) -> ClassUnitComputation:
    """Return the shared computation consumed by every public projection."""
    if limits is not None and limit_overrides:
        raise ValueError("pass either limits or limit overrides, not both")
    selected_limits = (
        ClassUnitEngineLimits(**limit_overrides) if limit_overrides else limits
    )
    if selected_limits is None:
        selected_limits = ClassUnitEngineLimits()
    proof_value = True if proof is None else bool(proof)
    use_cache = (
        cancelled is None
        and progress is None
        and checkpoint is None
        and resume_from is None
        and checkpoint_controller is None
        and components is None
    )
    cache_key = (
        proof_value,
        algorithm,
        seed,
        tuple(sorted(selected_limits.to_dict().items())),
    )
    cache = getattr(field, "_class_unit_engine_cache", None)
    if use_cache and isinstance(cache, dict) and cache_key in cache:
        return cache[cache_key]
    result = compute_class_unit_group(
        field,
        proof=proof_value,
        algorithm=algorithm,
        limits=selected_limits,
        seed=seed,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        components=components,
    )
    if use_cache:
        if not isinstance(cache, dict):
            cache = {}
            field._class_unit_engine_cache = cache
        cache[cache_key] = result
    return result


def class_group(
    field: Any,
    proof: bool | None = None,
    names: str = "c",
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the proved ordinary ideal class group of `field`."""
    del names
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    try:
        maps = __import__(
            "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
        )
        adapter = maps.class_group_from_engine_result
        return adapter(result)
    except (ImportError, AttributeError, TypeError):
        return result.class_group()


def class_number(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> int:
    """Return the proved ordinary class number of `field`."""
    return class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    ).class_number()


def unit_group(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the complete ordinary unit group computation for `field`."""
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    unit_result = result.unit_group()
    if not unit_result.complete:
        raise ValueError("the unit subgroup has not been proved complete")
    return unit_result


def units(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> tuple[Any, ...]:
    """Return exact free unit generators for `field`."""
    result = unit_group(
        field,
        proof,
        algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    return tuple(_value(result, ("generators", "gens"), ()))


def regulator(
    field: Any,
    prec: int = 53,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the regulator result under a requested `prec`-bit policy."""
    precision = _positive(prec, "regulator precision")
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    current = result.regulator()
    if int(current.precision_bits) >= precision:
        return current
    unit_result = result.unit_group()
    cache = getattr(unit_result, "_regulator_precision_cache", None)
    if not isinstance(cache, dict):
        cache = {int(current.precision_bits): current}
        unit_result._regulator_precision_cache = cache
    if precision not in cache:
        analytic = _optional_module("sagejs.number_fields.class_unit_analytic")
        if analytic is None:
            raise ImportError("the class/unit analytic module is unavailable")
        cache[precision] = analytic.regulator_from_factored_units(
            result.units(),
            unit_rank=int(unit_result.unit_rank),
            precision_bits=precision,
            maximum_precision_bits=max(1_024, precision),
        )
    return cache[precision]


__all__ = [
    "ClassUnitComputation",
    "ClassUnitEngineLimits",
    "ClassUnitGroupEngine",
    "ClassUnitStage",
    "EXACT_RELATIONS_CONDITIONAL_GRH",
    "EXACT_UNCONDITIONAL",
    "INCOMPLETE_RESOURCE_LIMIT",
    "UnitGroupComputation",
    "class_group",
    "class_number",
    "class_unit_context",
    "class_unit_group",
    "compute_class_unit_group",
    "regulator",
    "unit_group",
    "units",
]
