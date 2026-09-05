"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),zlib=require("node:zlib");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {wasmKernelToolchain}=require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const root=path.resolve(__dirname,"../../..");
const [includeArg,outputArg]=process.argv.slice(2);
if(!includeArg||!outputArg||process.argv.length!==4)throw Error("usage: eigen-wasm-probe.cjs EIGEN_SOURCE OUTPUT_DIRECTORY");
const include=path.resolve(includeArg),output=path.resolve(outputArg);
if(fs.existsSync(output))throw Error("output already exists");
const source=path.join(__dirname,"eigen-probe.cpp");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const headers=[];
function visit(relative){const p=path.join(include,relative),stat=fs.lstatSync(p);if(stat.isDirectory()){for(const n of fs.readdirSync(p).sort())visit(relative+"/"+n);}else if(stat.isFile())headers.push([relative,hash(fs.readFileSync(p))]);else throw Error("nonregular header");}
visit("Eigen");
const headerDigest=hash(JSON.stringify(headers)),sourceDigest=hash(fs.readFileSync(source));
const tc=wasmKernelToolchain(root),compiler=path.join(path.dirname(tc.clang),"clang++");
const flags=["--target="+tc.target,"--sysroot="+tc.sysroot,"-std=c++14","-O2","-fno-exceptions","-fno-fast-math","-ffp-contract=off","-Wl,--no-entry","-Wl,--export=eigen_smoke","-mexec-model=reactor"];
fs.mkdirSync(output,{recursive:true});
const wasm=path.join(output,"probe.wasm"),start=performance.now();
const build=spawnSync(compiler,[...flags,"-I"+include,source,"-o",wasm],{encoding:"utf8",timeout:180000});
const compileMs=performance.now()-start;
fs.writeFileSync(path.join(output,"build.log"),(build.stdout||"")+(build.stderr||"")+String(build.error||""));
async function main(){
  if(build.status!==0)throw Error("Wasm compilation failed; see build.log");
  const bytes=fs.readFileSync(wasm),module=new WebAssembly.Module(bytes),imports=WebAssembly.Module.imports(module);
  const observations=[];
  for(const name of ["chromium","firefox","webkit"]){
    const browser=await require("playwright-core")[name].launch({headless:true});
    try {
      const page=await browser.newPage();
      const result=await page.evaluate(async b64=>{
        const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
        const reject=()=>{throw Error("unexpected host I/O in successful Eigen probe")};
        const {instance}=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:{fd_close:reject,fd_seek:reject,fd_write:reject}});
        instance.exports._initialize();
        return [instance.exports.eigen_smoke(),instance.exports.eigen_smoke()];
      },bytes.toString("base64"));
      observations.push({engine:name,version:browser.version(),results:result,passed:result.every(x=>x===0)});
    }finally{await browser.close();}
  }
  const before=headers.length;headers.length=0;visit("Eigen");
  if(headers.length!==before||hash(JSON.stringify(headers))!==headerDigest||hash(fs.readFileSync(source))!==sourceDigest)throw Error("inputs changed");
  const passed=observations.every(x=>x.passed);
  const receipt={schema:"sagejs.eigen-wasm-probe/v1",passed,qualification:false,eigen_version:"5.0.0",source_sha256:sourceDigest,collector_sha256:hash(fs.readFileSync(__filename)),headers:{sha256:headerDigest,files:headers.length},host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},compiler_sha256:hash(fs.readFileSync(compiler)),target:tc.target,flags,compile_ms:compileMs,artifact:{sha256:hash(bytes),bytes:bytes.length,gzip_bytes:zlib.gzipSync(bytes,{level:9}).length,imports},observations,limitations:["tiny well-conditioned smoke only","no independent broad corpus","not production binding","not performance qualification","no-exceptions configuration does not qualify allocation failure or recovery"]};
  fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(receipt));if(!passed)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
