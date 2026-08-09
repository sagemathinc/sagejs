"use strict";

const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");

function cString(value) {
  return JSON.stringify(String(value));
}

function cName(name) {
  return `sagejs_${name}`;
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

typedef struct
{
    ulong *data;
    size_t length;
} sagejs_source_u64_buffer;

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
    if (count > SIZE_MAX / sizeof(ulong))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "prime-field matrix is too large");
        return 0;
    }
    buffer->data = count == 0 ? NULL : (ulong *) malloc(count * sizeof(ulong));
    if (count != 0 && buffer->data == NULL)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "unable to allocate native source buffer");
        return 0;
    }
    buffer->length = count;
    if (columns != 0)
    {
        for (slong row = 0; row < rows; row++)
            memcpy(buffer->data + (size_t) row * (size_t) columns,
                nmod_mat_row_ptr(matrix, row),
                (size_t) columns * sizeof(ulong));
    }
    return 1;
}

static int sagejs_source_buffer_zeros(
    sagejs_native_status *status,
    sagejs_source_u64_buffer *buffer,
    uint64_t length)
{
    if (length > SIZE_MAX / sizeof(ulong))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "native source buffer is too large");
        return 0;
    }
    buffer->data = length == 0
        ? NULL
        : (ulong *) calloc((size_t) length, sizeof(ulong));
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
    ulong *accumulator,
    const sagejs_source_u64_buffer *left,
    const sagejs_source_u64_buffer *right,
    uint64_t left_row,
    uint64_t inner,
    uint64_t right_columns,
    uint64_t column,
    uint64_t start,
    uint64_t stop,
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
        *accumulator = _nmod_add(
            *accumulator, (ulong) (sum % modulus->n), *modulus);
    }
    return 1;
invalid:
    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
        "native source dot-product span is out of range");
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
    if (count != 0)
        memcpy(answer->entries, buffer->data,
            count * sizeof(ulong));
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

