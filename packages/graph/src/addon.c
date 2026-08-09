#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>

#include <igraph.h>
#include <sagejs/igraph_ffi.h>

typedef struct {
    sagejs_igraph_graph_t graph;
    int initialized;
} sagejs_ffi_graph_t;

typedef struct {
    igraph_t graph;
    igraph_vector_int_t colors;
    igraph_bool_t has_colors;
    igraph_bool_t initialized;
} sagejs_graph_input_t;

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;

    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int require_arguments(
    napi_env env,
    napi_callback_info info,
    size_t expected,
    napi_value *arguments)
{
    size_t count = expected;

    if (!check_napi(env,
            napi_get_cb_info(env, info, &count, arguments, NULL, NULL)))
        return 0;
    if (count != expected) {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    return 1;
}

static int uint64_from_value(napi_env env, napi_value value, uint64_t *result)
{
    bool lossless;
    if (!check_napi(env,
            napi_get_value_bigint_uint64(env, value, result, &lossless)))
        return 0;
    if (!lossless) {
        napi_throw_range_error(env, NULL, "expected a uint64 value");
        return 0;
    }
    return 1;
}

static sagejs_ffi_graph_t *ffi_graph_from_value(
    napi_env env, napi_value value)
{
    sagejs_ffi_graph_t *graph = NULL;
    if (!check_napi(env, napi_get_value_external(env, value, (void **) &graph)))
        return NULL;
    if (graph == NULL || !graph->initialized) {
        napi_throw_error(env, NULL, "igraph resource is closed");
        return NULL;
    }
    return graph;
}

static void ffi_graph_finalize(napi_env env, void *data, void *hint)
{
    sagejs_ffi_graph_t *graph = data;
    (void) env;
    (void) hint;
    if (graph != NULL && graph->initialized) {
        sagejs_igraph_graph_clear(graph->graph);
        graph->initialized = 0;
    }
    free(graph);
}

static napi_value ffi_graph_complete_create(
    napi_env env, napi_callback_info info)
{
    napi_value arguments[3];
    napi_value result;
    uint64_t vertex_count;
    bool directed;
    bool loops;
    sagejs_ffi_graph_t *graph;

    if (!require_arguments(env, info, 3, arguments) ||
        !uint64_from_value(env, arguments[0], &vertex_count) ||
        !check_napi(env, napi_get_value_bool(env, arguments[1], &directed)) ||
        !check_napi(env, napi_get_value_bool(env, arguments[2], &loops)))
        return NULL;
    graph = calloc(1, sizeof(*graph));
    if (graph == NULL) {
        napi_throw_error(env, NULL, "unable to allocate igraph resource");
        return NULL;
    }
    if (!sagejs_igraph_complete_init(
            graph->graph, vertex_count, directed, loops)) {
        free(graph);
        napi_throw_error(env, NULL, "igraph could not construct complete graph");
        return NULL;
    }
    graph->initialized = 1;
    if (!check_napi(env, napi_create_external(
            env, graph, ffi_graph_finalize, NULL, &result))) {
        ffi_graph_finalize(env, graph, NULL);
        return NULL;
    }
    return result;
}

static napi_value ffi_graph_close(napi_env env, napi_callback_info info)
{
    napi_value argument;
    sagejs_ffi_graph_t *graph = NULL;
    if (!require_arguments(env, info, 1, &argument) ||
        !check_napi(env,
            napi_get_value_external(env, argument, (void **) &graph)))
        return NULL;
    if (graph != NULL && graph->initialized) {
        sagejs_igraph_graph_clear(graph->graph);
        graph->initialized = 0;
    }
    return NULL;
}

static napi_value ffi_graph_vertex_count(
    napi_env env, napi_callback_info info)
{
    napi_value argument;
    napi_value result;
    sagejs_ffi_graph_t *graph;
    if (!require_arguments(env, info, 1, &argument) ||
        (graph = ffi_graph_from_value(env, argument)) == NULL ||
        !check_napi(env, napi_create_bigint_uint64(env,
            sagejs_igraph_vertex_count(graph->graph), &result)))
        return NULL;
    return result;
}

static napi_value ffi_graph_edges_borrow(
    napi_env env, napi_callback_info info)
{
    napi_value argument;
    if (!require_arguments(env, info, 1, &argument) ||
        ffi_graph_from_value(env, argument) == NULL)
        return NULL;
    /* The generated borrowed-view wrapper pins and validates this owner. */
    return argument;
}

static napi_value ffi_graph_edge_measure(
    napi_env env, napi_callback_info info, int checksum)
{
    napi_value argument;
    napi_value result;
    sagejs_ffi_graph_t *graph;
    sagejs_igraph_edges_view_t view;
    uint64_t value;
    if (!require_arguments(env, info, 1, &argument) ||
        (graph = ffi_graph_from_value(env, argument)) == NULL ||
        !sagejs_igraph_edges_borrow(view, graph->graph))
        return NULL;
    value = checksum ? sagejs_igraph_edge_checksum(view) :
        sagejs_igraph_edge_count(view);
    if (!check_napi(env, napi_create_bigint_uint64(env, value, &result)))
        return NULL;
    return result;
}

static napi_value ffi_graph_edge_count(
    napi_env env, napi_callback_info info)
{
    return ffi_graph_edge_measure(env, info, 0);
}

static napi_value ffi_graph_edge_checksum(
    napi_env env, napi_callback_info info)
{
    return ffi_graph_edge_measure(env, info, 1);
}

static int throw_igraph(napi_env env, igraph_error_t code, const char *context)
{
    char message[512];

    snprintf(message, sizeof(message), "%s: %s", context,
        igraph_strerror(code));
    napi_throw_error(env, NULL, message);
    return 0;
}

static int named_property(
    napi_env env,
    napi_value object,
    const char *name,
    napi_value *value)
{
    bool present;

    if (!check_napi(env, napi_has_named_property(env, object, name, &present)))
        return 0;
    if (!present) {
        napi_throw_type_error(env, NULL, name);
        return 0;
    }
    return check_napi(env, napi_get_named_property(env, object, name, value));
}

static int int_from_value(napi_env env, napi_value value, igraph_int_t *result)
{
    int64_t number;

    if (!check_napi(env, napi_get_value_int64(env, value, &number)))
        return 0;
    if ((int64_t) (igraph_int_t) number != number) {
        napi_throw_range_error(env, NULL, "integer is outside igraph's range");
        return 0;
    }
    *result = (igraph_int_t) number;
    return 1;
}

static int int_vector_from_value(
    napi_env env,
    napi_value value,
    igraph_vector_int_t *result)
{
    bool is_array;
    bool is_typed_array;
    uint32_t length;
    uint32_t index;
    igraph_error_t code;

    if (!check_napi(env, napi_is_array(env, value, &is_array)) ||
        !check_napi(env, napi_is_typedarray(env, value, &is_typed_array)))
        return 0;
    if (!is_array && !is_typed_array) {
        napi_throw_type_error(env, NULL,
            "edges and colors must be arrays or Int32Array values");
        return 0;
    }

    if (is_typed_array) {
        napi_typedarray_type type;
        size_t typed_length;
        void *data;
        napi_value backing;
        size_t offset;

        if (!check_napi(env, napi_get_typedarray_info(env, value, &type,
                &typed_length, &data, &backing, &offset)))
            return 0;
        (void) backing;
        (void) offset;
        if (type != napi_int32_array || typed_length > UINT32_MAX) {
            napi_throw_type_error(env, NULL, "expected an Int32Array");
            return 0;
        }
        length = (uint32_t) typed_length;
        code = igraph_vector_int_init(result, (igraph_int_t) length);
        if (code != IGRAPH_SUCCESS)
            return throw_igraph(env, code, "allocate integer vector");
        for (index = 0; index < length; index++)
            VECTOR(*result)[index] = ((const int32_t *) data)[index];
        return 1;
    }

    if (!check_napi(env, napi_get_array_length(env, value, &length)))
        return 0;
    code = igraph_vector_int_init(result, (igraph_int_t) length);
    if (code != IGRAPH_SUCCESS)
        return throw_igraph(env, code, "allocate integer vector");
    for (index = 0; index < length; index++) {
        napi_value item;
        if (!check_napi(env, napi_get_element(env, value, index, &item)) ||
            !int_from_value(env, item, &VECTOR(*result)[index])) {
            igraph_vector_int_destroy(result);
            return 0;
        }
    }
    return 1;
}

static void graph_input_destroy(sagejs_graph_input_t *input)
{
    if (!input->initialized)
        return;
    if (input->has_colors)
        igraph_vector_int_destroy(&input->colors);
    igraph_destroy(&input->graph);
    input->initialized = 0;
}

static int graph_input_from_value(
    napi_env env,
    napi_value value,
    sagejs_graph_input_t *result)
{
    napi_valuetype type;
    napi_value item;
    igraph_int_t vertex_count;
    igraph_vector_int_t edges;
    bool directed;
    bool has_colors;
    igraph_error_t code;

    memset(result, 0, sizeof(*result));
    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_object) {
        napi_throw_type_error(env, NULL, "graph must be an object");
        return 0;
    }
    if (!named_property(env, value, "vertexCount", &item) ||
        !int_from_value(env, item, &vertex_count))
        return 0;
    if (vertex_count < 0) {
        napi_throw_range_error(env, NULL, "vertexCount must be nonnegative");
        return 0;
    }
    if (!named_property(env, value, "directed", &item) ||
        !check_napi(env, napi_get_value_bool(env, item, &directed)))
        return 0;
    if (!named_property(env, value, "edges", &item) ||
        !int_vector_from_value(env, item, &edges))
        return 0;
    if (igraph_vector_int_size(&edges) % 2 != 0) {
        igraph_vector_int_destroy(&edges);
        napi_throw_range_error(env, NULL, "edges must contain endpoint pairs");
        return 0;
    }
    for (igraph_int_t index = 0;
         index < igraph_vector_int_size(&edges); index++) {
        const igraph_int_t endpoint = VECTOR(edges)[index];
        if (endpoint < 0 || endpoint >= vertex_count) {
            igraph_vector_int_destroy(&edges);
            napi_throw_range_error(env, NULL, "edge endpoint is out of range");
            return 0;
        }
    }

    code = igraph_create(&result->graph, &edges, vertex_count, directed);
    igraph_vector_int_destroy(&edges);
    if (code != IGRAPH_SUCCESS)
        return throw_igraph(env, code, "create graph");
    result->initialized = 1;

    if (!check_napi(env,
            napi_has_named_property(env, value, "vertexColors", &has_colors))) {
        graph_input_destroy(result);
        return 0;
    }
    if (has_colors) {
        if (!check_napi(env,
                napi_get_named_property(env, value, "vertexColors", &item)) ||
            !int_vector_from_value(env, item, &result->colors)) {
            graph_input_destroy(result);
            return 0;
        }
        result->has_colors = 1;
        if (igraph_vector_int_size(&result->colors) != vertex_count) {
            graph_input_destroy(result);
            napi_throw_range_error(env, NULL,
                "vertexColors length must equal vertexCount");
            return 0;
        }
    }
    return 1;
}

