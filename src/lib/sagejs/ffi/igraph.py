"""Generated safe FFI surface for igraph; do not edit by hand."""

from __future__ import annotations

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = "igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88"


class IGraph:
    """Opaque owned igraph:graph resource."""

    def __init__(self, token):
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self):
        return _runtime.ffi_resource_borrow(
            self._token, "resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:graph"
        )

    def __enter__(self):
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type, exception, traceback) -> bool:
        self.close()
        return False


class IGraphEdges:
    """Opaque borrowed igraph:edges view."""

    def __init__(self, token):
        self._token = token

    @property
    def valid(self) -> bool:
        return _runtime.ffi_view_valid(self._token)

    def _ffi_borrow(self):
        return _runtime.ffi_resource_borrow(
            self._token, "resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:edges"
        )



def complete_graph(vertex_count: int, directed: bool, loops: bool) -> IGraph:
    """Call declared igraph:complete_graph."""
    return IGraph(_runtime.ffi_resource_create(
        __sagejs_ffi_declaration__ + ":complete_graph",
        "resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:graph",
        "@sagemath/sagejs-graph",
        "ffiGraphCompleteCreate",
        "ffiGraphClose",
        [vertex_count, directed, loops],
        ["uint64", "bool", "bool"],
        [None, None, None],
        "zero_is_error",
        "RuntimeError",
        "igraph could not construct complete graph",
    ))


def vertex_count(graph: IGraph) -> int:
    """Call declared igraph:vertex_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":vertex_count",
        "@sagemath/sagejs-graph",
        "ffiGraphVertexCount",
        [graph._ffi_borrow()],
        ["resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:graph"],
        "uint64",
        "none",
        None,
        None,
    )


def edges(graph: IGraph) -> IGraphEdges:
    """Call declared igraph:edges."""
    return IGraphEdges(_runtime.ffi_view_create(
        __sagejs_ffi_declaration__ + ":edges",
        "resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:edges",
        "resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:graph",
        graph._ffi_borrow(),
        "@sagemath/sagejs-graph",
        "ffiGraphEdgesBorrow",
        [graph._ffi_borrow()],
        ["resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:graph"],
        "zero_is_error",
        "RuntimeError",
        "igraph could not borrow edge storage",
    ))


def edge_count(edges: IGraphEdges) -> int:
    """Call declared igraph:edge_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":edge_count",
        "@sagemath/sagejs-graph",
        "ffiGraphEdgeCount",
        [edges._ffi_borrow()],
        ["resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:edges"],
        "uint64",
        "none",
        None,
        None,
    )


def edge_checksum(edges: IGraphEdges) -> int:
    """Call declared igraph:edge_checksum."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":edge_checksum",
        "@sagemath/sagejs-graph",
        "ffiGraphEdgeChecksum",
        [edges._ffi_borrow()],
        ["resource:igraph@fec8f4dc1bb98c066deac7e9cee9294730054d2dbc0ef927789b4275e4cd5c88:edges"],
        "uint64",
        "none",
        None,
        None,
    )
