"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");
const level = Number(process.argv[2]);
const workload = process.argv[3];

async function main() {
  const session = await createSage();
  async function evaluate(source) {
    return (await session.evaluate(source)).stdout.trim();
  }
  async function timed(phase, source) {
    const start = performance.now();
    await evaluate(source);
    console.log(JSON.stringify({ phase, seconds: (performance.now() - start) / 1000 }));
  }
  async function data(expression) {
    console.log(await evaluate(`print(json.dumps(${expression}))`));
  }
  try {
    await evaluate("import json; warm=J0(11); warm.lattice().basis_matrix(); warm.integral_homology().hecke_matrix(2); [f.lattice().basis_matrix() for f in warm.decomposition()]");
    console.log(JSON.stringify({ system: "Sage.js", level, workload, node: process.version, backend: "native-default" }));
    await evaluate(`J=J0(${level})`);
    if (workload === "pipeline") {
      await timed("integral_homology", "J.lattice().basis_matrix()");
      await timed("hecke2", "T=J.integral_homology().hecke_matrix(2)");
      await data("{'hecke2_coefficients': [str(x) for x in T.charpoly().list()]}");
    }
    if (["pipeline", "decomposition"].includes(workload)) {
      await timed("decomposition", "factors=J.decomposition()");
      await timed("factor_lattices", "[f.lattice().basis_matrix() for f in factors]");
      await data("{'dimension': J.dimension(), 'factors': sorted(f.dimension() for f in factors)}");
    } else if (workload === "quotient") {
      await timed("select_newform", `f=min(CuspForms(${level},2).newforms(),key=lambda g:g.defining_polynomial().degree())`);
      await timed("connected_quotient", "Q=AbelianVariety(f); Q.lattice().basis_matrix(); q=Q.quotient_map(); q.matrix()");
      await data("{'dimension': Q.dimension(), 'map_shape': [q.matrix().nrows(),q.matrix().ncols()], 'hecke2_coefficients': [str(x) for x in Q.integral_homology().hecke_matrix(2).charpoly().list()]}");
    } else throw new Error("unknown workload");
  } finally {
    session.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
