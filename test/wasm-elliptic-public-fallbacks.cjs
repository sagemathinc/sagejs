"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("public elliptic methods capability-check optional eclib/smalljac exports", () => {
  const source = fs.readFileSync(
    path.join(root, "src/baselib/elliptic_curves.py"),
    "utf8",
  );
  assert.match(source, /runtime\.reflect\.get\(backend, "ecApIntegral"\)/);
  assert.match(source, /runtime\.reflect\.get\(backend, "ecAnlistIntegral"\)/);
  assert.match(source, /if native_function is runtime\.undefined:\n\s+return None/);
  assert.match(source, /exact direct Sage\.js point counter/);
  assert.match(source, /supply root_number\(precomputed=-1 or 1\)/);
  assert.match(
    source,
    /capability_trace\(\s*"elliptic-root-number-semistable", "portable-fallback"/,
  );
  assert.match(
    source,
    /capability_trace\("elliptic-coefficients-portable", "portable-fallback"\)/,
  );
});

test("portable coefficient recurrence and documented root override are public", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "E = EllipticCurve([0,0,1,-1,0])",
      "native = E.anlist(30)",
      "E._integral_model_coefficients = lambda: None",
      "portable = E.anlist(30)",
      "F = EllipticCurve([1,2,3,4,999])",
      "precomputed = F.root_number(precomputed=1)",
      "[portable == native, portable[1:8], precomputed, F.root_number()]",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[True, [1, -2, -3, 2, -2, 6, -1], 1, 1]",
    );
    await assert.rejects(
      session.evaluate(
        "EllipticCurve([1,2,3,4,999]).root_number(precomputed=0)",
      ),
      /precomputed root number must be -1 or 1/,
    );
  } finally {
    await session.close();
  }
});

test("missing specialist exports select exact semistable and coefficient fallbacks", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "names = ['ecRootNumber', 'ecApIntegral', 'ecAnlistIntegral']",
      "saved = [rt.reflect.get(backend, name) for name in names]",
      "for name in names:",
      "    rt.reflect.deleteProperty(backend, name)",
      "E = EllipticCurve([0,0,1,-1,0])",
      "answer = [E.root_number(), E.ap(5), E.anlist(12)]",
      "for name, value in zip(names, saved):",
      "    rt.reflect.set(backend, name, value)",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[-1, -2, [0, 1, -2, -3, 2, -2, 6, -1, 0, 6, 4, -5, -6]]",
    );
  } finally {
    await session.close();
  }
});

test("missing eclib rejects additive signs unless explicitly certified", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    await assert.rejects(
      session.evaluate([
        "import sagejs.runtime as rt",
        "backend = rt.flint_backend()",
        "rt.reflect.deleteProperty(backend, 'ecRootNumber')",
        "EllipticCurve([0,0,0,-1,0]).root_number()",
      ].join("\n")),
      /additive local root numbers are not yet implemented.*precomputed/s,
    );
    assert.equal(
      (
        await session.evaluate(
          "EllipticCurve([0,0,0,-1,0]).root_number(precomputed=-1)",
        )
      ).repr,
      "-1",
    );
  } finally {
    await session.close();
  }
});
