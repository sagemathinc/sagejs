import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("Wasm Brandt rank-four kernels preserve the public ideal-class result", async () => {
  const session = await createSage({ timeout: 120_000 });
  try {
    const result = await session.evaluate([
      "import sagejs.native as native",
      "import sagejs.quaternion_algebras.ideals as ideals",
      "from sagejs.modular_forms import BrandtModule",
      "B=BrandtModule(11,1,realization='ideal-classes',use_cache=False)",
      "direct=B.hecke_matrix(3,algorithm='direct')",
      "series=B.hecke_matrix(3,algorithm='brandt-series')",
      "[native.is_compiled(ideals._theta_kernel),native.is_compiled(ideals._vector_kernel),B.dimension(),B.mass(),direct==series,direct.charpoly(),B.mass_certificate().verify()]",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[True, True, 2, 5/6, True, x^2 - 3*x - 4, True]",
    );
  } finally {
    await session.close();
  }
});
