"""Named graph generators at SageMath's historical import path."""

from typing import Any

import sagejs.runtime as runtime

graphs: Any = runtime.reflect.get(runtime.global_object, "graphs")
digraphs: Any = runtime.reflect.get(runtime.global_object, "digraphs")

__all__ = ["digraphs", "graphs"]
