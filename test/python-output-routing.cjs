// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { EventEmitter } = require("node:events");
const { runInThisContext } = require("node:vm");
const { createRequire } = require("node:module");
const { sha256, caseEvidence } = require("../tools/python-compat/evidence.cjs");
const { makeBaselineRecord, applyIntentionalIncompatibilities } = require("../tools/python-compat/output-baseline.cjs");
const { runOutputSuite, validateSelection, defaultJobs } = require("../tools/python-compat/output-suite.cjs");
const { legacyEnvironment, runOne } = require("../tools/python-compat/legacy-output-runner.cjs");

const execution = output => ({status:0, signal:null, error:null, timedOut:false,
  output, stdout:output, stderr:""});

function fixture(context) {
  const directory = fs.mkdtempSync(join(tmpdir(), "sagejs-output-routing-"));
  context.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  fs.mkdirSync(join(directory,"basics"));
  const reference = {implementation:"CPython",version:"3.14.4",majorMinor:"3.14",
    executable:process.execPath,executableSha256:sha256(fs.readFileSync(process.execPath))};
  const entries = ["a.py","b.py"].map(name => {
    fs.writeFileSync(join(directory,"basics",name), "print('ordinary Python')\n");
    return {id:`micropython/basics/${name.slice(0,-3)}`,suite:"micropython",
      directory,path:`basics/${name}`,timeoutMs:5000,performanceScopes:[],
      sourceSha256:sha256(fs.readFileSync(join(directory,"basics",name))),
      comparison:"cpython-output-baseline-v2",executionProfile:"micropython-corpus-v1"};
  });
  const ev = (entry,text) => caseEvidence(entry.sourceSha256,execution("oracle\n"),execution(text));
  const reviews = {format:2,tests:{"b.py":{expectedStatus:"output-mismatch",
    reason:"synthetic reviewed output difference",reference:{implementation:"CPython",version:"3.14.4"},
    evidence:ev(entries[1],"subject\n"),alternateEvidence:[ev(entries[1],"alternate\n")]}}};
  const raw = [{name:"a.py",status:"pass",detail:"",evidence:ev(entries[0],"oracle\n")},
    {name:"b.py",status:"output-mismatch",detail:"",evidence:reviews.tests["b.py"].evidence}];
  const excluded = {expected:[],unittest:[]};
  const source = {revision:"a".repeat(40)}, provenance = {synthetic:true};
  const baseline = makeBaselineRecord(applyIntentionalIncompatibilities(raw,reviews.tests,reference),
    reference,excluded,provenance,source);
  const metadata = {baseline,reviews,excluded,candidates:["a.py","b.py"]};
  const calls = [];
  const environment = legacyEnvironment({PATH:"retained-path",PYTHONPATH:"retained-pythonpath",
    NODE_OPTIONS:"retained-node-options",HOME:"retained-home"});
  const execute = async (command,args,options) => {
    calls.push({command,args,options});
    if (args.includes("-c")) return execution(args.at(-1).includes("json")
      ? JSON.stringify(reference) : "CPython\n3.14.4\n");
    return execution(args[0] === "-BS" || args.at(-1).endsWith("a.py")
      ? "oracle\n" : "subject\n");
  };
  return {directory,entries,reference,metadata,calls,environment,execute};
}

