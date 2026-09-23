"use strict";

// The oracle is rebuilt from pristine PARI source on every run.  No PARI
// answer or transformed basis is stored in the repository.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const BUCH2_SHA = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const ARCHIVE_SHA = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function signature(source, name) {
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`),
  );
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function oracle(pari, archive) {
  assert.equal(sha256(fs.readFileSync(archive)), ARCHIVE_SHA);
  const pristine = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(sha256(pristine), BUCH2_SHA);
  assert.equal(sha256(fs.readFileSync(path.join(pari, "src/basemath/buch2.c"))), BUCH2_SHA);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-degree5-ranked-lll-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
  const source = pristine + String.raw`
static void scalar(GEN x) { long e; if (typ(x)==t_INT) pari_printf(" %Ps -1 0",x); else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x)); }
static void ints(GEN x,long n) { for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf(" %Ps",gcoeff(x,i,j)); }
static void reals(GEN x,long n) { for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j)); }
static void emit(GEN nf,long p,long j) {
  long n=nf_get_degree(nf),prec=nf_get_prec(nf),stride=n+1;
  GEN P=gel(idealprimedec(nf,stoi(p)),j),I=idealhnf(nf,P),G0=nf_get_roundG(nf),G=nf_get_G(nf);
  GEN original=ZM_mul(G0,I),U=ZM_lll(original,.99,LLL_IM),ideal=ZM_mul(I,U),matrix=RgM_mul(G,ideal),r=gaussred_from_QR(matrix,prec);
  if(!r)exit(2);
  forprime_t S; init_modular_small(&S); ulong rp=u_forprime_next(&S); long nullity; Flm_pivots(ZM_to_Flm(original,rp),rp,&nullity,1);
  double v[16]={0},q[256]={0},T=4.; for(long i=1;i<=n;i++){if(!gisdouble(gcoeff(r,i,i),&v[i]))exit(3);for(long k=1;k<i;k++)if(!gisdouble(gcoeff(r,k,i),&q[k*stride+i]))exit(4);}
  double b2=v[2]+v[1]*q[stride+2]*q[stride+2],bound=maxdd(2*b2,Fincke_Pohst_bound(T,r));
  GEN zT=dbltor(T*T),prod=gcoeff(r,1,1);long stop;for(stop=2;stop<=n;stop++){prod=gmul(prod,gcoeff(r,stop,stop));GEN B=sqrtnr(gmul(zT,prod),stop);if(stop==n||cmprr(B,gcoeff(r,stop+1,stop+1))<0)break;}
  printf("%ld %ld %lu %ld %ld %ld %.17g",n,prec2nbits(prec),rp,nullity,stop,ZV_isscalar(gel(ideal,1)),bound);
  ints(I,n);ints(G0,n);reals(G,n);ints(U,n);ints(ideal,n);reals(matrix,n);reals(r,n);
  for(long i=0;i<=n;i++)printf(" %.17g",v[i]);for(long i=0;i<stride*stride;i++)printf(" %.17g",q[i]);puts("");
}
int main(void){pari_init(256000000,10000);
  GEN q=nfinit(gp_read_str("x^4-20018*x-20034"),nbits2prec(192));emit(q,2,1);
  GEN nf=nfinit(gp_read_str("36+930*x-305*x^2-90*x^3+x^5"),nbits2prec(192));
  long ps[6]={11,11,11,13,29,29},js[6]={1,2,3,1,1,2};for(long i=0;i<6;i++)emit(nf,ps[i],js[i]);
  pari_close();return 0;}
