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
    ) -> None:
        self.torsion = torsion
        self.generators = tuple(generators)
        self.unit_rank = int(unit_rank)
        self.complete = bool(complete)
        self.regulator_enclosure = regulator
        self.reason = reason
        self.proof_status = (
            EXACT_UNCONDITIONAL if self.complete else INCOMPLETE_RESOURCE_LIMIT
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
        for coordinate, modulus in zip(self._coordinates, self._parent._invariants):
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
                for left, right in zip(self._coordinates, other._coordinates)
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
        for coordinate, ideal in zip(element.coordinates(), self._generator_ideals):
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
        row = tuple(
            int(value) for value in self._factor_over_base(ideal, self._factor_base)
        )
        coordinates = tuple(self._presentation.class_coordinates(row))
        reduced = tuple(self._presentation.lift_class_coordinates(coordinates))
        delta_values = []
        for index in range(len(row)):
            delta_values.append(row[index] - reduced[index])
        delta = tuple(delta_values)
        witness = self._combine_relations(self._relation_coefficients(delta))
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
        self.components = _Components() if components is None else components
        self.stages: list[ClassUnitStage] = []

    def _stage(self, name: str, state: str, **details: Any) -> None:
        self.stages.append(ClassUnitStage(name, state, details))

    def _check_cancelled(self) -> None:
        if self.cancelled():
            raise RuntimeError("class/unit computation cancelled")

    def _incomplete(
        self,
        reason: str,
        *,
        invariants: Iterable[int] = (),
        unit_group: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> ClassUnitComputation:
        self._stage("terminal", "incomplete", reason=reason)
        return ClassUnitComputation(
            self.field,
            proof_status=INCOMPLETE_RESOURCE_LIMIT,
            complete=False,
            reason=reason,
            algorithm=self.algorithm,
            stages=self.stages,
            unit_group=unit_group,
            tentative_invariants=invariants,
            diagnostics=diagnostics,
        )

    def _specialized(self) -> ClassUnitComputation | None:
        if self.algorithm == "buchmann-hecke" or self.field.degree() > 3:
            return None
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
        self._stage(
            "specialized",
            "complete",
            class_number=int(classes.order()),
            unit_rank=int(units.unit_rank),
        )
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
        )

    def _factor_base(self) -> tuple[Any, tuple[Any, ...]]:
        module = self.components.factor_base
        plan = module.factor_base_plan(
            self.order,
            proof=self.proof,
            theorem=("minkowski" if self.proof else "auto"),
            max_bound=self.limits.max_factor_base_bound,
            max_prime_ideals=self.limits.max_factor_base_size,
            max_memory_bytes=self.limits.max_memory_bytes,
        )
        plan.require_feasible()
        records = module.build_factor_base(plan)
        primes = tuple(_value(record, ("prime_ideal", "ideal")) for record in records)
        if any(prime is None for prime in primes):
            raise TypeError("factor-base records do not expose exact prime ideals")
        self._stage(
            "factor-base",
            "complete",
            theorem=plan.theorem,
            assumptions=list(plan.assumptions),
            bound=int(plan.bound),
            size=len(primes),
        )
        return plan, primes

    def _relations(
        self, factor_base: tuple[Any, ...], unit_rank: int
    ) -> tuple[Any, Any]:
        relations = self.components.relations
        matrix_module = self.components.matrix
        collector = relations.ExactRelationCollector(self.order, factor_base)
        relations.initial_rational_prime_relations(collector)
        attempts = 0
        presentation = matrix_module.extract_relation_presentation(
            [record.row for record in collector.records],
            len(factor_base),
            require_full_rank=False,
        )
        coefficient_bound = 1
        batch = 4
        search = relations.LLLRelationSearch(
            collector,
            seed=self.seed,
            max_candidates_per_ideal=8,
            random_terms=3,
            coefficient_bound=coefficient_bound,
        )
        dependency_target = unit_rank + max(2, int(self.field.degree()))
        while (
            presentation.rank < len(factor_base)
            or len(presentation.dependency_transforms) < dependency_target
        ):
            self._check_cancelled()
            if attempts >= self.limits.max_relation_attempts:
                break
            remaining = self.limits.max_relation_attempts - attempts
            count = min(batch, remaining)
            search.max_candidates_per_ideal = min(
                self.limits.max_candidates_per_ideal,
                8 * coefficient_bound,
            )
            search.random_terms = min(
                self.limits.max_random_terms, 2 + coefficient_bound
            )
            search.coefficient_bound = coefficient_bound
            for _attempt in range(count):
                try:
                    search.search_random_ideals(
                        1,
                        terms=search.random_terms,
                        max_exponent=min(3, coefficient_bound + 1),
                        stop_after_per_ideal=2,
                    )
                except ValueError as error:
                    if "already admitted" not in str(error):
                        raise
            attempts += count
            if len(collector.records) > self.limits.max_relations:
                raise ValueError("exact relation count exceeds max_relations")
            presentation = matrix_module.extract_relation_presentation(
                [record.row for record in collector.records],
                len(factor_base),
                require_full_rank=False,
            )
            coefficient_bound = min(
                self.limits.max_coefficient_bound, coefficient_bound + 1
            )
            batch = min(64, 2 * batch)
        self._stage(
            "relations",
            "complete" if presentation.rank == len(factor_base) else "bounded",
            attempts=attempts,
            relations=len(collector.records),
            rank=int(presentation.rank),
            columns=len(factor_base),
            dependencies=len(presentation.dependency_transforms),
        )
        return collector, presentation

    def _decode_relation_witness(self, record: Any) -> Any:
        return self.components.relations.FactoredPrincipalWitness.from_dict(
            self.field, record.witness
        )

    def _combine(self, records: Sequence[Any], coefficients: Sequence[int]) -> Any:
        factors = []
        for record, coefficient in zip(records, coefficients):
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
        if unit_rank == 0:
            return ()
        embedding_module = _optional_module("sagejs.number_fields.embeddings")
        if embedding_module is None:
            return ()
        data = embedding_module.archimedean_data(self.field)
        rows: list[list[float]] = []
        units: list[Any] = []
        rank = 0
        for dependency in presentation.dependency_transforms:
            unit = self._combine(records, dependency)
            if unit.principal_ideal(self.order) != self.order.ideal(1):
                raise ArithmeticError("a relation dependency is not an exact unit")
            value = unit.evaluate()
            logs = list(data.logarithmic_image(value, 80)[:-1])
            candidate = rows + [logs]
            next_rank = _floating_rank(candidate)
            if next_rank > rank:
                rows.append(logs)
                units.append(unit)
                rank = next_rank
                if rank == unit_rank:
                    break
        return tuple(units)

    def _analytic_index(
        self, presentation: Any, units: tuple[Any, ...], unit_rank: int
    ) -> tuple[Any, Any, Any]:
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
            proof_status,
            theorem,
        )
        if not group.verify():
            raise ArithmeticError("class-group ideal maps failed exact replay")
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
            plan, factor_base = self._factor_base()
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
            )
            if not index.index_one:
                return self._incomplete(
                    "analytic hR validation did not isolate index one",
                    invariants=presentation.invariants,
                    unit_group=unit_group,
                )
            proof_status = (
                EXACT_UNCONDITIONAL if self.proof else EXACT_RELATIONS_CONDITIONAL_GRH
            )
            if self.proof and tuple(plan.assumptions):
                raise ArithmeticError("an unconditional run selected an assumed bound")
            if not self.proof and not tuple(plan.assumptions):
                raise ArithmeticError("a conditional run did not record its assumption")
            group = self._class_group(
                factor_base,
                collector,
                presentation,
                proof_status,
                str(plan.theorem),
            )
            self._stage(
                "proof",
                "complete",
                proof_status=proof_status,
                minkowski_primes=(len(factor_base) if self.proof else 0),
                exact_relations=len(collector.records),
            )
            self._stage("terminal", "complete", class_number=group.order())
            return ClassUnitComputation(
                self.field,
                proof_status=proof_status,
                complete=True,
                reason="exact relations and rigorous class/unit index one",
                algorithm="buchmann-hecke",
                stages=self.stages,
                class_group=group,
                unit_group=unit_group,
                tentative_invariants=presentation.invariants,
                diagnostics={
                    "factor_base_bound": int(plan.bound),
                    "factor_base_size": len(factor_base),
                    "relations": len(collector.records),
                },
            )
        except RuntimeError as error:
            if str(error) == "class/unit computation cancelled":
                return self._incomplete(str(error))
            raise
        except (ImportError, TypeError, ValueError, ArithmeticError) as error:
            return self._incomplete(str(error))