test("legacy suite preserves arguments and evidence with additional pinned-interpreter preflight", async context => {
  const f=fixture(context);
  const suite = await runOutputSuite([...f.entries].reverse(),f.metadata,f.reference,
    {root:f.directory,python:"pinned-python",execute:f.execute,environment:f.environment,jobs:1});
  assert.equal(suite.passed,true);
  assert.deepEqual(suite.changes,[]);
  assert.deepEqual(suite.results.map(r=>r.status),["pass","intentional-incompatibility"]);
  assert.deepEqual(f.calls[0].args,["-BS","-c",
    "import platform; print(platform.python_implementation()); print(platform.python_version())"]);
  assert.equal(f.calls[0].options.cwd,f.directory);
  assert.ok(defaultJobs() >= 1 && defaultJobs() <= 8);
  for (const call of f.calls) {
    assert.equal(call.options.env,f.environment);
    assert.equal(call.options.timeout,5000);
    assert.equal(call.options.maxOutputBytes,undefined);
  }
  assert.equal(f.calls[1].options.cwd,join(f.directory,"basics"));
  assert.deepEqual(f.calls[2].args,["-BS",join(f.directory,"basics/a.py")]);
  assert.equal(f.calls[2].command,f.reference.executable);
  assert.equal(suite.reference.command,"pinned-python");
  assert.equal(suite.reference.executionCommand,f.reference.executable);
  assert.deepEqual(f.calls[3].args,[join(f.directory,"bin/sagejs-source.cjs"),"--python",
    join(f.directory,"basics/a.py")]);
  assert.equal(f.calls[3].command,process.execPath);
  assert.equal(f.calls[3].options.cwd,join(f.directory,"basics"));
  assert.equal(f.environment.NODE_OPTIONS,"retained-node-options");
  assert.equal(f.environment.PYTHONPATH,"retained-pythonpath");
  assert.equal(f.environment.HOME,"retained-home");
  assert.equal(f.environment.PYTHONHASHSEED,"0");
});

test("baseline drift fails even for ordinary passes; only pinned review alternatives pass",async context=>{
  const f=fixture(context);
  const run = text => runOutputSuite(f.entries,f.metadata,f.reference,{
    root:f.directory,python:"pinned-python",environment:f.environment,jobs:1,
    execute:async(command,args,options)=>{
      if (!args.includes("-c") && args.at(-1).endsWith("a.py")) return execution("changed identically\n");
      const result=await f.execute(command,args,options);
      return args[0] !== "-BS" ? execution(text) : result;
    }});
  const drift = await run("alternate\n");
  assert.equal(drift.results[0].status,"pass");
  assert.equal(drift.results[1].status,"intentional-incompatibility");
  assert.equal(drift.passed,false);
  assert.ok(drift.changes.length>0);
  const unreviewed = await run("third unreviewed output\n");
  assert.equal(unreviewed.results[1].status,"output-mismatch");
  assert.equal(unreviewed.passed,false);
  const alternate = await runOutputSuite(f.entries,f.metadata,f.reference,{
    root:f.directory,python:"pinned-python",environment:f.environment,jobs:1,
    execute:async(command,args,options)=>args[0] !== "-BS" && args.at(-1).endsWith("b.py")
      ? execution("alternate\n") : f.execute(command,args,options)});
  assert.equal(alternate.passed,true);
});

test("legacy adapter rejects same-version interpreter substitution before case execution",async context=>{
  const f=fixture(context);
  const alternate=join(f.directory,"other-python");
  fs.writeFileSync(alternate,"synthetic alternate interpreter bytes");
  for (const identity of [
    {...f.reference,executable:alternate},
    {...f.reference,version:"3.14.5"},
  ]) {
    let calls=0;
    await assert.rejects(runOutputSuite(f.entries,f.metadata,f.reference,{
      root:f.directory,python:"pinned-python",environment:f.environment,
      execute:async(command,args,options)=>{
        calls++;
        return args.at(-1).includes("json") ? execution(JSON.stringify(identity))
          : f.execute(command,args,options);
      },
    }),/oracle executable differs/);
    assert.equal(calls,2);
  }
  await assert.rejects(runOutputSuite(f.entries,f.metadata,
    {...f.reference,executableSha256:"0".repeat(64)}, {
      root:f.directory,python:"pinned-python",environment:f.environment,execute:f.execute,
    }),/oracle executable differs/);
});

