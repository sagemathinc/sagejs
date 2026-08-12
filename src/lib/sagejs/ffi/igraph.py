"""Generated safe FFI surface for igraph; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c"
)


class IGraph:
    """Opaque owned igraph:graph resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:graph",
        )

    def __enter__(self) -> IGraph:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class IGraphEdges:
    """Opaque borrowed igraph:edges view."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def valid(self) -> bool:
        return _runtime.ffi_view_valid(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:edges",
        )


def complete_graph(vertex_count: int, directed: bool, loops: bool) -> IGraph:
    """Call declared igraph:complete_graph."""
    return IGraph(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":complete_graph",
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:graph",
            "@sagemath/sagejs-graph",
            "ffiGraphCompleteCreate",
            "ffiGraphClose",
            [vertex_count, directed, loops],
            ["uint64", "bool", "bool"],
            [None, None, None],
            "zero_is_error",
            "RuntimeError",
            "igraph could not construct complete graph",
        )
    )


def vertex_count(graph: IGraph) -> int:
    """Call declared igraph:vertex_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":vertex_count",
        "@sagemath/sagejs-graph",
        "ffiGraphVertexCount",
        [graph._ffi_borrow()],
        [
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:graph"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def edges(graph: IGraph) -> IGraphEdges:
    """Call declared igraph:edges."""
    return IGraphEdges(
        _runtime.ffi_view_create(
            __sagejs_ffi_declaration__ + ":edges",
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:edges",
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:graph",
            graph._ffi_borrow(),
            "@sagemath/sagejs-graph",
            "ffiGraphEdgesBorrow",
            [graph._ffi_borrow()],
            [
                "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:graph"
            ],
            "zero_is_error",
            "RuntimeError",
            "igraph could not borrow edge storage",
        )
    )


def edge_count(edges: IGraphEdges) -> int:
    """Call declared igraph:edge_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":edge_count",
        "@sagemath/sagejs-graph",
        "ffiGraphEdgeCount",
        [edges._ffi_borrow()],
        [
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:edges"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def edge_checksum(edges: IGraphEdges) -> int:
    """Call declared igraph:edge_checksum."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":edge_checksum",
        "@sagemath/sagejs-graph",
        "ffiGraphEdgeChecksum",
        [edges._ffi_borrow()],
        [
            "resource:igraph@6979211fee6a49b6f272e15f0315e14f482897ca5605a6b49be0859dfc0c9c8c:edges"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def canonical_permutation(
    output: list[int],
    edges: list[int],
    vertex_count: int,
    edge_entries: int,
    directed: bool,
) -> bool:
    """Call declared igraph:canonical_permutation."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":canonical_permutation",
        "@sagemath/sagejs-graph",
        "ffiCanonicalPermutationPacked",
        [output, edges, vertex_count, edge_entries, directed],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "bool"],
        "bool",
        ["status", [1], None],
        "RuntimeError",
        "igraph canonical labeling failed",
        [
            [
                "buffer_length",
                "output",
                ["vertex_count"],
                ["output", "edges", "vertex_count", "edge_entries", "directed"],
            ],
            [
                "buffer_length",
                "edges",
                ["edge_entries"],
                ["output", "edges", "vertex_count", "edge_entries", "directed"],
            ],
        ],
    )


def first_edge_endpoint(edges: list[int], edge_entries: int) -> int:
    """Call declared igraph:first_edge_endpoint."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":first_edge_endpoint",
        "@sagemath/sagejs-graph",
        "ffiFirstEdgeEndpointPacked",
        [edges, edge_entries],
        ["UInt64Buffer", "uint64"],
        "uint64",
        ["nullable", [], "error"],
        "ValueError",
        "graph has no edge endpoints",
        [["buffer_length", "edges", ["edge_entries"], ["edges", "edge_entries"]]],
    )
