"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const target = {
  primeIdeals: [2n, 1n, 0n, 0n, 1n, 0n, 0n, 0n, 1n,
    5n, 3n, 4n, 0n, 1n, 0n, 0n, 0n, 1n],
  table: [
    1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 1n,
    0n, 1n, 0n, 133n, 0n, 1n, -7n, 67n, 0n,
    0n, 0n, 1n, -7n, 67n, 0n, 8911n, -7n, -66n,
  ],
  candidates: [4n, 0n, 0n, 8n, 0n, 0n, 8n, 0n, 0n,
    5n, 0n, 0n, -17n, 1n, 0n],
  relation: [-3n, -1n],
  ideal: [38n, 21n, 34n, 0n, 1n, 0n, 0n, 0n, 1n],
  factors: [
    [0n, 1n, 8n, 0n, 0n, 0n, 1n],
    [0n, 1n, 5n, 0n, 0n, 0n, 1n],
    [1n, 0n, 1n, -17n, 1n, 0n, -1n],
    [0n, 40n, 1n, 0n, 0n, 0n, 1n],
  ],
};

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function normalize(value) { return value.replace(/\s+/g, ""); }
function values(owner) { return Array.isArray(owner) ? owner : owner.toArray(); }

function parseTrace(trace) {
  const words = trace.trim().split(/\s+/); let at = 0;
  const number = () => Number(words[at++]);
  const integers = (count) => { const out = words.slice(at, at + count); at += count; return out; };
  const n = number(), active = number(), precision = number(), factorCount = number();
  const W = integers(n * n);
  const triples = integers(27);
  const matrix = [0, 1, 2].map((part) => triples.filter((_, i) => i % 3 === part));
  const C = integers(3 * n * 7);
  const factors = [];
  for (let i = 0; i < factorCount; i += 1) {
    factors.push({ kind: number(), numerator: words[at++], denominator: words[at++],
      coordinates: integers(3), exponent: words[at++] });
  }
  const lengths = { D:n*n, U:n*n, Ui:n*n, V:n*n, Ur:n*n, Y:n*n,
    Uir:n*n, X:n*n, M1:n*active, M2:n*n };
  const expected = Object.fromEntries(Object.entries(lengths).map(([name, length]) =>
    [name, integers(length)]));
  expected.invariants = integers(active); expected.classNumber = integers(1);
  expected.Ga = integers(3 * active * 7); expected.GD = integers(3 * active * 7);
  expected.ga = integers(3 * n * 7);
  assert.equal(at, words.length);
  const convert = (xs) => xs.map(BigInt);
  return {
    n, active, precision, W:convert(W), matrix:matrix.map(convert), C:convert(C),
    factors: factors.map((f) => ({...f, kind:BigInt(f.kind), numerator:BigInt(f.numerator),
      denominator:BigInt(f.denominator), coordinates:convert(f.coordinates), exponent:BigInt(f.exponent)})),
    expected:Object.fromEntries(Object.entries(expected).map(([k,v]) => [k,convert(v)])),
  };
}

