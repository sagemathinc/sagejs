"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

function sourceFiles(directory) {
  const answer = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      answer.push(...sourceFiles(path));
    } else if (entry.isFile() && path.endsWith(".py")) {
      answer.push(path);
    }
  }
  return answer;
}

function collectStrings(value, answer = new Set()) {
  if (typeof value === "string") {
    answer.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, answer);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, answer);
  }
  return answer;
}

function enclosingPythonFunctionPrefix(lines, callIndex) {
  const callIndent = lines[callIndex].match(/^\s*/)[0].length;
  for (let index = callIndex; index >= 0; index -= 1) {
    const match = lines[index].match(/^(\s*)(?:async\s+)?def\s+/);
    if (match && match[1].length < callIndent) {
      return lines.slice(index, callIndex + 2).join("\n");
    }
  }
  return lines.slice(Math.max(0, callIndex - 96), callIndex + 2).join("\n");
}

test("public resource constructors cannot assume unshipped Wasm exports", () => {
  const root = join(__dirname, "..");
  const schema = JSON.parse(readFileSync(join(root, "ffi/flint.ffi.json"), "utf8"));
  const production = JSON.parse(
    readFileSync(
      join(root, "packages/flint-wasm/release/production-capabilities.json"),
      "utf8",
    ),
  );
  const productionCapabilities = collectStrings(production);
  const resourceTypes = new Set(schema.resources.map((resource) => resource.python_name));
  const candidates = schema.functions.filter((fn) =>
    fn.targets.wasm === false
    && fn.signature.return_ownership === "owned"
    && !fn.signature.parameters.some((parameter) => resourceTypes.has(parameter.type))
    && !productionCapabilities.has(`ffi:flint:${fn.id}`)
  );
  const reviewedNativeOnly = new Set([
    "fmpz_polynomial:src/lib/sagejs/number_fields/field_analysis_resource.py",
    "fmpz_polynomial:src/lib/sagejs/number_fields/order_resource.py",
  ]);
  const observedNativeOnly = new Set();

  for (const path of sourceFiles(join(root, "src"))) {
    const source = readFileSync(path, "utf8");
    const lines = source.split("\n");
    for (const fn of candidates) {
      const needle = `.${fn.python_name}(`;
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(needle)) continue;
        const nearby = lines.slice(Math.max(0, index - 12), index + 2).join("\n");
        if (
          nearby.includes("_flint_backend_has_function")
          && nearby.includes(fn.dynamic.export)
        ) {
          continue;
        }
        const key = `${fn.id}:${relative(root, path)}`;
        assert.ok(
          reviewedNativeOnly.has(key),
          `${key} calls ${fn.dynamic.export}, which is absent from the production Wasm closure, without an explicit capability guard`,
        );
        observedNativeOnly.add(key);
      }
    }
  }
  assert.deepEqual(observedNativeOnly, reviewedNativeOnly);
});

test("public operations on shipped resources cannot assume omitted Wasm exports", () => {
  const root = join(__dirname, "..");
  const schema = JSON.parse(readFileSync(join(root, "ffi/flint.ffi.json"), "utf8"));
  const production = JSON.parse(
    readFileSync(
      join(root, "packages/flint-wasm/release/production-capabilities.json"),
      "utf8",
    ),
  );
  const productionCapabilities = collectStrings(production);
  const allResourceTypes = new Set(
    schema.resources.map((resource) => resource.python_name),
  );
  const productionResourceTypes = new Set(
    schema.resources
      .filter((resource) =>
        productionCapabilities.has(`ffi-resource:flint:${resource.id}`)
      )
      .map((resource) => resource.python_name),
  );
  const candidates = schema.functions.filter((fn) => {
    if (productionCapabilities.has(`ffi:flint:${fn.id}`)) return false;
    const usedResourceTypes = new Set(
      fn.signature.parameters
        .map((parameter) => parameter.type)
        .filter((type) => allResourceTypes.has(type)),
    );
    if (allResourceTypes.has(fn.signature.return_type)) {
      usedResourceTypes.add(fn.signature.return_type);
    }
    return usedResourceTypes.size > 0
      && [...usedResourceTypes].every((type) => productionResourceTypes.has(type));
  });

  for (const path of sourceFiles(join(root, "src"))) {
    const lines = readFileSync(path, "utf8").split("\n");
    for (const fn of candidates) {
      const needle = `.${fn.python_name}(`;
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(needle)) continue;
        const enclosingPrefix = enclosingPythonFunctionPrefix(lines, index);
        assert.ok(
          (enclosingPrefix.includes("_flint_backend_has_function")
            || enclosingPrefix.includes("runtime.reflect.get"))
            && enclosingPrefix.includes(fn.dynamic.export),
          `${fn.id}:${relative(root, path)} calls ${fn.dynamic.export}, which is absent from the production Wasm closure, without an explicit capability guard`,
        );
      }
    }
  }
});

