// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const moduleSource = `import builtins
origin_before = __file__
metadata_names = ('__name__', '__file__', '__package__', '__loader__', '__spec__', '__cached__', '__builtins__')
metadata_before = {name: globals()[name] for name in metadata_names}
execute = getattr(builtins, 'exec')
execute("def generated(value):\\n    return value + 1\\n")
assert generated(4) == 5
assert __file__ == origin_before
for name in metadata_names:
    assert globals()[name] is metadata_before[name], name
assert eval('__file__') == origin_before
assert eval('__name__') == 'exec_origin_fixture'
globals()['dynamic_value'] = 11
assert dynamic_value == 11
def read_dynamic_value():
    return dynamic_value
assert read_dynamic_value() == 11
globals()['dynamic_value'] = 12
assert read_dynamic_value() == 12
del globals()['dynamic_value']
try:
    read_dynamic_value()
except NameError:
    pass
else:
    raise AssertionError('deleted dynamic global remained visible')
`;

const checkSource = `import builtins
import exec_origin_fixture
assert exec_origin_fixture.__file__ == EXPECTED_ORIGIN
assert exec_origin_fixture.generated(8) == 9
sentinel = object()
namespace = {'__name__': 'owner', '__file__': 'owner.py', '__spec__': sentinel, '__builtins__': builtins.__dict__}
code = compile('seen = (__name__, __file__, __spec__)', 'generated.py', 'exec')
exec(code, namespace)
assert namespace['seen'] == ('owner', 'owner.py', sentinel)
assert namespace['__file__'] == 'owner.py'
namespace['__name__'] = 'second'
namespace['__file__'] = 'second.py'
exec(code, namespace)
assert namespace['seen'] == ('second', 'second.py', sentinel)
exec("__file__ = 'explicit.py'; __name__ = 'explicit'", namespace)
assert namespace['__file__'] == 'explicit.py'
assert namespace['__name__'] == 'explicit'
empty = {}
exec('value = 7', empty)
assert empty['value'] == 7
assert '__name__' not in empty
assert '__file__' not in empty
assert '__package__' not in empty
assert '__spec__' not in empty
assert '__loader__' not in empty
assert '__cached__' not in empty
assert empty['__builtins__']['len']([1, 2]) == 2
globals_map = {}
locals_map = {}
exec('value = 9', globals_map, locals_map)
assert '__builtins__' in globals_map
assert locals_map['value'] == 9
print('exec-origin-ok')
`;

test("exec and eval preserve caller module origins and other import metadata", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exec-origin-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const origin = join(directory, "exec_origin_fixture.py");
  const filename = join(directory, "check.py");
  writeFileSync(origin, moduleSource);
  writeFileSync(filename, `EXPECTED_ORIGIN = ${JSON.stringify(origin)}\n${checkSource}`);
  const result = spawnSync(process.execPath, [
    join(__dirname, "..", "bin", "sagejs-source.cjs"), "--python", filename,
  ], { cwd: directory, encoding: "utf8", timeout: 60000, maxBuffer: 65536 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "exec-origin-ok\n");
  assert.equal(result.stderr, "");
});
