"use strict";

const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");
const {
  isUint64Shift,
  uint64COperator,
} = require("./uint64-operations.cjs");

function cString(value) {
  return JSON.stringify(String(value));
}

function cName(name) {
  return `sagejs_${name}`;
}

function recordCType(name) {
  return `sagejs_native_record_${name}`;
}

function recordFieldCName(name) {
  return `sagejs_field_${name}`;
}

function recordForType(fn, type) {
  const name = type.startsWith("Record:") ? type.slice(7) : undefined;
  const record = (fn.records || []).find((candidate) => candidate.name === name);
  if (record === undefined) {
    throw new Error(`missing compiler-owned record schema ${type}`);
  }
  return record;
}

function statusFailure(message, indent) {
  return `${indent}sagejs_native_status_set(status, ` +
    `SAGEJS_NATIVE_RANGE_ERROR, ${cString(message)});`;
}

function generatePrimeSourceSupport() {
  return String.raw`
#ifndef SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK
#define SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK 0
#endif

#ifndef SAGEJS_SOURCE_U64_BUFFER_DEFINED
#define SAGEJS_SOURCE_U64_BUFFER_DEFINED
typedef struct
{
    uint64_t *data;
    size_t length;
} sagejs_source_u64_buffer;
#endif

static void sagejs_source_buffer_clear(sagejs_source_u64_buffer *buffer)
{
    free(buffer->data);
    buffer->data = NULL;
    buffer->length = 0;
}

static int sagejs_source_buffer_copy_matrix(
    sagejs_native_status *status,
    sagejs_source_u64_buffer *buffer,
    const nmod_mat_struct *matrix)
{
    const slong rows = nmod_mat_nrows(matrix);
    const slong columns = nmod_mat_ncols(matrix);
    size_t count;
    if (rows < 0 || columns < 0 ||
        ((size_t) columns != 0 &&
            (size_t) rows > SIZE_MAX / (size_t) columns))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return 0;
    }
    count = (size_t) rows * (size_t) columns;
    if (count > SIZE_MAX / sizeof(uint64_t))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return 0;
    }
    buffer->data = count == 0 ? NULL :
        (uint64_t *) malloc(count * sizeof(uint64_t));
    if (count != 0 && buffer->data == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate native source buffer");
        return 0;
    }
    buffer->length = count;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            buffer->data[(size_t) row * (size_t) columns +
                (size_t) column] =
                (uint64_t) nmod_mat_entry(matrix, row, column);
    return 1;
}

static int sagejs_source_buffer_zeros(
    sagejs_native_status *status,
    sagejs_source_u64_buffer *buffer,
    uint64_t length)
{
    if (length > SIZE_MAX / sizeof(uint64_t))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "native source buffer is too large");
        return 0;
    }
    buffer->data = length == 0
        ? NULL
        : (uint64_t *) calloc((size_t) length, sizeof(uint64_t));
    if (length != 0 && buffer->data == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate native source buffer");
        return 0;
    }
    buffer->length = (size_t) length;
    return 1;
}

static inline ulong sagejs_source_prime_add(
    ulong left, ulong right, const nmod_t *modulus)
{
    return nmod_add(left, right, *modulus);
}

static inline ulong sagejs_source_prime_sub(
    ulong left, ulong right, const nmod_t *modulus)
{
    return nmod_sub(left, right, *modulus);
}

static inline ulong sagejs_source_prime_mul(
    ulong left, ulong right, const nmod_t *modulus)
{
    return nmod_mul(left, right, *modulus);
}

static ulong sagejs_source_prime_inverse(
    ulong value, const nmod_t *modulus)
{
    ulong old_remainder = modulus->n;
    ulong remainder = value;
    ulong old_coefficient = 0;
    ulong coefficient = 1;
    while (remainder != 0)
    {
        const ulong quotient = old_remainder / remainder;
        const ulong next_remainder = old_remainder % remainder;
        const ulong next_coefficient = sagejs_source_prime_sub(
            old_coefficient,
            sagejs_source_prime_mul(
                quotient % modulus->n, coefficient, modulus),
            modulus);
        old_remainder = remainder;
        remainder = next_remainder;
        old_coefficient = coefficient;
        coefficient = next_coefficient;
    }
    return old_coefficient;
}

static int sagejs_source_row_span(
    sagejs_native_status *status,
    const sagejs_source_u64_buffer *buffer,
    uint64_t row,
    uint64_t stride,
    uint64_t start,
    uint64_t stop,
    size_t *offset,
    size_t *length)
{
    uint64_t first;
    if (start > stop || stop > stride ||
        (stride != 0 && row > UINT64_MAX / stride))
        goto invalid;
    first = row * stride;
    if (first > UINT64_MAX - start ||
        first + start > (uint64_t) SIZE_MAX ||
        stop - start > (uint64_t) SIZE_MAX)
        goto invalid;
    *offset = (size_t) (first + start);
    *length = (size_t) (stop - start);
    if (*offset > buffer->length ||
        *length > buffer->length - *offset)
        goto invalid;
    return 1;
invalid:
    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
        "native source row span is out of range");
    return 0;
}

static int sagejs_source_prime_row_submul(
    sagejs_native_status *status,
    sagejs_source_u64_buffer *buffer,
    uint64_t target_row,
    uint64_t source_row,
    uint64_t stride,
    uint64_t start,
    uint64_t stop,
    ulong factor,
    const nmod_t *modulus)
{
    size_t target_offset;
    size_t source_offset;
    size_t length;
    size_t source_length;
    if (!sagejs_source_row_span(status, buffer, target_row, stride,
            start, stop, &target_offset, &length) ||
        !sagejs_source_row_span(status, buffer, source_row, stride,
            start, stop, &source_offset, &source_length))
        return 0;
    if (factor == 0 || length == 0)
        return 1;
    if (length >= 4 && NMOD_CAN_USE_SHOUP(*modulus))
    {
        const ulong scalar = modulus->n - factor;
        const ulong precomputed = n_mulmod_precomp_shoup(
            scalar, modulus->n);
        for (size_t index = 0; index < length; index++)
        {
            const ulong product = n_mulmod_shoup(
                scalar,
                buffer->data[source_offset + index],
                precomputed,
                modulus->n);
            buffer->data[target_offset + index] = _nmod_add(
                buffer->data[target_offset + index], product, *modulus);
        }
        return 1;
    }
    for (size_t index = 0; index < length; index++)
        buffer->data[target_offset + index] = sagejs_source_prime_sub(
            buffer->data[target_offset + index],
            sagejs_source_prime_mul(
                factor, buffer->data[source_offset + index], modulus),
            modulus);
    return 1;
}

static int sagejs_source_prime_dot_accumulate(
    sagejs_native_status *status,
    uint64_t *accumulator,
    const sagejs_source_u64_buffer *left,
    const sagejs_source_u64_buffer *right,
    uint64_t left_row,
    uint64_t inner,
    uint64_t right_columns,
    uint64_t column,
    uint64_t start,
    uint64_t stop,
    int subtract,
    const nmod_t *modulus)
{
    uint64_t left_base;
    uint64_t right_last;
    const uint64_t magnitude = (uint64_t) modulus->n - UINT64_C(1);
    const uint64_t product_bound = magnitude * magnitude;
    uint64_t batch = product_bound == 0
        ? stop - start
        : UINT64_MAX / product_bound;
    if (start > stop || stop > inner || column >= right_columns ||
        (inner != 0 && left_row > UINT64_MAX / inner))
        goto invalid;
    left_base = left_row * inner;
    if (left_base > UINT64_MAX - stop ||
        left_base + stop > (uint64_t) left->length)
        goto invalid;
    if (stop != 0 && (stop - 1 > UINT64_MAX / right_columns ||
        (stop - 1) * right_columns > UINT64_MAX - column))
        goto invalid;
    right_last = stop == 0 ? 0 : (stop - 1) * right_columns + column;
    if (stop != 0 && right_last >= (uint64_t) right->length)
        goto invalid;
    if (batch < 1)
        batch = 1;
    if (batch > stop - start)
        batch = stop - start;
    for (uint64_t offset = start; offset < stop; offset += batch)
    {
        const uint64_t available = stop - offset;
        const uint64_t count = batch < available ? batch : available;
        uint64_t sum = 0;
        for (uint64_t index = 0; index < count; index++)
        {
            const uint64_t position = offset + index;
            sum += (uint64_t) left->data[left_base + position] *
                (uint64_t) right->data[
                    position * right_columns + column];
        }
        if (subtract)
            *accumulator = (uint64_t) nmod_sub(
                (ulong) *accumulator,
                (ulong) (sum % modulus->n), *modulus);
        else
            *accumulator = (uint64_t) _nmod_add(
                (ulong) *accumulator,
                (ulong) (sum % modulus->n), *modulus);
    }
    return 1;
invalid:
    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
        "native source dot-product span is out of range");
    return 0;
}

static int sagejs_source_prime_panel_update(
    sagejs_native_status *status,
    sagejs_source_u64_buffer *buffer,
    uint64_t rows_start,
    uint64_t rows_stop,
    uint64_t columns_start,
    uint64_t columns_stop,
    uint64_t panel_start,
    uint64_t panel_stop,
    uint64_t stride,
    const nmod_t *modulus)
{
    const uint64_t tile_capacity = UINT64_C(512);
    const uint64_t count = panel_stop - panel_start;
    const uint64_t magnitude = (uint64_t) modulus->n - UINT64_C(1);
    const uint64_t product_bound = magnitude * magnitude;
    uint64_t batch = product_bound == 0
        ? count : UINT64_MAX / product_bound;
    uint64_t *packed = NULL;
    if (rows_start > rows_stop || columns_start > columns_stop ||
        panel_start > panel_stop ||
        (stride != 0 && rows_stop > UINT64_MAX / stride) ||
        panel_stop > rows_start || columns_stop > stride ||
        rows_stop * stride > (uint64_t) buffer->length)
        goto invalid;
    if (batch < 1)
        batch = 1;
    if (batch > count)
        batch = count;
    if (count != 0 &&
        count > SIZE_MAX / tile_capacity / sizeof(uint64_t))
        goto invalid;
    packed = count == 0 ? NULL : (uint64_t *) malloc(
        (size_t) count * (size_t) tile_capacity * sizeof(uint64_t));
    if (count != 0 && packed == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate native panel workspace");
        return 0;
    }
    for (uint64_t column_start = columns_start;
         column_start < columns_stop; column_start += tile_capacity)
    {
        const uint64_t available = columns_stop - column_start;
        const uint64_t length = available < tile_capacity
            ? available : tile_capacity;
        for (uint64_t column = 0; column < length; column++)
            for (uint64_t prior = 0; prior < count; prior++)
                packed[column * count + prior] = buffer->data[
                    (panel_start + prior) * stride + column_start + column];
        for (uint64_t row = rows_start; row < rows_stop; row++)
        {
            const uint64_t *factors =
                buffer->data + row * stride + panel_start;
            uint64_t *target = buffer->data + row * stride + column_start;
            for (uint64_t column = 0; column < length; column++)
            {
                for (uint64_t offset = 0; offset < count; offset += batch)
                {
                    const uint64_t available = count - offset;
                    const uint64_t length = batch < available
                        ? batch : available;
                    uint64_t sum = 0;
                    for (uint64_t prior = 0; prior < length; prior++)
                        sum += (uint64_t) factors[offset + prior] *
                            (uint64_t) packed[
                                column * count + offset + prior];
                    target[column] = (uint64_t) nmod_sub(
                        (ulong) target[column],
                        (ulong) (sum % modulus->n), *modulus);
                }
            }
        }
    }
    free(packed);
    return 1;
invalid:
    free(packed);
    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
        "native source panel update is out of range");
    return 0;
}

static nmod_mat_struct *sagejs_source_matrix_from_buffer(
    sagejs_native_status *status,
    const nmod_mat_struct *model,
    uint64_t rows,
    uint64_t columns,
    const sagejs_source_u64_buffer *buffer)
{
    nmod_mat_struct *answer;
    size_t count;
    if (rows > (uint64_t) INT64_MAX || columns > (uint64_t) INT64_MAX ||
        (columns != 0 && rows > SIZE_MAX / columns))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "result matrix is too large");
        return NULL;
    }
    count = (size_t) rows * (size_t) columns;
    if (count != buffer->length)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "result buffer does not match matrix dimensions");
        return NULL;
    }
    answer = (nmod_mat_struct *) calloc(1, sizeof(*answer));
    if (answer == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate result matrix");
        return NULL;
    }
    answer->r = (slong) rows;
    answer->c = (slong) columns;
    answer->stride = (slong) columns;
    answer->mod = model->mod;
    answer->entries = count == 0
        ? NULL : (ulong *) malloc(count * sizeof(ulong));
    if (count != 0 && answer->entries == NULL)
    {
        free(answer);
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate result matrix entries");
        return NULL;
    }
    for (size_t index = 0; index < count; index++)
        answer->entries[index] = (ulong) buffer->data[index];
    return answer;
}

static void sagejs_source_matrix_clear(nmod_mat_struct *matrix)
{
    if (matrix == NULL) return;
    free(matrix->entries);
    matrix->entries = NULL;
    free(matrix);
}
`;
}

