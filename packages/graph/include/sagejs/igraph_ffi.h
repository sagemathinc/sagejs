#ifndef SAGEJS_IGRAPH_FFI_H
#define SAGEJS_IGRAPH_FFI_H

#include <stdint.h>

#ifndef IGRAPH_STATIC
#define IGRAPH_STATIC 1
#endif
#include <igraph.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Public, host-neutral storage used by generated Sage.js FFI kernels. */
typedef igraph_t sagejs_igraph_graph_t[1];

typedef struct {
    const igraph_t *graph;
} sagejs_igraph_edges_view_struct;
typedef sagejs_igraph_edges_view_struct sagejs_igraph_edges_view_t[1];

static inline int sagejs_igraph_complete_init(
    sagejs_igraph_graph_t result,
    uint64_t vertex_count,
    int directed,
    int loops)
{
    if (vertex_count > (uint64_t) IGRAPH_VCOUNT_MAX)
        return 0;
    return igraph_full(result, (igraph_int_t) vertex_count,
        directed != 0, loops != 0) == IGRAPH_SUCCESS;
}

static inline void sagejs_igraph_graph_clear(sagejs_igraph_graph_t graph)
{
    igraph_destroy(graph);
}

static inline uint64_t sagejs_igraph_vertex_count(
    const sagejs_igraph_graph_t graph)
{
    return (uint64_t) igraph_vcount(graph);
}

static inline int sagejs_igraph_edges_borrow(
    sagejs_igraph_edges_view_t result,
    const sagejs_igraph_graph_t graph)
{
    result->graph = graph;
    return 1;
}

static inline uint64_t sagejs_igraph_edge_count(
    const sagejs_igraph_edges_view_t view)
{
    return (uint64_t) igraph_ecount(view->graph);
}

static inline uint64_t sagejs_igraph_edge_checksum(
    const sagejs_igraph_edges_view_t view)
{
    const igraph_int_t count = igraph_ecount(view->graph);
    uint64_t checksum = UINT64_C(1469598103934665603);
    for (igraph_int_t edge = 0; edge < count; edge++) {
        checksum ^= (uint64_t) IGRAPH_FROM(view->graph, edge);
        checksum *= UINT64_C(1099511628211);
        checksum ^= (uint64_t) IGRAPH_TO(view->graph, edge);
        checksum *= UINT64_C(1099511628211);
    }
    return checksum;
}

#ifdef __cplusplus
}
#endif

#endif
