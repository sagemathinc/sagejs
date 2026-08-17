"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const python =
  process.env.SAGEJS_PYTHON ??
  (existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3");
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-local-polygons.json"),
    "utf8",
  ),
);

function pyRepr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return `'${value.replaceAll("'", "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  return String(value);
}

test("local polygon fixtures agree with frozen Sage/PARI/Hecke evidence", async () => {
  const session = await createSage();
  try {
    for (const item of fixture.cases) {
      const result = await session.evaluate(
        [
          "from sagejs.number_fields.local_polygons import analyze_local_polygons",
          `r = analyze_local_polygons(${pyRepr(item.coefficients)}, ${item.prime}, ${item.polynomial_discriminant_valuation})`,
          "t = r.to_trace()",
          "[r.status, r.predicted_index_exponent, r.basis_numerators, " +
            "r.basis_denominator, t['regular'], " +
            "[q['degree'] for q in t['dedekind']['modular_factors']], " +
            "[q['multiplicity'] for q in t['dedekind']['modular_factors']], " +
            "[q['polygon']['vertices'] for q in t['factor_traces']]]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        pyRepr([
          item.status,
          item.predicted_index_exponent,
          item.basis_numerators,
          item.basis_denominator,
          item.regular,
          item.modular_factor_degrees,
          item.modular_factor_multiplicities,
          item.polygon_vertices,
        ]),
        item.name,
      );
    }
  } finally {
    await session.close();
  }
});

test("regularity fails closed into an inspectable multiplier-ring plan", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.local_polygons import analyze_local_polygons, multiplier_ring_iteration_plan, select_local_enlargement",
        "r = analyze_local_polygons([5, -19, -14, 1], 3, 4)",
        "s = select_local_enlargement([5, -19, -14, 1], 3, 4, 'polygon')",
        "m = multiplier_ring_iteration_plan(r, 2, 2)",
        "[r.status, r.fallback_reason, s['algorithm'], m['iteration'], " +
          "m['current_discriminant_valuation'], m['stop_when']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['fallback-required', " +
        "'a first-order residual polynomial is not squarefree', " +
        "'multiplier-ring', 2, 2, " +
        "'multiplier-kernel-dimension is zero']",
    );
  } finally {
    await session.close();
  }
});

test("local polygon outcomes map to typed solver results and component splits", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.local_polygons import analyze_local_component, analyze_local_polygons",
        "from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent",
        "prime = DiscriminantComponent(2, 'proven-prime')",
        "local = analyze_local_polygons([3, -1, 5, 1], 2, 6).to_local_order_result(prime, -1984)",
        "composite = DiscriminantComponent(35, 'composite')",
        "split = analyze_local_component([3, -1, 5, 1], composite)",
        "unproved = DiscriminantComponent(37, 'probable-prime-awaiting-proof')",
        "deferred = analyze_local_component([3, -1, 5, 1], unproved)",
        "[local.state, local.algorithm, local.index, local.discriminant, " +
          "local.basis.numerator, local.basis.denominator, split.state, " +
          "split.split.left, split.split.right, deferred.state]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['complete', 'polygon', 8, -31, [[4, 0, 0], [2, 2, 0], " +
        "[3, 0, 1]], 4, 'split', 5, 7, 'not-applicable']",
    );
  } finally {
    await session.close();
  }
});

test("residual regularity is computed over nontrivial residue extensions", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.local_polygons import analyze_local_polygons",
        "regular = analyze_local_polygons([3, 4, 5, 2, 1], 2).to_trace()",
        "irregular = analyze_local_polygons([5, 2, 3, 2, 1], 2).to_trace()",
        "[regular['dedekind']['modular_factors'][0]['factor'], " +
          "regular['predicted_index_exponent'], regular['regular'], " +
          "irregular['regular'], irregular['factor_traces'][0]" +
          "['residual_polynomials'][0]['coefficients']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[[1, 1, 1], 2, True, False, [[1, 0], [0, 0], [1, 0]]]",
    );
  } finally {
    await session.close();
  }
});

test("the local analysis module is ordinary CPython and trace serializable", () => {
  const source = [
    `import json,sys;sys.path.insert(0,${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.number_fields.local_polygons import analyze_local_polygons",
    "r=analyze_local_polygons([3,-1,5,1],2,6)",
    "print(json.dumps(r.to_trace(),sort_keys=True,separators=(',',':')))",
  ].join(";");
  const output = execFileSync(python, ["-c", source], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  const trace = JSON.parse(output);
  assert.equal(trace.status, "regular-enlargement");
  assert.equal(trace.predicted_index_exponent, 3);
  assert.equal(trace.enlargement_lattice.basis_denominator, 4);
  assert.equal(trace.source.license, "BSD-2-Clause");
});

test("local analysis has a bounded deterministic moderate-degree path", () => {
  const source = [
    `import sys,time;sys.path.insert(0,${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.number_fields.local_polygons import analyze_local_polygons",
    "f=[4,2]+[0]*30+[1]",
    "start=time.perf_counter()",
    "results=[analyze_local_polygons(f,2).status for _ in range(20)]",
    "print(time.perf_counter()-start, len(results))",
  ].join(";");
  const output = execFileSync(python, ["-c", source], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 10_000,
  });
  const elapsed = Number(output.trim().split(/\s+/)[0]);
  // This is a regression ceiling, not a competitive benchmark: it prevents
  // reintroducing projective enumeration or trial division up to p.
  assert.ok(elapsed < 2.0, `20 degree-32 analyses took ${elapsed}s`);
});