test("wide-prime polynomial resources follow backend capability without Node", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "import sagejs._baselib.polynomial as polynomial",
      "backend = rt.flint_backend()",
      "PolynomialRing(GF(18446744073709551653), 'warmup').gen()",
      "polynomial._generated_flint_resources_available_cache = rt.undefined",
      "global_object = rt.global_object",
      "saved_process = rt.reflect.get(global_object, 'process')",
      "formatter = rt.reflect.get(backend, 'ffiFmpzModPolynomialFormat')",
      "rt.reflect.deleteProperty(global_object, 'process')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzModPolynomialFormat')",
      "try:",
      "    R = PolynomialRing(GF(18446744073709551629), 'x')",
      "    x = R.gen()",
      "    f = x^4 + 3*x + 7",
      "    answer = [f.gcd(f.derivative()), f(5)]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzModPolynomialFormat', formatter)",
      "    rt.reflect.set(global_object, 'process', saved_process)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[1, 647]");
  } finally {
    await session.close();
  }
});

test("integer row selection falls back when the generated selector is absent", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "selector = rt.reflect.get(backend, 'ffiFmpzMatrixSelectRows')",
      "A = matrix(ZZ, [[2^70, 2, 3], [4, 5, 6], [7, 8, 9]])",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzMatrixSelectRows')",
      "try:",
      "    selected = A.matrix_from_rows([2, 0, 2])",
      "    empty = A.matrix_from_rows([])",
      "    answer = [selected.list(), selected.dimensions(), empty.dimensions()]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzMatrixSelectRows', selector)",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[[7, 8, 9, 1180591620717411303424, 2, 3, 7, 8, 9], (3, 3), (0, 3)]",
    );
  } finally {
    await session.close();
  }
});

test("rational matrix operations fall back independently of resource storage", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "inverse_function = rt.reflect.get(backend, 'ffiFmpqMatrixInv')",
      "solve_function = rt.reflect.get(backend, 'ffiFmpqMatrixSolve')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixInv')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixSolve')",
      "try:",
      "    polynomial_ring = PolynomialRing(QQ, 'x')",
      "    x = polynomial_ring.gen()",
      "    K = NumberField(x^2 - 5, 'a')",
      "    basis = K.equation_order().basis_matrix()",
      "    basis_ok = basis.det() == 1 and basis*basis.inverse() == identity_matrix(QQ, 2)",
      "    large = 2^521 + 17",
      "    A = matrix(QQ, [[QQ(large, 97), -QQ(13, 2^257 + 93)], [QQ(5, 7), QQ(2^1024 + 3, 11)]])",
      "    right = matrix(QQ, [[QQ(2^509 + 29, 89)], [-QQ(19, 23)]])",
      "    inverse = A.inverse()",
      "    solution = A.solve_right(right)",
      "    identity_ok = A*inverse == identity_matrix(QQ, 2)",
      "    solution_ok = A*solution == right",
      "    singular = matrix(QQ, [[QQ(1, 2), QQ(1, 3)], [1, QQ(2, 3)]])",
      "    singular_inverse = False",
      "    try:",
      "        singular.inverse()",
      "    except ZeroDivisionError:",
      "        singular_inverse = True",
      "    consistent = matrix(QQ, [[QQ(5, 7)], [QQ(10, 7)]])",
      "    consistent_solution = singular.solve_right(consistent)",
      "    consistent_ok = singular*consistent_solution == consistent",
      "    inconsistent = False",
      "    try:",
      "        singular.solve_right(vector(QQ, [QQ(5, 7), QQ(11, 7)]))",
      "    except ValueError:",
      "        inconsistent = True",
      "    answer = [basis_ok, identity_ok, solution_ok, singular_inverse, consistent_ok, inconsistent]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixInv', inverse_function)",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixSolve', solve_function)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("rational random construction falls back when randbits is absent", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "randbits = rt.reflect.get(backend, 'ffiFmpqMatrixRandbits')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixRandbits')",
      "try:",
      "    set_random_seed(20260821)",
      "    A = random_matrix(QQ, 2)",
      "    characteristic = A.charpoly()",
      "    set_random_seed(20260821)",
      "    repeat = random_matrix(QQ, 2)",
      "    bounded = all(1 <= abs(value.numerator()) <= 3 and 1 <= value.denominator() <= 3 for value in A.list())",
      "    answer = [A == repeat, bounded, characteristic.degree(), characteristic(A).is_zero()]",
      "finally:",
      "    if randbits is not rt.undefined:",
      "        rt.reflect.set(backend, 'ffiFmpqMatrixRandbits', randbits)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, True, 2, True]");
  } finally {
    await session.close();
  }
});

