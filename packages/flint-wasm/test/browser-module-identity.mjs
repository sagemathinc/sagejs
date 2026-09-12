import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const engines = parseEngineList(process.env.SAGEJS_BROWSER_ENGINES ?? "chromium");
const browserTypes = { chromium, firefox, webkit };
const mapping = `
class PublicMapping(Mapping):
    def __iter__(self):
        return iter(["x"])
    def __len__(self):
        return 1
    def __getitem__(self, key):
        if key != "x":
            raise KeyError(key)
        return float("1.25")
assert isinstance(PublicMapping(), _json.Mapping), "public Mapping identity"
assert _json.materialize_json(PublicMapping()) == {"x": 1.25}, "public Mapping materialization"
assert _json.math is math, "numerical math dependency"
assert _json.Mapping is Mapping, "numerical Mapping dependency"
assert math is __import__("math"), "dynamic math import"
`;

for (const name of engines) {
  const engine = browserTypes[name];
  const executablePath = executablePathFor(name, engine);
  assert.ok(executablePath, `${name} is required for module-identity tests`);
  const browser = await engine.launch({
    executablePath,
    headless: true,
    args: name === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  try {
    for (const isolated of [true, false]) {
      const server = await createBrowserWasmServer({ crossOriginIsolation: isolated });
      try {
        for (const mode of ["python", "sage"]) {
          const context = await browser.newContext({ serviceWorkers: "block" });
          try {
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", error => errors.push(String(error)));
            await page.addInitScript(mode => {
              window.__sagejsTestOptions = { mode };
            }, mode);
            await page.goto(`${server.origin}/browser-wasm-harness.html`);
            await page.waitForFunction(() => window.__sagejsReady !== undefined);
            await page.evaluate(() => window.__sagejsReady);
            assert.equal(await page.evaluate(() => crossOriginIsolated), isolated);
            const check = async source => {
              const result = await page.evaluate(source =>
                window.__sagejsTest.evaluate(source + '\nprint("identity-ok")', 120_000), source);
              assert.equal(result.stdout, "identity-ok\n", `${name}/${mode}/${isolated}`);
              assert.equal(result.stderr, "");
            };
            // Both import orders in fresh sessions. A lazy dependency must not
            // retain an obsolete class or module from before the cell import.
            for (const order of [
              "import math\nfrom collections.abc import Mapping\nfrom sagejs.numerics import _json\n",
              "from sagejs.numerics import _json\nfrom collections.abc import Mapping\nimport math\n",
            ]) {
              await page.evaluate(() => window.__sagejsTest.reset());
              await check(order + mapping + `
math._sagejs_identity_witness = (Mapping, PublicMapping())
`);
              // Importing again in a later cell preserves module state and
              // the class identity held by an instance from the earlier cell.
              await check(`
import math
from collections.abc import Mapping
from sagejs.numerics import _json
assert math._sagejs_identity_witness[0] is Mapping
assert isinstance(math._sagejs_identity_witness[1], Mapping)
assert _json.materialize_json(math._sagejs_identity_witness[1]) == {"x": 1.25}
del math._sagejs_identity_witness
`);
            }
            if (isolated) {
              await check(`
from sagejs.numerics import _json
import math
from collections.abc import Mapping
scope = {}
program = compile("import math\\nfrom collections.abc import Mapping", "<identity>", "exec")
exec(program, scope)
assert scope["math"] is math is _json.math
assert scope["Mapping"] is Mapping is _json.Mapping
assert eval("__import__('math')", scope) is math
exec(program, scope)
assert scope["Mapping"] is Mapping
`);
            }
            await check(`
from sagejs.numerics import _json
import math
checks = []
original = math.isfinite
def counted(value):
    checks.append(value)
    return original(value)
math.isfinite = counted
try:
    assert _json.materialize_json([float("1.25")]) == [1.25]
    assert checks == [1.25]
finally:
    math.isfinite = original
`);
            await check(mode === "sage"
              ? "assert 2^3 == 8\nassert str(1/2) == '1/2'"
              : "assert 2^3 == 1\nassert 1/2 == 0.5");
            // Not every browser stdlib module belongs to the bootstrap/lazy
            // loader. Such modules must remain available via static compilation.
            await check(`
import calendar
import textwrap
from sagejs.numerics import _json
import math
assert calendar.isleap(2024)
assert textwrap.dedent("  x") == "x"
assert _json.math is math
`);
            assert.deepEqual(errors, []);
            await page.evaluate(() => window.__sagejsTest.close());
            console.log(`${name}: ${mode}, isolated=${isolated}: module identity passed`);
          } finally {
            await context.close();
          }
        }
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
  }
}
