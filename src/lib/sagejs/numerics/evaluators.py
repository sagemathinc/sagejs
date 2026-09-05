"""Prepared, bounded scalar binary64 expressions with explicit execution routes.

This is a numerical expression facility, not general Python closure compilation.
Opaque callbacks are never converted, inspected for purity or replaced by it.
"""

from __future__ import annotations

import hashlib
import math
import time
from typing import Any

from ._json import canonical_json, materialize_object
from .frontends.expressions import evaluate_expression, expression_record


class PreparedFunction:
    """Own a reusable scalar expression with explicit ordered inputs.

    All constants, intermediates and inputs use binary64 semantics. Preparation
    accepts at most 32768 source characters, 64 input names, 128 tree levels and
    4096 instructions. No input buffers or mutable parameter values are retained.
    `backend="native"` requests available source-bound acceleration; missing or
    unsupported acceleration keeps the canonical expression interpreter.

    Source parsing, native loading and argument conversion occur outside the
    isolated core. `to_dict()` reports the actual selection. Derivatives and
    vector outputs are not yet supported. Native execution remains experimental.
    """

    def __init__(
        self,
        source: str,
        *,
        inputs: tuple[str, ...] | list[str] = ("x",),
        language: str = "python",
        backend: str = "dynamic",
        max_instructions: int = 4096,
    ) -> None:
        started = time.perf_counter()
        if not isinstance(source, str) or len(source) > 32768:
            raise ValueError(
                "prepared source must be a string of at most 32768 characters"
            )
        if not isinstance(inputs, (tuple, list)) or not 1 <= len(inputs) <= 64:
            raise ValueError("prepared inputs require one through 64 names")
        if any(name in ("pi", "e") for name in inputs):
            raise ValueError(
                "pi and e are reserved expression constants, not input names"
            )
        if backend not in ("dynamic", "native"):
            raise ValueError("backend must be 'dynamic' or 'native'")
        if type(max_instructions) is not int or not 1 <= max_instructions <= 4096:
            raise ValueError("max_instructions must be an integer from 1 through 4096")
        self._closed = False
        self._busy = False
        self._names = tuple(inputs)
        try:
            self._record = expression_record(
                source, language=language, parameters=self._names
            )
        except RecursionError as error:
            raise ValueError("prepared expression nesting is too deep") from error
        self._source = source
        self._language = language
        self._requested = backend
        self._target = "dynamic"
        self._reason = "dynamic requested"
        self._function: Any = None
        self._workspace: Any = None
        self._opcodes: list[int] = []
        self._left: list[int] = []
        self._right: list[int] = []
        self._constants: list[float] = []
        self._maximum = max_instructions
        self._nodes = 0
        self._eligible = True
        # Count the complete tree even when its first operation is unsupported.
        self._check_tree(self._record["tree"], 0)
        try:
            self._lower(self._record["tree"])
        except NotImplementedError as error:
            self._eligible = False
            self._reason = str(error)
            self._opcodes = []
            self._left = []
            self._right = []
            self._constants = []
        if backend == "native" and self._eligible:
            from sagejs.native import (
                is_compiled,
                kernel_float64_buffer,
                kernel_uint64_buffer,
            )

            from ._evaluation_core import evaluate_program

            self._reason = "source-bound native evaluator unavailable"
            if is_compiled(evaluate_program) and getattr(
                evaluate_program, "nativeAvailable", False
            ):
                self._function = evaluate_program
                self._workspace = (
                    kernel_uint64_buffer(evaluate_program, self._opcodes),
                    kernel_uint64_buffer(evaluate_program, self._left),
                    kernel_uint64_buffer(evaluate_program, self._right),
                    kernel_float64_buffer(evaluate_program, self._constants),
                    kernel_float64_buffer(evaluate_program, [0.0] * len(self._names)),
                    kernel_float64_buffer(evaluate_program, [0.0] * len(self._opcodes)),
                    kernel_float64_buffer(evaluate_program, [0.0]),
                )
                self._target = str(
                    getattr(evaluate_program, "executionTarget", "native")
                )
                self._reason = "explicit source-bound prepared evaluator"
        identity = {
            "schema": "sagejs.prepared-function/v1",
            "semantics": "finite-binary64",
            "expression": self._record,
        }
        self._identity = hashlib.sha256(
            canonical_json(identity).encode("utf-8")
        ).hexdigest()
        self._preparation_ms = 1000.0 * (time.perf_counter() - started)

    def _check_tree(self, node: Any, depth: int) -> None:
        self._nodes += 1
        if depth > 128 or self._nodes > self._maximum:
            raise ValueError("prepared expression exceeds its depth/instruction budget")
        if node["kind"] == "number" and not math.isfinite(float(node["value"])):
            raise ValueError("prepared constant is not finite binary64")
        if node["kind"] == "binary":
            self._check_tree(node["left"], depth + 1)
            self._check_tree(node["right"], depth + 1)
        elif node["kind"] == "unary":
            self._check_tree(node["operand"], depth + 1)
        elif node["kind"] == "call":
            for argument in node["arguments"]:
                self._check_tree(argument, depth + 1)

    def _lower(self, node: Any) -> int:
        kind = node["kind"]
        operation, first, second = 0, 0, 0
        if kind == "number" or (kind == "symbol" and node["name"] in ("pi", "e")):
            value = (
                float(node["value"])
                if kind == "number"
                else (math.pi if node["name"] == "pi" else math.e)
            )
            if not math.isfinite(value):
                raise ValueError("prepared constant is not finite binary64")
            first = len(self._constants)
            self._constants.append(value)
        elif kind == "symbol":
            operation, first = 1, self._names.index(node["name"])
        elif kind == "unary":
            first = self._lower(node["operand"])
            if node["operator"] == "positive":
                return first
            operation = 2
        elif kind == "binary":
            operations = {"add": 5, "subtract": 6, "multiply": 7, "divide": 8}
            if node["operator"] not in operations:
                raise NotImplementedError(
                    "dynamic fallback for operation " + node["operator"]
                )
            operation = operations[node["operator"]]
            first = self._lower(node["left"])
            second = self._lower(node["right"])
        elif kind == "call":
            operations = {"abs": 3, "sqrt": 4}
            if node["function"] not in operations:
                raise NotImplementedError(
                    "dynamic fallback for function " + node["function"]
                )
            operation = operations[node["function"]]
            first = self._lower(node["arguments"][0])
        else:
            raise NotImplementedError("dynamic fallback for expression " + kind)
        index = len(self._opcodes)
        self._opcodes.append(operation)
        self._left.append(first)
        self._right.append(second)
        return index

    def _require_open(self) -> None:
        if self._closed:
            raise ValueError("PreparedFunction is closed")
        if self._busy:
            raise RuntimeError("PreparedFunction workspace is in use")

    def __call__(self, *values: Any) -> float:
        self._require_open()
        if len(values) != len(self._names):
            raise ValueError("prepared argument count mismatch")
        self._busy = True
        try:
            arguments = [float(value) for value in values]
            if not all(math.isfinite(value) for value in arguments):
                raise ValueError("prepared inputs must be finite binary64")
            if self._function is None:
                try:
                    answer = float(
                        evaluate_expression(
                            self._record,
                            {
                                name: arguments[index]
                                for index, name in enumerate(self._names)
                            },
                            finite_intermediates=True,
                        )
                    )
                except ArithmeticError as error:
                    raise ValueError(
                        "prepared expression is outside its finite real domain"
                    ) from error
            else:
                workspace = self._workspace
                for index, value in enumerate(arguments):
                    workspace[4][index] = value
                status = self._function(*workspace, len(self._opcodes))
                if status == 2.0:
                    raise ValueError(
                        "prepared expression is outside its finite real domain"
                    )
                if status != 0.0:
                    raise ValueError(
                        "prepared expression failed with status " + str(status)
                    )
                answer = float(workspace[6][0])
            if not math.isfinite(answer):
                raise ValueError("prepared result is not finite binary64")
            return answer
        finally:
            self._busy = False

    def to_dict(self) -> dict[str, Any]:
        """Return detached semantics and selection, not a performance claim."""
        self._require_open()
        return materialize_object(
            {
                "schema": "sagejs.prepared-function/v1",
                "id": self._identity,
                "identity_kind": "canonical-expression",
                "source": self._source,
                "language": self._language,
                "expression": self._record,
                "semantics": "finite-binary64",
                "classification": "extension",
                "requested_backend": self._requested,
                "execution_target": self._target,
                "selection_reason": self._reason,
                "compiled_eligible": self._eligible,
                "instruction_count": len(self._opcodes),
                "host_calls_inside_compiled_core": 0
                if self._function is not None
                else None,
                "derivatives": "unsupported",
                "vector_outputs": "unsupported",
                "preparation_ms": self._preparation_ms,
            },
            "$.prepared_function",
        )

    def close(self) -> None:
        if self._busy:
            raise RuntimeError("PreparedFunction workspace is in use")
        self._workspace = None
        self._function = None
        self._opcodes, self._left, self._right, self._constants = [], [], [], []
        self._record = {}
        self._closed = True

    def __enter__(self) -> PreparedFunction:
        self._require_open()
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False

    def __copy__(self) -> Any:
        raise TypeError(
            "prepare a new function from its source instead of copying owned workspace"
        )

    def __deepcopy__(self, _memo: Any) -> Any:
        return self.__copy__()

    def __reduce_ex__(self, _protocol: Any) -> Any:
        return self.__copy__()