`;
  fs.writeFileSync(cfile, source);
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${lib}`,
    cfile, `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", binary]);
  return { directory, binary, sourceSha256: sha256(source) };
}

function parse(text) {
  return text.trim().split("\n").map(line => {
    const fields = line.trim().split(/\s+/); const n = Number(fields[0]); let at = 7;
    const take = count => { const out = fields.slice(at, at + count); at += count; return out; };
    const row = { n, precision: fields[1], prime: fields[2], nullity: fields[3],
      stop: fields[4], skip: fields[5], bound: Number(fields[6]), I: take(n*n), G0: take(n*n),
      G: take(3*n*n), U: take(n*n), ideal: take(n*n), matrix: take(3*n*n),
      reduction: take(3*n*n), v: take(n+1).map(Number), q: take((n+1)**2).map(Number) };
    assert.equal(at, fields.length); return row;
  });
}

function input(row, declarations) {
  const n=row.n, zero=count=>Array(count).fill("0"), values={
    original_ideal:row.I,rounded_embedding:row.G0,embedding:row.G,n:String(n),
    precision:row.precision,scale:4,original:zero(n*n),basis:zero(n*n),
    transform:zero(n*n),ideal:zero(n*n),flags:zero(2),rank_diagnostic:zero(3),
    selection:zero(5),stages:zero(4),
  };
  for (const [name, type] of declarations) {
    if (name in values) continue;
    let length=n*n;
    if (["qr_input","qr","vectors"].includes(name)) length=3*n*n;
    else if (["betas","norms","column"].includes(name)) length=3*n;
    else if (["y","s","exponents","s_exponents","alpha","column_exponents","float_scratch"].includes(name)) length=n;
    else if (name==="diagnostic") length=7;
    else if (name==="temporary") length=1;
    else if (["r1","r2","r3","inverse","first","second","final"].includes(name)) length=12;
    else if (["t1","t2","t3","integers","rounded"].includes(name)) length=4;
    else if (name==="float_q") length=(n+1)**2;
    else if (name==="float_v") length=n+1;
    else if (name==="bound") length=1;
    else if (name==="cache") length=3;
    else if (name.startsWith("root_")) length=name==="root_stack"?128:64;
    values[name]=Array(length).fill(type==="Float64Buffer"?0:"0");
  }
  return values;
}

async function main() {
  const pari=path.resolve(process.argv[2]||"/home/user/upstream/pari-2.17.4");
  const archive=path.resolve(process.argv[3]||"/home/user/upstream/pari-2.17.4.tar.gz");
  const builtOracle=oracle(pari,archive), raw=run(builtOracle.binary,[]), rows=parse(raw);
  assert.deepEqual(rows.map(row=>row.n),[4,5,5,5,5,5,5]);
  assert(rows.every(row=>row.prime==="2147483659"&&row.nullity==="0"));
  const sourcePath=path.join(__dirname,"ideal_ranked_preparation.py");
  const declarations=signature(sourcePath,"pari_ideal_ranked_preparation");
  const names=declarations.map(([name])=>name), floatNames=new Set(declarations.filter(([,type])=>type==="Float64Buffer").map(([name])=>name));
  const inputs=rows.map(row=>input(row,declarations));
  const payload={names,floatNames:[...floatNames],inputs,rows};
  run("python3",["-c",String.raw`
import decimal,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.ideal_ranked_preparation').pari_ideal_ranked_preparation
for ix,(raw,row) in enumerate(zip(d['inputs'],d['rows'])):
 v={k:([float(x) if k in d['floatNames'] else int(x) for x in value] if isinstance(value,list) else float(value) if k=='scale' else int(value)) for k,value in raw.items()}
 status=f(*(v[k] for k in d['names']));assert status==0,(ix,status,v['stages'])
 n=row['n'];assert v['transform']==[int(row['U'][i*n+j]) for j in range(n) for i in range(n)],(ix,'U')
 assert v['ideal']==list(map(int,row['ideal'])) and v['qr_input']==list(map(int,row['matrix'])) and v['qr']==list(map(int,row['reduction'])),ix
 assert v['flags']==[int(row['skip']),int(row['stop'])] and v['rank_diagnostic']==[1,2147483659,0],(ix,v['flags'],row['skip'],row['stop'])
 if n==5:
  assert v['selection'][0]==1 and v['selection'][1]==1 and v['selection'][3]==20894,v['selection']
  assert v['stages'][0]==0,v['stages']
 assert v['float_v']==row['v'] and v['float_q']==row['q'] and v['bound']==[row['bound']],ix
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(payload)});
  const built=await compileKernel({sourcePath}), fn=require(built.modulePath).pari_ideal_ranked_preparation;
  assert.equal(fn.nativeAvailable,true);
  for (let ix=0;ix<rows.length;ix++) for (const backend of ["javascript","gmp"]) {
    const row=rows[ix], values={};
    for (const [key,value] of Object.entries(inputs[ix])) values[key]=Array.isArray(value)?value.map(floatNames.has(key)?Number:BigInt):key==="scale"?Number(value):BigInt(value);
    if (backend==="gmp") for (const name of names) if (Array.isArray(values[name])&&!floatNames.has(name)) values[name]=fn.packIntegerBuffer(values[name],1024);
    assert.equal(fn[backend](...names.map(name=>values[name])),0n,`${ix} ${backend} status`);
    const out=name=>backend==="gmp"?values[name].toArray():values[name],n=row.n;
    assert.deepEqual(out("transform"),Array.from({length:n*n},(_,p)=>BigInt(row.U[(p%n)*n+Math.floor(p/n)])),`${ix} ${backend} U`);
    assert.deepEqual(out("ideal"),row.ideal.map(BigInt));assert.deepEqual(out("qr_input"),row.matrix.map(BigInt));assert.deepEqual(out("qr"),row.reduction.map(BigInt));
    assert.deepEqual(out("flags"),[BigInt(row.skip),BigInt(row.stop)]);assert.deepEqual(out("rank_diagnostic"),[1n,2147483659n,0n]);
    if (n===5) { assert.equal(out("selection")[0],1n);assert.equal(out("selection")[1],1n);assert.equal(out("selection")[3],20894n);assert.equal(out("stages")[0],0n); }
    assert.deepEqual(values.float_v,row.v);assert.deepEqual(values.float_q,row.q);assert.deepEqual(values.bound,[row.bound]);
  }
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
  console.log("1 quartic regression and 6 authenticated quintic ranked preparations match pristine PARI/CPython/JS/GMP; every quintic selector bypasses FLATTER");
  console.log(JSON.stringify({oracleSourceSha256:builtOracle.sourceSha256,traceSha256:sha256(raw),coreSourcePath:built.coreSourcePath,qualifiedTiming:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
