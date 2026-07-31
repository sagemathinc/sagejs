"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

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
            "[(a*b)(17), b^2, (b^4).is_principal(), " +
            "a.is_real(), b.is_real(), " +
            "G.zeta().minpoly(), G.zeta().n()]",
        )
      ).repr,
      "[zeta4, Dirichlet character modulo 20 of conductor 5 mapping " +
        "11 |--> 1, 17 |--> -1, True, True, False, " +
        "x^2 + 1, 1.00000000000000*I]",
    );
  } finally {
    await session.close();
  }
});