function declaration(local) {
  if (local.type === "uint64") return `    uint64_t ${cName(local.name)} = 0;`;
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
  throw new Error(`unsupported source-transparent local ${local.type}`);
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

function emitStatementBody(operation, indent) {
  const target = operation.target === undefined ? null : cName(operation.target);
  if (operation.kind === "source.uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "source.bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "source.copy") {
    if (operation.type === "UInt64Buffer") {
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
    return `${indent}${target} = ${cName(operation.source)};`;
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
  if (operation.kind === "source.uint64.binary") {
    if (operation.operation === "%") {
      return [
        `${indent}if (${cName(operation.right)} == 0)`,
        `${indent}{`,
        statusFailure("integer modulo by zero", `${indent}    `),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${cName(operation.left)} % ${cName(operation.right)};`,
      ].join("\n");
    }
    return `${indent}${target} = ${cName(operation.left)} ` +
      `${operation.operation} ${cName(operation.right)};`;
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
        emitStatement(item, `${indent}    `)
      ),
      `${indent}    ${target} = ${cName(operation.right.value)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind.startsWith("source.prime.")) {
    const name = operation.kind.slice(13);
    if (name === "row_submul") {
      return [
        `${indent}if (!sagejs_source_prime_row_submul(`,
        `${indent}        status, &${cName(operation.buffer)},`,
        `${indent}        ${cName(operation.targetRow)}, ${cName(operation.sourceRow)},`,
        `${indent}        ${cName(operation.stride)}, ${cName(operation.start)},`,
        `${indent}        ${cName(operation.stop)}, ${cName(operation.factor)},`,
        `${indent}        ${cName(operation.modulus)}))`,
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
        `${indent}        ${cName(operation.modulus)}))`,
        `${indent}    goto fail;`,
      ].join("\n");
    }
    if (name === "inverse") {
      return `${indent}${target} = sagejs_source_prime_inverse(` +
        `${cName(operation.value)}, ${cName(operation.modulus)});`;
    }
    return `${indent}${target} = sagejs_source_prime_${name}(` +
      `${cName(operation.left)}, ${cName(operation.right)}, ` +
      `${cName(operation.modulus)});`;
  }
  if (operation.kind === "source.if") {
    const lines = [
      ...operation.condition.operations.map((item) => emitStatement(item, indent)),
      `${indent}if (${cName(operation.condition.value)})`,
      `${indent}{`,
      ...operation.body.map((item) => emitStatement(item, `${indent}    `)),
      `${indent}}`,
    ];
    if (operation.alternative.length > 0) {
      lines.push(
        `${indent}else`,
        `${indent}{`,
        ...operation.alternative.map((item) => emitStatement(item, `${indent}    `)),
        `${indent}}`,
      );
    }
    return lines.join("\n");
  }
  if (operation.kind === "source.while") {
    return [
      `${indent}for (;;)`,
      `${indent}{`,
      ...operation.condition.operations.map((item) => emitStatement(item, `${indent}    `)),
      `${indent}    if (!${cName(operation.condition.value)}) break;`,
      ...operation.body.map((item) => emitStatement(item, `${indent}    `)),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "source.loop.range") {
    return [
      `${indent}for (${cName(operation.index)} = ${cName(operation.start)};`,
      `${indent}     ${cName(operation.index)} < ${cName(operation.stop)};`,
      `${indent}     ${cName(operation.index)}++)`,
      `${indent}{`,
      ...operation.body.map((item) => emitStatement(item, `${indent}    `)),
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
    if (operation.type === "uint64") {
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

function emitStatement(operation, indent) {
  const body = emitStatementBody(operation, indent);
  const comment = cOperationComment(operation, indent);
  const directive = cSourceDirective(operation);
  return [comment, directive, body].filter(Boolean).join("\n");
}

function primeSourceCoreSignature(fn, prototype = false) {
  const output = fn.returnType === "PrimeFieldMatrix"
    ? "nmod_mat_struct **sagejs_native_output"
    : "uint64_t *sagejs_native_output";
  const params = fn.params.map((param) => {
    if (param.type !== "PrimeFieldMatrix") {
      throw new Error(`unsupported source-transparent parameter ${param.type}`);
    }
    return `const nmod_mat_struct *${cName(param.name)}`;
  });
  return `int sagejs_kernel_${fn.name}(` + [
    "sagejs_native_status *status", output, ...params,
  ].join(", ") + `)${prototype ? ";" : ""}`;
}

function emitPrimeSourceCoreFunction(fn) {
  const buffers = fn.locals.filter((local) => local.type === "UInt64Buffer");
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
  return `${primeSourceCoreSignature(fn)}
{
${fn.locals.map(declaration).join("\n")}
    sagejs_native_status_reset(status);
    ${fn.returnType === "PrimeFieldMatrix"
      ? "*sagejs_native_output = NULL;" : "*sagejs_native_output = 0;"}

${fn.body.map((item) => emitStatement(item, "    ")).join("\n")}
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
  const declarations = fn.params.map((param) =>
    `    sagejs_matrix *sagejs_wrapper_${param.name};`
  ).join("\n");
  const parse = fn.params.map((param, index) => [
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
  ].join("\n")).join("\n");
  const args = fn.params.map((param) =>
    `sagejs_wrapper_${param.name}->modular`
  );
  const outputDeclaration = fn.returnType === "PrimeFieldMatrix"
    ? "    nmod_mat_struct *output = NULL;"
    : "    uint64_t output = 0;";
  const result = fn.returnType === "PrimeFieldMatrix"
    ? [
      "    result = sagejs_source_wrap_matrix(env, output);",
      "    output = NULL;",
      "    return result;",
    ].join("\n")
    : [
      "    if (!sagejs_native_check_napi(env,",
      "            napi_create_int64(env, (int64_t) output, &result)))",
      "        return NULL;",
      "    return result;",
    ].join("\n");
  return `static napi_value compiled_${fn.name}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
    sagejs_native_status status = {0, NULL};
${declarations}
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
${parse}
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