static napi_value int_vector_to_array(
    napi_env env,
    const igraph_vector_int_t *vector)
{
    const igraph_int_t length = igraph_vector_int_size(vector);
    napi_value result;

    if (length > UINT32_MAX ||
        !check_napi(env,
            napi_create_array_with_length(env, (size_t) length, &result)))
        return NULL;
    for (igraph_int_t index = 0; index < length; index++) {
        napi_value item;
        if (!check_napi(env,
                napi_create_int64(env, VECTOR(*vector)[index], &item)) ||
            !check_napi(env,
                napi_set_element(env, result, (uint32_t) index, item)))
            return NULL;
    }
    return result;
}

static napi_value isomorphic(napi_env env, napi_callback_info info)
{
    napi_value arguments[2];
    sagejs_graph_input_t left;
    sagejs_graph_input_t right;
    igraph_bool_t answer;
    igraph_error_t code;
    napi_value result;

    if (!require_arguments(env, info, 2, arguments) ||
        !graph_input_from_value(env, arguments[0], &left))
        return NULL;
    if (!graph_input_from_value(env, arguments[1], &right)) {
        graph_input_destroy(&left);
        return NULL;
    }
    if (!left.has_colors && !right.has_colors) {
        /* igraph dispatches tiny graphs to tables, simple graphs to Bliss,
         * and colorized multigraphs to VF2. */
        code = igraph_isomorphic(&left.graph, &right.graph, &answer);
    } else if (left.has_colors && right.has_colors) {
        code = igraph_isomorphic_bliss(
            &left.graph,
            &right.graph,
            &left.colors,
            &right.colors,
            &answer,
            NULL,
            NULL,
            IGRAPH_BLISS_FLM,
            NULL,
            NULL);
    } else {
        code = IGRAPH_EINVAL;
    }
    graph_input_destroy(&right);
    graph_input_destroy(&left);
    if (code != IGRAPH_SUCCESS)
        return throw_igraph(env, code, "igraph isomorphism"), NULL;
    if (!check_napi(env, napi_get_boolean(env, answer, &result)))
        return NULL;
    return result;
}