test("partial output scope is diagnosis only, and other comparison values fail closed",async context=>{
  const f=fixture(context);
  const loaded={outputComparisons:{micropython:f.metadata}};
  assert.throws(()=>validateSelection(loaded,[f.entries[0]],false),/complete suite/);
  validateSelection(loaded,[f.entries[0]],true);
  assert.throws(()=>validateSelection(loaded,[{comparison:"unknown"}],true),/unsupported comparison/);
  const partial=await runOutputSuite([f.entries[0]],f.metadata,f.reference,{
    root:f.directory,python:"pinned-python",execute:f.execute,environment:f.environment});
  assert.equal(partial.complete,false);
  assert.equal(partial.passed,false);
  assert.equal(partial.changes,null);
});

test("oracle identity and error precedence remain before subject execution",async context=>{
  const f=fixture(context);
  let calls=0;
  await assert.rejects(runOutputSuite(f.entries,f.metadata,f.reference,{
    root:f.directory,python:"pinned-python",execute:async()=>{calls++;return execution("CPython\n3.14.5\n");}
  }),/oracle identity differs/);
  assert.equal(calls,1);
  for (const [overrides,status] of [
    [{error:{message:"launch"},timedOut:true,status:1},"launch-error"],
    [{timedOut:true,status:1},"oracle-error"],
    [{status:1},"oracle-error"],
  ]) {
    calls=0;
    const result=await runOne({name:"a.py",file:join(f.directory,"basics/a.py")},
      {python:"pinned-python",timeout:5000},f.environment,{
        corpusRoot:join(f.directory,"basics"),sagejs:"unused",
        execute:async()=>{calls++;return {...execution("bad"),...overrides};}});
    assert.equal(result.status,status);
    assert.equal(calls,1);
    assert.equal(result.executions.subject,null);
  }
});

