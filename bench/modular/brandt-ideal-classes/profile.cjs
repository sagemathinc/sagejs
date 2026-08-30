#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { createSage } = require("../../../dist/tools/kernel.js");

const root = path.resolve(__dirname, "../../..");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value === undefined ? fallback : value.slice(prefix.length);
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

async function main() {
  const casesText = option("cases", "11:2:3,37:2:3");
  const cases = casesText.split(",").map((entry) =>
    entry.split(":").map((value) => Number(value))
  );
  const session = await createSage();
  let records;
  try {
    const source = [
      "import json, time",
      "import sagejs.quaternion_algebras.ideals as qi",
      "import sagejs.quaternion_algebras.class_set as qc",
      "import sagejs.quaternion_algebras.algebra as qa",
      "import sagejs.modular_forms.brandt as bm",
      "stats={}",
      "stack=[]",
      "def enter(label):",
      "    token=[label,time.perf_counter(),0.0]",
      "    stack.append(token)",
      "    return token",
      "def leave(token):",
      "    elapsed=time.perf_counter()-token[1]",
      "    if stack[-1] is not token: raise RuntimeError('Brandt profiler stack mismatch')",
      "    stack.pop()",
      "    exclusive=elapsed-token[2]",
      "    if stack: stack[-1][2]+=elapsed",
      "    row=stats.get(token[0],[0,0.0,0.0])",
      "    row[0]+=1; row[1]+=elapsed; row[2]+=exclusive",
      "    stats[token[0]]=row",
      "def patch(owner,name,label):",
      "    original=getattr(owner,name)",
      "    def measured(*args,**kwargs):",
      "        token=enter(label)",
      "        try: return original(*args,**kwargs)",
      "        finally: leave(token)",
      "    setattr(owner,name,measured)",
      "for owner,name,label in [",
      "    (qi,'_canonical_lattice','lattice_canonicalization'),",
      "    (qi,'_try_flint_gram_lll_transform','gram_lll_flint'),",
      "    (qi._LatticeNormPlan,'__init__','norm_plan_setup'),",
      "    (qi,'_try_native_theta_counts','native_theta'),",
      "    (qi,'_try_native_vectors_of_norm','native_exact_vectors'),",
      "    (qi.QuaternionRightIdeal,'__init__','ideal_construction'),",
      "    (qi.QuaternionRightIdeal,'theta_series_vector','theta_series'),",
      "    (qi.QuaternionRightIdeal,'unit_weight','unit_weight'),",
      "    (qi.QuaternionRightIdeal,'is_equivalent','ideal_equivalence'),",
      "    (qi.QuaternionRightIdeal,'cyclic_right_subideals','neighbors'),",
      "    (qa.RationalQuaternionAlgebra,'order_with_level','eichler_order'),",
      "    (qc.EichlerIdealClassSet,'_classify_in','classify'),",
      "    (qc.EichlerIdealClassSet,'_enumerate','class_enumeration'),",
      "    (qc.EichlerIdealClassSet,'_direct_hecke_matrix','direct_operator'),",
      "    (qc.EichlerIdealClassSet,'_ideal_product_plans','brandt_product_plans'),",
      "    (qc.EichlerIdealClassSet,'_brandt_series_hecke_matrix','brandt_series_operator')",
      "    ,(bm.BrandtModule_class,'__init__','module_construction_and_jl_oracle')",
      "    ,(bm.BrandtModule_class,'hecke_operator','public_hecke_and_oracles')",
      "]:",
      "    patch(owner,name,label)",
      `cases=${JSON.stringify(cases)}`,
      "records=[]",
      "for D,N,ell in cases:",
      "    stats.clear(); stack.clear()",
      "    started=time.perf_counter()",
      "    B=BrandtModule(D,N,realization='ideal-classes',use_cache=False)",
      "    construction=time.perf_counter()-started",
      "    started=time.perf_counter()",
      "    direct=B.hecke_matrix(ell,algorithm='direct')",
      "    direct_seconds=time.perf_counter()-started",
      "    started=time.perf_counter()",
      "    series=B.hecke_matrix(ell,algorithm='brandt-series')",
      "    series_seconds=time.perf_counter()-started",
      "    if series != direct: raise ArithmeticError('Brandt algorithms disagree')",
      "    named=sum(row[2] for row in stats.values())",
      "    primary=construction+direct_seconds+series_seconds",
      "    records.append({'D':D,'N':N,'ell':ell,'dimension':B.dimension(),",
      "      'construction_seconds':str(construction),'direct_seconds':str(direct_seconds),",
      "      'brandt_series_seconds':str(series_seconds),'primary_seconds':str(primary),",
      "      'named_exclusive_seconds':str(named),'named_fraction':str(named/primary),",
      "      'stages':{label:{'calls':row[0],'inclusive_seconds':str(row[1]),",
      "        'exclusive_seconds':str(row[2])} for label,row in stats.items()},",
      "      'matrix_rows':[[str(value) for value in row] for row in direct.rows()],",
      "      'mass_verified':B.mass_certificate().verify()})",
      "json.dumps(records)",
    ].join("\n");
    const result = await session.evaluate(source);
    records = JSON.parse(result.repr.slice(1, -1));
  } finally {
    await session.close();
  }
  const memory = process.memoryUsage();
  const receipt = {
    schema: "sagejs.brandt-ideal-classes-stage-profile.v1",
    recorded_at: new Date().toISOString(),
    source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    profiler_sha256: sha256(__filename),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cases,
    memory: {
      rss_bytes: memory.rss,
      heap_total_bytes: memory.heapTotal,
      heap_used_bytes: memory.heapUsed,
      external_bytes: memory.external,
      array_buffers_bytes: memory.arrayBuffers,
    },
    records,
  };
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const output = option("output", "");
  if (output !== "") fs.writeFileSync(path.resolve(output), serialized);
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
