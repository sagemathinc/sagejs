"use strict";
const fs = require("node:fs");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = filename => sha(fs.readFileSync(filename));
const options = {root:process.cwd(),python:"python3",count:10000,warmups:3,samples:7,oracleOnly:false};
for (let i=2;i<process.argv.length;i++) {
  const argument = process.argv[i];
  if (argument === "--oracle-only") options.oracleOnly = true;
  else if (["--root","--python","--out","--count","--warmups","--samples"].includes(argument)) {
    const value = process.argv[++i];
    if (!value || value.startsWith("--")) throw Error(`missing ${argument}`);
    options[argument.slice(2)] = value;
  } else throw Error(`unknown option ${argument}`);
}
for (const field of ["count","warmups","samples"]) {
  options[field] = Number(options[field]);
  if (!Number.isSafeInteger(options[field]) || options[field] < 1) throw Error(`invalid ${field}`);
}
if (!options.out) throw Error("--out is required");
options.root = path.resolve(options.root);
const modes = ["explicit","branch"];
const kinds = ["boolean","number","string","list","custom-bool","custom-len"];
const source = fs.readFileSync(path.join(__dirname,"cases.py"),"utf8");
const driverSha256 = fileHash(__filename);
const program = source + `
for mode in ("explicit", "branch"):
    for kind in ("boolean", "number", "string", "list", "custom-bool", "custom-len"):
        for warmup in range(${options.warmups}):
            assert probe(mode, kind, ${options.count})[1] == ${options.count * 2}
        for sample in range(${options.samples}):
            elapsed, total = probe(mode, kind, ${options.count})
            assert total == ${options.count * 2}
            print(mode, kind, sample, elapsed, total)
`;
function parse(output) {
  const lines = output.trim().split(/\r?\n/);
  if (lines.length !== modes.length*kinds.length*options.samples) throw Error("incomplete benchmark output");
  let position = 0;
  const rows = [];
  for (const mode of modes) for (const kind of kinds) for (let sample=0;sample<options.samples;sample++) {
    const fields = lines[position++].trim().split(/\s+/);
    if (fields.length !== 5 || fields[0] !== mode || fields[1] !== kind || Number(fields[2]) !== sample ||
      !Number.isFinite(Number(fields[3])) || Number(fields[3]) <= 0 || Number(fields[4]) !== options.count*2) {
      throw Error(`invalid sample ${fields.join(" ")}`);
    }
    rows.push({mode,kind,sample,seconds:Number(fields[3]),checksum:Number(fields[4])});
  }
  return rows;
}
async function main() {
  const environment = {...process.env,PYTHONDONTWRITEBYTECODE:"1",PYTHONHASHSEED:"0",TZ:"UTC"};
  const identify = JSON.parse(cp.execFileSync(options.python,["-BS","-c",
    "import json,platform,sys; print(json.dumps(dict(implementation=platform.python_implementation(),version=platform.python_version(),executable=sys.executable)))"],
  {encoding:"utf8",env:environment,timeout:10000}));
  if (identify.implementation !== "CPython" || identify.version !== "3.14.4") throw Error("exact CPython 3.14.4 required");
  identify.executable = fs.realpathSync(identify.executable);
  identify.sha256 = fileHash(identify.executable);
  const receipt = require(path.join(options.root,"scripts/build-receipt.cjs"));
  const git = args => cp.execFileSync("git",args,{cwd:options.root,encoding:"utf8"}).trim();
  const capture = () => ({commit:git(["rev-parse","HEAD"]),dirty:git(["status","--porcelain"]),
    workspaceSha256:receipt.workspaceFingerprint(options.root),
    artifactInputsSha256:receipt.artifactInputsFingerprint(options.root),
    inputs:Object.fromEntries(["src/baselib/builtins.py","src/output/stream.py","src/output/operators.py"].map(name => [name,fileHash(path.join(options.root,name))])),
    ...(options.oracleOnly ? {} : {build:receipt.inspectBuildReceipt(options.root),
      artifacts:Object.fromEntries(["dist/build-receipt.json","dist/tools/kernel.js","dist/compiler/compiler.js",
        "dist/runtime-cache/runtime-bootstrap-python.js"].map(name => [name,fileHash(path.join(options.root,name))]))}),
  });
  const before = capture();
  if (!options.oracleOnly && !before.build.current) throw Error(`current-source build required: ${before.build.reason}`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-truth-run-"));
  try {
    const programFile = path.join(scratch,"program.py");
    fs.writeFileSync(programFile,program);
    const oracle = parse(cp.execFileSync(identify.executable,["-BS",programFile],
      {encoding:"utf8",env:environment,timeout:300000,maxBuffer:1024*1024}));
    let subject = null;
    if (!options.oracleOnly) {
      const {createSage} = require(path.join(options.root,"dist/tools/kernel.js"));
      const sage = await createSage({mode:"python"});
      try {
        const result = await sage.evaluate(program);
        if (result.stderr) throw Error(result.stderr);
        subject = parse(result.stdout);
      } finally { await sage.close(); }
    }
    const after = capture();
    if (JSON.stringify(before) !== JSON.stringify(after) || identify.sha256 !== fileHash(identify.executable) ||
      driverSha256 !== fileHash(__filename) || sha(source) !== fileHash(path.join(__dirname,"cases.py"))) {
      throw Error("source, artifacts or reference executable changed during measurement");
    }
    const report = {scope:"local diagnostic; warmed body; no comparative performance qualification",options,
      operationsPerSample:4*options.count,sourceSha256:sha(source),programSha256:sha(program),
      driverSha256,program,reference:identify,
      runtime:{node:process.versions.node,v8:process.versions.v8,platform:process.platform,arch:process.arch,
        cpu:os.cpus()[0]?.model,
        executable:process.execPath,executableSha256:fileHash(process.execPath)},before,after,oracle,subject};
    fs.writeFileSync(path.resolve(options.out),JSON.stringify(report,null,2)+"\n");
    const median = values => {const sorted=values.toSorted((a,b)=>a-b);const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;};
    for (const mode of modes) for (const kind of kinds) {
      const ms = rows => rows === null ? null : 1000*median(rows.filter(row=>row.mode===mode&&row.kind===kind).map(row=>row.seconds));
      console.log(JSON.stringify({mode,kind,oracleMs:ms(oracle),subjectMs:ms(subject)}));
    }
  } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