def _floating_rank(rows: Sequence[Sequence[float]], tolerance: float = 1e-10) -> int:
    if not rows:
        return 0
    matrix = [list(float(value) for value in row) for row in rows]
    row_count = len(matrix)
    column_count = len(matrix[0])
    rank = 0
    for column in range(column_count):
        pivot = rank
        while pivot < row_count and abs(matrix[pivot][column]) <= tolerance:
            pivot += 1
        if pivot == row_count:
            continue
        matrix[rank], matrix[pivot] = matrix[pivot], matrix[rank]
        value = matrix[rank][column]
        for index in range(column, column_count):
            matrix[rank][index] /= value
        for row in range(row_count):
            if row == rank:
                continue
            multiple = matrix[row][column]
            for index in range(column, column_count):
                matrix[row][index] -= multiple * matrix[rank][index]
        rank += 1
        if rank == row_count:
            break
    return rank


def compute_class_unit_group(
    field: Any,
    *,
    proof: bool = True,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
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
        components=components,
    )
    try:
        return engine.run()
    except RuntimeError as error:
        if str(error) != "class/unit computation cancelled":
            raise
        return engine._incomplete(str(error))


class_unit_group = compute_class_unit_group


def class_unit_context(
    field: Any,
    *,
    proof: bool | None = None,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
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
    use_cache = cancelled is None and components is None
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
        components=components,
    )
    if use_cache:
        if not isinstance(cache, dict):
            cache = {}
            setattr(field, "_class_unit_engine_cache", cache)
        cache[cache_key] = result
    return result


