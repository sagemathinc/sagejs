"use strict";

// Bounded external owner for the row-21 arbitrary-ideal map gap. PARI 2.17.4
// executes SPLIT transitively through bnfisprincipal and returns idealred's
// multiplier; ordinary Python independently replays all ideal equalities.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_SHA256 =
  "92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03";
const SCHEMA = "sagejs.pari-class-group/row21-arbitrary-ideal-map-owner-v1";
const REQUEST_SCHEMA =
  "sagejs.pari-class-group/row21-arbitrary-ideal-map-request-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function decimal(value, name) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  const integer = BigInt(value);
  assert.equal(integer.toString(), value, `${name} is not canonical`);
  assert(integer >= -(1n << 255n) && integer < (1n << 255n),
    `${name} exceeds 256 bits`);
  return value;
}

function normalizeRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["combinePairs", "ideals", "schema"]);
  assert.equal(request.schema, REQUEST_SCHEMA);
  assert(Array.isArray(request.ideals) && request.ideals.length >= 1 &&
    request.ideals.length <= 4);
  const ideals = request.ideals.map((ideal, index) => {
    assert.deepEqual(Object.keys(ideal).sort(), ["denominator", "numeratorHnf"]);
    assert(Array.isArray(ideal.numeratorHnf) && ideal.numeratorHnf.length === 25);
    const denominator = decimal(ideal.denominator, `ideal ${index} denominator`);
    assert(BigInt(denominator) > 0n);
    return { denominator,
      numeratorHnf: ideal.numeratorHnf.map((value, entry) =>
        decimal(value, `ideal ${index} entry ${entry}`)) };
  });
  assert(Array.isArray(request.combinePairs) && request.combinePairs.length <= 4);
  const combinePairs = request.combinePairs.map((pair, index) => {
    assert(Array.isArray(pair) && pair.length === 2, `combine pair ${index}`);
    assert(pair.every(value => Number.isSafeInteger(value) && value >= 0 &&
      value < ideals.length), `combine pair ${index}`);
    return [...pair];
  });
  return { schema: REQUEST_SCHEMA, ideals, combinePairs };
}

function matrixLiteral(entries) {
  return `[${Array.from({ length: 5 }, (_, row) =>
    entries.slice(5 * row, 5 * row + 5).join(",")).join(";")}]`;
}

function gpProgram(request) {
  const definitions = request.ideals.map((ideal, index) =>
    `id${index}=idealhnf(nf,${matrixLiteral(ideal.numeratorHnf)})/${ideal.denominator};`
  ).join("\n");
  const requests = request.ideals.map((_, index) =>
    `emit("request",${index},id${index});`).join("\n");
  const combines = request.combinePairs.map(([left, right], index) =>
    `emit("combine",${index},idealmul(nf,id${left},id${right}));`).join("\n");
  return String.raw`
default(parisize,536870912);
emitv(tag,v)={print1("SJ|",tag,"|");for(i=1,#v,if(i>1,print1(","));print1(v[i]));print();}
emitm(tag,M)={my(s=matsize(M));print1("SJ|",tag,"|");for(i=1,s[1],for(j=1,s[2],if(i>1||j>1,print1(","));print1(M[i,j])));print();}
emit(kind,idx,id)={my(nh,nd,nn,r,rh,rd,rn,rm,rmd,rmn,z,g,gd,gn,iv,ivd,ivn);nh=idealhnf(nf,id);nd=denominator(nh);nn=nh*nd;r=idealred(nf,[id,1]);rh=idealhnf(nf,r[1]);rd=denominator(rh);rn=rh*rd;rm=nfalgtobasis(nf,r[2]);rmd=denominator(rm);rmn=rm*rmd;z=bnfisprincipal(b,id,3);g=nfalgtobasis(nf,z[2]);gd=denominator(g);gn=g*gd;iv=nfalgtobasis(nf,nfeltdiv(nf,1,z[2]));ivd=denominator(iv);ivn=iv*ivd;print("SJ|BEGIN|",kind,"|",idx);emitv("CLASS",z[1]);emitm("NORMALIZED_NUM",nn);print("SJ|NORMALIZED_DEN|",nd);emitv("GEN_NUM",gn);print("SJ|GEN_DEN|",gd);emitm("REDUCED_NUM",rn);print("SJ|REDUCED_DEN|",rd);emitv("RED_MULT_NUM",rmn);print("SJ|RED_MULT_DEN|",rmd);emitv("IDENTITY_MULT_NUM",ivn);print("SJ|IDENTITY_MULT_DEN|",ivd);print("SJ|END");}
p=x^5-90*x^3-305*x^2+930*x+36;
b=bnfinit(p,1);nf=b.nf;
print("SJ|VERSION|",version());
${definitions}
${requests}
${combines}
quit();
`;
}

