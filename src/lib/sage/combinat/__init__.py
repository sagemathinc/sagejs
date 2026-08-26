"""Sage-compatible combinatorics namespace."""

from typing import Any

import sagejs.runtime as runtime

Partition: Any = runtime.reflect.get(runtime.global_object, "Partition")
Partitions: Any = runtime.reflect.get(runtime.global_object, "Partitions")
number_of_partitions: Any = runtime.reflect.get(
    runtime.global_object, "number_of_partitions"
)
fibonacci: Any = runtime.reflect.get(runtime.global_object, "fibonacci")
lucas_number1: Any = runtime.reflect.get(runtime.global_object, "lucas_number1")
lucas_number2: Any = runtime.reflect.get(runtime.global_object, "lucas_number2")
catalan_number: Any = runtime.reflect.get(runtime.global_object, "catalan_number")
bell_number: Any = runtime.reflect.get(runtime.global_object, "bell_number")
stirling_number1: Any = runtime.reflect.get(runtime.global_object, "stirling_number1")
stirling_number2: Any = runtime.reflect.get(runtime.global_object, "stirling_number2")
multinomial: Any = runtime.reflect.get(runtime.global_object, "multinomial")
falling_factorial: Any = runtime.reflect.get(runtime.global_object, "falling_factorial")
rising_factorial: Any = runtime.reflect.get(runtime.global_object, "rising_factorial")
number_of_derangements: Any = runtime.reflect.get(
    runtime.global_object, "number_of_derangements"
)
euler_number: Any = runtime.reflect.get(runtime.global_object, "euler_number")
harmonic_number: Any = runtime.reflect.get(runtime.global_object, "harmonic_number")
q_binomial: Any = runtime.reflect.get(runtime.global_object, "q_binomial")
gaussian_binomial: Any = runtime.reflect.get(runtime.global_object, "gaussian_binomial")

__all__ = [
    "Partition",
    "Partitions",
    "number_of_partitions",
    "fibonacci",
    "lucas_number1",
    "lucas_number2",
    "catalan_number",
    "bell_number",
    "stirling_number1",
    "stirling_number2",
    "multinomial",
    "falling_factorial",
    "rising_factorial",
    "number_of_derangements",
    "euler_number",
    "harmonic_number",
    "q_binomial",
    "gaussian_binomial",
]
