"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Dirichlet and character modular-symbol APIs work in script mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dirichlet-test-"));
  const filename = join(directory, "script.sage");
  try {
    writeFileSync(
      filename,
      [
        "G = DirichletGroup(13)",
        "e = G.gen()^2",
        "M = ModularSymbols(e, 2, sign=1)",
        "print([G.gen().order(), CyclotomicField(5).gen().minpoly(),",
        "       M.dimension(), M.hecke_matrix(2).trace().minpoly()])",
        "",
      ].join("\n"),
    );
    const result = spawnSync(
      process.execPath,
      [join(__dirname, "..", "bin", "sagejs"), filename],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      "[12, x^4 + x^3 + x^2 + x + 1, 3, x^2 - 6*x + 12]",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FLINT-backed Dirichlet groups match the guided tour", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(12)\n" +
            "[G, G.list(), G.gens(), len(G), G.unit_gens()]",
        )
      ).repr,
      "[Group of Dirichlet characters modulo 12 with values in " +
        "Cyclotomic Field of order 2 and degree 1, " +
        "[Dirichlet character modulo 12 of conductor 1 mapping " +
        "7 |--> 1, 5 |--> 1, " +
        "Dirichlet character modulo 12 of conductor 4 mapping " +
        "7 |--> -1, 5 |--> 1, " +
        "Dirichlet character modulo 12 of conductor 3 mapping " +
        "7 |--> 1, 5 |--> -1, " +
        "Dirichlet character modulo 12 of conductor 12 mapping " +
        "7 |--> -1, 5 |--> -1], " +
        "(Dirichlet character modulo 12 of conductor 4 mapping " +
        "7 |--> -1, 5 |--> 1, " +
        "Dirichlet character modulo 12 of conductor 3 mapping " +
        "7 |--> 1, 5 |--> -1), 4, (7, 5)]",
    );

    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(21)\n" +
            "chi = G.1\n" +
            "[chi, chi.values(), chi.conductor(), chi.modulus(), " +
            "chi.order(), chi(19), chi(40)]",
        )
      ).repr,
      "[Dirichlet character modulo 21 of conductor 7 mapping " +
        "8 |--> 1, 10 |--> zeta6, " +
        "[0, 1, zeta6 - 1, 0, -zeta6, -zeta6 + 1, 0, 0, 1, " +
        "0, zeta6, -zeta6, 0, -1, 0, 0, zeta6 - 1, zeta6, 0, " +
        "-zeta6 + 1, -1], 7, 21, 6, -zeta6 + 1, -zeta6 + 1]",
    );

    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(21)\n" +
            "chi = G.1\n" +
            "[chi.galois_orbit(), " +
            "[len(orbit) for orbit in G.galois_orbits()], " +
            "G.decomposition()]",
        )
      ).repr,
      "[[Dirichlet character modulo 21 of conductor 7 mapping " +
        "8 |--> 1, 10 |--> -zeta6 + 1, " +
        "Dirichlet character modulo 21 of conductor 7 mapping " +
        "8 |--> 1, 10 |--> zeta6], " +
        "[1, 2, 2, 1, 1, 2, 2, 1], " +
        "[Group of Dirichlet characters modulo 3 with values in " +
        "Cyclotomic Field of order 6 and degree 2, " +
        "Group of Dirichlet characters modulo 7 with values in " +
        "Cyclotomic Field of order 6 and degree 2]]",
    );
  } finally {
    await session.close();
  }
});

test("Dirichlet character arithmetic and exact values stay native", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(20)\n" +
            "a,b = G.gens()\n" +
            "K = CyclotomicField(4)\n" +
            "[(a*b)(17), b^2, (b^4).is_principal(), " +
            "a.is_real(), b.is_real(), " +
            "G.zeta().minpoly(), G.zeta().n(), " +
            "K(1).multiplicative_order(), " +
            "K(-1).multiplicative_order(), K(0)^0]",
        )
      ).repr,
      "[zeta4, Dirichlet character modulo 20 of conductor 5 mapping " +
        "11 |--> 1, 17 |--> -1, True, True, False, " +
        "x^2 + 1, 1.00000000000000*I, 1, 2, 1]",
    );
  } finally {
    await session.close();
  }
});

test("Dirichlet character sums are exact with precision-aware numerics", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(5)\n" +
            "chi = G.0\n" +
            "g = chi.gauss_sum()\n" +
            "[g.minpoly(), g.degree(), chi.jacobi_sum(chi), " +
            "chi.gauss_sum_numerical(100).parent(), " +
            "chi.root_number(100).parent()]",
        )
      ).repr,
      "[x^8 + 30*x^4 + 625, 8, -2*I - 1, " +
        "Complex Field with 100 bits of precision, " +
        "Complex Field with 100 bits of precision]",
    );

    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(5)\n" +
            "chi = G.0\n" +
            "z = chi.gauss_sum_numerical(a=2)\n" +
            "[round(float(z.real()), 12), " +
            "round(float(z.imag()), 12)]",
        )
      ).repr,
      "[1.90211303259, 1.175570504585]",
    );
  } finally {
    await session.close();
  }
});

test("Dirichlet L-functions agree with Sage values and derivatives", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(5)\n" +
            "chi = G.0\n" +
            "L = chi.lfunction()\n" +
            "[L(2), L.derivative(2), L.derivative(2, 2), " +
            "L.precision()]",
        )
      ).repr,
      "[0.958716122716883 + 0.145565876785090*I, " +
        "0.0505097931323040 - 0.0628837125364825*I, " +
        "-0.0591413218047955 + 0.00611865758282376*I, 53]",
    );
  } finally {
    await session.close();
  }
});

test("generalized Bernoulli numbers agree exactly with Sage", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G = DirichletGroup(5)\n" +
            "chi = G.0\n" +
            "[chi.bernoulli(k) for k in range(8)]",
        )
      ).repr,
      "[0, -1/5*I - 3/5, 0, 6/5*I + 12/5, 0, " +
        "-86/5*I - 148/5, 0, 2366/5*I + 3892/5]",
    );
  } finally {
    await session.close();
  }
});

test("Kronecker symbols vanish for a shared factor of two", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[kronecker(-8, 4), kronecker(-20, 4), " +
            "kronecker(5, 8), kronecker(-3, 8)]",
        )
      ).repr,
      "[0, 0, -1, -1]",
    );
  } finally {
    await session.close();
  }
});
