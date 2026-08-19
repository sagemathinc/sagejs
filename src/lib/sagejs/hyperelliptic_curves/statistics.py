"""Exact accumulators for hyperelliptic local-data streams."""

from __future__ import annotations

from typing import Any, Iterable, Iterator

import sagejs as sage


def _exact_nonnegative(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if value != answer:
        raise ValueError(name + " must be an exact integer")
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


class LocalDataStatistics:
    """Streaming exact counts, sums, and coefficient moments."""

    def __init__(self, max_moment: Any = 4) -> None:
        self.max_moment = _exact_nonnegative(max_moment, "max_moment")
        self.records = 0
        self.available_records = 0
        self.omitted_records = 0
        self.status_counts: dict[str, int] = {}
        self.p_rank_counts: dict[int, int] = {}
        self.ordinary_records = 0
        self.coefficient_sums: list[Any] = []
        self.coefficient_power_sums: list[list[Any]] = []
        self.curve_point_count_sums: dict[int, Any] = {}
        self.jacobian_order_sums: dict[int, Any] = {}
        self._normalized_even_sums: dict[tuple[int, int], Any] = {}
        self._normalized_float_sums: dict[tuple[int, int], float] = {}

    def add(self, record: Any) -> LocalDataStatistics:
        """Add one already-computed local-data record."""
        self.records += 1
        self.status_counts[record.status] = self.status_counts.get(record.status, 0) + 1
        if not record.available or record.coefficients is None:
            self.omitted_records += 1
            return self
        self.available_records += 1
        if record.ordinary:
            self.ordinary_records += 1
        if record.p_rank is not None:
            self.p_rank_counts[record.p_rank] = (
                self.p_rank_counts.get(record.p_rank, 0) + 1
            )
        genus = int(record.genus)
        if len(self.coefficient_sums) == 0:
            self.coefficient_sums = [sage.ZZ(0) for _index in range(genus)]
            self.coefficient_power_sums = [
                [sage.ZZ(0) for _power in range(self.max_moment)]
                for _index in range(genus)
            ]
        elif len(self.coefficient_sums) != genus:
            raise ValueError("one statistics accumulator cannot mix genera")
        prime = sage.ZZ(record.prime)
        for index in range(1, genus + 1):
            coefficient = sage.ZZ(record.coefficients[index])
            self.coefficient_sums[index - 1] += coefficient
            power_value = sage.ZZ(1)
            for power in range(1, self.max_moment + 1):
                power_value *= coefficient
                self.coefficient_power_sums[index - 1][power - 1] += power_value
                key = (index, power)
                self._normalized_float_sums[key] = self._normalized_float_sums.get(
                    key, 0.0
                ) + float(coefficient) ** power / (float(prime) ** (index * power / 2))
                if (index * power) % 2 == 0:
                    denominator = prime ** ((index * power) // 2)
                    self._normalized_even_sums[key] = self._normalized_even_sums.get(
                        key, sage.QQ(0)
                    ) + sage.QQ(power_value) / sage.QQ(denominator)
        for degree, value in record.curve_point_counts.items():
            self.curve_point_count_sums[degree] = (
                self.curve_point_count_sums.get(degree, sage.ZZ(0)) + value
            )
        for degree, value in record.jacobian_extension_orders.items():
            self.jacobian_order_sums[degree] = (
                self.jacobian_order_sums.get(degree, sage.ZZ(0)) + value
            )
        return self

    def normalized_moment(self, coefficient_index: Any, power: Any) -> Any:
        """Return an exact mean when the normalization has integral p-power."""
        index = _exact_nonnegative(coefficient_index, "coefficient_index")
        moment = _exact_nonnegative(power, "power")
        if index < 1 or moment < 1:
            raise ValueError("coefficient_index and power must be positive")
        if (index * moment) % 2:
            raise ValueError(
                "this normalized moment contains square roots; use "
                "normalized_moment_float() at the presentation boundary"
            )
        if self.available_records == 0:
            raise ZeroDivisionError("there are no available records")
        return self._normalized_even_sums.get((index, moment), sage.QQ(0)) / (
            self.available_records
        )

    def normalized_moment_float(self, coefficient_index: Any, power: Any) -> float:
        """Return a floating normalized mean for presentation and plotting."""
        index = _exact_nonnegative(coefficient_index, "coefficient_index")
        moment = _exact_nonnegative(power, "power")
        if index < 1 or moment < 1:
            raise ValueError("coefficient_index and power must be positive")
        if self.available_records == 0:
            raise ZeroDivisionError("there are no available records")
        return self._normalized_float_sums.get((index, moment), 0.0) / float(
            self.available_records
        )

    def as_dict(self) -> dict[str, Any]:
        """Return exact accumulator state suitable for SagePack serialization."""
        return {
            "records": self.records,
            "available_records": self.available_records,
            "omitted_records": self.omitted_records,
            "status_counts": dict(self.status_counts),
            "p_rank_counts": dict(self.p_rank_counts),
            "ordinary_records": self.ordinary_records,
            "coefficient_sums": tuple(self.coefficient_sums),
            "coefficient_power_sums": tuple(
                tuple(values) for values in self.coefficient_power_sums
            ),
            "curve_point_count_sums": dict(self.curve_point_count_sums),
            "jacobian_order_sums": dict(self.jacobian_order_sums),
        }


def filter_local_data(
    records: Iterable[Any],
    *,
    available: bool | None = None,
    ordinary: bool | None = None,
    p_rank: int | None = None,
    status: str | None = None,
) -> Iterator[Any]:
    """Filter any local-data iterable using only already-derived invariants."""
    for record in records:
        if record.matches(
            available=available,
            ordinary=ordinary,
            p_rank=p_rank,
            status=status,
        ):
            yield record