function generatePrimeSourceNodeSupport() {
  return String.raw`
static int sagejs_source_get_u64_buffer(
    napi_env env,
    napi_value value,
    sagejs_source_u64_buffer *result,
    const char *argument)
{
    bool typed = false;
    napi_typedarray_type type;
    size_t length = 0;
    void *data = NULL;
    napi_value array_buffer;
    size_t byte_offset = 0;
    if (napi_is_typedarray(env, value, &typed) != napi_ok || !typed ||
        napi_get_typedarray_info(env, value, &type, &length, &data,
            &array_buffer, &byte_offset) != napi_ok ||
        type != napi_biguint64_array)
    {
        napi_throw_type_error(env, NULL, argument);
        return 0;
    }
    result->data = (uint64_t *) data;
    result->length = length;
    return 1;
}

static napi_value sagejs_source_wrap_matrix(
    napi_env env, nmod_mat_struct *source)
{
    sagejs_matrix *matrix;
    napi_value object;
    napi_value rows;
    napi_value columns;
    if (source == NULL) return NULL;
    matrix = (sagejs_matrix *) calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        sagejs_source_matrix_clear(source);
        napi_throw_error(env, NULL, "unable to allocate matrix wrapper");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = SAGEJS_MATRIX_NMOD;
    matrix->modular[0] = *source;
    free(source);
    object = sagejs_native_wrap_prime_matrix(env, matrix);
    if (object == NULL) return NULL;
    if (!sagejs_native_check_napi(env,
            napi_create_int64(env, (int64_t) matrix->modular->r, &rows)) ||
        !sagejs_native_check_napi(env,
            napi_create_int64(env, (int64_t) matrix->modular->c, &columns)) ||
        !sagejs_native_check_napi(env,
            napi_set_named_property(
                env, object, "__sagejs_native_rows__", rows)) ||
        !sagejs_native_check_napi(env,
            napi_set_named_property(
                env, object, "__sagejs_native_columns__", columns)))
        return NULL;
    return object;
}`;
}

