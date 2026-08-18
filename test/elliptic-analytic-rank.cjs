"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("probable analytic rank and raw leading derivatives match independent oracles", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "fixtures = [",
        " ([0,-1,1,-10,-20], 0, 0.253841860855911),",
        " ([0,0,1,-1,0], 1, 0.305999773834052),",
        " ([0,1,1,-2,0], 2, 1.51863300057685),",
        " ([0,0,1,-7,6], 3, 10.3910994007158),",
        " ([1,-1,0,-79,289], 4, 214.652337501621),",
        " ([0,0,1,-79,342], 5, 3634.28250646374201),",
        " ([2,3,1,4,50], 2, 14.7552475203803),",
        "]",
        "observed = []",
        "for ainvs, rank, leading in fixtures:",
        "    E = EllipticCurve(ainvs)",
        "    got_rank, got_leading = E.analytic_rank(leading_coefficient=True, prec=64)",
        "    observed.append((got_rank == rank, abs(got_leading-leading) < 1e-10))",
        "observed",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "[(True, True), (True, True), (True, True), (True, True), " +
        "(True, True), (True, True), (True, True)]",
    );
  } finally {
    await session.close();
  }
});

test("global root numbers enforce the analytic-rank parity", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[EllipticCurve([0,-1,1,-10,-20]).root_number(), " +
            "EllipticCurve([0,0,1,-1,0]).root_number()]",
        )
      ).repr,
      "[1, -1]",
    );
    await assert.rejects(
      session.evaluate("EllipticCurve(GF(5), [0,0,1,-1,0]).root_number()"),
      /only implemented over QQ/,
    );
  } finally {
    await session.close();
  }
});

test("rank decisions use completed derivatives while returning raw L derivatives", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E0 = EllipticCurve([0,-1,1,-10,-20])",
            "E1 = EllipticCurve([0,0,1,-1,0])",
            "D0 = E0._analytic_rank_result('reference', 64)['runs'][-1]",
            "D1 = E1._analytic_rank_result('reference', 64)['runs'][-1]",
            "[D0['completed_derivatives'][1] == '0.0',",
            " abs(float(D0['derivatives'][1])-0.3087085340) < 1e-9,",
            " D1['completed_derivatives'][2] == '0.0',",
            " abs(float(D1['derivatives'][2])-0.3730955945) < 1e-9,",
            " D0['coefficient_prefix_extensions'] == 1,",
            " D1['coefficient_prefix_extensions'] == 1]",
          ].join("\n"),
          { timeout: 60_000 },
        )
      ).repr,
      "[True, True, True, True, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("native diagnostics account for variable-grid coefficient omissions", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([2,3,1,4,50])",
            "D = E._analytic_rank_result('native', 64)['runs'][-1]",
            "tail = float(D['tail_bound'])",
            "pieces = float(D['coefficient_tail_bound']) + float(D['grid_omission_bound'])",
            "[D['coefficient_terms'] < D['cutoff']*D['grid_points'],",
            " D['grid_omission_bound'] > '0',",
            " abs(tail-pieces) <= 1e-12*max(1.0, abs(tail))]",
          ].join("\n"),
          { timeout: 30_000 },
        )
      ).repr,
      "[True, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("zero sums give a separate GRH-conditional parity-adjusted upper bound", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "curves = [",
            " [0,-1,1,-10,-20], [0,0,1,-1,0], [0,1,1,-2,0],",
            " [0,0,1,-7,6], [1,-1,0,-79,289]",
            "]",
            "[EllipticCurve(a).analytic_rank_upper_bound(Delta=1, adaptive=False) for a in curves]",
          ].join("\n"),
          { timeout: 60_000 },
        )
      ).repr,
      "[0, 1, 2, 3, 4]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([0,-1,0,-7460362000712,-7842981500851012704])",
            "E.analytic_rank_upper_bound(Delta=1, adaptive=False)",
          ].join("\n"),
          { timeout: 60_000 },
        )
      ).repr,
      "2",
    );
  } finally {
    await session.close();
  }
});

test("analytic-rank API documents probability and rejects unsupported modes", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([0,-1,1,-10,-20])",
            "['probably' in E.analytic_rank.__doc__,",
            " 'does not in general prove' in E.analytic_rank.__doc__,",
            " 'Generalized Riemann Hypothesis' in E.analytic_rank_upper_bound.__doc__,",
            " E.analytic_rank() == E.analytic_rank()]",
          ].join("\n"),
          { timeout: 30_000 },
        )
      ).repr,
      "[True, True, True, True]",
    );
    await assert.rejects(
      session.evaluate("EllipticCurve([0,-1,1,-10,-20]).analytic_rank('pari')"),
      /does not ship the external pari analytic-rank backend/,
    );
    await assert.rejects(
      session.evaluate("EllipticCurve([0,-1,1,-10,-20]).analytic_rank(prec=20)"),
      /precision must be at least 32 bits/,
    );
    await assert.rejects(
      session.evaluate("EllipticCurve(GF(5), [0,0,1,-1,0]).analytic_rank()"),
      /only implemented over QQ/,
    );
    await assert.rejects(
      session.evaluate(
        [
          'M = __import__("sagejs.elliptic_curves.analytic_rank", fromlist=["probable_analytic_rank"])',
          "E = EllipticCurve([0,1,1,-2,0])",
          'M.probable_analytic_rank(E, E.root_number(), 64, 0, "native")',
        ].join("\n"),
      ),
      /no central derivative separated stably from zero/,
    );
  } finally {
    await session.close();
  }
});
