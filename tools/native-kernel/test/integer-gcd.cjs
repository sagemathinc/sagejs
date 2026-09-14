// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict"),{mkdtempSync,writeFileSync,readFileSync}=require("node:fs");
const {tmpdir}=require("node:os"),{join}=require("node:path"),{spawnSync}=require("node:child_process");
const test=require("node:test"),{compileKernel}=require("../compiler.cjs"),{lowerSource}=require("../ir.cjs");
test("imported math.gcd lowers to exact native arithmetic without name dispatch",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-gcd-")),source=join(dir,"gcd.py");
  writeFileSync(source,`from sagejs.native import native
from math import gcd as divisor
@native
def common(a: int, b: int) -> int:
    return divisor(a,b)
@native
def repeated(a: int, b: int) -> int:
    a = divisor(a,b)
    return divisor(a,b+1)
`);
  const b=await compileKernel({sourcePath:source}),mod=require(b.modulePath);
  const core=readFileSync(b.coreSourcePath,"utf8");
  assert.match(core,/mpz_gcd\(/);
  assert.doesNotMatch(core,/napi_call_function|PyObject_Call/);
  if(process.platform==="linux" && process.env.SAGEJS_FLINT_PREFIX){
    const harness=join(dir,"sanitize.c"),exe=join(dir,"sanitize"),prefix=process.env.SAGEJS_FLINT_PREFIX;
    writeFileSync(harness,`#include "${b.coreSourcePath}"
#include <assert.h>
int main(void){
int64_t v[]={INT64_MIN,0,1,-1,12,-12,INT64_MAX};
const char *s[]={"-9223372036854775808","0","1","-1","12","-12","9223372036854775807"};
mpz_t x,y,expected;mpz_inits(x,y,expected,NULL);
for(int i=0;i<7;i++)for(int j=0;j<7;j++){
sagejs_tagged_int a,b,out;sagejs_tagged_init(&a);sagejs_tagged_init(&b);sagejs_tagged_init(&out);
sagejs_tagged_set_small(&a,v[i]);sagejs_tagged_set_small(&b,v[j]);
mpz_set_str(x,s[i],10);mpz_set_str(y,s[j],10);mpz_gcd(expected,x,y);
sagejs_native_status status={0};assert(tagged_common(&status,&out,&a,&b));
sagejs_tagged_make_big(&out);assert(mpz_cmp(out.big,expected)==0);
sagejs_tagged_set_small(&a,v[i]);sagejs_tagged_set_small(&b,v[j]);
sagejs_tagged_gcd(&a,&a,&b);sagejs_tagged_make_big(&a);assert(mpz_cmp(a.big,expected)==0);
sagejs_tagged_clear(&a);sagejs_tagged_clear(&b);sagejs_tagged_clear(&out);
}mpz_clears(x,y,expected,NULL);return 0;}
`);
    const cc=spawnSync("cc",["-O1","-g","-fsanitize=address,undefined","-fno-omit-frame-pointer","-I"+join(prefix,"include"),harness,join(prefix,"lib/libgmp.a"),"-lm","-o",exe],{encoding:"utf8",timeout:30000});
    assert.equal(cc.status,0,cc.stderr);
    const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000});assert.equal(run.status,0,run.stderr);
  }
  const values=[0n,1n,-1n,2n,-12n,1n<<63n,-(1n<<63n),(1n<<512n)-1n,(1n<<4096n)+15n];
  const pairs=values.flatMap(a=>values.map(b=>[a,b]));
  const oracle=spawnSync("python3",["-c","import json,sys,math; print(json.dumps([[str(math.gcd(int(a),int(b))),str(math.gcd(math.gcd(int(a),int(b)),int(b)+1))] for a,b in json.load(sys.stdin)]))"],{input:JSON.stringify(pairs.map(r=>r.map(String))),encoding:"utf8",timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);const expected=JSON.parse(oracle.stdout);
  for(let i=0;i<pairs.length;i++)for(const [j,name] of ["common","repeated"].entries())
    for(const f of [mod[name].javascript,mod[name].gmp,mod[name].tagged])assert.equal(f(...pairs[i]),BigInt(expected[i][j]));
  for(const call of ["gcd(a)","gcd(a,b,c=1)","gcd(a,1.5)"])
    await assert.rejects(()=>lowerSource(`from math import gcd\ndef f(a: int,b: int)->int:\n    return ${call}\n`,"bad.py"),/gcd|native/);
  await assert.rejects(()=>lowerSource("from math import gcd\ndef f(gcd: int,b: int)->int:\n    return gcd(b,b)\n","shadow.py"),/shadowed/);
  await assert.rejects(()=>lowerSource("from math import gcd\ndef f(a: int,b: int)->int:\n    gcd=2\n    return gcd(a,b)\n","shadow.py"),/shadowed/);
  await assert.rejects(()=>lowerSource("def f(a: int,b: int)->int:\n    return gcd(a,b)\n","unbound.py"),/gcd|unsupported/);
  await assert.rejects(()=>lowerSource("from math import gcd\nfrom math import sqrt as gcd\ndef f(a: int,b: int)->int:\n    return gcd(a,b)\n","ambiguous.py"),/ambiguous/);
  await assert.rejects(()=>lowerSource("from math import gcd\ndef gcd(a: int,b: int)->int:\n    return a+b\ndef f(a: int,b: int)->int:\n    return gcd(a,b)\n","shadow.py"),/shadowed/);
});