function parseGp(stdout) {
  const candidates = [];
  let current = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("SJ|")) continue;
    const [, tag, ...rest] = line.split("|");
    if (tag === "VERSION") {
      assert.equal(rest.join("|"), "[2, 17, 4]");
    } else if (tag === "BEGIN") {
      assert.equal(current, null);
      current = { kind: rest[0], index: Number(rest[1]) };
    } else if (tag === "END") {
      assert(current);
      candidates.push(current);
      current = null;
    } else {
      assert(current, `orphan GP evidence ${tag}`);
      const values = rest[0] === "" ? [] : rest[0].split(",");
      const scalar = name => { assert.equal(values.length, 1); current[name] = values[0]; };
      if (tag === "CLASS") current.classCoordinates = values;
      else if (tag === "NORMALIZED_NUM") current.normalizedNumeratorHnf = values;
      else if (tag === "NORMALIZED_DEN") scalar("normalizedDenominator");
      else if (tag === "GEN_NUM") current.principalGeneratorNumerator = values;
      else if (tag === "GEN_DEN") scalar("principalGeneratorDenominator");
      else if (tag === "REDUCED_NUM") current.reducedNumeratorHnf = values;
      else if (tag === "REDUCED_DEN") scalar("reducedDenominator");
      else if (tag === "RED_MULT_NUM") current.reductionMultiplierNumerator = values;
      else if (tag === "RED_MULT_DEN") scalar("reductionMultiplierDenominator");
      else if (tag === "IDENTITY_MULT_NUM") current.reductionToIdentityNumerator = values;
      else if (tag === "IDENTITY_MULT_DEN") scalar("reductionToIdentityDenominator");
      else assert.fail(`unknown GP evidence ${tag}`);
    }
  }
  assert.equal(current, null);
  return candidates;
}

function verify(source, request, candidates) {
  const program = String.raw`
import json,sys
from importlib import import_module
m=import_module('bench.pari-class-group-port.row21_arbitrary_ideal_maps')
x=json.load(sys.stdin);p=x['source']['payload'];q=x['request'];cs=x['candidates']
requests=[c for c in cs if c['kind']=='request']
combines=[c for c in cs if c['kind']=='combine']
out=[]
for i,c in enumerate(requests):out.append(m.verify_owner_candidate(p,q['ideals'][i],c))
for i,c in enumerate(combines):
 self_request={'numeratorHnf':c['normalizedNumeratorHnf'],'denominator':c['normalizedDenominator']}
 checked=m.verify_owner_candidate(p,self_request,c);a,b=q['combinePairs'][i]
 m.verify_combine(p,out[a],out[b],checked);out.append(checked)
json.dump(out,sys.stdout,sort_keys=True,separators=(',',':'))
`;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    encoding: "utf8", input: JSON.stringify({ source, request, candidates }),
    timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function run({ sourcePath, request, gp }) {
  const raw = zlib.gunzipSync(fs.readFileSync(sourcePath));
  assert.equal(sha(raw), SOURCE_SHA256, "row-21 source authority changed");
  const source = JSON.parse(raw);
  const normalized = normalizeRequest(request);
  const execution = spawnSync("prlimit", ["--as=1073741824", "--cpu=120", "--",
    gp, "-fq"], { encoding: "utf8", input: gpProgram(normalized), timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, LD_LIBRARY_PATH: path.dirname(gp) } });
  assert.equal(execution.status, 0, execution.stderr || String(execution.error));
  assert(!execution.stderr.split(/\r?\n/).some(line =>
    line.includes("***") && !line.includes("Warning")), execution.stderr);
  const candidates = parseGp(execution.stdout);
  assert.equal(candidates.length,
    normalized.ideals.length + normalized.combinePairs.length,
    `PARI evidence count changed; stdout=${JSON.stringify(execution.stdout)}`);
  const evidence = verify(source, normalized, candidates);
  return { schema: SCHEMA, sourceSha256: SOURCE_SHA256,
    requestSha256: sha(Buffer.from(JSON.stringify(normalized))),
    bounds: { ideals: 4, combinePairs: 4, coefficientBits: 256,
      addressSpaceBytes: 1073741824, cpuSeconds: 120, wallMilliseconds: 120000 },
    owner: { kind: "external-pari-2.17.4", splitExecutedTransitively: true,
      splitTapeRetained: false, idealredMultiplierRetained: true,
      denominatorEvidenceRetained: true },
    maps: { factor: true, reduce: true, combine: true },
    arbitraryIdealMap: true, nativeMap: false, evidence };
}

module.exports = Object.freeze({ REQUEST_SCHEMA, SCHEMA, SOURCE_SHA256, run });