def class_group(
    field: Any,
    proof: bool | None = None,
    names: str = "c",
    algorithm: str = "auto",
    **limits: Any,
) -> Any:
    """Return the proved ordinary ideal class group of `field`."""
    del names
    return class_unit_context(
        field, proof=proof, algorithm=algorithm, **limits
    ).class_group()


def class_number(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    **limits: Any,
) -> int:
    """Return the proved ordinary class number of `field`."""
    return class_unit_context(
        field, proof=proof, algorithm=algorithm, **limits
    ).class_number()


def unit_group(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    **limits: Any,
) -> Any:
    """Return the complete ordinary unit group computation for `field`."""
    result = class_unit_context(field, proof=proof, algorithm=algorithm, **limits)
    unit_result = result.unit_group()
    if not unit_result.complete:
        raise ValueError("the unit subgroup has not been proved complete")
    return unit_result


def units(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    **limits: Any,
) -> tuple[Any, ...]:
    """Return exact free unit generators for `field`."""
    result = unit_group(field, proof, algorithm, **limits)
    return tuple(_value(result, ("generators", "gens"), ()))


def regulator(
    field: Any,
    prec: int = 53,
    proof: bool | None = None,
    algorithm: str = "auto",
    **limits: Any,
) -> Any:
    """Return the regulator result under a requested `prec`-bit policy."""
    precision = _positive(prec, "regulator precision")
    if "precision_bits" not in limits:
        limits["precision_bits"] = precision
    if "max_precision_bits" not in limits:
        limits["max_precision_bits"] = max(1_024, precision)
    return class_unit_context(
        field, proof=proof, algorithm=algorithm, **limits
    ).regulator()


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