function declaration(local, fn) {
  if (local.type === "uint64") return `    uint64_t ${cName(local.name)} = 0;`;
  if (local.type === "PrimeModulusValue") {
    return `    uint64_t ${cName(local.name)} = 0;\n` +
      `    nmod_t ${cName(local.name)}_nmod;`;
  }
  if (local.type === "bool") return `    int ${cName(local.name)} = 0;`;
  if (local.type === "UInt64Buffer") {
    return `    sagejs_source_u64_buffer ${cName(local.name)} = {NULL, 0};`;
  }
  if (local.type === "PrimeFieldMatrix") {
    return `    nmod_mat_struct *${cName(local.name)} = NULL;`;
  }
  if (local.type === "PrimeModulus") {
    return `    const nmod_t *${cName(local.name)} = NULL;`;
  }
  if (local.type.startsWith("Record:")) {
    const record = recordForType(fn, local.type);
    return `    ${recordCType(record.name)} ${cName(local.name)} = {0};`;
  }
  throw new Error(`unsupported source-transparent local ${local.type}`);
}

function modulusExpression(operation) {
  return operation.modulusType === "PrimeModulusValue"
    ? `&${cName(operation.modulus)}_nmod`
    : cName(operation.modulus);
}

function comparison(operation) {
  return {
    eq: "==",
    ne: "!=",
    lt: "<",
    le: "<=",
    gt: ">",
    ge: ">=",
  }[operation];
}

