"""Lazy documentation search for the public builtins facade."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__all__ = ["_search_doc"]

_core: Any = runtime.reflect.get(
    runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
    "sagejs._baselib.builtins",
)
_Str = str
_Bool = bool


def _builtins_doc_summary(doc: _Str) -> _Str:
    for line in doc.split("\n"):
        summary = line.strip()
        if summary:
            return summary
    return ""


def _replace_pattern(value: _Str, pattern: _Str, replacement: _Str) -> _Str:
    return runtime.reflect.apply(
        runtime.string_class.prototype.replace,
        value,
        [runtime.regexp(pattern, "g"), replacement],
    )


def _builtins_doc_search_match(
    query: _Str,
    candidate: _Str,
) -> _Bool:
    lowered = _replace_pattern(
        runtime.reflect.apply(
            runtime.string_class.prototype.normalize, candidate.lower(), ["NFD"]
        ),
        r"[\u0300-\u036f]",
        "",
    )
    query = _replace_pattern(
        runtime.reflect.apply(runtime.string_class.prototype.normalize, query, ["NFD"]),
        r"[\u0300-\u036f]",
        "",
    )
    if query in lowered:
        return True
    normalized_query = _replace_pattern(
        _replace_pattern(query, r"[`_-]+", " "), r"\s+", " "
    )
    normalized_candidate = _replace_pattern(
        _replace_pattern(lowered, r"[`_-]+", " "), r"\s+", " "
    )
    return normalized_query in normalized_candidate


def _search_doc(query: Any) -> None:
    text = str(query)
    needle = text.lower()
    if not needle:
        raise ValueError("search_doc query must not be empty")

    matches = []
    seen = []
    for registered_entry in runtime.documentation_registry():
        registered_name = registered_entry[0]
        registered_value = registered_entry[1]
        if registered_name in seen:
            continue
        registered_doc = _core._builtins_doc(registered_value)
        if _builtins_doc_search_match(needle, registered_name) or (
            registered_doc and _builtins_doc_search_match(needle, registered_doc)
        ):
            matches.append(
                registered_name + " -- " + _builtins_doc_summary(registered_doc)
            )
            seen.append(registered_name)

    namespace = _core._builtins_get_member(runtime.modules, "__main__")
    names = runtime.object.getOwnPropertyNames(namespace)
    names.sort()
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
        if _builtins_doc_search_match(needle, name) or (
            doc and _builtins_doc_search_match(needle, doc)
        ):
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
            if _builtins_doc_search_match(needle, qualified_name) or (
                method_doc and _builtins_doc_search_match(needle, method_doc)
            ):
                matches.append(
                    qualified_name + " -- " + _builtins_doc_summary(method_doc)
                )
                seen.append(qualified_name)

    matches.sort()
    if len(matches) == 0:
        _core.ρσ_print("No documentation matching '" + text + "'.")
        return
    _core.ρσ_print(
        "Search results for '" + text + "':\n    " + str.join("\n    ", matches)
    )
