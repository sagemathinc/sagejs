// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync} = require("node:fs");
const {tmpdir} = require("node:os"), {join,relative} = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {compileKernel} = require("../compiler.cjs"), {lowerSource} = require("../ir.cjs");
const {createNativeImportResolver} = require("../native-imports.cjs");
test("native import memoization isolates callers and revalidates dependency content",async()=>{
  const {createHash}=require("node:crypto");
  const hash=s=>createHash("sha256").update(s).digest("hex");
  const dir=mkdtempSync(join(tmpdir(),"sagejs-import-memo-"));
  writeFileSync(join(dir,"__init__.py"),"");
  const root=join(dir,"entry.py"),helper=join(dir,"helper.py"),leaf=join(dir,"leaf.py");
  writeFileSync(root,"");writeFileSync(helper,"@native\ndef helper(x:int)->int:\n    return x+1\n");writeFileSync(leaf,"first");
  let calls=0;
  const resolver=createNativeImportResolver({root:dir,initialSourcePath:root,lowerSource:async()=>{
    calls++;return {functions:[{name:"helper",body:[{value:calls}]}],nativeSourceDependencies:[{path:leaf,sha256:hash(readFileSync(leaf,"utf8"))}]};
  }});
  // Register the dependency's physical identity without lowering it: its
  // source intentionally has no native definition.
  assert.equal(await resolver({moduleName:".leaf",importedName:"leaf",importer:root}),null);
  const request={moduleName:".helper",importedName:"helper",localName:"helper",importer:root};
  const first=await resolver(request);first.ir.functions[0].body[0].value=999;
  const second=await resolver({...request,localName:"different"});
  assert.equal(calls,1);assert.equal(second.localName,"different");assert.equal(second.ir.functions[0].body[0].value,1);
  second.ir.functions[0].body[0].value=998;
  assert.equal((await resolver(request)).ir.functions[0].body[0].value,1);
  writeFileSync(leaf,"changed");await resolver(request);assert.equal(calls,2);
  writeFileSync(helper,readFileSync(helper,"utf8").replace("x+1","x+2"));await resolver(request);assert.equal(calls,3);
});
test("shared native import layers lower once per entry, not once per graph path",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-import-diamond-"));writeFileSync(join(dir,"__init__.py"),"");
  const header="from sagejs.native import native\n";
  for(let layer=0;layer<5;layer++){
    const imports=layer?`from .layer${layer-1} import left${layer-1}, right${layer-1}\n`:"";
    const value=layer?`left${layer-1}(x)+right${layer-1}(x)`:"x";
    writeFileSync(join(dir,`layer${layer}.py`),header+imports+`@native\ndef left${layer}(x:int)->int:\n    return ${value}\n@native\ndef right${layer}(x:int)->int:\n    return ${value}+1\n`);
  }
  const source=join(dir,"entry.py"),body=header+"from .layer4 import left4, right4\n@native\ndef entry(x:int)->int:\n    return left4(x)+right4(x)\n";writeFileSync(source,body);
  let calls=0;
  const resolver=createNativeImportResolver({root:dir,initialSourcePath:source,lowerSource:async(...args)=>{calls++;return lowerSource(...args);}});
  const ir=await lowerSource(body,source,{resolveNativeImport:resolver});
  assert.equal(calls,10);assert.equal(ir.nativeSourceDependencies.length,5);
});
test("portable root provenance may differ from imported dependency display paths",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-portable-relative-")),pkg=join(dir,"src","lib","example");
  mkdirSync(pkg,{recursive:true});writeFileSync(join(pkg,"__init__.py"),"");
  const source=join(pkg,"entry.py"),body="from sagejs.native import native\nfrom .helper import shifted\n@native\ndef entry(x:int)->int:\n    return shifted(x)\n";
  writeFileSync(source,body);
  writeFileSync(join(pkg,"helper.py"),"from sagejs.native import native\nfrom .leaf import square\n@native\ndef shifted(x:int)->int:\n    return square(x)+1\n");
  writeFileSync(join(pkg,"leaf.py"),"from sagejs.native import native\n@native\ndef square(x:int)->int:\n    return x*x\n");
  const logical="example/entry.py";
  const resolver=createNativeImportResolver({root:dir,lowerSource,initialSourcePath:source,initialDisplayPath:logical,displayPath:p=>relative(dir,p).replaceAll("\\","/")});
  const ir=await lowerSource(body,logical,{resolveNativeImport:resolver});
  assert.deepEqual(ir.nativeSourceDependencies.map(d=>d.path).sort(),["src/lib/example/helper.py","src/lib/example/leaf.py"]);
  assert(!JSON.stringify(ir).includes(dir));
  await assert.rejects(()=>resolver({moduleName:".helper",importedName:"shifted",importer:"unregistered/entry.py"}),/unknown relative import source/);
});
test("multiple entries from one source share a helper but distinct sources still conflict",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-shared-import-")),pkg=join(dir,"example");
  mkdirSync(pkg);writeFileSync(join(pkg,"__init__.py"),"");
  const leaf=join(pkg,"leaf.py"),source=join(pkg,"entry.py");
  const leafBody="from sagejs.native import native\n@native\ndef square(x:int)->int:\n    return x*x\n@native\ndef shifted(x:int)->int:\n    return square(x)+1\n";
  writeFileSync(leaf,leafBody);
  for(const names of ["square, shifted","shifted, square"]){
    writeFileSync(source,`from sagejs.native import native\nfrom .leaf import ${names}\n@native\ndef entry(x:int)->int:\n    return square(x)+shifted(x)\n`);
    const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
    for(const backend of ["javascript","gmp","tagged"])assert.equal(mod.entry[backend](1n<<80n),(1n<<161n)+1n);
    const py=spawnSync("python3",["-c",`import sys;sys.path[:0]=[${JSON.stringify(dir)},${JSON.stringify(join(__dirname,"../../../src/lib"))}];from example.entry import entry;print(entry(1<<80))`],{encoding:"utf8",timeout:30000});
    assert.equal(py.status,0,py.stderr);assert.equal(BigInt(py.stdout.trim()),(1n<<161n)+1n);
  }
  writeFileSync(join(pkg,"other.py"),leafBody);
  writeFileSync(source,"from sagejs.native import native\nfrom .leaf import square\nfrom .other import shifted\n@native\ndef entry(x:int)->int:\n    return square(x)+shifted(x)\n");
  await assert.rejects(()=>compileKernel({sourcePath:source}),/conflicts with square/);
  writeFileSync(join(pkg,"bridge.py"),"from sagejs.native import native\nfrom .leaf import square\n@native\ndef bridge(x:int)->int:\n    return square(x)+2\n");
  writeFileSync(source,"from sagejs.native import native\nfrom .leaf import square\nfrom .bridge import bridge\n@native\ndef entry(x:int)->int:\n    return square(x)+bridge(x)\n");
  const diamond=await compileKernel({sourcePath:source}),diamondModule=require(diamond.modulePath);
  for(const backend of ['javascript','gmp','tagged'])assert.equal(diamondModule.entry[backend](5n),52n);
  writeFileSync(leaf,leafBody.replace('x*x','x*x+10'));
  const changedDiamond=await compileKernel({sourcePath:source});assert.notEqual(changedDiamond.modulePath,diamond.modulePath);
  for(const backend of ['javascript','gmp','tagged'])assert.equal(require(changedDiamond.modulePath).entry[backend](5n),72n);
});
test("same-source proof-bearing imports tolerate analysis key reordering",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-import-proof-order-")),pkg=join(dir,"example");
  mkdirSync(pkg);writeFileSync(join(pkg,"__init__.py"),"");
  const leaf=join(pkg,"leaf.py"),bridge=join(pkg,"bridge.py"),source=join(pkg,"entry.py");
  writeFileSync(leaf,"from sagejs.native import native\n@native\ndef looped(x:int)->int:\n    total=0\n    for i in range(9):\n        total += x+i\n    return total\n");
  writeFileSync(bridge,"from sagejs.native import native\nfrom .leaf import looped\n@native\ndef bridged(x:int)->int:\n    return looped(x)+1\n");
  const body="from sagejs.native import native\nfrom .leaf import looped\nfrom .bridge import bridged\n@native\ndef entry(x:int)->int:\n    return looped(x)+bridged(x)\n";
  writeFileSync(source,body);
  const resolver=createNativeImportResolver({root:dir,initialSourcePath:source,lowerSource});
  const ir=await lowerSource(body,source,{resolveNativeImport:resolver});
  assert.equal(ir.functions.filter(fn=>fn.name==="looped").length,1);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  for(const backend of ["javascript","gmp","tagged"])assert.equal(mod.entry[backend](5n),163n);
});
test("relative native calls preserve source closure, fallback and dependency identity", async () => {
  const dir=mkdtempSync(join(tmpdir(),"sagejs-relative-")),pkg=join(dir,"example"),sub=join(pkg,"nested");
  mkdirSync(sub,{recursive:true});
  for(const d of [pkg,sub])writeFileSync(join(d,"__init__.py"),"");
  const leaf=join(pkg,"leaf.py"),helper=join(sub,"helper.py"),source=join(sub,"entry.py");
  writeFileSync(leaf,"from sagejs.native import native\n@native\ndef square(x: int) -> int:\n    return x*x\n");
  writeFileSync(helper,"from sagejs.native import native\nfrom ..leaf import square\n@native\ndef shifted(x: int) -> int:\n    return square(x)+1\n");
  const body="from sagejs.native import native\nfrom .helper import shifted\n@native\ndef entry(x: int) -> int:\n    return shifted(x)+2\n";
  writeFileSync(source,body);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  const x=1n<<129n;
  for(const backend of ["javascript","gmp","tagged"])assert.equal(mod.entry[backend](x),x*x+3n);
  const py=spawnSync("python3",["-c",`import sys; sys.path[:0]=[${JSON.stringify(dir)},${JSON.stringify(join(__dirname,"../../../src/lib"))}]; from example.nested.entry import entry; print(entry(1<<129))`],{encoding:"utf8",timeout:30000});
  assert.equal(py.status,0,py.stderr);assert.equal(BigInt(py.stdout.trim()),x*x+3n);
  assert.doesNotMatch(readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
  const resolver=createNativeImportResolver({root:dir,lowerSource,initialSourcePath:source,displayPath:p=>relative(dir,p)});
  const ir=await lowerSource(body,relative(dir,source),{resolveNativeImport:resolver});
  assert.equal(ir.nativeSourceDependencies.length,2);
  assert(ir.nativeSourceDependencies.every(d=>!d.path.startsWith(dir)&&d.sha256.length===64));
  writeFileSync(leaf,readFileSync(leaf,"utf8").replace("x*x","x*x+10"));
  const changed=await compileKernel({sourcePath:source});assert.notEqual(changed.modulePath,built.modulePath);
  assert.equal(require(changed.modulePath).entry.tagged(x),x*x+13n);
  writeFileSync(join(pkg,"math.py"),"from sagejs.native import native\n@native\ndef gcd(a: int,b: int)->int:\n    return a+b\n");
  writeFileSync(source,"from sagejs.native import native\nfrom ..math import gcd\n@native\ndef entry(x: int)->int:\n    return gcd(x,7)\n");
  const relativeMath=await compileKernel({sourcePath:source});
  assert.equal(require(relativeMath.modulePath).entry.tagged(5n),12n);
  writeFileSync(source,body);
  writeFileSync(helper,"from sagejs.native import native\nfrom .entry import entry\n@native\ndef shifted(x: int) -> int:\n    return entry(x)\n");
  await assert.rejects(()=>compileKernel({sourcePath:source}),/cyclic/);
  writeFileSync(source,body.replace(".helper","...leaf"));
  await assert.rejects(()=>compileKernel({sourcePath:source}),/cannot cross its root/);
  writeFileSync(source,body.replace(".helper",".missing"));
  await assert.rejects(()=>compileKernel({sourcePath:source}),/missing|unsupported|shifted/);
});
