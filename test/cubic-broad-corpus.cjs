// sagejs-test-tier: unit
"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {build,validate,summary,isqrt,query}=require("../bench/class-unit-groups/cubic-broad-corpus.cjs");
const {pilot,select,gpSource,parse}=require("../bench/class-unit-groups/cubic-broad-pari.cjs");
const {BEFORE,AFTER,ablate,wideDiscriminant,WIDE_INPUT,WIDE_INPUT_AFTER,WIDE_ANCHOR,WIDE_ENDPOINTS}=require("../bench/class-unit-groups/cubic-grh-envelope-ablation.cjs");
const {result,report}=require("../bench/class-unit-groups/cubic-broad-report.cjs");
function fixture() {return {label:"3.1.23.1",r2:1,galt:2,coefficients:["-1","-1","0","1"],discriminant_absolute:"23",disc_sign:-1,
 class_number:"1",class_group:[],regulator:"0.281199574323",used_grh:false,d_band:0,r_band:"-1",h_band:"trivial",
 sample_rank:1,population:10,d_rank:100,h_rank:100,r_rank:100};}
test("broad corpus preserves exact data and deterministic selection identity",()=>{
 const raw=fixture();const a=build([raw],"date-a"),b=build([raw],"date-b");
 assert.equal(a.payload_sha256,b.payload_sha256);assert.equal(validate(a),a);
 assert.equal(a.records[0].equation_order_index,"1");assert.equal(a.records[0].polynomial_discriminant,"-23");
 assert.equal(summary(a).complex,1);assert.equal(pilot(a).length,1);
 const heldout=build([{...raw,sample_rank:8}]);
 assert.equal(select(heldout,"plan").length,0);
 assert.equal(select(heldout,"all").length,1);
 assert.deepEqual(select(heldout,"plan-all"),select(heldout,"all"));
 assert.throws(()=>select(heldout,"typo"));
 for(const change of [{discriminant_absolute:"24"},{coefficients:["1);quit;", "0","0","1"]},
   {class_number:"2"},{class_group:["1"]},{sample_rank:11},{r2:0},{disc_sign:1}]) {
   assert.throws(()=>build([{...raw,...change}]));
 }
 assert.throws(()=>build([raw,raw]));
 const damaged=structuredClone(a);damaged.records[0].role="holdout";assert.throws(()=>validate(damaged));
 const unknown=build([{...raw,class_number:null,class_group:null,regulator:null,h_band:"unknown",r_band:"unknown"}]);
 assert.equal(summary(unknown).missing_answers,1);
 assert.match(query(),/REPEATABLE READ READ ONLY/);assert.match(query(),/statement_timeout/);
});
test("exact discriminant index and square root avoid machine-number rounding",()=>{
 const raw=fixture();const scaled=build([{...raw,coefficients:["-8","-4","0","1"]}]);
 assert.equal(scaled.records[0].equation_order_index,"8");
 for(let i=0n;i<300n;i++){const n=i*i;assert.equal(isqrt(n),i);assert.equal(isqrt(n+2n*i),i);}
 const big=(1n<<511n)+12345n;assert.equal(isqrt(big*big-1n),big-1n);assert.equal(isqrt(big*big),big);
 assert.throws(()=>isqrt(-1n));
});
test("PARI phase parsing distinguishes unknown answers, failures and false success",()=>{
 const r=build([fixture()]).records[0];
 const run={status:0,stdout:'["irreducible",1]\n["nf",2,1,"-23","1",[1,1]]\n["bnf",3,2,"1",[],"0.28"]\n',stderr:""};
 assert.equal(parse(run,r).status,"agree");
 assert.equal(parse(run,{...r,class_number:null,class_group:null}).status,"complete-no-database-answer");
 assert.equal(parse({...run,error:{code:"ETIMEDOUT"}},r).status,"timeout");
 assert.equal(parse({...run,stderr:"*** error in bnfinit"},r).status,"error");
 assert.equal(parse({...run,stderr:"*** Warning: increasing stack"},r).status,"agree");
 assert.equal(parse({...run,stdout:run.stdout.replace('"1",[],"0.28"','"2",[],"0.28"')},r).status,"malformed");
 assert.equal(parse({...run,stdout:run.stdout.replace('"1",[],"0.28"','"2",["2"],"0.28"')},r).status,"class-mismatch");
 assert.equal(parse({...run,stdout:run.stdout.replace('"-23"','"-31"')},r).status,"field-mismatch");
 assert.equal(parse({...run,stdout:'["bnf"]'},r).status,"incomplete");
 assert.match(gpSource(r),/bnfinit\(n,0\)/);assert.doesNotMatch(gpSource(r),/bnfcertify/);
 assert.throws(()=>gpSource({...r,coefficients:['quit()']}));
});
test("GRH envelope ablation retains capped search and final decline guards",()=>{
 const suffix="if bdf_value_limit > _CUBIC_MAX_FACTOR_SEARCH_BOUND:\nif grh_search_bound > _CUBIC_MAX_FACTOR_SEARCH_BOUND:\nor generator_bound > _CUBIC_MAX_FACTOR_SEARCH_BOUND\n";
 assert.equal(ablate("prefix\n"+BEFORE+suffix),"prefix\n"+AFTER+suffix);
 assert.throws(()=>ablate(BEFORE));assert.throws(()=>ablate(BEFORE+BEFORE+suffix));
 for(const m of [2n,8n,257n,4096n,4097n,10n**12n,10n**100n]) {
   const tableLimit=m<257n?m:257n;
   assert(tableLimit<=257n);
   const allocated=(tableLimit<32n?32n:tableLimit)+1n;
   assert(allocated<=258n);
   for(const proved of [0n,2n,8n,257n]) {
     const chosen=proved>0n&&proved<m?proved:m;
     if(chosen<=257n) assert(chosen===m||proved>0n);
     else assert(chosen>257n); // Existing final guard must reject.
   }
 }
});
test("broad report rejects false publication, missing results and wrong answers",()=>{
 const corpus=build([fixture()]),label=corpus.records[0].label;
 const out=Array(64).fill("0");out[0]="2";out[1]="1";out[28]="-23";out[29]="1";
 assert.deepEqual(result(out),{class_number:"1",invariants:[]});
 const pari={rows:[{label,status:"agree",class_number:"1",invariants:[],nf_wall_ms:1,bnf_wall_ms:2}]};
 const native={protocol:{source_hash:"source",cache_key:"key"},rows:[{label,status:"accepted",source_hash:"source",cache_key:"key",attempts:[{accepted:true,output:out}]}]};
 const summary=report(corpus,pari,[native,native]);
 assert.equal(summary.runs[0].statuses.accepted,1);
 assert.deepEqual(summary.runs[0].complex_pari_cost_bands,{"<10ms":{fields:1,statuses:{accepted:1}}});
 assert.deepEqual(summary.comparisons[0].parent_accepted_output_changes,[]);
 for(const [index,value] of [[0,"0"],[1,"2"],[2,"18"],[3,"1"],[28,"-24"],[29,"2"]]) {
   const damaged=structuredClone(native);damaged.rows[0].attempts[0].output[index]=value;
   if(index===3) damaged.rows[0].attempts[0].output[2]="1";
   assert.throws(()=>report(corpus,pari,[damaged]));
 }
 assert.throws(()=>report(corpus,{rows:[]},[native]));
 assert.throws(()=>report(corpus,{rows:[{label,status:"timeout"}]},[native]));
 assert.throws(()=>report(corpus,pari,[{...native,rows:[]}]));
});
test("wide discriminant uses exact source bounds without changing the small-prime batch",()=>{
 assert.equal(wideDiscriminant(WIDE_INPUT+WIDE_ANCHOR),WIDE_INPUT_AFTER+WIDE_ENDPOINTS+WIDE_ANCHOR);
 assert.throws(()=>wideDiscriminant(WIDE_INPUT));
 assert.throws(()=>wideDiscriminant(WIDE_INPUT+WIDE_INPUT+WIDE_ANCHOR));
 const cp=require("node:child_process"),fs=require("node:fs");
 const source=fs.readFileSync(require.resolve("../src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
 const candidate=wideDiscriminant(ablate(source));
 const script=`import ast, json, math, sys
data=json.load(sys.stdin)
ast.parse(data['candidate'])
tree=ast.parse(data['source'])
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('_cubic_floor_sqrt','_cubic_ceil_sqrt')]
assert len(functions)==2
for n in functions: n.decorator_list=[]
ns={'uint64':int,'checked_uint64':int}
exec(compile(ast.Module(body=functions,type_ignores=[]),'helpers','exec'),ns)
scale=2**96
for d in [2**32-1,2**32,2**64-1,2**64,2**127+17,2**521-1]:
    calls=[]
    def log_bounds(*args):
        calls.append(args)
        assert args[3:]==(d,1,96)
        return (11,12)
    env=dict(ns,absolute_discriminant=d,analytic_scale=scale,_CUBIC_ANALYTIC_PRECISION=96,
             bdf_values={},bdf_endpoints={},log_numerators=None,log_denominators=None,log_endpoints=None,
             _cubic_arb_log_positive_rational_bounds=log_bounds)
    body=data['input']+data['endpoints']+'        return bdf_values, bdf_endpoints\\n'
    exec('def check():\\n'+body,env)
    values,endpoints=env['check']()
    if d.bit_length()<=32:
        assert values[0,0]==d and not endpoints and not calls
    else:
        assert values[0,0]==1 and len(calls)==1
        n=d*scale*scale; lo=math.isqrt(n); hi=lo+(lo*lo<n)
        assert endpoints=={(0,0):11,(1,0):12,(2,0):lo,(3,0):hi}
print('wide-discriminant-exact-source-ok')
`;
 const run=cp.spawnSync("python3",["-c",script],{input:JSON.stringify({source,candidate,input:WIDE_INPUT_AFTER,endpoints:WIDE_ENDPOINTS}),encoding:"utf8",timeout:10000});
 assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/wide-discriminant-exact-source-ok/);
});
