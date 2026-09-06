"""Lazy documentation search; the public facade stays in builtins."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__all__ = ["_search_doc"]

_core: Any = __import__("sagejs._baselib.builtins", fromlist=["ρσ_search_doc"])
_Str = str
_Bool = bool


def _builtins_doc_summary(doc: _Str) -> _Str:
    for line in doc.split("\n"):
        summary = line.strip()
        if summary:
            return summary
    return ""


def _search_doc(query: Any) -> None:
    text = str(query)
    needle = text.lower()
    if not needle:
        raise ValueError("search_doc query must not be empty")

    # Each maximal run of punctuation/whitespace becomes one space, exactly
    # as punctuation-to-space followed by whitespace collapse. Neither step
    # trims the boundary runs. Keep the pre-collapse substring test first.
    marks = runtime.regexp(r"[\u0300-\u036f]", "g")
    separators = runtime.regexp(r"[`_\s-]+", "g")
    needle = runtime.reflect.apply(
        runtime.string_class.prototype.normalize, needle, ["NFD"]
    )
    needle = runtime.reflect.apply(
        runtime.string_class.prototype.replace, needle, [marks, ""]
    )
    normalized_needle = runtime.reflect.apply(
        runtime.string_class.prototype.replace, needle, [separators, " "]
    )

    def matches_text(candidate: _Str) -> _Bool:
        lowered = runtime.reflect.apply(
            runtime.string_class.prototype.toLowerCase, candidate, []
        )
        lowered = runtime.reflect.apply(
            runtime.string_class.prototype.normalize, lowered, ["NFD"]
        )
        lowered = runtime.reflect.apply(
            runtime.string_class.prototype.replace, lowered, [marks, ""]
        )
        if runtime.string_find(lowered, needle) != -1:
            return True
        normalized_candidate = runtime.reflect.apply(
            runtime.string_class.prototype.replace, lowered, [separators, " "]
        )
        return runtime.string_find(normalized_candidate, normalized_needle) != -1

    matches = []
    seen = []
    for registered_entry in runtime.documentation_registry():
        registered_name = registered_entry[0]
        registered_value = registered_entry[1]
        if registered_name in seen:
            continue
        registered_doc = _core._builtins_doc(registered_value)
        if matches_text(registered_name) or (
            registered_doc and matches_text(registered_doc)
        ):
            matches.append(
                registered_name + " -- " + _builtins_doc_summary(registered_doc)
            )
            seen.append(registered_name)

    namespace = _core._builtins_get_member(runtime.modules, "__main__")
    names = runtime.object.getOwnPropertyNames(namespace)
    runtime.reflect.apply(runtime.array.prototype.sort, names, [])
    for name in names:
        if (
            runtime.string_find(name, "_") == 0
            or runtime.string_find(name, "ρσ_") == 0
            or name in seen
        ):
            continue
        descriptor = runtime.object.getOwnPropertyDescriptor(namespace, name)
        value = runtime.reflect.get(descriptor, "value")
        if value is runtime.undefined:
            continue
        doc = _core._builtins_doc(value)
        if matches_text(name) or (doc and matches_text(doc)):
            matches.append(name + " -- " + _builtins_doc_summary(doc))
            seen.append(name)

        if not _core._builtins_is_python_class(value):
            continue
        prototype = _core._builtins_get_member(value, "prototype")
        for method_name in _core.ρσ_dir(value):
            if runtime.string_find(method_name, "_") == 0:
                continue
            method = _core._builtins_prototype_member(prototype, method_name)
            if not runtime.strict_equal(runtime.jstype(method), "function"):
                continue
            qualified_name = name + "." + method_name
            if qualified_name in seen:
                continue
            method_doc = _core._builtins_doc(method)
            if matches_text(qualified_name) or (
                method_doc and matches_text(method_doc)
            ):
                matches.append(
                    qualified_name + " -- " + _builtins_doc_summary(method_doc)
                )
                seen.append(qualified_name)

    runtime.reflect.apply(runtime.array.prototype.sort, matches, [])
    if len(matches) == 0:
        _core.ρσ_print("No documentation matching '" + text + "'.")
        return
    _core.ρσ_print(
        "Search results for '" + text + "':\n    " + str.join("\n    ", matches)
    )