test("cyclotomic construction falls back when its resource export is absent", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "cyclotomic = rt.reflect.get(backend, 'ffiFmpzPolynomialCyclotomic')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzPolynomialCyclotomic')",
      "try:",
      "    R = PolynomialRing(ZZ, 'x')",
      "    x = R.gen()",
      "    value = R.cyclotomic_polynomial(12)",
      "    answer = [value == x^4 - x^2 + 1, value(1), value(-1)]",
      "finally:",
      "    if cyclotomic is not rt.undefined:",
      "        rt.reflect.set(backend, 'ffiFmpzPolynomialCyclotomic', cyclotomic)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, 1, 1]");
  } finally {
    await session.close();
  }
});

test("each optional exact-matrix resource operation has a public fallback", async () => {
  const cases = [
    ["ffiFmpzMatrixAdd", "A=matrix(ZZ,[[1,2],[3,4]])\nB=matrix(ZZ,[[5,6],[7,8]])\nanswer=(A+B).list()==[6,8,10,12]"],
    ["ffiFmpzMatrixSub", "A=matrix(ZZ,[[1,2],[3,4]])\nB=matrix(ZZ,[[5,6],[7,8]])\nanswer=(A-B).list()==[-4,-4,-4,-4]"],
    ["ffiFmpzMatrixNeg", "A=matrix(ZZ,[[1,2],[3,4]])\nanswer=(-A).list()==[-1,-2,-3,-4]"],
    ["ffiFmpzMatrixScalarMul", "A=matrix(ZZ,[[1,2],[3,4]])\nanswer=(A*(2^130+3)).list()[3]==4*(2^130+3)"],
    ["ffiFmpzMatrixCharpoly", "A=matrix(ZZ,[[1,2],[3,4]])\nanswer=str(A.charpoly())=='x^2 - 5*x - 2'"],
    ["ffiFmpzMatrixMinpoly", "A=matrix(ZZ,[[1,2],[3,4]])\nanswer=str(A.minpoly())=='x^2 - 5*x - 2'"],
    ["ffiFmpzMatrixHnfTransform", "A=matrix(ZZ,[[2,4,4],[6,6,12],[10,4,16]])\nH,U=A.hermite_form(transformation=True)\nanswer=(U*A).list()==H.list()"],
    ["ffiFmpzMatrixSnfTransform", "A=matrix(ZZ,[[2,4,4],[6,6,12],[10,4,16]])\nD,L,R=A.smith_form()\nanswer=(L*A*R).list()==D.list()"],
    ["ffiFmpqMatrixAdd", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nB=matrix(QQ,[[1/3,1/5],[1/7,1/11]])\nanswer=(A+B).list()==[5/6,13/15,25/28,61/66]"],
    ["ffiFmpqMatrixSub", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nB=matrix(QQ,[[1/3,1/5],[1/7,1/11]])\nanswer=(A-B).list()==[1/6,7/15,17/28,49/66]"],
    ["ffiFmpqMatrixNeg", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nanswer=(-A).list()==[-1/2,-2/3,-3/4,-5/6]"],
    ["ffiFmpqMatrixScalarMul", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nanswer=(A*(7/5)).list()==[7/10,14/15,21/20,7/6]"],
    ["ffiFmpqMatrixCharpoly", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nanswer=str(A.charpoly())=='x^2 - 4/3*x - 1/12'"],
    ["ffiFmpqMatrixMinpoly", "A=matrix(QQ,[[1/2,2/3],[3/4,5/6]])\nanswer=str(A.minpoly())=='x^2 - 4/3*x - 1/12'"],
    ["ffiFmpqMatrixRightKernel", "A=matrix(QQ,[[1/2,1/3,1/5],[1/4,1/7,1/10]])\nK=A.right_kernel_matrix()\nanswer=K.dimensions()==(1,3) and (A*K.transpose()).list()==[0,0]"],
    ["ffiFmpqMatrixIsZero", "Z=zero_matrix(QQ,2)\nA=matrix(QQ,[[0,0],[0,1/3]])\nanswer=Z.is_zero() and not A.is_zero()"],
    ["ffiFmpqMatrixSelectRows", "A=matrix(QQ,[[1/2,1/3],[2/5,3/7],[5/11,7/13]])\nanswer=A.matrix_from_rows([2,0,2]).list()==[5/11,7/13,1/2,1/3,5/11,7/13]"],
    ["ffiFmpqMatrixSelectColumns", "A=matrix(QQ,[[1/2,1/3,1/5],[2/5,3/7,5/11]])\nanswer=A.matrix_from_columns([2,0,2]).list()==[1/5,1/2,1/5,5/11,2/5,5/11]"],
  ];
  const session = await createSage();
  try {
    for (const [name, body] of cases) {
      const result = await session.evaluate([
        "import sagejs.runtime as rt",
        "backend=rt.flint_backend()",
        `saved=rt.reflect.get(backend, '${name}')`,
        "assert saved is not rt.undefined",
        `rt.reflect.deleteProperty(backend, '${name}')`,
        "try:",
        ...body.split("\n").map((line) => `    ${line}`),
        "finally:",
        `    rt.reflect.set(backend, '${name}', saved)`,
        "answer",
      ].join("\n"));
      assert.equal(result.repr, "True", name);
    }
  } finally {
    await session.close();
  }
});

test("modular-symbol integer matrices use the portable exact ingress", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "global_object = rt.global_object",
      "saved_process = rt.reflect.get(global_object, 'process')",
      "export_packed = rt.reflect.get(backend, 'zzMatrixExportPacked')",
      "from_fmpz = rt.reflect.get(backend, 'ffiFmpqMatrixFromFmpz')",
      "fmpq_close = rt.reflect.get(backend, 'ffiFmpqMatrixClose')",
      "fmpq_trace = rt.reflect.get(backend, 'ffiFmpqMatrixTrace')",
      "fmpq_value_close = rt.reflect.get(backend, 'ffiFmpqValueClose')",
      "warmup = matrix(QQ, 1, 1, [1])",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixFromFmpz')",
      "packed_warmup = matrix(ZZ, 1, 1, [1]).change_ring(QQ).transpose()",
      "packed_warmup.trace()",
      "rt.reflect.set(backend, 'ffiFmpqMatrixFromFmpz', from_fmpz)",
      "rt.reflect.deleteProperty(global_object, 'process')",
      "rt.reflect.deleteProperty(backend, 'zzMatrixExportPacked')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixFromFmpz')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixClose')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixTrace')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqValueClose')",
      "try:",
      "    integer_matrix = matrix(ZZ, 2, 2, [2^130 + 7, -3, 0, 11])",
      "    rational_matrix = integer_matrix.change_ring(QQ)",
      "    rational_identity = identity_matrix(QQ, 2)",
      "    packed_ok = rational_matrix.list() == [2^130 + 7, -3, 0, 11] and rational_identity.list() == [1, 0, 0, 1]",
      "    trace_ok = rational_matrix.trace() == 2^130 + 18 and warmup.trace() == 1",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixClose', fmpq_close)",
      "    M = ModularSymbols(37, 2)",
      "    C = M.cuspidal_subspace()",
      "    answer = [packed_ok, trace_ok, M.dimension(), C.dimension(), M.hecke_matrix(2).trace()]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixFromFmpz', from_fmpz)",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixClose', fmpq_close)",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixTrace', fmpq_trace)",
      "    rt.reflect.set(backend, 'ffiFmpqValueClose', fmpq_value_close)",
      "    rt.reflect.set(backend, 'zzMatrixExportPacked', export_packed)",
      "    rt.reflect.set(global_object, 'process', saved_process)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, True, 5, 4, -1]");
  } finally {
    await session.close();
  }
});
