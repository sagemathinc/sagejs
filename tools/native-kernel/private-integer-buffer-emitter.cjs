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
    `    sagejs_private_integer_buffer_context_begin(&sagejs_private_context, sagejs_private_table, ${tableCapacity});`,
  );
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
    while (context != NULL)
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
        context = context->previous;
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
  });
}

module.exports = { emitPrivateIntegerBufferRuntime };
