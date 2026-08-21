import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = new URL("../dist/flint-factor.wasm", import.meta.url);

test("MPFR resources and Acb special functions execute in the production Wasm module", async () => {
  const routes = [];
  const backend = await instantiateFlintFactor(await readFile(wasm), {
    recordCapability(...record) {
      routes.push(record);
    },
  });
  const resources = [];
  const keep = (value) => {
    resources.push(value);
    return value;
  };

  assert.equal(backend.numericLiveCount(), 0);
  const one = keep(backend.realFromBigInt(1n, 100));
  const three = keep(backend.realFromBigInt(3n, 100));
  const third = keep(backend.realDiv(one, three));
  assert.equal(
    backend.realToString(third),
    "0.33333333333333333333333333333",
  );
  const rounded = keep(backend.realRound(third, 53));
  assert.equal(backend.realToString(rounded), "0.333333333333333");

  const input = keep(backend.complexFromStrings("1", "2", 100));
  const ei = keep(backend.complexEi(input));
  assert.match(
    backend.complexToString(ei),
    /^1\.0421677081649356844163271638 \+ 3\.7015014259378742641152943269\*I$/,
  );
  const order = keep(backend.complexFromStrings("1", "1", 100));
  const argument = keep(backend.complexFromStrings("2", "1", 100));
  const bessel = keep(backend.complexBesselI(order, argument));
  assert.match(
    backend.complexToString(bessel),
    /^1\.4409091470417881309936831544 \+ 0\.47516726750336723007051513668\*I$/,
  );
  assert.deepEqual(
    backend.zetaZeros(3, 100).map((value) => Number(value.toFixed(10))),
    [14.1347251417, 21.0220396388, 25.0108575801],
  );
  const integral = backend.symbolicNumericalIntegral(
    ["Exp", ["Power", "x", 2]],
    "x",
    1,
    2,
    87,
    1e-12,
    1e-12,
    true,
  );
  assert.ok(Math.abs(integral.value - 14.989976019600048) < 1e-12);
  assert.ok(integral.error < 1e-10);
  assert.ok(Math.abs(backend.symbolicFindRoot(
    ["Subtract", ["Power", "x", 2], 2],
    "x",
    1,
    2,
    100,
    1e-12,
  ) - Math.SQRT2) < 1e-10);

  assert.ok(backend.numericLiveCount() >= resources.length);
  for (const resource of resources.reverse()) {
    assert.equal(backend.closeNumericResource(resource), true);
    assert.equal(backend.closeNumericResource(resource), false);
  }
  assert.equal(backend.numericLiveCount(), 0);
  assert.throws(() => backend.realToString(one), /live WebAssembly real resource/);

  const routeIds = new Set(routes.map(([id]) => id));
  for (const id of [
    "napi:@sagemath/sagejs-flint:realDiv",
    "napi:@sagemath/sagejs-flint:complexEi",
    "napi:@sagemath/sagejs-flint:complexBesselI",
    "napi:@sagemath/sagejs-flint:zetaZeros",
    "specialist:symbolic-numerical-integral-wasm",
    "specialist:symbolic-find-root-wasm",
  ]) {
    assert.ok(routeIds.has(id), `missing route ${id}`);
  }
  assert.ok(routes.every(([, route]) => route === "receipt-backed-wasm-artifact"));
});