static napi_value canonical_permutation(napi_env env, napi_callback_info info)
{
    napi_value arguments[1];
    sagejs_graph_input_t input;
    igraph_vector_int_t labeling;
    igraph_error_t code;
    napi_value result;

    if (!require_arguments(env, info, 1, arguments) ||
        !graph_input_from_value(env, arguments[0], &input))
        return NULL;
    code = igraph_vector_int_init(&labeling, 0);
    if (code == IGRAPH_SUCCESS) {
        code = igraph_canonical_permutation_bliss(
            &input.graph,
            input.has_colors ? &input.colors : NULL,
            &labeling,
            IGRAPH_BLISS_FLM,
            NULL);
    }
    graph_input_destroy(&input);
    if (code != IGRAPH_SUCCESS)
        return throw_igraph(env, code, "Bliss canonical labeling"), NULL;
    result = int_vector_to_array(env, &labeling);
    igraph_vector_int_destroy(&labeling);
    return result;
}

static napi_value automorphism_group(napi_env env, napi_callback_info info)
{
    napi_value arguments[1];
    sagejs_graph_input_t input;
    igraph_vector_int_list_t generators;
    igraph_bliss_info_t bliss_info;
    igraph_error_t code;
    napi_value result;
    napi_value generator_values;
    napi_value order;

    if (!require_arguments(env, info, 1, arguments) ||
        !graph_input_from_value(env, arguments[0], &input))
        return NULL;
    memset(&bliss_info, 0, sizeof(bliss_info));
    code = igraph_vector_int_list_init(&generators, 0);
    if (code != IGRAPH_SUCCESS) {
        graph_input_destroy(&input);
        return throw_igraph(env, code,
            "allocate automorphism generators"), NULL;
    }
    code = igraph_automorphism_group_bliss(
        &input.graph,
        input.has_colors ? &input.colors : NULL,
        &generators,
        IGRAPH_BLISS_FLM,
        &bliss_info);
    graph_input_destroy(&input);
    if (code != IGRAPH_SUCCESS) {
        if (bliss_info.group_size != NULL)
            igraph_free(bliss_info.group_size);
        igraph_vector_int_list_destroy(&generators);
        return throw_igraph(env, code, "Bliss automorphism group"), NULL;
    }

    if (!check_napi(env, napi_create_object(env, &result)))
        goto failure;
    if (!check_napi(env, napi_create_array_with_length(env,
            (size_t) igraph_vector_int_list_size(&generators),
            &generator_values)))
        goto failure;
    for (igraph_int_t index = 0;
         index < igraph_vector_int_list_size(&generators); index++) {
        napi_value generator = int_vector_to_array(
            env, igraph_vector_int_list_get_ptr(&generators, index));
        if (generator == NULL ||
            !check_napi(env, napi_set_element(
                env, generator_values, (uint32_t) index, generator)))
            goto failure;
    }
    if (!check_napi(env, napi_create_string_utf8(env,
            bliss_info.group_size == NULL ? "1" : bliss_info.group_size,
            NAPI_AUTO_LENGTH, &order)) ||
        !check_napi(env, napi_set_named_property(
            env, result, "generators", generator_values)) ||
        !check_napi(env, napi_set_named_property(env, result, "order", order)))
        goto failure;

    igraph_free(bliss_info.group_size);
    igraph_vector_int_list_destroy(&generators);
    return result;

failure:
    igraph_free(bliss_info.group_size);
    igraph_vector_int_list_destroy(&generators);
    return NULL;
}

