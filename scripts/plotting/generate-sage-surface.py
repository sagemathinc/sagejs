#!/usr/bin/env python3
"""Generate the pinned Sage 10.9.post1 plotting public-surface inventory."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import inspect
import json
import re
import sys
import warnings
from pathlib import Path
from typing import Any

from sage.version import date as sage_release_date
from sage.version import version as sage_version


PINNED_SAGE_VERSION = "10.9.post1"
SCHEMA_VERSION = 1

# These are the modules in the Sage 2D and 3D reference manuals.  The 2D
# manual also documents graph plotting through sage.graphs.graph_plot.
MODULES_2D = (
    "sage.graphs.graph_plot",
    "sage.plot.animate",
    "sage.plot.arc",
    "sage.plot.arrow",
    "sage.plot.bar_chart",
    "sage.plot.bezier_path",
    "sage.plot.circle",
    "sage.plot.colors",
    "sage.plot.complex_plot",
    "sage.plot.contour_plot",
    "sage.plot.density_plot",
    "sage.plot.disk",
    "sage.plot.ellipse",
    "sage.plot.graphics",
    "sage.plot.histogram",
    "sage.plot.hyperbolic_arc",
    "sage.plot.hyperbolic_polygon",
    "sage.plot.hyperbolic_regular_polygon",
    "sage.plot.line",
    "sage.plot.matrix_plot",
    "sage.plot.misc",
    "sage.plot.multigraphics",
    "sage.plot.plot",
    "sage.plot.plot_field",
    "sage.plot.point",
    "sage.plot.polygon",
    "sage.plot.primitive",
    "sage.plot.scatter_plot",
    "sage.plot.step",
    "sage.plot.streamline_plot",
    "sage.plot.text",
)

MODULES_3D = (
    "sage.plot.plot3d.base",
    "sage.plot.plot3d.implicit_plot3d",
    "sage.plot.plot3d.implicit_surface",
    "sage.plot.plot3d.index_face_set",
    "sage.plot.plot3d.introduction",
    "sage.plot.plot3d.list_plot3d",
    "sage.plot.plot3d.parametric_plot3d",
    "sage.plot.plot3d.parametric_surface",
    "sage.plot.plot3d.platonic",
    "sage.plot.plot3d.plot3d",
    "sage.plot.plot3d.plot_field3d",
    "sage.plot.plot3d.revolution_plot3d",
    "sage.plot.plot3d.shapes",
    "sage.plot.plot3d.shapes2",
    "sage.plot.plot3d.tachyon",
    "sage.plot.plot3d.texture",
    "sage.plot.plot3d.transform",
    "sage.plot.plot3d.tri_plot",
)

_ADDRESS = re.compile(r"0x[0-9A-Fa-f]+")


def _stable_text(value: Any) -> str:
    """Return introspection text without process-specific memory addresses."""
    return _ADDRESS.sub("<address>", str(value))


def _documented_signature(obj: Any, name: str) -> tuple[str | None, str]:
    """Return the best deterministic signature exposed by the installed Sage."""
    try:
        return _stable_text(inspect.signature(obj)), "inspect"
    except (TypeError, ValueError):
        pass

    text_signature = getattr(obj, "__text_signature__", None)
    if isinstance(text_signature, str) and text_signature.strip():
        return _stable_text(text_signature.strip()), "text_signature"

    doc = inspect.getdoc(obj)
    if doc:
        first_line = doc.splitlines()[0].strip()
        prefix = first_line.find(f"{name}(")
        if prefix >= 0 and first_line.endswith(")"):
            return _stable_text(first_line[prefix + len(name) :]), "docstring"
    return None, "unavailable"


def _qualified_type(value: type[Any]) -> str:
    return f"{value.__module__}.{value.__qualname__}"


def _method_record(cls: type[Any], name: str, raw: Any) -> dict[str, Any] | None:
    descriptor = "instance"
    value = raw
    if isinstance(raw, staticmethod):
        descriptor = "static"
        value = raw.__func__
    elif isinstance(raw, classmethod):
        descriptor = "class"
        value = raw.__func__
    if not callable(value):
        return None
    signature, signature_source = _documented_signature(value, name)
    return {
        "name": name,
        "qualified_name": f"{cls.__module__}.{cls.__qualname__}.{name}",
        "descriptor": descriptor,
        "signature": signature,
        "signature_source": signature_source,
    }


def _class_record(module_name: str, binding: str, cls: type[Any]) -> dict[str, Any]:
    signature, signature_source = _documented_signature(cls, binding)
    if signature is None:
        signature, signature_source = _documented_signature(cls.__init__, "__init__")
        if signature is not None:
            signature_source = f"constructor_{signature_source}"
    methods = []
    for name, raw in sorted(vars(cls).items()):
        if name.startswith("_"):
            continue
        record = _method_record(cls, name, raw)
        if record is not None:
            methods.append(record)
    return {
        "name": binding,
        "qualified_name": f"{module_name}.{binding}",
        "implementation_qualified_name": _qualified_type(cls),
        "kind": "class",
        "signature": signature,
        "signature_source": signature_source,
        "bases": [_qualified_type(base) for base in cls.__bases__],
        "methods": methods,
    }


def _callable_record(module_name: str, binding: str, value: Any) -> dict[str, Any]:
    signature, signature_source = _documented_signature(value, binding)
    implementation_name = getattr(value, "__qualname__", binding)
    return {
        "name": binding,
        "qualified_name": f"{module_name}.{binding}",
        "implementation_qualified_name": f"{module_name}.{implementation_name}",
        "kind": "function",
        "signature": signature,
        "signature_source": signature_source,
    }


def _source_record(module: Any) -> dict[str, Any]:
    origin = Path(module.__spec__.origin)
    data = origin.read_bytes()
    is_python = origin.suffix == ".py"
    logical_suffix = ".py" if is_python else ".pyx"
    return {
        "logical_path": module.__name__.replace(".", "/") + logical_suffix,
        "installed_kind": "python-source" if is_python else "extension-binary",
        "sha256": hashlib.sha256(data).hexdigest(),
        "sha256_scope": "source-file" if is_python else "installed-extension-binary",
        "size_bytes": len(data),
    }


def _module_record(module_name: str, dimension: str) -> dict[str, Any]:
    module = importlib.import_module(module_name)
    symbols = []
    for binding, value in sorted(vars(module).items()):
        if binding.startswith("_"):
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            defined_in = getattr(value, "__module__", None)
        if defined_in != module_name:
            continue
        if inspect.isclass(value):
            symbols.append(_class_record(module_name, binding, value))
        elif inspect.isroutine(value):
            symbols.append(_callable_record(module_name, binding, value))
    return {
        "name": module_name,
        "dimension": dimension,
        "source": _source_record(module),
        "symbols": symbols,
    }


def generate() -> dict[str, Any]:
    if sage_version != PINNED_SAGE_VERSION:
        raise RuntimeError(
            f"expected SageMath {PINNED_SAGE_VERSION}, found {sage_version}"
        )

    modules = [
        *(_module_record(name, "2d") for name in MODULES_2D),
        *(_module_record(name, "3d") for name in MODULES_3D),
    ]
    functions = sum(
        symbol["kind"] == "function"
        for module in modules
        for symbol in module["symbols"]
    )
    classes = sum(
        symbol["kind"] == "class" for module in modules for symbol in module["symbols"]
    )
    methods = sum(
        len(symbol.get("methods", ()))
        for module in modules
        for symbol in module["symbols"]
    )
    unavailable_signatures = sum(
        symbol["signature"] is None
        for module in modules
        for symbol in module["symbols"]
    ) + sum(
        method["signature"] is None
        for module in modules
        for symbol in module["symbols"]
        for method in symbol.get("methods", ())
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "authority": {
            "name": "SageMath",
            "version": sage_version,
            "release_date": sage_release_date,
            "reference_2d": "https://doc.sagemath.org/html/en/reference/plotting/",
            "reference_3d": "https://doc.sagemath.org/html/en/reference/plot3d/",
        },
        "scope": {
            "rule": "documented modules; module-local public callables and classes; class-declared public callable methods",
            "dimensions": {"2d": list(MODULES_2D), "3d": list(MODULES_3D)},
        },
        "summary": {
            "modules": len(modules),
            "modules_2d": len(MODULES_2D),
            "modules_3d": len(MODULES_3D),
            "functions": functions,
            "classes": classes,
            "methods": methods,
            "unavailable_signatures": unavailable_signatures,
        },
        "modules": modules,
    }


def _serialized() -> str:
    return json.dumps(generate(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    # Sagelite's file runner retains its ``--`` separator in sys.argv.  Accept
    # that form so generator options are not consumed by Sagelite itself.
    separated = sys.argv[0] == "--"
    script_argument = sys.argv[1] if separated else sys.argv[0]
    command_arguments = sys.argv[2:] if separated else sys.argv[1:]
    repository = Path(script_argument).resolve().parents[2]
    default_output = repository / "docs/sage-compatibility/plotting/sage-surface.json"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args(command_arguments)

    serialized = _serialized()
    if args.stdout:
        print(serialized, end="")
        return
    if args.check:
        actual = args.output.read_text(encoding="utf-8")
        if actual != serialized:
            raise SystemExit(f"stale Sage plotting surface: {args.output}")
        print(f"Sage plotting surface is current: {args.output}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(serialized, encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ in {"__main__", "sage.all"}:
    main()
