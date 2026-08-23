"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "prepared genus-3 theta recurrence agrees with direct lattice summation",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "import sagejs.hyperelliptic_curves.genus3_heights as heights",
          "from mpmath import mp",
          "def direct_theta(z, tau, radius):",
          "    a = [mp.mpf('0.5') for _index in range(3)]",
          "    b = [mp.mpf(3-index)/2 for index in range(3)]",
          "    terms = []",
          "    for n0 in range(-radius, radius+1):",
          "        for n1 in range(-radius, radius+1):",
          "            for n2 in range(-radius, radius+1):",
          "                shifted = [n0+a[0], n1+a[1], n2+a[2]]",
          "                quadratic = mp.mpc(0)",
          "                for row in range(3):",
          "                    for column in range(3):",
          "                        quadratic += shifted[row]*tau[row][column]*shifted[column]",
          "                linear = sum(shifted[index]*(z[index]+b[index]) for index in range(3))",
          "                terms.append(mp.exp(mp.pi*mp.j*quadratic+2*mp.pi*mp.j*linear))",
          "    return mp.fsum(terms)",
          "with mp.workprec(112):",
          "    tau = [[mp.mpc(0,1),mp.mpc('0.01','0.02'),mp.mpc('-0.02','0.01')],",
          "           [mp.mpc('0.01','0.02'),mp.mpc(0,'1.2'),mp.mpc('0.015','-0.01')],",
          "           [mp.mpc('-0.02','0.01'),mp.mpc('0.015','-0.01'),mp.mpc(0,'1.4')]]",
          "    z = [mp.mpc('0.12','0.07'),mp.mpc('-0.05','0.03'),mp.mpc('0.09','-0.04')]",
          "    coarse = direct_theta(z, tau, 4)",
          "    fine = direct_theta(z, tau, 6)",
          "    first = heights.genus3_theta(z, tau, prec=80, radius=4)",
          "    warm = heights.genus3_theta(z, tau, prec=80, radius=4)",
          "    first_data = first.to_dict()",
          "    warm_data = warm.to_dict()",
          "    answer = (",
          "        abs(first.value-fine) < mp.mpf('1e-25'),",
          "        abs(first.refinement_difference-abs(fine-coarse)) < mp.mpf('1e-25'),",
          "        first_data['algorithm'],",
          "        first_data['terms'],",
          "        first_data['exponential_evaluations'],",
          "        warm_data['plan_cache_hit'],",
          "        warm_data['exponential_evaluations'],",
          "        warm_data['terms'] >= 10*warm_data['exponential_evaluations'],",
          "        first.refinement_stable and warm.refinement_stable,",
          "        not first.rigorous and not warm.rigorous,",
          "    )",
          "answer",
        ].join("\n"),
        { timeout: 120_000 },
      );
      assert.equal(
        result.repr,
        "(True, True, 'prepared quadratic lattice with reanchored line recurrence', " +
          "2926, 509, True, 170, True, True, True)",
      );
    } finally {
      await session.close();
    }
  },
);
