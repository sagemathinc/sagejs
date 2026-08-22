#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function run(executable, args, source, timeout = 120_000) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const kernelDifferential = String.raw`
from sagejs.native import kernel_integer_buffer
from sagejs.number_fields.bl_composite_kernel import packed_cubic_norm_form_target_slice

packed = packed_cubic_norm_form_target_slice
dynamic = getattr(packed, "__sagejs_native_source__", packed)
coefficients = [170, 5745, 18000, 1585, 2345, 5115, 25215, 11100, 36900, 15075]

for function in (dynamic, packed):
    values = kernel_integer_buffer(function, coefficients)
    assert function(values, 19, 0, 19, 5, 14) == 1
    assert function(values, 19, 0, 19, 0, 0) == 2
    assert function(values, 19, 7, 7, 5, 14) == 1
    assert function(values, 1, 0, 1, 0, 0) == 0
    assert function(values, 19, 8, 7, 5, 14) == 0
`;

test("packed cubic norm obstruction matches ordinary Python", () => {
  run(
    pythonExecutable(),
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${kernelDifferential}`,
    ],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed))\n`,
  );
  assert.equal(output, "True");
});

test("cubic class-number obstruction agrees with the readable search", () => {
  const output = run(
    sagejs,
    ["--python", "-"],
    String.raw`
import sagejs.number_fields.cubic_class_number as cubic

R = PolynomialRing(QQ, "x")
x = R.gen()
packed_field = NumberField(x**3 - x**2 - 6*x - 12, "a")
packed = cubic.bounded_cubic_minkowski_class_number(packed_field)
assert packed.complete and packed.order() == 3 and packed.certificate.verify()

def forbidden_verifier_kernel(*args, **kwargs):
    raise AssertionError("detached replay reused the producer kernel")
saved = cubic._cubic_norm_form_kernel_override
cubic._cubic_norm_form_kernel_override = forbidden_verifier_kernel
assert packed.certificate.verify()
cubic._cubic_norm_form_kernel_override = saved

cubic._cubic_norm_form_kernel_override = False
readable_field = NumberField(x**3 - x**2 - 6*x - 12, "b")
readable = cubic.bounded_cubic_minkowski_class_number(readable_field)
cubic._cubic_norm_form_kernel_override = saved
assert readable.complete and readable.order() == 3 and readable.certificate.verify()
packed_obstruction = packed.certificate.obstructions[0]
readable_obstruction = readable.certificate.obstructions[0]
for name in (
    "prime",
    "line",
    "class_coordinates",
    "ambient_row",
    "ideal_norm",
    "norm_form_coefficients",
    "modulus",
    "residue_states",
):
    assert packed_obstruction[name] == readable_obstruction[name]
assert packed.certificate.relations == readable.certificate.relations

def invalid_kernel(*args, **kwargs):
    return 0
cubic._cubic_norm_form_kernel_override = invalid_kernel
assert not cubic._cubic_norm_form_represents_targets(
    tuple(packed_obstruction["norm_form_coefficients"]),
    19,
    5,
    14,
    cancelled=None,
)
cubic._cubic_norm_form_kernel_override = saved
print("cubic-norm-kernel-ok")
`,
    180_000,
  );
  assert.equal(output, "cubic-norm-kernel-ok");
});
