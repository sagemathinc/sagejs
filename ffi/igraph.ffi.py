"""Safe igraph declarations lowered statically to igraph.ffi.json."""

from sagejs.ffi.declare import (
    CxxToStatus,
    Direct,
    Effects,
    Library,
    Nullable,
    Status,
    Writable,
    in_,
    out,
    packed_slice,
    record,
)


igraph = Library(
    id="igraph",
    python_module="sagejs.ffi.igraph",
    package="@sagemath/sagejs-graph",
    headers=["sagejs/igraph_ffi.h"],
    link_unix=["libigraph.a"],
    link_windows=["igraph.lib"],
    dependencies=["igraph"],
    prefix_environment="SAGEJS_GRAPH_PREFIX",
    unix_default="packages/graph/.native/prefix",
    windows_default="packages/graph/.native/prefix",
    include_dirs=["include", "include/igraph"],
    source_include_dirs=["packages/graph/include"],
)


IGraph = igraph.resource(
    id="graph",
    abi=sagejs_igraph_graph_t,
    ownership="owned",
    close="ffiGraphClose",
    clear="sagejs_igraph_graph_clear",
    wasm=False,
)


IGraphEdges = igraph.resource(
    id="edges",
    abi=sagejs_igraph_edges_view_t,
    ownership="borrowed",
    owner="graph",
    wasm=False,
)


@igraph.function(
    dynamic="ffiGraphCompleteCreate",
    symbol="sagejs_igraph_complete_init",
    returns=int,
    abi=[
        out("result", sagejs_igraph_graph_t),
        in_("vertex_count", uint64_t),
        in_("directed", int),
        in_("loops", int),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="igraph could not construct complete graph",
    ),
    wasm=False,
)
def complete_graph(vertex_count: uint64, directed: bool, loops: bool) -> IGraph:
    ...


@igraph.function(
    dynamic="ffiGraphVertexCount",
    symbol="sagejs_igraph_vertex_count",
    returns=uint64_t,
    abi=[in_("graph", sagejs_igraph_graph_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def vertex_count(graph: IGraph) -> uint64:
    ...


@igraph.function(
    dynamic="ffiGraphEdgesBorrow",
    symbol="sagejs_igraph_edges_borrow",
    returns=int,
    abi=[
        out("result", sagejs_igraph_edges_view_t),
        in_("graph", sagejs_igraph_graph_t),
    ],
    effects=Effects(pure=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="igraph could not borrow edge storage",
    ),
    borrow_from="graph",
    wasm=False,
)
def edges(graph: IGraph) -> IGraphEdges:
    ...


@igraph.function(
    dynamic="ffiGraphEdgeCount",
    symbol="sagejs_igraph_edge_count",
    returns=uint64_t,
    abi=[in_("edges", sagejs_igraph_edges_view_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def edge_count(edges: IGraphEdges) -> uint64:
    ...


@igraph.function(
    dynamic="ffiGraphEdgeChecksum",
    symbol="sagejs_igraph_edge_checksum",
    returns=uint64_t,
    abi=[in_("edges", sagejs_igraph_edges_view_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def edge_checksum(edges: IGraphEdges) -> uint64:
    ...


@igraph.function(
    dynamic="ffiCanonicalPermutationPacked",
    symbol="sagejs_igraph_canonical_permutation_packed",
    returns=int,
    abi=[
        out(
            "labels",
            uint64_t_ptr,
            packed_slice(
                data="output",
                length="vertex_count",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "edge_data",
            uint64_t_ptr,
            packed_slice(
                data="edges",
                length="edge_entries",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "request",
            sagejs_igraph_canonical_request_t,
            record(
                vertex_count="vertex_count",
                edge_entries="edge_entries",
                directed="directed",
            ),
        ),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[RuntimeError],
        writes=["output"],
    ),
    result=Status(
        1,
        exception=RuntimeError,
        message="igraph canonical labeling failed",
    ),
    exceptions=CxxToStatus(0),
    wasm=False,
)
def canonical_permutation(
    output: Writable[UInt64Buffer],
    edges: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: bool,
) -> bool:
    ...


@igraph.function(
    dynamic="ffiFirstEdgeEndpointPacked",
    symbol="sagejs_igraph_first_edge_endpoint",
    returns=const_uint64_t_ptr,
    abi=[
        in_(
            "edge_data",
            uint64_t_ptr,
            packed_slice(
                data="edges",
                length="edge_entries",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("edge_entries", uint64_t),
    ],
    effects=Effects(pure=True, raises=[ValueError]),
    result=Nullable(
        exception=ValueError,
        message="graph has no edge endpoints",
    ),
    wasm=False,
)
def first_edge_endpoint(edges: UInt64Buffer, edge_entries: uint64) -> uint64:
    ...
