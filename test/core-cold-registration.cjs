// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {runInNewContext} = require("node:vm");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");
const root = join(__dirname, "..");

const propertySource = `
class Counter:
    def __init__(self):
        self.value = 1
    @property
    def item(self):
        """Current counter value."""
        return self.value
    @item.setter
    def item(self, value):
        self.value = value
    @item.deleter
    def item(self):
        self.value = -1
counter = Counter()
descriptor = Counter.item
assert type(descriptor) is property
assert Counter.item is descriptor
assert descriptor.__doc__ == 'Current counter value.'
assert descriptor.fget(counter) == 1
descriptor.fset(counter, 3)
assert counter.item == 3
descriptor.fdel(counter)
assert counter.item == -1
class ReadOnly:
    @property
    def item(self):
        return 7
assert ReadOnly.item.fset is None and ReadOnly.item.fdel is None
assert ReadOnly().item == 7
`;

test("native properties load construction lazily and reuse cached descriptors", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const result = await session.evaluate(`
import sys
assert 'sagejs._namespace' not in sys.modules
${propertySource}
assert 'sagejs._namespace' in sys.modules
import sagejs._namespace as bridge
saved = bridge._native_property
def forbidden(*args):
    raise AssertionError('cached property reconstructed')
bridge._native_property = forbidden
try:
    assert Counter.item is descriptor
    assert Counter.item.fget(counter) == -1
finally:
    bridge._native_property = saved
print('property cache passed')
`);
  assert.equal(result.stdout, "property cache passed\n");
});

test("byte method publication preserves names, targets and mutability", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const result = await session.evaluate(`
for cls in (bytes, bytearray):
    value = cls(b' a b ')
    assert cls.strip(value) == value.strip() == cls(b'a b')
    assert cls.count(value, b' ') == value.count(b' ') == 3
    assert cls.upper(value) == value.upper() == cls(b' A B ')
    assert cls.decode(value) == value.decode() == ' a b '
    assert cls.split(value) == value.split() == [cls(b'a'), cls(b'b')]
    assert cls.count is cls.count
    assert cls.fromhex('6162') == cls(b'ab')
assert not hasattr(bytes, 'append') and not hasattr(bytes, 'extend')
value = bytearray(b'a')
bytearray.append(value, 98)
bytearray.extend(value, b'c')
assert value == bytearray(b'abc')
assert int.from_bytes(b'ab', 'big') == 24930
assert (24930).to_bytes(2, 'big') == b'ab'
print('byte registration passed')
`);
  assert.equal(result.stdout, "byte registration passed\n");
});

test("documentation tables preserve complete independent metadata records", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const result = await session.evaluate(`
import sagejs.runtime as runtime
selected = []
for name, target, metadata in runtime.documentation_registry():
    if name in ('help', 'search_doc', 'factor', 'next_prime', 'is_prime', 'prime_range', 'prime_pi'):
        selected.append(metadata)
        print(runtime.json.stringify([name, metadata]))
assert selected[0] is not selected[1]
assert runtime.reflect.get(selected[0], 'backends') is not runtime.reflect.get(selected[1], 'backends')
`);
  const records = new Map(result.stdout.trim().split("\n").map(line => JSON.parse(line)));
  assert.equal(records.size, 7);
  for (const [name, tags, notes] of [
    ["help", ["documentation", "introspection"], "Provides concise runtime help for installed APIs."],
    ["search_doc", ["documentation", "search", "introspection"], "Searches the installed Sage.js corpus only."],
  ]) {
    assert.deepEqual(records.get(name), {
      kind: "function", module: "builtins", tags, backends: ["Sage.js runtime"],
      sage_compatibility: {status: "compatible", notes},
      provenance: [{kind: "sagejs-original"}],
    });
  }
  for (const [name, tags, algorithm, limitations] of [
    ["factor", ["factorization"], "FLINT integer factorization", []],
    ["next_prime", ["primes"], "FLINT next-prime search", []],
    ["is_prime", ["primes", "primality"], "FLINT primality testing", []],
    ["prime_range", ["primes", "enumeration"], "Repeated FLINT next-prime search", []],
    ["prime_pi", ["primes", "prime counting"], "Lehmer prime counting with incremental enumeration for small bounds",
      ["Like Sage primecountpy, inputs at or above 2^63 are not supported."]],
  ]) {
    assert.deepEqual(records.get(name), {
      kind: "function", module: "sage.arith.misc", tags: ["arithmetic", ...tags],
      backends: ["FLINT"],
      sage_compatibility: {status: "compatible",
        notes: "Matches the documented SageMath result for the supported integer inputs."},
      provenance: [
        {kind: "sage-derived", source: "SageMath arithmetic API",
          url: "https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html", license: "GPL-2.0-or-later"},
        {kind: "library-backed", source: "FLINT", url: "https://flintlib.org/doc/"},
      ],
      references: [{id: "flint", type: "software", title: "FLINT: Fast Library for Number Theory",
        authors: ["The FLINT contributors"], url: "https://flintlib.org/"}],
      implementation: {algorithm}, limitations,
    });
  }
});

for (const privateScope of [true, false])
test(`property construction works in host-free standalone (${privateScope ? "private" : "global"})`, async () => {
  const {default: createCompiler} = require("../dist/tools/compiler.js");
  const {createPythonCompilerFrontend} = require("../dist/tools/python/compiler-frontend.js");
  const {standaloneRuntimeRequirePrelude} = require("../tools/standalone-library.cjs");
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(propertySource, {
      filename: "cold-property.py", libdir: join(root, "src/lib"), import_dirs: [],
      exact_integer_literals: true, strict_python_scopes: true,
      scoped_flags: {dict_literals: true, overload_getitem: true,
        bound_methods: true, sequential_definitions: true},
    });
    const output = new compiler.OutputStream({
      baselib_plain: standaloneRuntimeRequirePrelude() +
        readFileSync(join(root, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
      beautify: true, private_scope: privateScope, exact_integers: true,
      keep_docstrings: true,
      python_tuples: true, python_truthiness: true, python_attributes: true,
    });
    ast.print(output);
    runInNewContext(output.get(), {console});
  } finally {frontend.close();}
});
