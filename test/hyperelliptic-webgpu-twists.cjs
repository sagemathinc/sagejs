"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("software WebGPU adapter exercises deterministic packed twist dots", async () => {
  const previous = process.env.SAGEJS_WEBGPU_OPTIONS;
  process.env.SAGEJS_WEBGPU_OPTIONS = "backend=null";
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.gpu_twists import gpu_twist_capabilities, gpu_twist_dot_products",
        "capability = gpu_twist_capabilities()",
        "answer = gpu_twist_dot_products(",
        "    [1,2,3],",
        "    [[1,-1,1],[-1,0,1]],",
        "    [[[0.5,1.0,-2.0],[1.0,1.0,1.0]],",
        "     [[2.0,-1.0,0.25],[0.0,3.0,-1.0]]],",
        ")",
        "(capability['available'], answer['values'],",
        " all(error > 0 for row in answer['absolute_error_bounds'] for error in row),",
        " answer['provenance']['numeric_format'],",
        " len(answer['provenance']['shader_sha256']), answer['candidate_screen_only'])",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "(True, ((-7.5, 2.0), (-1.25, -3.0)), True, 'f32', 64, True)",
    );
  } finally {
    await session.close();
    if (previous === undefined) delete process.env.SAGEJS_WEBGPU_OPTIONS;
    else process.env.SAGEJS_WEBGPU_OPTIONS = previous;
  }
});
