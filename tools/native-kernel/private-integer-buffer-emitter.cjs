"use strict";

/* C support for an authorized private noncanonical IntegerBuffer region.
 * This is intentionally separate from the ordinary public setters: callers
 * receive no source unless the complete private-graph authority still holds.
 */

const {
  privateIntegerBufferPlanAuthorized,
} = require("./private-integer-buffer-authority.cjs");

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("invalid private IntegerBuffer C identifier");
  }
  return value;
}

function emitPrivateIntegerBufferRuntime(functions, root, claim) {
  if (!privateIntegerBufferPlanAuthorized(functions, root, claim)) return undefined;
  const buffers = claim.buffers.map(identifier);
  const rootBuffers = root.params
    .filter((param) => param.type === "IntegerBuffer")
    .map((param) => identifier(param.name));
  let tableCapacity = 2;
  while (tableCapacity < 2 * buffers.length) tableCapacity *= 2;
  const declarations = buffers.map((name) =>
    `    sagejs_private_integer_buffer_state sagejs_private_${name} = {0};`,
  ).concat([
    `    sagejs_private_integer_buffer_state *sagejs_private_table[${tableCapacity}] = {0};`,
    "    sagejs_private_integer_buffer_context sagejs_private_context = {0};",
  ]).join("\n");
  const opens = buffers.map((name) =>
    `    sagejs_private_integer_buffer_begin(&sagejs_private_context, &sagejs_private_${name}, &sagejs_arg_${name});`,
  );
  opens.unshift(
    `    sagejs_integer_buffer *sagejs_private_root_buffers[${rootBuffers.length}] = { ${rootBuffers.map((name) => `&sagejs_arg_${name}`).join(", ")} };`,
    `    sagejs_private_integer_buffer_context_begin(&sagejs_private_context, sagejs_private_table, ${tableCapacity});`,
    `    if (sagejs_private_integer_buffers_disjoint(sagejs_private_root_buffers, ${rootBuffers.length}))`,
    "    {",
  );
  opens.push("    }");
  const closes = [...buffers].reverse().map((name) =>
    `    sagejs_private_integer_buffer_canonicalize(&sagejs_private_${name});`,
  );
  closes.push(
    "    sagejs_private_integer_buffer_context_end(&sagejs_private_context);",
  );
  return Object.freeze({
    support: String.raw`
struct sagejs_private_integer_buffer_state;
typedef struct sagejs_private_integer_buffer_context {
    struct sagejs_private_integer_buffer_context *previous;
    struct sagejs_private_integer_buffer_state **table;
    size_t capacity;
} sagejs_private_integer_buffer_context;

typedef struct sagejs_private_integer_buffer_state {
    sagejs_integer_buffer *buffer;
    size_t first_dirty;
    size_t last_dirty;
    int dirty;
} sagejs_private_integer_buffer_state;

#if defined(_MSC_VER)
#define SAGEJS_PRIVATE_BUFFER_TLS __declspec(thread)
#else
#define SAGEJS_PRIVATE_BUFFER_TLS _Thread_local
#endif
static SAGEJS_PRIVATE_BUFFER_TLS sagejs_private_integer_buffer_context
    *sagejs_private_integer_buffer_top = NULL;

static int sagejs_private_integer_buffer_ranges_overlap(
    const void *left, size_t left_bytes,
    const void *right, size_t right_bytes)
{
    uintptr_t left_start = (uintptr_t)left;
    uintptr_t right_start = (uintptr_t)right;
    uintptr_t left_end, right_end;
    if (left_bytes == 0 || right_bytes == 0) return 0;
    if (left_start > UINTPTR_MAX - left_bytes ||
        right_start > UINTPTR_MAX - right_bytes) return 1;
    left_end = left_start + left_bytes;
    right_end = right_start + right_bytes;
    return left_start < right_end && right_start < left_end;
}

static int sagejs_private_integer_buffers_disjoint(
    sagejs_integer_buffer *const *buffers, size_t count)
{
    size_t left, right;
    for (left = 0; left < count; left++)
    {
        const sagejs_integer_buffer *a = buffers[left];
        size_t a_sizes, a_limbs;
        if (a->length > SIZE_MAX / sizeof(*a->sizes) ||
            (a->length != 0 && a->word_capacity > SIZE_MAX / a->length) ||
            a->length * a->word_capacity > SIZE_MAX / sizeof(*a->limbs)) return 0;
        a_sizes = a->length * sizeof(*a->sizes);
        a_limbs = a->length * a->word_capacity * sizeof(*a->limbs);
        if (sagejs_private_integer_buffer_ranges_overlap(
                a->sizes, a_sizes, a->limbs, a_limbs)) return 0;
        for (right = left + 1; right < count; right++)
        {
            const sagejs_integer_buffer *b = buffers[right];
            size_t b_sizes, b_limbs;
            if (b->length > SIZE_MAX / sizeof(*b->sizes) ||
                (b->length != 0 && b->word_capacity > SIZE_MAX / b->length) ||
                b->length * b->word_capacity > SIZE_MAX / sizeof(*b->limbs)) return 0;
            b_sizes = b->length * sizeof(*b->sizes);
            b_limbs = b->length * b->word_capacity * sizeof(*b->limbs);
            if (sagejs_private_integer_buffer_ranges_overlap(
                    a->sizes, a_sizes, b->sizes, b_sizes) ||
                sagejs_private_integer_buffer_ranges_overlap(
                    a->sizes, a_sizes, b->limbs, b_limbs) ||
                sagejs_private_integer_buffer_ranges_overlap(
                    a->limbs, a_limbs, b->sizes, b_sizes) ||
                sagejs_private_integer_buffer_ranges_overlap(
                    a->limbs, a_limbs, b->limbs, b_limbs)) return 0;
        }
    }
    return 1;
}

static size_t sagejs_private_integer_buffer_hash(
    const sagejs_integer_buffer *buffer, size_t capacity)
{
    uintptr_t value = (uintptr_t) buffer->sizes;
    value ^= value >> 17;
    value *= (uintptr_t) UINT64_C(0xed5ad4bb);
    value ^= value >> 11;
    return (size_t) value & (capacity - 1);
}

static void sagejs_private_integer_buffer_context_begin(
    sagejs_private_integer_buffer_context *context,
    sagejs_private_integer_buffer_state **table,
    size_t capacity)
{
    context->previous = sagejs_private_integer_buffer_top;
    context->table = table;
    context->capacity = capacity;
    sagejs_private_integer_buffer_top = context;
}

static void sagejs_private_integer_buffer_begin(
    sagejs_private_integer_buffer_context *context,
    sagejs_private_integer_buffer_state *state,
    sagejs_integer_buffer *buffer)
{
    size_t position = sagejs_private_integer_buffer_hash(
        buffer, context->capacity);
    state->buffer = buffer;
    state->first_dirty = buffer->length;
    state->last_dirty = 0;
    state->dirty = 0;
    while (context->table[position] != NULL &&
           context->table[position]->buffer->sizes != buffer->sizes)
        position = (position + 1) & (context->capacity - 1);
    context->table[position] = state;
}

static sagejs_private_integer_buffer_state *
sagejs_private_integer_buffer_lookup(const sagejs_integer_buffer *buffer)
{
    sagejs_private_integer_buffer_context *context =
        sagejs_private_integer_buffer_top;
    if (context != NULL)
    {
        size_t position = sagejs_private_integer_buffer_hash(
            buffer, context->capacity);
        while (context->table[position] != NULL)
        {
            sagejs_private_integer_buffer_state *state =
                context->table[position];
            if (state->buffer->sizes == buffer->sizes) return state;
            position = (position + 1) & (context->capacity - 1);
        }
    }
    return NULL;
}

static void sagejs_private_integer_buffer_context_end(
    sagejs_private_integer_buffer_context *context)
{
    if (sagejs_private_integer_buffer_top == context)
        sagejs_private_integer_buffer_top = context->previous;
}

static void sagejs_private_integer_buffer_mark(
    sagejs_private_integer_buffer_state *state, size_t position)
{
    if (!state->dirty || position < state->first_dirty)
        state->first_dirty = position;
    if (!state->dirty || position > state->last_dirty)
        state->last_dirty = position;
    state->dirty = 1;
}

static int sagejs_private_integer_buffer_set_mpz(
    sagejs_native_status *status,
    sagejs_private_integer_buffer_state *state,
    size_t position,
    const mpz_t value)
{
    sagejs_integer_buffer *buffer = state->buffer;
    const int sign = mpz_sgn(value);
    const size_t count = sign == 0 ? 0 :
        (mpz_sizeinbase(value, 2) + 63) / 64;
    uint64_t *slot = buffer->limbs + position * buffer->word_capacity;
    size_t actual = 0;
    if (position >= buffer->length || count > buffer->word_capacity ||
        count > (size_t) INT32_MAX)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "private IntegerBuffer store is out of range");
        return 0;
    }
    if (count != 0)
        mpz_export(slot, &actual, -1, sizeof(*slot), 0, 0, value);
    buffer->sizes[position] = sign < 0 ? -(int32_t) actual : (int32_t) actual;
    sagejs_private_integer_buffer_mark(state, position);
    return 1;
}

static void sagejs_private_integer_buffer_canonicalize(
    sagejs_private_integer_buffer_state *state)
{
    sagejs_integer_buffer *buffer = state->buffer;
    if (state->dirty)
    {
        for (size_t position = state->first_dirty;
             position <= state->last_dirty; position += 1)
        {
            const int32_t signed_size = buffer->sizes[position];
            const size_t count = signed_size < 0
                ? (size_t) (-(int64_t) signed_size) : (size_t) signed_size;
            uint64_t *slot = buffer->limbs + position * buffer->word_capacity;
            memset(slot + count, 0,
                (buffer->word_capacity - count) * sizeof(*slot));
        }
    }
    state->dirty = 0;
}
`,
    declarations,
    enter: opens.join("\n"),
    beforeBoundary: Object.freeze(Object.fromEntries(
      claim.canonicalizeAt.map((boundary) => [boundary, closes.join("\n")]),
    )),
    beforePublish: closes.join("\n"),
    failureCleanup: closes.join("\n"),
    aliasProtection: Object.freeze({
      policy: "all-root-storage-ranges-disjoint-v1",
      rootIntegerBuffers: rootBuffers.length,
      checkedRangeKinds: Object.freeze(["sizes", "limbs"]),
    }),
  });
}

module.exports = { emitPrivateIntegerBufferRuntime };