function oracle(pari, archive) {
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE_SHA256);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-genback-assembly-"));
  const source = path.join(directory, "oracle.c"), executable = path.join(directory, "oracle");
  fs.writeFileSync(source, `#include "pari.h"
#include "paripriv.h"
static void scalar(GEN x){long e;if(typ(x)==t_INT){pari_printf("%Ps -1 0 ",x);return;}pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void entry(GEN x){if(typ(x)==t_COMPLEX){printf("2 ");scalar(gel(x,1));scalar(gel(x,2));}else{printf("1 ");scalar(x);printf("0 -1 0 ");}}
static void imat(GEN x){for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++)pari_printf("%Ps ",gcoeff(x,i,j));}
static void lmat(GEN x,long c){for(long j=1;j<=c;j++)for(long i=1;i<lg(gel(x,j));i++)entry(gcoeff(x,i,j));}
static GEN add0(GEN a,GEN t){return a?RgC_add(a,t):t;}
static GEN act0(GEN A,GEN x){GEN a;long i,l=lg(A),t=typ(A);if(t==t_MAT){a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=act0(gel(A,i),x);return a;}if(l==1)return cgetg(1,t_COL);a=NULL;for(i=1;i<l;i++){GEN c=gel(A,i);if(signe(c))a=add0(a,gmul(c,gel(x,i)));}return a?a:zerocol(lgcols(x)-1);}
static GEN diag0(GEN v,GEN x){long i,l=lg(v);GEN a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=gmul(gel(x,i),gel(v,i));return a;}
int main(){pari_init(256000000,10000);long bits=192;GEN b=bnfinit0(gp_read_str("x^3-200*x+7"),1,NULL,nbits2prec(bits)),nf=bnf_get_nf(b),W=gel(b,1),C=gel(b,4),Ge=gmael(b,9,4),U,V,D=ZM_snfall(W,&U,&V),D0=gcopy(D),V0=gcopy(V),Ui=ZM_inv(U,NULL),Y,X,Ur=ZM_hnfdivrem(U,D,&Y),Uir=ZM_hnfdivrem(Ui,W,&X),M2=ZM_add(ZM_mul(X,Ur),ZM_mul(V,Y));long n=lg(W)-1,j,l;for(j=1;j<lg(D);j++)if(is_pm1(gcoeff(D,j,j)))break;l=j;GEN cyc=cgetg(l,t_VEC);for(j=1;j<l;j++)gel(cyc,j)=gcoeff(D,j,j);setlg(V,l);setlg(D,l);GEN M1=ZM_add(V,ZM_mul(X,D)),Ga=nfV_cxlog(nf,Ge,nbits2prec(bits)),GD=gsub(act0(M1,C),diag0(cyc,Ga)),ga=gsub(act0(M2,C),act0(Ur,Ga));long factors=lg(gel(gel(Ge,1),1))-1;printf("%ld %ld %ld %ld ",n,l-1,bits,factors);imat(W);GEN EM=nf_get_M(nf);for(long r=1;r<=3;r++)for(long c=1;c<=3;c++)scalar(gcoeff(EM,r,c));lmat(C,n);GEN F=gel(Ge,1),FG=gel(F,1),FE=gel(F,2);for(long k=1;k<lg(FG);k++){GEN z=nf_to_scalar_or_basis(nf,gel(FG,k));if(typ(z)==t_FRAC){printf("0 ");pari_printf("%Ps %Ps 0 0 0 ",gel(z,1),gel(z,2));}else if(typ(z)==t_INT){printf("0 ");pari_printf("%Ps 1 0 0 0 ",z);}else{printf("1 0 1 ");for(long q=1;q<=3;q++)pari_printf("%Ps ",gel(z,q));}pari_printf("%Ps ",gel(FE,k));}imat(D0);imat(U);imat(Ui);imat(V0);imat(Ur);imat(Y);imat(Uir);imat(X);imat(M1);imat(M2);pari_printf("%Ps %Ps ",gel(cyc,1),gel(cyc,1));lmat(Ga,1);lmat(GD,1);lmat(ga,n);putchar('\\n');pari_close();}
`);
  run("cc", ["-O2", `-I${path.join(pari,"src/headers")}`, `-I${lib}`, source,
    `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", executable]);
  const trace = run(executable, []), fixture = parseTrace(trace);
  assert.deepEqual(fixture.expected.Uir.slice(0, 2), target.relation);
  assert.deepEqual(fixture.factors.map((f) => [f.kind,f.numerator,f.denominator,...f.coordinates,f.exponent]), target.factors);

  const gp = path.join(lib, "gp-dyn");
  const program = `print("VERSION|",version())
nf=nfinit(x^3-200*x+7);b=bnfinit(x^3-200*x+7,1);V=b[5];E=nf[5][3];tape=List();
red(X)={my(I=X[1],q=I[1,1],J=idealhnf(nf,idealinv(nf,I)*q),U=qflll(E*J),y=J*U[,1]);listput(tape,y);idealred(nf,X)};
pw(R,e)={my(A=[idealhnf(nf,R),factor(1)],a=abs(e));if(a>=2,A=red(idealmul(nf,A,A)));if(a==3,A=red(idealmul(nf,A,[idealhnf(nf,R),factor(1)])));if(e<0,A=red(idealinv(nf,A)),if(a==1,A=red(A)));A};
A=pw(V[1],-3);B=pw(V[2],-1);Z=red(idealmul(nf,A,B));
print("TAPE|",Vec(tape))
print("PAIR|",Z)
print("IDEAL|",idealhnf(nf,idealmul(nf,Z[1],nffactorback(nf,Z[2])))==idealhnf(nf,idealmul(nf,idealpow(nf,V[1],-3),idealpow(nf,V[2],-1))))
print("SMITH|",Col([-3,-1])*24==b[1]*Col([1,-12]))
`;
  const lines = run(gp, ["-fq"], {input:program}).trim().split(/\r?\n/);
  assert.match(lines.shift(), /^VERSION\|(?:2\.17\.4|\[2, 17, 4\])$/);
  assert.equal(normalize(lines.shift()), "TAPE|[[4,0,0]~,[8,0,0]~,[8,0,0]~,[5,0,0]~,[-17,1,0]~]");
  assert.equal(normalize(lines.shift()), "PAIR|[[38,21,34;0,1,0;0,0,1],[1/8,1;1/5,1;[-17,1,0]~,-1;40,1]]");
  assert.equal(lines.shift(), "IDEAL|1"); assert.equal(lines.shift(), "SMITH|1");
  return {fixture, trace};
}

function invocation(native, fixture, backend) {
  const n=fixture.n, active=fixture.active, size=n*n;
  const exact=(length, init=Array(length).fill(0n)) => backend==="javascript" ? init.slice() : native.createIntegerBuffer(length,1024,init);
  const state=(length, fill=77n) => Array(length).fill(fill);
  const matrices=Array.from({length:10},()=>exact(size,Array(size).fill(77n)));
  const invariants=exact(n,Array(n).fill(77n)), classNumber=exact(1,[77n]);
  const generatorIdeal=exact(9,Array(9).fill(77n)), relationExponents=exact(2,Array(2).fill(77n));
  const offsets=exact(2,Array(2).fill(77n)), kinds=exact(16), numerators=exact(16), denominators=exact(16), coordinates=exact(48), exponents=exact(16), compactValues=exact(64), compactMetadata=exact(1);
  const z=(length)=>exact(length), cursor=exact(1);
  const termKinds=z(16),termValues=z(64),termExponents=z(16),termMetadata=z(1);
  const genback=[z(9),z(9),z(9),z(9),z(27),z(18),z(30),z(12),z(3),z(9),z(9),z(3),z(3),z(2),z(9),z(9),z(3),z(1),z(9)];
  const Ga=exact(21*active,Array(21*active).fill(77n)),GD=exact(21*active,Array(21*active).fill(77n)),ga=exact(21*n,Array(21*n).fill(77n));
  const smithStates=[state(7),state(7),state(7),state(7),state(9)];
  const cxState=exact(8,[0n,0n,-1n,-1n,0n,0n,0n,0n]), assemblyState=state(8), connectionState=state(7);
  const args=[...fixture.matrix,fixture.W,fixture.C,target.primeIdeals,2n,target.table,target.candidates,cursor,BigInt(n),BigInt(active),BigInt(fixture.precision),generatorIdeal,relationExponents,offsets,kinds,numerators,denominators,coordinates,exponents,compactValues,compactMetadata,termKinds,termValues,termExponents,termMetadata,...genback,...matrices,invariants,classNumber,Ga,GD,ga,z(n),z(size),z(2*size),...smithStates,cxState,z(3),z(21),z(21),z(64),z(64),z(64),z(64),z(64),z(64),z(128),z(21*n),z(21*active),z(21*active),z(21*n),z(21*n),z(21*active),z(21*n),assemblyState,connectionState];
  return {args,matrices,invariants,classNumber,generatorIdeal,relationExponents,offsets,kinds,numerators,denominators,coordinates,exponents,compactMetadata,Ga,GD,ga,cursor,assemblyState,connectionState};
}

function check(call, fixture, label) {
  assert.deepEqual(values(call.generatorIdeal),target.ideal,`${label}:G`);
  assert.deepEqual(values(call.relationExponents),target.relation,`${label}:Uir column`);
  assert.deepEqual(values(call.offsets),[0n,4n]); assert.deepEqual(values(call.compactMetadata),[4n]);
  const rows=Array.from({length:4},(_,i)=>[values(call.kinds)[i],values(call.numerators)[i],values(call.denominators)[i],...values(call.coordinates).slice(3*i,3*i+3),values(call.exponents)[i]]);
  assert.deepEqual(rows,target.factors,`${label}:generated Ge`);
  assert.deepEqual(values(call.cursor),[5n]); assert.deepEqual(call.connectionState,[0n,2n,4n,5n,2n,-3n,-1n]);
  assert.deepEqual(values(call.invariants).slice(0,1),[24n]); assert.deepEqual(values(call.classNumber),[24n]);
  assert.deepEqual(values(call.Ga),fixture.expected.Ga); assert.deepEqual(values(call.GD),fixture.expected.GD); assert.deepEqual(values(call.ga),fixture.expected.ga);
}

(async()=>{
  const pari=path.resolve(process.argv[2]||"/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
  const archive=path.resolve(process.argv[3]||"/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
  const {fixture,trace}=oracle(pari,archive);
  const sourcePath=path.join(__dirname,"signed_genback_assembly.py");

  const py=`import importlib,json,sys\nsys.path[:0]=sys.argv[1:3]\nf=importlib.import_module('bench.pari-class-group-port.signed_genback_assembly').pari_signed_genback_class_group_assembly\nr=json.load(sys.stdin);n=r['n'];a=r['active'];z=lambda k:[0]*k;cvint=lambda q:list(map(int,q));mats=[[77]*(n*n) for _ in range(10)];inv=[77]*n;h=[77];G=[77]*9;rel=[77]*2;off=[77]*2;k=z(16);num=z(16);den=z(16);co=z(48);ex=z(16);cv=z(64);cm=z(1);tk=z(16);tv=z(64);te=z(16);tm=z(1);gb=[z(9),z(9),z(9),z(9),z(27),z(18),z(30),z(12),z(3),z(9),z(9),z(3),z(3),z(2),z(9),z(9),z(3),z(1),z(9)];Ga=[77]*(21*a);GD=[77]*(21*a);ga=[77]*(21*n);ss=[[77]*7 for _ in range(4)]+[[77]*9];cx=[0,0,-1,-1,0,0,0,0];ast=[77]*8;cst=[77]*7;cur=[0];args=[*map(cvint,r['matrix']),cvint(r['W']),cvint(r['C']),cvint(r['primeIdeals']),2,cvint(r['table']),cvint(r['candidates']),cur,n,a,r['precision'],G,rel,off,k,num,den,co,ex,cv,cm,tk,tv,te,tm,*gb,*mats,inv,h,Ga,GD,ga,z(n),z(n*n),z(2*n*n),*ss,cx,z(3),z(21),z(21),z(64),z(64),z(64),z(64),z(64),z(64),z(128),z(21*n),z(21*a),z(21*a),z(21*n),z(21*n),z(21*a),z(21*n),ast,cst];assert f(*args)==0;assert Ga==cvint(r['expected']['Ga']);assert GD==cvint(r['expected']['GD']);assert ga==cvint(r['expected']['ga']);print(json.dumps([G,rel,off,[[k[i],num[i],den[i],*co[3*i:3*i+3],ex[i]] for i in range(cm[0])],cur,cst,inv[:a],h]))`;
  const payload={...fixture,primeIdeals:target.primeIdeals,table:target.table,candidates:target.candidates};
  const serial=JSON.stringify(payload,(_,v)=>typeof v==="bigint"?v.toString():v);
  const pyOut=JSON.parse(run("python3",["-c",py,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:serial}),(_,v)=>typeof v==="number"?BigInt(v):v);
  assert.deepEqual(pyOut[0],target.ideal);assert.deepEqual(pyOut[1],target.relation);assert.deepEqual(pyOut[2],[0n,4n]);assert.deepEqual(pyOut[3],target.factors);assert.deepEqual(pyOut[4],[5n]);assert.deepEqual(pyOut[5],[0n,2n,4n,5n,2n,-3n,-1n]);

  if (process.env.SAGEJS_ORACLE_ONLY === "1") {
    console.log("signed Uir genback feeds class assembly in pristine PARI 2.17.4 and CPython");
    return;
  }

  const built=await compileKernel({sourcePath});const native=require(built.modulePath).pari_signed_genback_class_group_assembly;
  for(const backend of ["javascript","gmp","tagged"]){const call=invocation(native,fixture,backend);assert.equal(native[backend](...call.args),0n,backend);check(call,fixture,backend);}
  const short=structuredClone(target.candidates.slice(0,3));const failed=invocation(native,fixture,"javascript");failed.args[8]=short;assert.throws(()=>native.javascript(...failed.args),/tape exhausted/);assert.deepEqual(values(failed.generatorIdeal),Array(9).fill(77n));
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call|v8::/);
  console.log("signed Uir genback feeds class assembly and matches pristine PARI 2.17.4 across CPython, JS, GMP, and tagged backends");
  console.log(JSON.stringify({fixture:"x^3-200*x+7",classNumber:24,relation:[-3,-1],candidateCount:5,factorCount:4,backends:["PARI","CPython","javascript","gmp","tagged"],traceSha256:hash(trace),sourceSha256:hash(fs.readFileSync(sourcePath)),coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch((error)=>{console.error(error);process.exitCode=1;});
