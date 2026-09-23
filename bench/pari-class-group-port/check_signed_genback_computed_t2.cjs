"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const directory = __dirname;
const sourcePath = path.join(directory, "signed_genback_computed_t2.py");
const pari = path.resolve(process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
const archive = path.resolve(process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
const primeIdeals = [2n,1n,0n,0n,1n,0n,0n,0n,1n,5n,3n,4n,0n,1n,0n,0n,0n,1n];
const table = [1n,0n,0n,0n,1n,0n,0n,0n,1n,0n,1n,0n,133n,0n,1n,-7n,67n,0n,0n,0n,1n,-7n,67n,0n,8911n,-7n,-66n];
const roundedT2 = [16n,-227n,1080n,16n,1n,-2128n,16n,226n,1064n];
const expectedCandidates = [4n,0n,0n,8n,0n,0n,8n,0n,0n,5n,0n,0n,-17n,1n,0n];
const expectedInverse = [4n,0n,2n,0n,4n,1n,0n,0n,1n,8n,0n,6n,0n,8n,1n,0n,0n,1n,8n,7n,4n,0n,1n,0n,0n,0n,1n,5n,3n,4n,0n,1n,0n,0n,0n,1n,40n,23n,4n,0n,1n,0n,0n,0n,1n];
const expectedWeighted = [64n,-908n,885n,64n,4n,-2095n,64n,904n,1322n,128n,-1816n,949n,128n,8n,-2031n,128n,1808n,1386n,128n,-115n,1144n,128n,113n,-2064n,128n,338n,1128n,80n,-179n,1144n,80n,49n,-2064n,80n,274n,1128n,640n,141n,1144n,640n,369n,-2064n,640n,594n,1128n];
const expectedTransform = [1n,0n,0n,0n,1n,0n,-1n,0n,1n,1n,0n,0n,0n,1n,0n,-1n,0n,1n,1n,0n,0n,-1n,1n,0n,-1n,0n,1n,1n,0n,0n,-1n,1n,0n,-1n,0n,1n,-1n,1n,0n,-1n,2n,0n,0n,0n,1n];
const expectedIdeal = [38n,21n,34n,0n,1n,0n,0n,0n,1n];
const expectedFactors = [[0n,1n,0n,0n,8n,1n],[0n,1n,0n,0n,5n,1n],[1n,-17n,1n,0n,1n,-1n],[0n,40n,0n,0n,1n,1n]];

const fixture = {
  n:2, active:1, precision:192,
  W:[12n,0n,7n,2n],
  matrix:[
    [1n,-1890295560688428073330985231214437896190191102161395909703950874541621581063438383362217267575716n,1126305365533957529939012647083585272193207645665454465770816456235488505233581372525705150816914n,1n,1196160066685869406147796501297279783026826882172392415210928050534694277126720284024641956550486n,-20470384984654633283952424573096860491126663782562714524711803480535596549249441225142319345429170286518643585974272n,1n,1885623060427936395963220401131245397037742559652910001832033186844220431543412132252746009932940n,1109785620381894855301110418780099142120456547396919051143330731519547376621104956437619372457375n],
    [-1n,320n,320n,-1n,320n,384n,-1n,320n,320n],
    [0n,3n,6n,0n,-5n,7n,0n,3n,6n],
  ],
  C:[2n,65951082980999611924370071472632831328187258532459244298359135084302861888608n,256n,3n,90942894222941581070058735694432465663348344332098107489693037779484723616544n,256n,1n,2n,-65781323816343211456825059544056395422592798722562978850249582644817996005154n,256n,4n,90942894222941581070058735694432465663348344332098107489693037779484723616547n,256n,1n,1n,65611564651686810989280047615479959516998338912666713402140030205333130121700n,256n,3n,0n,-1n,0n,2n,99557864291658491752604406256397742540790594179226436072032948005735892870904n,256n,2n,90942894222941581070058735694432465663348344332098107489693037779484723616544n,256n,1n,1n,-92401670699080368499233406590109884834530615870889106898912958501353909468404n,256n,3n,0n,-1n,0n,2n,85245477106502245245862406923822027128270637562551777725792968996971926065906n,256n,2n,90942894222941581070058735694432465663348344332098107489693037779484723616546n,256n,1n],
  Ga:[2n,-1836480262424000778515997281564843002561438388620369645131322034980316386115240868753779850356027n,320n,1n,-1677600295053042228788960243555000810201048522356787237681776606087928304667951345024875097228510n,320n,1n,2n,-27888270960083616546484161755046433471648960758642790258142896287200649962310866876924628575033177582786395871031119n,384n,1n,-30946263300823101954888425259784296108860594177929936231961025381527827855583154673559277957637088071546809309872923n,384n,1n,2n,-1128004864114922565403317347583307877597778919500318313719511133210343180831307128865826630676330n,320n,0n,-1677600295053042228788960243555000810201048522356787237681776606087928304667951345024875097228510n,320n,1n],
  GD:[2n,65938664305103943219971057065773777436259072951092870023199191743701952162560n,256n,3n,73891101556140034619422722751726378351470529769829712335375593195831337938445n,256n,5n,2n,91812185954560697074149439788402889002299616684716037715267434012313568976633n,256n,7n,1310625230510189241241375190277344382969569158091240029438887973506193988021837381714448988177318n,320n,6n,2n,-65603374837546092641528926820951509590260748830084191238331890206516778832483n,256n,5n,68207170667206185802544051770824349247511258249073580617269778334613542712409n,256n,5n],
  ga:[2n,-67822528624878684291150680659579655117130855035558708073503897468434983845888n,256n,-13n,90942894222941581070058735694432465663348344332098107489693037779484723616549n,256n,1n,2n,66689900954402399004168381487606625620082477683357606714365754561943878984851n,256n,4n,30946263300823101954888425259784296108860594177929936231961025381527827855583154673559277957637088071546809309872923n,384n,2n,2n,-109341688000623727185131918299761999292680444744334492785155863677133415150542n,256n,1n,90942894222941581070058735694432465663348344332098107489693037779484723616547n,256n,1n,2n,-99543375836446878264138889448395513000207711000965666084346347441701498190512n,256n,1n,-90942894222941581070058735694432465663348344332098107489693037779484723616548n,256n,3n,2n,-105157117832819152194890491779547859230828008962014673387775950670732549539940n,256n,5n,-27077980388220214210527372102311259095253019905688694202965897208836849373635260339364368212932452062603458146138808n,384n,4n,2n,74362607723920199975524826781336242599027729760654736755563138468248756740248n,256n,3n,-90942894222941581070058735694432465663348344332098107489693037779484723616546n,256n,3n],
};

function run(command,args,options={}) { const result=spawnSync(command,args,{encoding:"utf8",timeout:300000,maxBuffer:64*1024*1024,...options}); assert.equal(result.status,0,result.stderr||String(result.error)); return result.stdout; }
function normalize(value) { return value.replace(/\s+/g,""); }
function values(owner) { return Array.isArray(owner)?owner:owner.toArray(); }
function factors(call) { const count=Number(values(call.compact_metadata)[0]),k=values(call.factor_kinds),v=values(call.compact_values),e=values(call.factor_exponents); return Array.from({length:count},(_,i)=>[k[i],...v.slice(4*i,4*i+4),e[i]]); }

function verifyPari() {
  run(process.execPath,[path.join(directory,"check_signed_genback_assembly.cjs"),pari,archive],{env:{...process.env,SAGEJS_ORACLE_ONLY:"1"}});
  const gp=path.join(pari,"Olinux-x86_64","gp-dyn");
  const program=`print("VERSION|",version());nf=nfinit(x^3-200*x+7);b=bnfinit(x^3-200*x+7,1);V=b[5];G=nf[5][3];
red(X)={my(I=X[1],q=I[1,1],J=idealhnf(nf,idealinv(nf,I)*q),B=G*J,U=qflll(B),y=J*U[,1]);print("R|",J,"|",B,"|",U,"|",y);idealred(nf,X)};
pw(R,e)={my(A=[idealhnf(nf,R),factor(1)],a=abs(e));if(a>=2,A=red(idealmul(nf,A,A)));if(a==3,A=red(idealmul(nf,A,[idealhnf(nf,R),factor(1)])));if(e<0,A=red(idealinv(nf,A)),if(a==1,A=red(A)));A};
A=pw(V[1],-3);B=pw(V[2],-1);red(idealmul(nf,A,B));`;
  const lines=run(gp,["-fq"],{input:program}).trim().split(/\r?\n/);assert.match(lines.shift(),/^VERSION\|(?:2\.17\.4|\[2, 17, 4\])$/);
  const expected=[
    "R|[4,0,2;0,4,1;0,0,1]|[64,-908,885;64,4,-2095;64,904,1322]|[1,0,-1;0,1,0;0,0,1]|[4,0,0]~",
    "R|[8,0,6;0,8,1;0,0,1]|[128,-1816,949;128,8,-2031;128,1808,1386]|[1,0,-1;0,1,0;0,0,1]|[8,0,0]~",
    "R|[8,7,4;0,1,0;0,0,1]|[128,-115,1144;128,113,-2064;128,338,1128]|[1,-1,-1;0,1,0;0,0,1]|[8,0,0]~",
    "R|[5,3,4;0,1,0;0,0,1]|[80,-179,1144;80,49,-2064;80,274,1128]|[1,-1,-1;0,1,0;0,0,1]|[5,0,0]~",
    "R|[40,23,4;0,1,0;0,0,1]|[640,141,1144;640,369,-2064;640,594,1128]|[-1,-1,0;1,2,0;0,0,1]|[-17,1,0]~",
  ];
  assert.deepEqual(lines.map(normalize),expected.map(normalize));
}

const source=fs.readFileSync(sourcePath,"utf8");
const declarations=source.match(/def pari_signed_genback_computed_t2_assembly\(([\s\S]*?)\n\)/)[1].trim().split("\n").map((line)=>line.trim().replace(/,$/,"").split(": "));
const names=declarations.map(([name])=>name),types=Object.fromEntries(declarations);
function plainWorkspace() {
  const n=2,a=1,size=4,z=(length)=>Array(length).fill(0n),state=(length)=>Array(length).fill(77n),v={};
  Object.assign(v,{matrix_m:fixture.matrix[0].slice(),matrix_p:fixture.matrix[1].slice(),matrix_e:fixture.matrix[2].slice(),relation_hnf:fixture.W.slice(),relation_logs:fixture.C.slice(),prime_ideals:primeIdeals.slice(),prime_count:2n,multiplication_table:table.slice(),rounded_t2:roundedT2.slice(),candidate_trace:z(15),inverse_trace:z(45),weighted_trace:z(45),transform_trace:z(45),candidate_cursor:z(1),dimension:2n,generator_count:1n,precision:192n});
  const sizes={generator_ideal:9,relation_exponents:2,factor_offsets:2,factor_kinds:16,factor_numerators:16,factor_denominators:16,factor_coordinates:48,factor_exponents:16,compact_values:64,compact_metadata:1,term_kinds:16,term_values:64,term_exponents:16,term_metadata:1,base:9,term:9,current:9,matrix_scratch:9,generators:27,hnf_input:18,hnf_work:30,hnf_triangular:12,hnf_moduli:3,hnf_intermediate:9,inverse_basis:9,congruence_row:3,candidate:3,content:2,multiplication_matrix:9,product:9,inverse_numerator:3,inverse_denominator:1,generated_ideal:9,inverse_ideal:9,weighted_basis:9,lll_basis:9,lll_transform:9,lll_selection:5,lll_stages:4,flatter_input:9,flatter_current:9,flatter_transform:9,flatter_total_work:9,flatter_step_t:9,flatter_step_s:9,flatter_product:9,flatter_next_basis:9,qr_input:27,qr:27,qr_vectors:27,qr_betas:9,qr_norms:9,qr_column:9,flatter_y:3,flatter_diagnostic:7,flatter_r1:12,flatter_r2:12,flatter_r3:12,flatter_t1:4,flatter_t2:4,flatter_t3:4,flatter_integers:4,flatter_inverse:12,flatter_first:12,flatter_second:12,flatter_final:12,flatter_rounded:4,lll_exponents:3,lll_gram:9,lll_mu_exponents:9,lll_r_exponents:9,lll_s_exponents:3,lll_alpha:3,lll_column_exponents:3,smith:size,left:size,left_inverse:size,right:size,ur:size,y:size,uir:size,x:size,m1:size,m2:size,invariants:n,class_number:1,ga:21*a,gd:21*a,generator_arch:21*n,smith_column:n,smith_product:size,smith_augmented:2*size,cx_state:8,cx_coordinates:3,cx_column:21,cx_accumulator:21,log_cache:64,pi_cache:64,arithmetic_a:64,arithmetic_b:64,arithmetic_p:64,arithmetic_q:64,arithmetic_stack:128,ga_full:21*n,c_m1:21*a,ga_diagonal:21*a,c_m2:21*n,ga_ur:21*n,gd_work:21*a,generator_arch_work:21*n};
  for(const [name,length] of Object.entries(sizes))v[name]=z(length);
  for(const [name,length] of Object.entries({lll_mu:9,lll_r:9,lll_s:3,lll_approximate:9,lll_float_gram:9,lll_float_scratch:3,lll_temporary:1}))v[name]=Array(length).fill(0);
  for(const name of ["left_inverse_state","right_inverse_state","first_division_state","second_division_state"])v[name]=state(7);v.smith_state=state(9);v.assembly_state=state(8);v.connection_state=state(7);v.cx_state=[0n,0n,-1n,-1n,0n,0n,0n,0n];
  return v;
}
function nativeWorkspace(api,backend) { const raw=plainWorkspace(),out={};for(const name of names){const value=raw[name];if(!Array.isArray(value)){out[name]=value;continue;}if(types[name]==="IntegerBuffer"&&backend!=="javascript")out[name]=api.createIntegerBuffer(value.length,1024,value);else out[name]=value.slice();}return out; }
function check(call,label) { assert.deepEqual(values(call.candidate_trace),expectedCandidates,`${label}: candidates`);assert.deepEqual(values(call.inverse_trace),expectedInverse,`${label}: inverse witnesses`);assert.deepEqual(values(call.weighted_trace),expectedWeighted,`${label}: weighted witnesses`);assert.deepEqual(values(call.transform_trace),expectedTransform,`${label}: transforms`);assert.deepEqual(values(call.generator_ideal),expectedIdeal,`${label}: ideal`);assert.deepEqual(factors(call),expectedFactors,`${label}: factors`);assert.deepEqual(values(call.relation_exponents),[-3n,-1n]);assert.deepEqual(values(call.candidate_cursor),[5n]);assert.deepEqual(values(call.invariants).slice(0,1),[24n]);assert.deepEqual(values(call.class_number),[24n]);assert.deepEqual(values(call.ga),fixture.Ga);assert.deepEqual(values(call.gd),fixture.GD);assert.deepEqual(values(call.generator_arch),fixture.ga);assert.deepEqual(call.connection_state,[0n,2n,4n,5n,2n,-3n,-1n]); }

(async()=>{
  verifyPari();
  const raw=plainWorkspace(),serial=JSON.stringify(raw,(_,value)=>typeof value==="bigint"?value.toString():value);
  const python=run("python3",["-c",`import importlib,inspect,json,sys\nsys.path[:0]=sys.argv[1:3]\nm=importlib.import_module('bench.pari-class-group-port.signed_genback_computed_t2');f=m.pari_signed_genback_computed_t2_assembly;v=json.load(sys.stdin);floats={'lll_mu','lll_r','lll_s','lll_approximate','lll_float_gram','lll_float_scratch','lll_temporary'}\nfor k,x in list(v.items()):\n if isinstance(x,list):v[k]=[float(y) if k in floats else int(y) for y in x]\n else:v[k]=int(x)\nassert f(*(v[k] for k in inspect.signature(f).parameters))==0\ndef enc(x):return [enc(y) for y in x] if isinstance(x,list) else str(x) if isinstance(x,int) else x\nprint(json.dumps({k:enc(v[k]) for k in ['candidate_trace','inverse_trace','weighted_trace','transform_trace','generator_ideal','relation_exponents','factor_kinds','compact_values','factor_exponents','compact_metadata','candidate_cursor','invariants','class_number','ga','gd','generator_arch','connection_state']}))`,path.resolve(directory,"../.."),path.resolve(directory,"../../src/lib")],{input:serial});
  const py=JSON.parse(python,(_,value)=>typeof value==="string"&&/^-?\d+$/.test(value)?BigInt(value):value);Object.assign(raw,py);check(raw,"cpython");
  if(process.env.SAGEJS_ORACLE_ONLY==="1"){console.log("computed cubic T2 candidates and assembly match pristine PARI 2.17.4 and CPython");return;}
  const built=await compileKernel({sourcePath}),api=require(built.modulePath).pari_signed_genback_computed_t2_assembly;
  for(const backend of ["javascript","gmp","tagged"]){const call=nativeWorkspace(api,backend);assert.equal(api[backend](...names.map((name)=>call[name])),0n,backend);check(call,backend);
    const short=nativeWorkspace(api,backend);short.candidate_trace=backend==="javascript"?Array(14).fill(0n):api.createIntegerBuffer(14,1024,Array(14).fill(0n));assert.throws(()=>api[backend](...names.map((name)=>short[name])),/short frozen computed-T2/);assert.deepEqual(values(short.generator_ideal),Array(9).fill(0n));
    const shortWitness=nativeWorkspace(api,backend);shortWitness.inverse_trace=backend==="javascript"?Array(44).fill(0n):api.createIntegerBuffer(44,1024,Array(44).fill(0n));assert.throws(()=>api[backend](...names.map((name)=>shortWitness[name])),/short frozen computed-T2/);assert.deepEqual(values(shortWitness.generator_ideal),Array(9).fill(0n));
    const shape=nativeWorkspace(api,backend);shape.prime_count=1n;assert.throws(()=>api[backend](...names.map((name)=>shape[name])),/shape/);
  }
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call|v8::/);
  console.log("computed cubic T2/LLL candidates feed signed class assembly across PARI, CPython, JS, GMP, and tagged backends");
  console.log(JSON.stringify({fixture:"x^3-200*x+7",candidates:5,witnessMatrices:15,classNumber:24,backends:["PARI","CPython","javascript","gmp","tagged"],coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch((error)=>{console.error(error);process.exitCode=1;});
