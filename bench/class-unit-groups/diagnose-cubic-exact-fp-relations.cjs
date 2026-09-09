"use strict";
// PARI exact-arithmetic forensic oracle. Not the production admission rule,
// independent Sage.js replay, a completeness certificate, or a timing receipt.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const matrix = a => `[${[0, 1, 2].map(i => a.slice(3 * i, 3 * i + 3).join(",")).join(";")}]`;
const vector = a => `[${a.join(",")}]`;

function main() {
  const [capturePath, geometryPath, gp, orderText, ...extra] = process.argv.slice(2);
  assert.ok(capturePath && geometryPath && gp && orderText && !extra.length);
  const raw = fs.readFileSync(capturePath), geoRaw = fs.readFileSync(geometryPath);
  const capture = JSON.parse(raw), geometry = JSON.parse(geoRaw);
  assert.equal(geometry.schema, "sagejs.diagnostic/exact-cubic-fp-v1");
  assert.equal(geometry.capture_sha256, hash(raw));
  assert.equal(capture.records.length, 1);
  const r = capture.records[0], plans = geometry.records[0].plans;
  assert.equal(geometry.records[0].captured_source_sha256, r.sourceSha256);
  assert.deepEqual(r.basis, ["1", "0", "0", "0", "1", "0", "0", "0", "1"]);
  for (const values of [r.coefficients, ...r.transcripts, r.analysis])
    for (const value of values) assert.match(value, /^-?\d+$/);
  const n = Number(r.output[50]), order = orderText.split(",").map(Number);
  assert.ok(n > 0 && n <= 12);
  assert.ok(order.length && new Set(order).size === order.length);
  for (const i of order) assert.ok(Number.isInteger(i) && i >= 0 && i < n);
  let source = `f=Polrev(${vector(r.coefficients)});nf=nfinit(f);if(nf.disc!=poldisc(f),error("diagnostic requires maximal power basis"));T=matrix(3,3,i,j,nfalgtobasis(nf,x^(j-1))[i]);P=vector(${n});\n`;
  for (let i = 0; i < n; i++) source += `P[${i + 1}]=idealhnf(nf,T*${matrix(r.transcripts[0].slice(9 * i, 9 * i + 9))}~);\n`;
  const rational = [];
  for (let i = 0; i < Number(r.output[51]); i++) {
    const a = r.transcripts[2].slice(3 * i, 3 * i + 3);
    if (a[1] !== "0" || a[2] !== "0") break;
    rational.push(a);
  }
  assert.ok(rational.length);
  source += `relation(a)={my(fac=idealfactor(nf,a),v=vector(${n}),ok=1,J=idealhnf(nf,1));for(i=1,matsize(fac)[1],my(found=0);for(j=1,${n},if(idealhnf(nf,fac[i,1])==P[j],v[j]=fac[i,2];found=1;break));if(!found,ok=0;break));if(!ok,return([]));for(j=1,${n},J=idealmul(nf,J,idealpow(nf,P[j],v[j])));if(J!=idealhnf(nf,a),error("principal relation failed"));v};\n`;
  const streams = [];
  for (const policy of ["initial", "fourfold", "volume-T478"]) {
    source += `A=List();V=List();seen=Map();\n`;
    for (const a of rational) source += `a=Mod(Polrev(${vector(a)}),f);v=relation(a);if(#v!=${n},error("rational relation failed"));listput(A,a);listput(V,v);mapput(seen,lift(a),1);\n`;
    for (const ideal of order) {
      const plan = plans.find(p => p.ideal_index === ideal);
      assert.ok(plan);
      const points = plan.policies.find(p => p.policy === policy).points;
      const u = r.analysis.slice(272 + 9 * ideal, 281 + 9 * ideal).map(BigInt);
      const h = r.transcripts[0].slice(9 * ideal, 9 * ideal + 9).map(BigInt);
      source += `if(abs(matdet(${matrix(u)}))!=1,error("plan is not unimodular"));\n`;
      const generators = [];
      for (const x of points) {
        assert.ok(x.length === 3 && x.every(Number.isSafeInteger));
        let a = x.map(BigInt);
        for (const m of [u, h]) a = [0, 1, 2].map(j => a.reduce((s, v, i) => s + v * m[3 * i + j], 0n));
        if (a[1] === 0n && a[2] === 0n) continue;
        const content = a.reduce(gcd, 0n);
        a = a.map(v => v / content);
        // Sign normalization is a diagnostic duplicate policy, not production's.
        if (a.findLast(v => v !== 0n) < 0n) a = a.map(v => -v);
        generators.push(a.map(String));
        if (generators.length === 500) break;
      }
      streams.push({ policy, ideal, generators });
      source += `C=[${generators.map(vector).join(",")}];used=0;tries=0;if(#A<${n + 6},for(k=1,#C,tries++;a=Mod(Polrev(C[k]),f);if(mapisdefined(seen,lift(a)),next);v=relation(a);if(!#v,next);mapput(seen,lift(a),1);listput(A,a);listput(V,v);used++;if(used==4||#A==${n + 6},break)));\n`;
      source += `M=matrix(#V,${n},i,j,V[i][j]);K=matkerint(M~);nontrivial=0;witness=0;for(j=1,matsize(K)[2],u=prod(i=1,#A,A[i]^K[i,j]);if(abs(norm(u))!=1,error("kernel product is not a unit"));if(u!=1&&u!= -1,nontrivial=1;witness=lift(u);break));H=mathnf(M~);index=if(matrank(M)==${n},abs(matdet(H)),0);print("${policy} ",${ideal}," ",[tries,used,#A,matrank(M),index,nontrivial]," unit=",witness);\n`;
    }
  }
  source += "quit;\n";
  const result = spawnSync(gp, ["-fq"], { input: source, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "");
  assert.equal(result.stdout.trim().split("\n").length, 3 * order.length);
  console.log(JSON.stringify({ diagnostic_only: true, independent_exact_replay: false,
    capture_sha256: hash(raw), geometry_sha256: hash(geoRaw), driver_sha256: hash(fs.readFileSync(__filename)),
    policy: "up to 500 primitive nonscalar proposals and 4 distinct smooth generators per ideal; stop at factor_count+6 rows; no modular rank admission or final certification",
    order, streams, gp_source: source, stdout: result.stdout }, null, 2));
}
if (require.main === module) main();
