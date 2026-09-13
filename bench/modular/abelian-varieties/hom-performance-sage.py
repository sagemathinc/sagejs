"""Sage complete End basis, followed by an untimed exact homology oracle."""

import json
import sys
import time
from sage.all import J0, Hom, ModularSymbols
from sage.env import SAGE_VERSION

level = int(sys.argv[1])
start = time.perf_counter()
J = J0(level)
H = Hom(J, J)
generators = H.gens()
done = time.perf_counter()
M = ModularSymbols(level, 2)
symbols = [M.manin_symbols()[i] for i in M.manin_basis()]
print(
    json.dumps(
        {
            "system": "Sage",
            "version": SAGE_VERSION,
            "level": level,
            "dimension": int(J.dimension()),
            "rank": len(generators),
            "seconds": done - start,
            "oracle": {
                "lifts": [[int(x) for x in s.lift_to_sl2z()] for s in symbols],
                "coordinates": [[str(x) for x in M(s).element()] for s in symbols],
                "integral": [
                    [str(x) for x in row]
                    for row in M.cuspidal_submodule()
                    .integral_structure()
                    .basis_matrix()
                ],
                "matrices": [
                    [[str(x) for x in row] for row in f.matrix()] for f in generators
                ],
            },
        }
    ),
    flush=True,
)
