// sagejs-test-tier: unit
"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {build,validate,summary,isqrt,query}=require("../bench/class-unit-groups/cubic-broad-corpus.cjs");
const {pilot,gpSource,parse}=require("../bench/class-unit-groups/cubic-broad-pari.cjs");
function fixture() {return {label:"3.1.23.1",r2:1,galt:2,coefficients:["-1","-1","0","1"],discriminant_absolute:"23",disc_sign:-1,
 class_number:"1",class_group:[],regulator:"0.281199574323",used_grh:false,d_band:0,r_band:"-1",h_band:"trivial",
 sample_rank:1,population:10,d_rank:100,h_rank:100,r_rank:100};}
test("broad corpus preserves exact data and deterministic selection identity",()=>{
 const raw=fixture();const a=build([raw],"date-a"),b=build([raw],"date-b");
 assert.equal(a.payload_sha256,b.payload_sha256);assert.equal(validate(a),a);
 assert.equal(a.records[0].equation_order_index,"1");assert.equal(a.records[0].polynomial_discriminant,"-23");
 assert.equal(summary(a).complex,1);assert.equal(pilot(a).length,1);
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
