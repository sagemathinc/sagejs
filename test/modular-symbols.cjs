"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("level one and Gamma0(11) modular-symbol Hecke models", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(1, 12)",
            "[M.basis(), M.T(2).matrix(), M.T(2).charpoly(), " +
              "M.T(11).charpoly().factor()]",
          ].join("\n"),
        )
      ).repr,
      "[([X^8*Y^2,(0,0)], [X^9*Y,(0,0)], [X^10,(0,0)]), " +
        "[ -24    0    0]\n[   0  -24    0]\n[4860    0 2049], " +
        "x^3 - 2001*x^2 - 97776*x - 1180224, " +
        "(x - 285311670612) * (x - 534612)^2]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11)",
            "[M.basis(), M.weight(), M.sign(), " +
              "[M.T(p).matrix() for p in [2,3,5]]]",
          ].join("\n"),
        )
      ).repr,
      "[((1,0), (1,8), (1,9)), 2, 0, " +
        "[[ 3  0 -1]\n[ 0 -2  0]\n[ 0  0 -2], " +
        "[ 4  0 -1]\n[ 0 -1  0]\n[ 0  0 -1], " +
        "[ 6  0 -1]\n[ 0  1  0]\n[ 0  0  1]]]",
    );
  } finally {
    await session.close();
  }
});

test("Gamma1 and character cuspidal modular-symbol models", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(Gamma1(11), 2)",
            "S = M.cuspidal_submodule()",
            "[M.dimension(), M.T(2).charpoly().factor(), " +
              "S.T(2).matrix(), S.q_expansion_basis(10)]",
          ].join("\n"),
        )
      ).repr,
      "[11, (x - 3) * (x + 2)^2 * " +
        "(x^4 - 7*x^3 + 19*x^2 - 23*x + 11) * " +
        "(x^4 - 2*x^3 + 4*x^2 + 2*x + 11), " +
        "[-2  0]\n[ 0 -2], " +
        "[q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 " +
        "- 2*q^9 + O(q^10)]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "e = DirichletGroup(13).0^2",
            "S = ModularSymbols(e, 2).cuspidal_submodule()",
            "[S.dimension(), S.T(2).charpoly().factor(), " +
              "S.q_expansion_basis(10)]",
          ].join("\n"),
        )
      ).repr,
      "[2, (x + zeta6 + 1)^2, " +
        "[q + (-zeta6 - 1)*q^2 + (2*zeta6 - 2)*q^3 + zeta6*q^4 " +
        "+ (-2*zeta6 + 1)*q^5 + (-2*zeta6 + 4)*q^6 " +
        "+ (2*zeta6 - 1)*q^8 - zeta6*q^9 + O(q^10)]]",
    );
  } finally {
    await session.close();
  }
});
