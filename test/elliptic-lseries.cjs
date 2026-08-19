"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("elliptic L-series evaluates the motivating complex value", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([1,2,3,4,999])",
        "L = E.lseries()",
        "z = L(1+I)",
        "[E.lseries() is L, L.elliptic_curve() is E, z.parent().precision() == 53,",
        " abs(float(z.real()) + 0.0053103195260299207) < 2e-13,",
        " abs(float(z.imag()) - 0.0990520277396781685) < 2e-13]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("elliptic L-series batch, completed values, and functional equation agree", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([0,-1,1,-10,-20])",
        "L = E.lseries()",
        "s = CC(0.5, 1)",
        "v = L.values([s, CC(1.5,-1)], prec=64)",
        "lam0 = L.completed_value(s, prec=64)",
        "lam1 = L.completed_value(2-s, prec=64)",
        "single = L.value(s, prec=64)",
        "pair = L.values([CC(1,2), CC(1,-2)], prec=64)",
        "pair_diagnostics = L.last_diagnostics()",
        "[abs(float((v[0]-single).real())) < 1e-15,",
        " abs(float((v[0]-single).imag())) < 1e-15,",
        " abs(float((lam0-E.root_number()*lam1).real())) < 1e-12,",
        " abs(float((lam0-E.root_number()*lam1).imag())) < 1e-12,",
        " pair[1].real() == pair[0].real() and pair[1].imag() == -pair[0].imag(),",
        " pair_diagnostics['conjugation_reconstructed'] == 1]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("elliptic L-series handles trivial zeros and explicit algorithms", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([0,-1,1,-10,-20])",
        "L = E.lseries()",
        "zeros = [L.value(s, prec=64, algorithm='native') for s in [0,-1,-2]]",
        "reference = L.value(CC(1,1), prec=64, algorithm='reference')",
        "native = L.value(CC(1,1), prec=64, algorithm='native')",
        "odd = EllipticCurve([0,0,1,-1,0]).lseries().value(1, prec=64, algorithm='native')",
        "near = L.value(CC(-1 + 2^(-20),0), prec=64, algorithm='native')",
        "[all(abs(float(z.real())) < 1e-15 and abs(float(z.imag())) < 1e-15 for z in zeros),",
        " abs(float((reference-native).real())) < 1e-12,",
        " abs(float((reference-native).imag())) < 1e-12,",
        " abs(float(odd.real())) < 1e-15 and abs(float(odd.imag())) < 1e-15,",
        " abs(float(near.real())) > 1e-10]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
    await assert.rejects(
      session.evaluate(
        "EllipticCurve([0,-1,1,-10,-20]).lseries().value(1, algorithm='pari')",
      ),
      /algorithm must be.*auto.*native.*reference/,
    );
  } finally {
    await session.close();
  }
});

test("elliptic L-series routes far right and preserves large batch order", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([1,2,3,4,999])",
        "L = E.lseries()",
        "far = L(10+I)",
        "far64 = L.value(10+I, prec=64, algorithm='native')",
        "points = [10 + k/100*I for k in range(70)]",
        "batch = L.values(points)",
        "line = L.values_along_line(10, 10+I, 5)",
        "[abs(float(far.real()) - 1.0007510301635383) < 2e-13,",
        " abs(float(far.imag()) + 0.0006232463759930876) < 2e-13,",
        " abs(float(far64.real()) - 1.0007510301635383) < 2e-13,",
        " L.last_diagnostics()['algorithm'] == 'direct',",
        " len(batch) == 70 and len(L._value_cache_keys) <= 64,",
        " all(batch[k] == L.values([points[k]])[0] for k in [0,17,69]),",
        " len(line) == 5 and abs(line[0][0]-10) < 1e-15 and",
        " abs(line[-1][0]-CC(10,0.8)) < 1e-14]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("complex_plot uses adaptive regional L-series batches", async () => {
  const session = await createSage();
  try {
    const adaptive = await session.evaluate(
      [
        "E = EllipticCurve([1,2,3,4,999])",
        "L = E.lseries()",
        "cache_before = len(L._value_cache_keys)",
        "adaptive_plot = complex_plot(L,(0,2),(-4,4),plot_points=12,",
        "                             interpolation='nearest')",
        "cache_after = len(L._value_cache_keys)",
        "adaptive_plot",
      ].join("\n"),
      { timeout: 120_000 },
    );
    const forced = await session.evaluate(
      [
        "forced_plot = complex_plot(L,(0,2),(-4,4),plot_points=12,",
        "                           plot_precision=53,interpolation='nearest')",
        "forced_plot",
      ].join("\n"),
      { timeout: 120_000 },
    );
    const adaptivePixels = adaptive.display?.data.data[0].z;
    const forcedPixels = forced.display?.data.data[0].z;
    assert.equal(adaptivePixels.length, 12);
    assert.equal(adaptivePixels[0].length, 12);
    let maximumChannelDifference = 0;
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          maximumChannelDifference = Math.max(
            maximumChannelDifference,
            Math.abs(
              adaptivePixels[row][column][channel] -
                forcedPixels[row][column][channel],
            ),
          );
        }
      }
    }
    assert.ok(maximumChannelDifference <= 1);
    const diagnostics = await session.evaluate(
      [
        "d = adaptive_plot._plot_spec_diagnostics[0]",
        "[d['provider'], d['pixel_count'], d['unstable_pixels'],",
        " d['accepted_by_precision']['16'], cache_before == cache_after]",
      ].join("\n"),
    );
    assert.equal(
      diagnostics.repr,
      "['private_plot_complex_batch', 144, 0, 144, True]",
    );
  } finally {
    await session.close();
  }
});

test("complex_plot prepares one packed grid above the ordinary native cap", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([0,-1,1,-10,-20])",
        "L = E.lseries()",
        "large_plot = complex_plot(L,(0,2),(-2,2),plot_points=142,",
        "                          interpolation='nearest')",
        "d = large_plot._plot_spec_diagnostics[0]",
        "run = d['runs'][0]",
        "[d['pixel_count'], d['unstable_pixels'], run['tile_count'],",
        " max(tile['point_count'] for tile in run['tiles']),",
        " run['evaluated_point_count'], run['conjugation_reconstructed'],",
        " run['packed_output'], run['prepared_grid_reused']]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "[20164, 0, 1, 10082, 10082, 10082, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("plot samples an elliptic L-series real axis in one packed batch", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([1,-1,0,-79,289])",
        "L = E.lseries()",
        "P = plot(L, 0, 2, plot_points=201, color='purple')",
        "Q = L.plot(-0.1, 2, plot_points=17)",
        "d = P._plot_spec_diagnostics[-1]",
        "[len(P), len(P[0]), len(Q[0]),",
        " abs(P[0][100][0]-1) < 1e-15, abs(P[0][100][1]) < 1e-10,",
        " P[0]._options['rgbcolor'] == 'purple',",
        " d['provider'], d['sample_count'], d['equally_spaced'],",
        " d['adaptive_sampling'], d['packed_output'],",
        " d['native_call_count'], d['prepared_grid_reused'],",
        " d['maximum_imaginary_part'] == 0]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "[1, 201, 17, True, True, True, 'private_plot_real_batch', 201, True, False, True, 2, True, True]",
    );
  } finally {
    await session.close();
  }
});
