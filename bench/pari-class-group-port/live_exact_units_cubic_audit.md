# Single-call live exact real-cubic units

This component removes the fixture/oracle boundary from exact algebraic unit
reconstruction for the authentic 73-relation cubic run.

Its five inputs are all live resident owners:

1. 73 exact principal-relation generators in the integral basis;
2. the 73-by-73 sparse-cleanup transform;
3. the 15-by-15 active HNF transform;
4. the 2-by-7 selected unit-lattice/getfu provenance; and
5. the prepared cubic multiplication tensor.

One call composes the first seven HNF-kernel columns back to all 73 raw
relations, reconstructs the seven kernel factors with exact rational cubic
arithmetic, composes the selected two unit words, and reconstructs each unit a
second time directly from the raw relations. Publication occurs only when the
direct and factored routes agree and every factor/unit has norm `+/-1`.

The focused checker obtains the 2-by-7 map by running unit-lattice preparation
on the resident `hnf_result_c`, `accept_relations`, and regulator owners. It
does not read the unit bridge fixture, compact result fixture, regulator
fixture, high-precision PARI logs, or expected exact units. The returned units
have integral-basis coordinate bit sizes 1,245 and 2,115, norms `-1`, and retained relation
words with 49 and 46 nonzero entries. Both words independently cancel every
row of the resident factor-base relation matrix.

This establishes exact principality/correspondence for the selected units. It
does not prove unit saturation, regulator completeness, or a public unit-group
result. Those remain separate authorities.
