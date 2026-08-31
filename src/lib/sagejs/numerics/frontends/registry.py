"""Composable frontend adapters without a shared mutable operation registry."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
)

Lowerer = Callable[..., NumericalFrontendIntent]
Emitter = Callable[[NumericalFrontendIntent], str]
Parser = Callable[[str], NumericalFrontendIntent]
Executor = Callable[[NumericalFrontendIntent], Any]


class OperationAdapter:
    """Language aliases, emitters, parsers, and execution for one operation."""

    def __init__(
        self,
        operation: OperationRef,
        *,
        aliases: Mapping[str, Sequence[str]],
        lowerers: Mapping[str, Lowerer],
        emitters: Mapping[str, Emitter],
        parsers: Mapping[str, Parser] | None = None,
        executor: Executor | None = None,
    ) -> None:
        if not isinstance(operation, OperationRef):
            raise TypeError("operation adapter requires an OperationRef")
        self.operation = operation
        self.aliases: dict[str, tuple[str, ...]] = {}
        self.lowerers: dict[str, Lowerer] = {}
        self.emitters: dict[str, Emitter] = {}
        self.parsers: dict[str, Parser] = {}
        for language in aliases:
            target = canonical_language(language)
            names = tuple(str(name) for name in aliases[language])
            if not names or any(name == "" for name in names):
                raise ValueError("operation aliases must be nonempty")
            self.aliases[target] = names
        for language in lowerers:
            self.lowerers[canonical_language(language)] = lowerers[language]
        for language in emitters:
            self.emitters[canonical_language(language)] = emitters[language]
        if parsers is not None:
            for language in parsers:
                self.parsers[canonical_language(language)] = parsers[language]
        self.executor = executor


class FrontendRegistry:
    """A caller-owned set of operation adapters.

    Domain packages register adapters into an instance supplied by their
    integration layer.  Merely importing a package never mutates a central
    registry, which keeps parallel domain work independent.
    """

    def __init__(self, adapters: Sequence[OperationAdapter] = ()) -> None:
        self._adapters: dict[str, OperationAdapter] = {}
        self._aliases: dict[tuple[str, str], str] = {}
        for adapter in adapters:
            self.register(adapter)

    def register(self, adapter: OperationAdapter) -> "FrontendRegistry":
        if not isinstance(adapter, OperationAdapter):
            raise TypeError("frontend registry accepts OperationAdapter values")
        key = adapter.operation.key
        if key in self._adapters:
            raise ValueError("duplicate frontend operation adapter: " + key)
        pending: list[tuple[str, str]] = []
        for language in adapter.aliases:
            if language not in adapter.lowerers:
                raise ValueError("operation aliases require a lowerer for " + language)
            for name in adapter.aliases[language]:
                alias = (language, name.lower())
                if alias in self._aliases:
                    raise ValueError(
                        "duplicate numerical frontend alias: " + language + ":" + name
                    )
                pending.append(alias)
        self._adapters[key] = adapter
        for alias in pending:
            self._aliases[alias] = key
        return self

    def operations(self) -> tuple[OperationRef, ...]:
        return tuple(self._adapters[key].operation for key in sorted(self._adapters))

    def adapter(self, operation: OperationRef) -> OperationAdapter:
        adapter = self._adapters.get(operation.key)
        if adapter is None:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_operation",
                    "no frontend adapter is registered for " + operation.key,
                    operation=operation.name,
                    details={"operation_key": operation.key},
                )
            )
        return adapter

    def lower(
        self,
        language: str,
        name: str,
        *arguments: Any,
        **options: Any,
    ) -> NumericalFrontendIntent:
        source = canonical_language(language)
        key = self._aliases.get((source, str(name).lower()))
        if key is None:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_operation",
                    "unsupported " + source + " numerical operation: " + str(name),
                    language=source,
                    details={"source_name": str(name)},
                )
            )
        lowerer = self._adapters[key].lowerers[source]
        return lowerer(*arguments, **options)

    def emit(self, intent: NumericalFrontendIntent, target: str) -> str:
        language = canonical_language(target)
        adapter = self.adapter(intent.operation_ref)
        emitter = adapter.emitters.get(language)
        if emitter is None:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_target",
                    "operation "
                    + intent.operation
                    + " has no "
                    + language
                    + " code emitter",
                    operation=intent.operation,
                    language=language,
                )
            )
        return emitter(intent)

    def parse(
        self, source: str, language: str, operation: OperationRef
    ) -> NumericalFrontendIntent:
        frontend = canonical_language(language)
        adapter = self.adapter(operation)
        parser = adapter.parsers.get(frontend)
        if parser is None:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_target",
                    "operation "
                    + operation.name
                    + " has no "
                    + frontend
                    + " round-trip parser",
                    operation=operation.name,
                    language=frontend,
                )
            )
        return parser(source)

    def execute(self, intent: NumericalFrontendIntent) -> Any:
        adapter = self.adapter(intent.operation_ref)
        if adapter.executor is None:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_operation",
                    "operation " + intent.operation + " has no execution adapter",
                    operation=intent.operation,
                )
            )
        return adapter.executor(intent)


__all__ = ["FrontendRegistry", "OperationAdapter"]
