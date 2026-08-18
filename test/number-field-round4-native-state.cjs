#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "number_fields",
  "round4_state_kernel.py",
);
const sagejs = join(root, "bin", "sagejs");

const vector010Polynomial = [
  87782430961, 0, 73445288000, 0, 1769278869776, 0, 2940754348320,
  0, 3788371498452, 0, 3275906117440, 0, 1764753386480, 0,
  613283590880, 0, 143402547926, 0, 23223642560, 0, 2645190320, 0,
  212540000, 0, 11928052, 0, 455360, 0, 11216, 0, 160, 0, 1,
];

// Captured from vector010's transition 49 (residue-root-error).  This is an
// algorithm-state fixture, not a selection key: the kernel sees only an
// arbitrary canonical packed element and integral monic equation.
const vector010Element = [
  4096, -1921167192014974631699n, 23311077024722075280332n,
  72979478997529796730157n, -34658213573031162851615n,
  57796697381498454556261n, 37476275780919218544234n,
  -74752371447830479155954n, 67247584065081978290845n,
  -1253424846351917248449n, -62480424453365492468748n,
  72002143441676135040555n, 62436778254632705463411n,
  -13629844741848554887801n, -5166348272990322863938n,
  -1992251438047013516850n, -7730640446327687246529n,
  -38308508203332025015337n, -3574998774953472019644n,
  -60624286770897190058033n, 68332303106228657974947n,
  -23222117488793191769793n, -38023491182303020748482n,
  -10272845292075491321262n, -66668303197036574539449n,
  -22001171014693020533883n, -34909127836307276045028n,
  -5430096565031968270255n, -44773352021897791522287n,
  -18537074588670589717219n, -10609318725528131460374n,
  27295268574728619925010n, 39991162386792915112613n,
];

function pythonIntegers(values) {
  return `[${values.map((value) => value.toString()).join(",")}]`;
}

async function main() {
  const compiled = await compile({
    sourcePath,
    cacheRoot: join(dirname(sourcePath), ".sagejs-native-kernels"),
  });
  assert.equal(compiled.nativeAbi > 0, true);
  const program = String.raw`
from sagejs.native import is_compiled
from sagejs.number_fields.round4 import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.round4_state_kernel import packed_round4_exact_characteristic, packed_round4_padic_characteristic

assert is_compiled(packed_round4_exact_characteristic)
assert is_compiled(packed_round4_padic_characteristic)

def reference_matrix(defining, packed):
    degree = len(defining) - 1
    column = list(packed[1:])
    columns = []
    for _ in range(degree):
        columns.append(list(column))
        leading = column[-1]
        column = [-leading * defining[0]] + [column[i - 1] - leading * defining[i] for i in range(1, degree)]
    return [[columns[column][row] for column in range(degree)] for row in range(degree)]

def exact_event(defining, packed, prime, transition):
    degree = len(defining) - 1
    control = kernel_integer_buffer(
        packed_round4_exact_characteristic,
        [0, 0, 0, transition],
    )
    output = kernel_integer_zeros(packed_round4_exact_characteristic, degree + 1, 192)
    matrix = kernel_integer_zeros(packed_round4_exact_characteristic, degree * degree, 48)
    ok = packed_round4_exact_characteristic(
        control,
        output,
        matrix,
        kernel_integer_buffer(packed_round4_exact_characteristic, defining),
        kernel_integer_buffer(packed_round4_exact_characteristic, packed),
        kernel_integer_buffer(packed_round4_exact_characteristic, [prime]),
        degree,
    )
    return ok, integer_buffer_values(control), integer_buffer_values(output)

# Deterministic small differentials exercise unrelated equations and elements.
small = [
    ([1, 1, 1], [1, 3, -2], 3),
    ([-2, 0, 0, 1], [1, -4, 7, 2], 5),
    ([3, -1, 2, 0, 1], [1, 5, -3, 8, 1], 7),
]
for transition, (defining, packed, prime) in enumerate(small):
    ok, control, actual = exact_event(defining, packed, prime, transition)
    assert ok and control == [1, 0, 0, transition]
    expected = list(matrix(ZZ, reference_matrix(defining, packed)).charpoly().list())
    assert actual == expected
    degree = len(defining) - 1
    pcontrol = kernel_integer_buffer(
        packed_round4_padic_characteristic,
        [0, 0, 0, transition],
    )
    poutput = kernel_integer_zeros(packed_round4_padic_characteristic, degree + 1, 16)
    workspace = kernel_integer_zeros(
        packed_round4_padic_characteristic,
        degree * degree + 6 * (degree + 1),
        32,
    )
    assert packed_round4_padic_characteristic(
        pcontrol,
        poutput,
        kernel_integer_buffer(packed_round4_padic_characteristic, defining),
        kernel_integer_buffer(packed_round4_padic_characteristic, packed),
        kernel_integer_buffer(packed_round4_padic_characteristic, [prime]),
        workspace,
        9,
        degree,
    )
    modulus = prime**9
    centered = [value % modulus for value in expected]
    centered = [value - modulus if value > modulus // 2 else value for value in centered]
    assert integer_buffer_values(poutput) == centered
    assert integer_buffer_values(pcontrol)[3] == transition

# A genuine high-denominator vector010 transition remains exact.  This catches
# the denominator normalization and large-output storage path that motivated
# the packed boundary.
vector_defining = ${pythonIntegers(vector010Polynomial)}
vector_element = ${pythonIntegers(vector010Element)}
ok, control, actual = exact_event(vector_defining, vector_element, 2, 49)
assert ok and control == [1, 12, 0, 49]
integer_matrix = reference_matrix(vector_defining, vector_element)
numerator_characteristic = list(matrix(ZZ, integer_matrix).charpoly().list())
denominator = vector_element[0]
expected = []
for index, coefficient in enumerate(numerator_characteristic):
    divisor = denominator ** (32 - index)
    quotient, remainder = divmod(coefficient, divisor)
    assert remainder == 0
    expected.append(quotient)
assert actual == expected

# Fail closed under malformed shape, denominator support away from p, and a
# canonical element corrupted into a nonintegral one.  The transcript index is
# never rewritten, so accepted events cannot be silently reordered.
ok, control, _ = exact_event([1, 0, 1], [3, 0, 1], 2, 73)
assert not ok and control[0] == -3 and control[3] == 73
ok, control, _ = exact_event([1, 0, 1], [2, 0, 1], 2, 74)
assert not ok and control[0] == -4 and control[3] == 74
bad_control = kernel_integer_zeros(packed_round4_exact_characteristic, 4, 8)
bad_output = kernel_integer_zeros(packed_round4_exact_characteristic, 3, 8)
bad_matrix = kernel_integer_zeros(packed_round4_exact_characteristic, 3, 8)
assert not packed_round4_exact_characteristic(
    bad_control,
    bad_output,
    bad_matrix,
    kernel_integer_buffer(packed_round4_exact_characteristic, [1, 0, 1]),
    kernel_integer_buffer(packed_round4_exact_characteristic, [1, 0, 1]),
    kernel_integer_buffer(packed_round4_exact_characteristic, [2]),
    2,
)
assert integer_buffer_values(bad_control)[0] == -1
print('round4 native-state kernels: ok')
`;
  const run = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: program,
    timeout: 120_000,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /round4 native-state kernels: ok/);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