function emitStatementBody(operation, indent, context = {}) {
  const target = operation.target === undefined ? null : cName(operation.target);
  if (operation.kind === "source.uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "source.bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "source.copy") {
    if (operation.type === "UInt64Buffer") {
      if (operation.borrowed) {
        return `${indent}${target} = ${cName(operation.source)};`;
      }
      return [
        `${indent}sagejs_source_buffer_clear(&${target});`,
        `${indent}${target} = ${cName(operation.source)};`,
        `${indent}${cName(operation.source)}.data = NULL;`,
        `${indent}${cName(operation.source)}.length = 0;`,
      ].join("\n");
    }
    if (operation.type === "PrimeFieldMatrix") {
      return [
        `${indent}if (${target} != NULL)`,
        `${indent}    sagejs_source_matrix_clear(${target});`,
        `${indent}${target} = ${cName(operation.source)};`,
        `${indent}${cName(operation.source)} = NULL;`,
      ].join("\n");
    }
    if (operation.type === "PrimeModulusValue") {
      return [
        `${indent}${target} = ${cName(operation.source)};`,
        `${indent}nmod_init(&${target}_nmod, (ulong) ${target});`,
      ].join("\n");
    }
    return `${indent}${target} = ${cName(operation.source)};`;
  }
  if (operation.kind === "source.record.construct") {
    return operation.fields.map((field) =>
      `${indent}${target}.${recordFieldCName(field.name)} = ` +
        `${cName(field.value)};`
    ).join("\n");
  }
  if (operation.kind === "source.record.get") {
    const assignment = `${indent}${target} = ` +
      `${cName(operation.source)}.${recordFieldCName(operation.field)};`;
    if (operation.type !== "PrimeModulusValue") return assignment;
    return [
      assignment,
      `${indent}if (${target} < UINT64_C(2) || ` +
        `${target} > (uint64_t) UINT32_MAX)`,
      `${indent}{`,
      statusFailure(`${operation.record}.${operation.field} must be a prime between 2 and 2^32 - 1`, `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}nmod_init(&${target}_nmod, (ulong) ${target});`,
    ].join("\n");
  }
  if (operation.kind.startsWith("source.matrix.") &&
      ["rows", "columns", "modulus"].includes(operation.kind.slice(14))) {
    const property = operation.kind.slice(14);
    const expression = property === "rows"
      ? `nmod_mat_nrows(${cName(operation.source)})`
      : property === "columns"
        ? `nmod_mat_ncols(${cName(operation.source)})`
        : `&${cName(operation.source)}->mod`;
    return property === "modulus"
      ? `${indent}${target} = ${expression};`
      : `${indent}${target} = (uint64_t) ${expression};`;
  }
  if (operation.kind === "source.buffer.copy_matrix") {
    return [
      `${indent}sagejs_source_buffer_clear(&${target});`,
      `${indent}if (!sagejs_source_buffer_copy_matrix(`,
      `${indent}        status, &${target}, ${cName(operation.source)}))`,
      `${indent}    goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "source.buffer.zeros") {
    return [
      `${indent}sagejs_source_buffer_clear(&${target});`,
      `${indent}if (!sagejs_source_buffer_zeros(`,
      `${indent}        status, &${target}, ${cName(operation.length)}))`,
      `${indent}    goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "source.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${cName(operation.buffer)}.length;`;
  }
  if (operation.kind === "source.buffer.get") {
    return [
      "#if SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK",
      `${indent}if (${cName(operation.index)} >= ${cName(operation.buffer)}.length)`,
      `${indent}{`,
      statusFailure("native source buffer index out of range", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      "#endif",
      `${indent}${target} = ${cName(operation.buffer)}.data[${cName(operation.index)}];`,
    ].join("\n");
  }
  if (operation.kind === "source.buffer.set") {
    return [
      "#if SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK",
      `${indent}if (${cName(operation.index)} >= ${cName(operation.buffer)}.length)`,
      `${indent}{`,
      statusFailure("native source buffer index out of range", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      "#endif",
      `${indent}${cName(operation.buffer)}.data[${cName(operation.index)}] = ${cName(operation.value)};`,
    ].join("\n");
  }
  if (operation.kind === "source.matrix.from_buffer") {
    return [
      `${indent}${target} = sagejs_source_matrix_from_buffer(`,
      `${indent}    status, ${cName(operation.model)}, ${cName(operation.rows)},`,
      `${indent}    ${cName(operation.columns)}, &${cName(operation.buffer)});`,
      `${indent}if (${target} == NULL) goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "source.call") {
    const argumentsList = operation.arguments.map((argument) =>
      cName(argument.name)
    );
    const wordCallee = context.wordFunctions?.get(operation.function);
    const directlyWordCallable = wordCallee !== undefined &&
      context.wordMayPromote?.get(operation.function) === false &&
      [wordCallee.returnType, ...wordCallee.params.map(({ type }) => type)]
        .every((type) => ["bool", "uint64", "UInt64Buffer"].includes(type));
    if (directlyWordCallable) {
      return [
        `${indent}if (word_${operation.function}(`,
        `${indent}        status, &${target}` +
          `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""}) ` +
          "!= SAGEJS_WORD_OK)",
        `${indent}    goto fail;`,
      ].join("\n");
    }
    return [
      `${indent}if (!sagejs_kernel_${operation.function}(`,
      `${indent}        status, &${target}` +
        `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""}))`,
      `${indent}    goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "source.uint64.binary") {
    if (operation.operation === "%" || operation.operation === "//") {
      const operationName = operation.operation === "%"
        ? "modulo"
        : "floor division";
      const operator = operation.operation === "%" ? "%" : "/";
      return [
        `${indent}if (${cName(operation.right)} == 0)`,
        `${indent}{`,
        statusFailure(`integer ${operationName} by zero`, `${indent}    `),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${cName(operation.left)} ${operator} ` +
          `${cName(operation.right)};`,
      ].join("\n");
    }
    const left = cName(operation.left);
    const right = cName(operation.right);
    const operator = uint64COperator(operation.operation);
    if (isUint64Shift(operation.operation)) {
      return [
        `${indent}if (${right} >= UINT64_C(64))`,
        `${indent}{`,
        statusFailure(
          "uint64 shift count must be between 0 and 63",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} (unsigned int) ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  if (operation.kind === "source.compare") {
    const left = operation.type === "PrimeModulus"
      ? `${cName(operation.left)}->n`
      : cName(operation.left);
    const right = operation.type === "PrimeModulus"
      ? `${cName(operation.right)}->n`
      : cName(operation.right);
    return `${indent}${target} = ${left} ` +
      `${comparison(operation.operation)} ${right};`;
  }
  if (operation.kind === "source.bool.not") {
    return `${indent}${target} = !${cName(operation.source)};`;
  }
  if (operation.kind === "source.bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${cName(operation.left)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      ...operation.right.operations.map((item) =>
        emitStatement(item, `${indent}    `, context)
      ),
      `${indent}    ${target} = ${cName(operation.right.value)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind.startsWith("source.prime.")) {
    const name = operation.kind.slice(13);
    if (name === "panel_update") {
      return [
        `${indent}if (!sagejs_source_prime_panel_update(`,
        `${indent}        status, &${cName(operation.buffer)},`,
        `${indent}        ${cName(operation.rowsStart)}, ${cName(operation.rowsStop)},`,
        `${indent}        ${cName(operation.columnsStart)}, ${cName(operation.columnsStop)},`,
        `${indent}        ${cName(operation.panelStart)}, ${cName(operation.panelStop)},`,
        `${indent}        ${cName(operation.stride)}, ${modulusExpression(operation)}))`,
        `${indent}    goto fail;`,
      ].join("\n");
    }
    if (name === "row_submul") {
      return [
        `${indent}if (!sagejs_source_prime_row_submul(`,
        `${indent}        status, &${cName(operation.buffer)},`,
        `${indent}        ${cName(operation.targetRow)}, ${cName(operation.sourceRow)},`,
        `${indent}        ${cName(operation.stride)}, ${cName(operation.start)},`,
        `${indent}        ${cName(operation.stop)}, ${cName(operation.factor)},`,
        `${indent}        ${modulusExpression(operation)}))`,
        `${indent}    goto fail;`,
      ].join("\n");
    }
    if (name === "dot_accumulate") {
      return [
        `${indent}if (!sagejs_source_prime_dot_accumulate(`,
        `${indent}        status, &${cName(operation.accumulator)},`,
        `${indent}        &${cName(operation.leftBuffer)},`,
        `${indent}        &${cName(operation.rightBuffer)},`,
        `${indent}        ${cName(operation.leftRow)}, ${cName(operation.inner)},`,
        `${indent}        ${cName(operation.rightColumns)}, ${cName(operation.column)},`,
        `${indent}        ${cName(operation.start)}, ${cName(operation.stop)},`,
        `${indent}        ${operation.operation === "sub" ? 1 : 0},`,
        `${indent}        ${modulusExpression(operation)}))`,
        `${indent}    goto fail;`,
      ].join("\n");
    }
    if (name === "inverse") {
      return `${indent}${target} = sagejs_source_prime_inverse(` +
        `${cName(operation.value)}, ${modulusExpression(operation)});`;
    }
    return `${indent}${target} = sagejs_source_prime_${name}(` +
      `${cName(operation.left)}, ${cName(operation.right)}, ` +
      `${modulusExpression(operation)});`;
  }
  if (operation.kind === "source.if") {
    const lines = [
      ...operation.condition.operations.map((item) =>
        emitStatement(item, indent, context)
      ),
      `${indent}if (${cName(operation.condition.value)})`,
      `${indent}{`,
      ...operation.body.map((item) =>
        emitStatement(item, `${indent}    `, context)
      ),
      `${indent}}`,
    ];
    if (operation.alternative.length > 0) {
      lines.push(
        `${indent}else`,
        `${indent}{`,
        ...operation.alternative.map((item) =>
          emitStatement(item, `${indent}    `, context)
        ),
        `${indent}}`,
      );
    }
    return lines.join("\n");
  }
  if (operation.kind === "source.while") {
    return [
      `${indent}for (;;)`,
      `${indent}{`,
      ...operation.condition.operations.map((item) =>
        emitStatement(item, `${indent}    `, context)
      ),
      `${indent}    if (!${cName(operation.condition.value)}) break;`,
      ...operation.body.map((item) =>
        emitStatement(item, `${indent}    `, context)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "source.loop.range") {
    return [
      `${indent}for (${cName(operation.index)} = ${cName(operation.start)};`,
      `${indent}     ${cName(operation.index)} < ${cName(operation.stop)};`,
      `${indent}     ${cName(operation.index)}++)`,
      `${indent}{`,
      ...operation.body.map((item) =>
        emitStatement(item, `${indent}    `, context)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "source.raise") {
    return [
      statusFailure(operation.message, indent),
      `${indent}goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "source.return") {
    if (["uint64", "bool"].includes(operation.type)) {
      return [
        `${indent}*sagejs_native_output = ${cName(operation.value)};`,
        `${indent}goto success;`,
      ].join("\n");
    }
    if (operation.type === "PrimeFieldMatrix") {
      return [
        `${indent}*sagejs_native_output = ${cName(operation.value)};`,
        `${indent}${cName(operation.value)} = NULL;`,
        `${indent}goto success;`,
      ].join("\n");
    }
  }
  throw new Error(`unsupported source-transparent C operation ${operation.kind}`);
}

function emitStatement(operation, indent, context) {
  const body = emitStatementBody(operation, indent, context);
  const comment = cOperationComment(operation, indent);
  const directive = cSourceDirective(operation);
  return [comment, directive, body].filter(Boolean).join("\n");
}

function primeSourceCoreSignature(fn, prototype = false) {
  const output = fn.returnType === "PrimeFieldMatrix"
    ? "nmod_mat_struct **sagejs_native_output"
    : "uint64_t *sagejs_native_output";
  const params = fn.params.map((param) => {
    if (param.type === "PrimeFieldMatrix") {
      return `const nmod_mat_struct *${cName(param.name)}`;
    }
    if (param.type === "UInt64Buffer") {
      return `sagejs_source_u64_buffer ${cName(param.name)}`;
    }
    if (["uint64", "PrimeModulusValue"].includes(param.type)) {
      return `uint64_t ${cName(param.name)}`;
    }
    if (param.type.startsWith("Record:")) {
      return `${recordCType(recordForType(fn, param.type).name)} ` +
        `${cName(param.name)}`;
    }
    throw new Error(`unsupported source-transparent parameter ${param.type}`);
  });
  return `int sagejs_kernel_${fn.name}(` + [
    "sagejs_native_status *status", output, ...params,
  ].join(", ") + `)${prototype ? ";" : ""}`;
}

function emitPrimeSourceCoreFunction(fn, context = {}) {
  const buffers = fn.locals.filter((local) =>
    local.type === "UInt64Buffer" && local.ownership !== "borrowed"
  );
  const matrices = fn.locals.filter((local) => local.type === "PrimeFieldMatrix");
  const cleanup = [
    ...buffers.map((local) =>
      `    sagejs_source_buffer_clear(&${cName(local.name)});`
    ),
    ...matrices.map((local) => [
      `    if (${cName(local.name)} != NULL)`,
      `        sagejs_source_matrix_clear(${cName(local.name)});`,
    ].join("\n")),
  ].join("\n");
  const modulusDeclarations = fn.params
    .filter((param) => param.type === "PrimeModulusValue")
    .map((param) => `    nmod_t ${cName(param.name)}_nmod;`)
    .join("\n");
  const modulusInitialization = fn.params
    .filter((param) => param.type === "PrimeModulusValue")
    .map((param) => [
      `    if (${cName(param.name)} < UINT64_C(2) ||`,
      `        ${cName(param.name)} > (uint64_t) UINT32_MAX)`,
      "    {",
      `        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,`,
      `            ${cString(param.name + " must be a prime between 2 and 2^32 - 1")});`,
      "        goto fail;",
      "    }",
      `    nmod_init(&${cName(param.name)}_nmod, (ulong) ${cName(param.name)});`,
    ].join("\n"))
    .join("\n");
  const recordModulusValidation = fn.params.flatMap((param) => {
    if (!param.type.startsWith("Record:")) return [];
    const record = recordForType(fn, param.type);
    return record.fields
      .filter((field) => field.type === "PrimeModulusValue")
      .map((field) => {
        const value = `${cName(param.name)}.${recordFieldCName(field.name)}`;
        return [
          `    if (${value} < UINT64_C(2) ||`,
          `        ${value} > (uint64_t) UINT32_MAX)`,
          "    {",
          "        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,",
          `            ${cString(param.name + "." + field.name +
            " must be a prime between 2 and 2^32 - 1")});`,
          "        goto fail;",
          "    }",
        ].join("\n");
      });
  }).join("\n");
  return `${primeSourceCoreSignature(fn)}
{
${modulusDeclarations}
${fn.locals.map((local) => declaration(local, fn)).join("\n")}
    sagejs_native_status_reset(status);
    ${fn.returnType === "PrimeFieldMatrix"
      ? "*sagejs_native_output = NULL;" : "*sagejs_native_output = 0;"}
${modulusInitialization}
${recordModulusValidation}

${fn.body.map((item) => emitStatement(item, "    ", context)).join("\n")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "source-transparent kernel did not return");
    goto fail;

success:
${cleanup}
    return 1;

fail:
${cleanup}
    return 0;
}`;
}

function emitPrimeSourceNodeAdapter(fn) {
  const declarations = [];
  const parse = [];
  const args = [];
  for (const [index, param] of fn.params.entries()) {
    if (param.type === "PrimeFieldMatrix") {
      declarations.push(`    sagejs_matrix *sagejs_wrapper_${param.name};`);
      parse.push([
        `    sagejs_wrapper_${param.name} = ` +
          `sagejs_native_unwrap_prime_matrix(env, args[${index}]);`,
        `    if (sagejs_wrapper_${param.name} == NULL) return NULL;`,
        `    if (sagejs_wrapper_${param.name}->modular->mod.n > ` +
          `(ulong) UINT32_MAX)`,
        "    {",
        "        napi_throw_range_error(env, NULL,",
        '            "source-transparent kernel currently requires a 32-bit prime");',
        "        return NULL;",
        "    }",
      ].join("\n"));
      args.push(`sagejs_wrapper_${param.name}->modular`);
    } else if (param.type === "UInt64Buffer") {
      declarations.push(
        `    sagejs_source_u64_buffer ${cName(param.name)} = {NULL, 0};`,
      );
      parse.push(
        `    if (!sagejs_source_get_u64_buffer(env, args[${index}], ` +
          `&${cName(param.name)}, ` +
          `${cString(param.name + " must be a BigUint64Array")})) return NULL;`,
      );
      args.push(cName(param.name));
    } else if (["uint64", "PrimeModulusValue"].includes(param.type)) {
      declarations.push(`    uint64_t ${cName(param.name)} = 0;`);
      parse.push(
        `    if (!get_uint64(env, args[${index}], ` +
          `&${cName(param.name)})) return NULL;`,
      );
      if (param.type === "PrimeModulusValue") {
        parse.push([
          `    if (${cName(param.name)} < UINT64_C(2) ||`,
          `        ${cName(param.name)} > (uint64_t) UINT32_MAX)`,
          "    {",
          "        napi_throw_range_error(env, NULL,",
          `            ${cString(param.name + " must be a prime between 2 and 2^32 - 1")});`,
          "        return NULL;",
          "    }",
        ].join("\n"));
      }
      args.push(cName(param.name));
    } else if (param.type.startsWith("Record:")) {
      const record = recordForType(fn, param.type);
      declarations.push(
        `    ${recordCType(record.name)} ${cName(param.name)} = {0};`,
      );
      for (const field of record.fields) {
        const property = `sagejs_${param.name}_${field.name}_property`;
        declarations.push(`    napi_value ${property} = NULL;`);
        parse.push([
          `    if (!sagejs_native_check_napi(env,`,
          `            napi_get_named_property(env, args[${index}], ` +
            `${cString(field.name)}, &${property})))`,
          `        return NULL;`,
        ].join("\n"));
        const target = `${cName(param.name)}.${recordFieldCName(field.name)}`;
        if (field.type === "UInt64Buffer") {
          parse.push(
            `    if (!sagejs_source_get_u64_buffer(env, ${property}, ` +
              `&${target}, ${cString(param.name + "." + field.name +
                " must be a BigUint64Array")})) return NULL;`,
          );
        } else {
          parse.push(
            `    if (!get_uint64(env, ${property}, &${target})) return NULL;`,
          );
          if (field.type === "PrimeModulusValue") {
            parse.push([
              `    if (${target} < UINT64_C(2) ||`,
              `        ${target} > (uint64_t) UINT32_MAX)`,
              "    {",
              "        napi_throw_range_error(env, NULL,",
              `            ${cString(param.name + "." + field.name +
                " must be a prime between 2 and 2^32 - 1")});`,
              "        return NULL;",
              "    }",
            ].join("\n"));
          }
        }
      }
      args.push(cName(param.name));
    } else {
      throw new Error(`unsupported source-transparent parameter ${param.type}`);
    }
  }
  const outputDeclaration = fn.returnType === "PrimeFieldMatrix"
    ? "    nmod_mat_struct *output = NULL;"
    : "    uint64_t output = 0;";
  const result = fn.returnType === "PrimeFieldMatrix"
    ? [
      "    result = sagejs_source_wrap_matrix(env, output);",
      "    output = NULL;",
      "    return result;",
    ].join("\n")
    : fn.returnType === "bool"
      ? [
        "    if (!sagejs_native_check_napi(env,",
        "            napi_get_boolean(env, output != 0, &result)))",
        "        return NULL;",
        "    return result;",
      ].join("\n")
      : [
      "    if (!sagejs_native_check_napi(env,",
      "            napi_create_bigint_uint64(env, output, &result)))",
      "        return NULL;",
      "    return result;",
      ].join("\n");
  return `static napi_value compiled_${fn.name}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
    sagejs_native_status status = {0, NULL};
${declarations.join("\n")}
${outputDeclaration}
    napi_value result = NULL;
    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
${parse.join("\n")}
    if (!sagejs_kernel_${fn.name}(&status, &output,
            ${args.join(", ")}))
    {
        sagejs_native_throw_status(env, &status);
        ${fn.returnType === "PrimeFieldMatrix"
          ? "sagejs_source_matrix_clear(output);" : ""}
        return NULL;
    }
${result}
}`;
}

module.exports = {
  emitPrimeSourceCoreFunction,
  emitPrimeSourceNodeAdapter,
  generatePrimeSourceSupport,
  generatePrimeSourceNodeSupport,
  primeSourceCoreSignature,
};
