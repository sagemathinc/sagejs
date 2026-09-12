// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const product = require("../sagejs-version.json");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`Python language and Sage.js implementation identities are distinct (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(`
import sys
import platform
assert sys.implementation.name == 'sagejs'
assert sys.implementation.cache_tag == 'sagejs-314'
assert sys.version_info == (3, 14, 4, 'final', 0)
assert sys.version_info.major == 3 and sys.version_info.minor == 14
assert sys.version_info.micro == 4
assert len(sys.implementation.version) == 5
assert sys.implementation.version.releaselevel == 'final'
assert sys.implementation.version.serial == 0
assert '.'.join(str(n) for n in sys.implementation.version[:3]) == ${JSON.stringify(product.version)}
assert 'sagejs' in repr(sys.implementation)
assert 'cpython' not in repr(sys.implementation)
assert sys.version == '3.14.4 (Sage.js ' + ${JSON.stringify(product.version)} + '; Python-to-JavaScript runtime)'
assert platform.python_implementation() == 'SageJS'
assert platform.python_version() == '3.14.4'
assert platform.python_version_tuple() == ('3', '14', '4')
assert sys._implementation_version('1.2.3-alpha.2') == (1, 2, 3, 'alpha', 2)
assert sys._implementation_version('1.2.3-beta') == (1, 2, 3, 'beta', 0)
assert sys._implementation_version('1.2.3-rc.1+build.7') == (1, 2, 3, 'candidate', 1)
assert sys._implementation_version('1.2.3+build.7') == (1, 2, 3, 'final', 0)
for invalid in ['1.2', '1.2.3.4', '1.2.-3', '1.2.3-preview.1', '1.2.3-rc.-1']:
    try:
        sys._implementation_version(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError(invalid)
print('runtime-identity-ok')
`);
    assert.equal(result.stdout.trim(), "runtime-identity-ok");
  });
}
