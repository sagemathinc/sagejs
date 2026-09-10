"use strict";
// LMFDB reconnaissance corpus, independent of Sage.js outcomes or timings.
const fs = require("node:fs");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const SEED = "sagejs-cubic-overall-20260910-v1";
const PER_STRATUM = 16;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function query() {
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='120s';
WITH base AS (
 SELECT label,r2,galt,coeffs,disc_abs,disc_sign,class_number,class_group,regulator,used_grh,
 floor(log(10,disc_abs)/3)::integer AS d_band,
 CASE WHEN regulator IS NULL THEN 'unknown'
      ELSE floor(log(10,regulator::numeric)/3)::integer::text END AS r_band,
 CASE WHEN class_number IS NULL THEN 'unknown'
      WHEN class_number=1 THEN 'trivial'
      WHEN jsonb_array_length(class_group)>1 THEN 'noncyclic'
      ELSE 'cyclic' END AS h_band
 FROM nf_fields WHERE degree=3
), ranked AS (
 SELECT *,
 row_number() OVER (PARTITION BY r2,galt,d_band,r_band,h_band ORDER BY md5(label||'${SEED}'),label) AS sample_rank,
 count(*) OVER (PARTITION BY r2,galt,d_band,r_band,h_band) AS population,
 row_number() OVER (PARTITION BY r2 ORDER BY disc_abs DESC,label) AS d_rank,
 row_number() OVER (PARTITION BY r2 ORDER BY class_number DESC NULLS LAST,label) AS h_rank,
 row_number() OVER (PARTITION BY r2 ORDER BY regulator DESC NULLS LAST,label) AS r_rank
 FROM base
)
SELECT row_to_json(s) FROM (
 SELECT label,r2,galt,
 ARRAY(SELECT c::text FROM unnest(coeffs) c) AS coefficients,
 disc_abs::text AS discriminant_absolute,disc_sign,
 class_number::text AS class_number,
 CASE WHEN class_group IS NULL THEN NULL ELSE
 ARRAY(SELECT c FROM jsonb_array_elements_text(class_group) c) END AS class_group,
 regulator::text AS regulator,used_grh,
 d_band,r_band,h_band,sample_rank,population,d_rank,h_rank,r_rank
 FROM ranked WHERE sample_rank<=${PER_STRATUM} OR d_rank<=2 OR h_rank<=2 OR r_rank<=2
 ORDER BY r2,disc_abs,label
) s;
COMMIT;`;
}

function integer(value) {
  if (typeof value !== "string" || value.length > 1024 || !/^(0|-?[1-9][0-9]*)$/.test(value)) {
    throw Error("noncanonical or excessive integer");
  }
  return BigInt(value);
}

function isqrt(n) {
  if (n < 0n) throw Error("negative square root");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

function checkRecord(r) {
  if (!/^3\.(1|3)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(r.label)) throw Error("invalid cubic label");
  if (![0, 1].includes(r.r2) || ![1, 2].includes(r.galt)) throw Error("invalid signature/group");
  if (!Array.isArray(r.coefficients) || r.coefficients.length !== 4) throw Error("four coefficients required");
  const [d, c, b, a] = r.coefficients.map(integer);
  if (a !== 1n) throw Error("monic cubic required");
  const pd = b*b*c*c - 4n*c*c*c - 4n*b*b*b*d - 27n*d*d + 18n*b*c*d;
  const abs = integer(r.discriminant_absolute);
  const sign = r.r2 === 1 ? -1 : 1;
  if (abs <= 0n || r.disc_sign !== sign || pd * BigInt(sign) <= 0n) throw Error("discriminant signature mismatch");
  if (r.label.split(".")[1] !== String(3 - 2*r.r2) || r.label.split(".")[2] !== String(abs)) throw Error("label mismatch");
  const fd = BigInt(sign)*abs;
  if (pd % fd !== 0n) throw Error("field discriminant does not divide polynomial discriminant");
  const index = isqrt(pd/fd);
  if (index*index !== pd/fd) throw Error("nonsquare equation index");
  if (r.class_number !== null) {
    const h = integer(r.class_number);
    if (h < 1n || !Array.isArray(r.class_group)) throw Error("missing or invalid class data");
    let product = 1n, previous = 1n;
    for (const entry of r.class_group) {
      const value = integer(entry);
      if (value <= 1n || value % previous !== 0n) throw Error("invalid invariant factors");
      product *= value;
      previous = value;
    }
    if (product !== h) throw Error("class group order mismatch");
  } else if (r.class_group !== null) throw Error("unknown class number with known group");
  if (r.regulator !== null && !(Number.isFinite(Number(r.regulator)) && Number(r.regulator)>0)) throw Error("invalid regulator");
  for (const key of ["sample_rank", "population", "d_rank", "h_rank", "r_rank"]) {
    if (!Number.isSafeInteger(r[key]) || r[key]<1) throw Error("invalid selection rank");
  }
  if (r.sample_rank > r.population) throw Error("rank exceeds stratum population");
  return { polynomial_discriminant: String(pd), equation_order_index: String(index) };
}

function build(records, capturedAt = new Date().toISOString()) {
  const seen = new Set();
  const normalized = records.map((r) => {
    if (seen.has(r.label)) throw Error("duplicate field");
    seen.add(r.label);
    const derived = checkRecord(r);
    const extremes = ["d", "h", "r"].filter((key) => r[key+"_rank"]<=2);
    if (r.sample_rank>PER_STRATUM && !extremes.length) throw Error("unselected field");
    return {...r,...derived,
      stratum: [r.r2,r.galt,r.d_band,r.r_band,r.h_band].join(":"),
      selection: r.sample_rank<=PER_STRATUM ? "stratified" : "extreme-only",
      role: extremes.length ? "stress" : r.sample_rank<=4 ? "development" : "holdout",
      extremes,
    };
  }).sort((a,b) => a.label.localeCompare(b.label, "en"));
  const payload = {schema:"sagejs-cubic-broad-v1",seed:SEED,per_stratum:PER_STRATUM,records:normalized};
  return {...payload,captured_at:capturedAt,
    source:{table:"nf_fields",url:"https://www.lmfdb.org/NumberField/?degree=3",license:"CC-BY-SA-4.0",query:query()},
    payload_sha256:sha256(JSON.stringify(payload)),
    limitations:["LMFDB is family-biased beyond its completeness range.",
      "Database answers are comparison data, not certificate authority.",
      "Missing answers and timing failures must not be omitted.",
      "Known large-regulator synthetic fields remain a separate required stress panel.",
      "Development/holdout designations are prospective; overlap with historical corpora must be reported."]};
}

function validate(corpus) {
  const rebuilt = build(corpus.records.map(({polynomial_discriminant,equation_order_index,stratum,selection,role,extremes,...r})=>r),corpus.captured_at);
  if (corpus.payload_sha256!==rebuilt.payload_sha256 || JSON.stringify(corpus.records)!==JSON.stringify(rebuilt.records)) throw Error("corpus hash/derived fields mismatch");
  if (corpus.schema!==rebuilt.schema || corpus.seed!==SEED || corpus.per_stratum!==PER_STRATUM || corpus.source.query!==query()) throw Error("corpus protocol mismatch");
  return corpus;
}

function summary(corpus) {
  validate(corpus);
  const strata = new Map();
  for (const r of corpus.records) {
    const s = strata.get(r.stratum) || {stratum:r.stratum,population:r.population,selected:0,development:0,holdout:0,stress:0};
    if (s.population!==r.population) throw Error("inconsistent stratum population");
    s.selected++; s[r.role]++;
    strata.set(r.stratum,s);
  }
  return {payload_sha256:corpus.payload_sha256,fields:corpus.records.length,
    complex:corpus.records.filter(r=>r.r2===1).length,real:corpus.records.filter(r=>r.r2===0).length,
    missing_answers:corpus.records.filter(r=>r.class_number===null).length,
    strata:[...strata.values()]};
}

function download() {
  const result=cp.spawnSync("psql",["-X","-qAt","--set=ON_ERROR_STOP=1",
    "--host="+(process.env.LMFDB_PGHOST||"devmirror.lmfdb.xyz"),
    "--port="+(process.env.LMFDB_PGPORT||"5432"),
    "--dbname="+(process.env.LMFDB_PGDATABASE||"lmfdb"),
    "--username="+(process.env.LMFDB_PGUSER||"lmfdb"),"--command="+query()],
    {encoding:"utf8",timeout:150000,maxBuffer:32*1024*1024,
      env:{...process.env,PGPASSWORD:process.env.LMFDB_PGPASSWORD||"lmfdb",PGCONNECT_TIMEOUT:"10"}});
  if (result.error || result.status!==0) throw Error(result.error?.message||result.stderr);
  return build(result.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse));
}

if (require.main===module) {
  const [command,file]=process.argv.slice(2);
  if (!file || !["download","validate"].includes(command)) throw Error("usage: cubic-broad-corpus.cjs download|validate FILE");
  const corpus=command==="download" ? download() : validate(JSON.parse(fs.readFileSync(file,"utf8")));
  if(command==="download") fs.writeFileSync(file,JSON.stringify(corpus,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(summary(corpus),null,2));
}
module.exports={SEED,PER_STRATUM,query,isqrt,checkRecord,build,validate,summary,sha256};
