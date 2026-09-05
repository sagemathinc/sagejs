"use strict";
// No download, package installation, production dispatch or existing overwrite.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const [includeArg,outputArg]=process.argv.slice(2);
if(!includeArg||!outputArg||process.argv.length!==4)throw Error("usage: eigen-probe.cjs EIGEN_SOURCE OUTPUT_DIRECTORY");
const include=path.resolve(includeArg),output=path.resolve(outputArg);
if(fs.existsSync(output))throw Error("output already exists");
const source=path.join(__dirname,"eigen-probe.cpp");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function snapshot(){
  const files=[];
  function visit(relative){const file=path.join(include,relative);const stat=fs.lstatSync(file);
    if(stat.isDirectory()){for(const name of fs.readdirSync(file).sort())visit(relative+"/"+name);}
    else if(stat.isFile())files.push([relative,hash(fs.readFileSync(file))]);
    else throw Error("unexpected nonregular source "+relative);
  }
  visit("Eigen");
  return {sha256:hash(JSON.stringify(files)),files:files.length};
}
const before=snapshot();
fs.mkdirSync(output,{recursive:true});
const executable=path.join(output,process.platform==="win32"?"probe.exe":"probe");
let command,args,flags;
if(process.platform==="win32"){
  const vswhere="C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe";
  const found=spawnSync(vswhere,["-latest","-products","*","-property","installationPath"],{encoding:"utf8",timeout:10000});
  if(found.error||found.status!==0||!found.stdout.trim())throw Error("native Visual Studio toolchain unavailable");
  const vcvars=path.join(found.stdout.trim(),"VC/Auxiliary/Build/vcvars64.bat");
  for(const p of [vcvars,include,source,executable])if(/["\r\n%]/.test(p))throw Error("unsupported shell path");
  flags=["/std:c++14","/EHsc","/O2","/fp:strict","/bigobj"];
  const batch=path.join(output,"compile.cmd");
  fs.writeFileSync(batch,`@echo off\r\ncall "${vcvars}"\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl /nologo ${flags.join(" ")} /I"${include}" "${source}" /Fe:"${executable}" /Fo:"${path.join(output,"probe.obj")}"\r\nexit /b %errorlevel%\r\n`);
  command=process.env.ComSpec||"cmd.exe";args=["/d","/c",batch];
}else{
  command=process.env.CXX||"c++";
  flags=["-std=c++14","-O2","-fno-fast-math","-ffp-contract=off"];
  args=[...flags,"-I"+include,source,"-o",executable];
}
const start=performance.now();
const build=spawnSync(command,args,{encoding:"utf8",timeout:180000,cwd:output});
const compileMs=performance.now()-start;
fs.writeFileSync(path.join(output,"build.log"),(build.stdout||"")+(build.stderr||"")+String(build.error||""));
const run=build.status===0?spawnSync(executable,[],{encoding:"utf8",timeout:30000}):null;
const after=snapshot();
const passed=build.status===0&&run?.status===0&&before.sha256===after.sha256;
const receipt={schema:"sagejs.eigen-dependency-probe/v1",passed,qualification:false,eigen_version:"5.0.0",source_sha256:hash(fs.readFileSync(source)),collector_sha256:hash(fs.readFileSync(__filename)),headers_before:before,headers_after:after,host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},compiler:command,flags,compile_ms:compileMs,build_status:build.status,run_status:run?.status,artifact:build.status===0?{bytes:fs.statSync(executable).size,sha256:hash(fs.readFileSync(executable))}:null,limitations:["tiny well-conditioned smoke only","not independent broad correctness corpus","not performance qualification","not production binding","no allocation-failure or cancellation qualification"]};
fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt));
if(!passed)process.exitCode=1;