test("extracted executor retains byte ordering and raw invalid UTF-8 without child processes",async()=>{
  const filename=join(__dirname,"../tools/python-compat/legacy-output-runner.cjs");
  const nativeRequire=createRequire(filename);
  const module={exports:{}};
  const child=new EventEmitter();
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  const injectedRequire=name=>name==="node:child_process"?{spawn:()=>{
    process.nextTick(()=>{
      child.stdout.emit("data",Buffer.from([0xff,13]));
      child.stderr.emit("data",Buffer.from([10,0x65]));
      child.stdout.emit("data",Buffer.from([0x6e,0x64]));
      child.emit("close",0,null);
    });
    return child;
  }}:nativeRequire(name);
  runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename,"utf8")}\n})`,
    {filename})(injectedRequire,module,module.exports);
  const result=await module.exports.execute("unused",[],{cwd:"unused",env:{},timeout:5000});
  assert.equal(result.raw.output,Buffer.from([0xff,13,10,0x65,0x6e,0x64]).toString("base64"));
  assert.equal(result.raw.stdout,Buffer.from([0xff,13,0x6e,0x64]).toString("base64"));
  assert.equal(result.raw.stderr,Buffer.from([10,0x65]).toString("base64"));
  assert.equal(result.output,"�\nend");
  assert.equal(result.status,0);
});

test("generic orchestration dispatches both profiles and retains workspace/artifact/source/build guards", async context => {
  const f=fixture(context);
  const filename=join(__dirname,"../scripts/run-python-compat.cjs");
  const nativeRequire=createRequire(filename);
  const assertion={...f.entries[0],id:"assertion/example",suite:"assertion",
    comparison:"assertion-exit-empty-output",fixtures:[],performanceScopes:[],
    disposition:"required",valueTags:["language"],priority:"P1",maxOutputBytes:4096};
  const entries=[assertion,...f.entries.map(entry=>({...entry,disposition:"required",valueTags:["language"]}))];
  for (const failure of [null,"workspace","artifact","reference","source","build","baseline","artifact-report","infrastructure"]) {
    let mutated=false, report, assertionCalls=0, outputCalls=0;
    const loaded={manifest:{oracle:f.reference},cases:entries,
      provenance:{source:"original"},outputComparisons:{micropython:f.metadata}};
    const module={exports:{}};
    const injectedRequire=name=>{
      if (name==="node:fs") return {...fs,
        readFileSync:(file,...args)=>{
          if (file===process.execPath || /(?:dist|bin)[\\/]/.test(file)) {
            return Buffer.from(mutated && (failure==="artifact" ||
              (failure==="reference" && file===process.execPath))?"changed":"original");
          }
          return fs.readFileSync(file,...args);
        },
        writeFileSync:(file,text)=>{report=JSON.parse(text);},
      };
      if (name.endsWith("/manifest.cjs")) return {loadManifest:()=>({
        ...loaded,provenance:{source:mutated && failure==="source"?"changed":"original"},
      })};
      if (name==="./build-receipt.cjs") return {
        workspaceFingerprint:()=>mutated && failure==="workspace"?"changed":"original",
        inspectBuildReceipt:()=>({current:!(mutated && failure==="build")}),
        currentBuildIdentity:()=>({fixed:true}),outputBindings:()=>({}),outputWitnesses:()=>({}),
      };
      if (name.endsWith("/assertion-runner.cjs")) return {
        classifyAssertion:nativeRequire(name).classifyAssertion,
        executeAssertion:async(command,args,options)=>{
          if (args.includes("-c")) return execution(JSON.stringify({
            implementation:"CPython",version:"3.14.4",executable:process.execPath}));
          assertionCalls++;
          assert.equal(options.maxOutputBytes,4096);
          assert.equal(options.timeoutMs,5000);
          assert.equal(options.env.PYTHONPATH,undefined);
          assert.equal(options.cwd,options.env.HOME);
          assert.equal(args.at(-1),"case.py");
          if (assertionCalls===2) assert.equal(args[0],"--max-old-space-size=512");
          return execution("");
        },
      };
      if (name.endsWith("/output-suite.cjs")) return {
        validateSelection,
        runOutputSuite:async(selected,metadata,reference,options)=>{
          outputCalls++;
          assert.deepEqual(selected,entries.slice(1));
          assert.equal(options.python,"pinned-python");
          mutated=true;
          return {reference:f.reference,provenance:metadata.baseline.provenance,
            excluded:metadata.excluded,complete:true,changes:failure==="baseline"?["drift"]:[],
            passed:!["baseline","infrastructure"].includes(failure),
            infrastructureFailure:failure==="infrastructure",
            results:[{name:"a.py",status:"pass"},{name:"b.py",status:"intentional-incompatibility"}]};
        },
      };
      return nativeRequire(name);
    };
    runInThisContext(`(function(require,module,exports,__dirname,console){${fs.readFileSync(filename,"utf8").replace(/^#![^\n]*\n/,"")}\n})`,
      {filename})(injectedRequire,module,module.exports,join(__dirname,"../scripts"),{log(){},error(){}});
    const artifactOnly=["artifact-report","infrastructure"].includes(failure);
    const promise=module.exports.main(["--python","pinned-python","--json","unused.json",
      ...(artifactOnly?["--artifact-report"]:[])]);
    if (["workspace","artifact","reference","source"].includes(failure)) {
      await assert.rejects(promise,/changed during execution/);
    } else if (failure==="infrastructure") {
      await assert.rejects(promise,/infrastructure failures/);
    } else assert.equal(await promise,failure && !artifactOnly?1:0);
    assert.equal(assertionCalls,2);
    assert.equal(outputCalls,1);
    assert.equal(report.gate.qualified,failure===null);
    for (const result of report.results) {
      assert.deepEqual(result.performance, {
        status:"unmeasured",scopes:[],
        note:"Execution duration includes process startup and is not comparative performance qualification.",
      });
    }
    // Flattened generic results add explicit non-qualification metadata without
    // changing the original legacy report capsule or claiming measured speed.
    assert.ok(report.outputSuites.micropython.results.every(result =>
      !Object.hasOwn(result,"performance")));
    assert.equal(report.outputSuites.micropython.schema,"sagejs.python-conformance-report/v1");
    assert.equal(report.outputSuites.micropython.gate.status,artifactOnly?"not-requested":failure?"failed":"passed");
  }
});