static napi_value layout(napi_env env, napi_callback_info info)
{
    napi_value arguments[2];
    sagejs_graph_input_t input;
    char algorithm[32];
    size_t algorithm_length;
    igraph_matrix_t coordinates;
    igraph_error_t code;
    napi_value result;
    igraph_int_t vertex_count;

    if (!require_arguments(env, info, 2, arguments) ||
        !graph_input_from_value(env, arguments[0], &input))
        return NULL;
    if (!check_napi(env, napi_get_value_string_utf8(env, arguments[1],
            algorithm, sizeof(algorithm), &algorithm_length))) {
        graph_input_destroy(&input);
        return NULL;
    }
    if (algorithm_length >= sizeof(algorithm)) {
        graph_input_destroy(&input);
        napi_throw_range_error(env, NULL, "layout name is too long");
        return NULL;
    }

    code = igraph_matrix_init(&coordinates, 0, 0);
    if (code == IGRAPH_SUCCESS) {
        igraph_rng_seed(igraph_rng_default(), UINT64_C(0x53414745));
        if (strcmp(algorithm, "fr") == 0) {
            const igraph_int_t n = igraph_vcount(&input.graph);
            code = igraph_layout_fruchterman_reingold(
                &input.graph, &coordinates, 0, 500,
                sqrt((double) (n > 0 ? n : 1)), IGRAPH_LAYOUT_AUTOGRID,
                NULL, NULL, NULL, NULL, NULL);
        } else if (strcmp(algorithm, "kk") == 0) {
            const igraph_int_t n = igraph_vcount(&input.graph);
            code = igraph_layout_kamada_kawai(
                &input.graph, &coordinates, 0, 50 * (n > 0 ? n : 1),
                0.0, n > 0 ? (double) n : 1.0,
                NULL, NULL, NULL, NULL, NULL);
        } else if (strcmp(algorithm, "circle") == 0) {
            code = igraph_layout_circle(
                &input.graph, &coordinates, igraph_vss_all());
        } else if (strcmp(algorithm, "grid") == 0) {
            code = igraph_layout_grid(&input.graph, &coordinates, 0);
        } else {
            igraph_matrix_destroy(&coordinates);
            graph_input_destroy(&input);
            napi_throw_range_error(env, NULL,
                "layout must be fr, kk, circle, or grid");
            return NULL;
        }
    }
    vertex_count = igraph_vcount(&input.graph);
    graph_input_destroy(&input);
    if (code != IGRAPH_SUCCESS)
        return throw_igraph(env, code, "igraph layout"), NULL;

    if (!check_napi(env, napi_create_array_with_length(
            env, (size_t) vertex_count, &result))) {
        igraph_matrix_destroy(&coordinates);
        return NULL;
    }
    for (igraph_int_t vertex = 0; vertex < vertex_count; vertex++) {
        napi_value point;
        napi_value x;
        napi_value y;
        if (!check_napi(env, napi_create_array_with_length(env, 2, &point)) ||
            !check_napi(env, napi_create_double(
                env, MATRIX(coordinates, vertex, 0), &x)) ||
            !check_napi(env, napi_create_double(
                env, MATRIX(coordinates, vertex, 1), &y)) ||
            !check_napi(env, napi_set_element(env, point, 0, x)) ||
            !check_napi(env, napi_set_element(env, point, 1, y)) ||
            !check_napi(env, napi_set_element(
                env, result, (uint32_t) vertex, point))) {
            igraph_matrix_destroy(&coordinates);
            return NULL;
        }
    }
    igraph_matrix_destroy(&coordinates);
    return result;
}

static napi_value initialize(napi_env env, napi_value exports)
{
    const napi_property_descriptor properties[] = {
        {"isomorphic", NULL, isomorphic, NULL, NULL, NULL, napi_default, NULL},
        {"canonicalPermutation", NULL, canonical_permutation,
            NULL, NULL, NULL, napi_default, NULL},
        {"automorphismGroup", NULL, automorphism_group,
            NULL, NULL, NULL, napi_default, NULL},
        {"layout", NULL, layout, NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphCompleteCreate", NULL, ffi_graph_complete_create,
            NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphClose", NULL, ffi_graph_close,
            NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphVertexCount", NULL, ffi_graph_vertex_count,
            NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphEdgesBorrow", NULL, ffi_graph_edges_borrow,
            NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphEdgeCount", NULL, ffi_graph_edge_count,
            NULL, NULL, NULL, napi_default, NULL},
        {"ffiGraphEdgeChecksum", NULL, ffi_graph_edge_checksum,
            NULL, NULL, NULL, napi_default, NULL},
    };

    igraph_set_error_handler(igraph_error_handler_ignore);
    if (!check_napi(env, napi_define_properties(env, exports,
            sizeof(properties) / sizeof(properties[0]), properties)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
