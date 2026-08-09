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

/* Canonical labeling over a packed edge-pair slice.  This is a host-neutral
 * adapter around igraph: ownership stays lexical and the caller's output is
 * touched only after Bliss succeeds. */
static inline int sagejs_igraph_canonical_permutation_packed(
    uint64_t *output,
    uint64_t *edges,
    uint64_t vertex_count,
    uint64_t edge_entries,
    int directed)
{
    igraph_vector_int_t edge_vector;
    igraph_vector_int_t labeling;
    igraph_t graph;
    igraph_error_t code;
    int edge_initialized = 0;
    int graph_initialized = 0;
    int labeling_initialized = 0;

    if (vertex_count > (uint64_t) IGRAPH_VCOUNT_MAX ||
        edge_entries > (uint64_t) IGRAPH_ECOUNT_MAX * UINT64_C(2) ||
        (edge_entries & UINT64_C(1)) != 0)
        return 0;
    code = igraph_vector_int_init(&edge_vector, (igraph_int_t) edge_entries);
    if (code != IGRAPH_SUCCESS)
        return 0;
    edge_initialized = 1;
    for (uint64_t index = 0; index < edge_entries; index++) {
        if (edges[index] >= vertex_count ||
            edges[index] > (uint64_t) IGRAPH_INTEGER_MAX) {
            code = IGRAPH_EINVAL;
            goto cleanup;
        }
        VECTOR(edge_vector)[(igraph_int_t) index] =
            (igraph_int_t) edges[index];
    }
    code = igraph_create(&graph, &edge_vector, (igraph_int_t) vertex_count,
        directed != 0);
    if (code != IGRAPH_SUCCESS)
        goto cleanup;
    graph_initialized = 1;
    code = igraph_vector_int_init(&labeling, 0);
    if (code != IGRAPH_SUCCESS)
        goto cleanup;
    labeling_initialized = 1;
    code = igraph_canonical_permutation_bliss(
        &graph, NULL, &labeling, IGRAPH_BLISS_FLM, NULL);
    if (code != IGRAPH_SUCCESS ||
        (uint64_t) igraph_vector_int_size(&labeling) != vertex_count)
        goto cleanup;
    for (uint64_t index = 0; index < vertex_count; index++)
        output[index] = (uint64_t) VECTOR(labeling)[(igraph_int_t) index];

cleanup:
    if (labeling_initialized)
        igraph_vector_int_destroy(&labeling);
    if (graph_initialized)
        igraph_destroy(&graph);
    if (edge_initialized)
        igraph_vector_int_destroy(&edge_vector);
    return code == IGRAPH_SUCCESS;
}

#ifdef __cplusplus
}
#endif

#endif
