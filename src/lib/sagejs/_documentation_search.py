"""Lazy help rendering and documentation search for the public builtins facade."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__all__ = ["_help", "_search_doc"]

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
        registered_doc = _builtins_doc(registered_value)
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
        # Module bindings are live accessor-backed slots in standalone output.
        # Read the namespace binding; class method inspection below still uses
        # descriptors so searching documentation never evaluates properties.
        value = runtime.reflect.get(namespace, name)
        if value is runtime.undefined:
            continue
        doc = _builtins_doc(value)
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
            method_doc = _builtins_doc(method)
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


def _builtins_signature(value: Any, name: _Str) -> _Str:
    # Signature binding and rendering belong together in the lazy inspect
    # module, not in two independently maintained defaults implementations.
    inspection = _core._builtins_default_import("inspect")
    return inspection._sagejs_signature_text(value, name)


def _builtins_doc(value: Any = None) -> _Str:
    for entry in runtime.documentation_registry():
        if entry[1] is value:
            metadata_doc = _core._builtins_get_member(entry[2], "doc")
            if runtime.strict_equal(runtime.jstype(metadata_doc), "string"):
                return metadata_doc
    doc = _core._builtins_get_member(value, "__doc__")
    if runtime.strict_equal(runtime.jstype(doc), "string"):
        return doc
    return ""


def _builtins_indent_doc(doc: _Str, prefix: _Str) -> _Str:
    if not doc:
        return ""
    lines = []
    for line in doc.split("\n"):
        lines.append(prefix + line)
    return str.join("\n", lines)


def _builtins_class_help(value: Any, instance: _Bool) -> _Str:
    cls = value
    if instance:
        cls = _core._builtins_get_member(value, "constructor")
    name = _core._builtins_callable_name(cls)
    heading = "Help on class " + name + ":"
    if instance:
        heading = "Help on " + name + " object:"
    lines = [
        heading,
        "",
        "class " + _builtins_signature(cls, name),
    ]
    doc = _builtins_doc(cls)
    if doc:
        lines.extend(["", _builtins_indent_doc(doc, "    ")])

    prototype = _core._builtins_get_member(cls, "prototype")
    methods = []
    for method_name in _core.ρσ_dir(cls):
        method = _core._builtins_prototype_member(prototype, method_name)
        if runtime.string_find(method_name, "_") != 0 and runtime.strict_equal(
            runtime.jstype(method), "function"
        ):
            methods.append(method_name)
    if len(methods) > 0:
        lines.extend(["", "Methods:"])
        for method_name in methods:
            method = _core._builtins_prototype_member(prototype, method_name)
            lines.append("    " + _builtins_signature(method, method_name))
            method_doc = _builtins_doc(method)
            if method_doc:
                lines.append(_builtins_indent_doc(method_doc, "        "))
    return str.join("\n", lines)


def _help(item: Any, omitted: _Bool = False) -> None:
    """Print concise Python-style help derived from Sage.js metadata."""
    if omitted:
        _core.ρσ_print(
            "Welcome to Sage.js help.  "
            + "Call help(object) for information about an object."
        )
        return

    for entry in runtime.documentation_registry():
        if entry[1] is item:
            registered_name = entry[0]
            metadata = entry[2]
            metadata_doc = _core._builtins_get_member(metadata, "doc")
            if runtime.strict_equal(runtime.jstype(metadata_doc), "string"):
                registered_kind = _core._builtins_get_member(metadata, "kind")
                if not runtime.strict_equal(runtime.jstype(registered_kind), "string"):
                    registered_kind = "object"
                registered_lines = [
                    ("Help on " + registered_kind + " " + registered_name + ":"),
                    "",
                ]
                if registered_kind in ["function", "method", "class"]:
                    registered_lines.append(_builtins_signature(item, registered_name))
                    registered_lines.append("")
                else:
                    registered_lines.extend([registered_name, ""])
                registered_lines.append(
                    _builtins_indent_doc(metadata_doc.strip(), "    ")
                )
                _core.ρσ_print(str.join("\n", registered_lines))
                return

    if _core._builtins_is_python_class(item):
        text = _builtins_class_help(item, False)
    elif runtime.strict_equal(runtime.jstype(item), "function"):
        name = _core._builtins_callable_name(item)
        bound = _core._builtins_has_member(item, "__self__")
        kind = "method" if bound else "function"
        module = _core._builtins_get_member(item, "__module__")
        heading = "Help on " + kind + " " + name
        if runtime.strict_equal(runtime.jstype(module), "string") and module:
            heading += " in module " + module
        lines = [
            heading + ":",
            "",
            _builtins_signature(item, name),
        ]
        doc = _builtins_doc(item)
        if doc:
            lines.extend(["", _builtins_indent_doc(doc, "    ")])
        text = str.join("\n", lines)
    else:
        constructor = _core._builtins_get_member(item, "constructor")
        if _core._builtins_is_python_class(constructor):
            text = _builtins_class_help(item, True)
        else:
            type_name = _core._builtins_callable_name(constructor)
            text = "Help on " + type_name + " object."
            doc = _builtins_doc(item)
            if doc:
                text += "\n\n" + _builtins_indent_doc(doc, "    ")
    _core.ρσ_print(text)
