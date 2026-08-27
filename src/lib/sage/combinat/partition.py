"""Integer partitions at SageMath's historical import path."""

from typing import Any

import sagejs.runtime as runtime

Partition: Any = runtime.reflect.get(runtime.global_object, "Partition")
Partitions: Any = runtime.reflect.get(runtime.global_object, "Partitions")
number_of_partitions: Any = runtime.reflect.get(
    runtime.global_object, "number_of_partitions"
)

__all__ = ["Partition", "Partitions", "number_of_partitions"]
