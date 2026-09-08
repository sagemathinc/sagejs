"use strict";
// Discovery only, not public receipts or independent replay.
// Usage: node THIS BUILT_ROOT FROZEN_SURVEY.gz GP [LIMIT]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {gunzipSync} = require('node:zlib');
const {fork, spawnSync, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {cubicEquationIndex} = require('./cubic-equation-index.cjs');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const efforts = [5, 1, 7, 8];
function retryable(values) {
  if (values.length !== 64) return false;
  const phase = Number(values[63]);
  return [41, 42, 43, 8].includes(phase) || (phase === 44 && [437, 438].includes(Number(values[59])));
}
function loadKernel(root) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'dist/native-kernels/index.json')));
  const entry = index.logicalSources['sagejs/number_fields/cubic_class_number_native.py'];
  const source = fs.readFileSync(path.join(root, 'src/lib/sagejs/number_fields/cubic_class_number_native.py'));
  assert.equal(hash(source), entry.sourceHash);
  const runtime = fs.readFileSync(path.join(root, 'src/lib/sagejs/number_fields/cubic_class_number_native_runtime.py'));
  const text = runtime.toString();
  assert.ok(text.includes('_CUBIC_RELATION_EFFORTS = (5, 1, 7, 8)'));
  assert.ok(text.includes('phase in (41, 42, 43, 8) or (phase == 44 and int(values[59]) in (437, 438))'));
  const module = require(path.join(root, 'dist/native-kernels', entry.cacheKey, 'index.cjs'));
  assert.equal(module.nativeAvailable, true);
  const k = module.certified_complex_cubic_class_group_v1;
  return {k, identity: {cacheKey: entry.cacheKey, sourceHash: entry.sourceHash,
    runtimeHash: hash(runtime), packHash: hash(fs.readFileSync(path.join(root, 'dist/native-kernels/pack/sagejs_native_kernel_pack.node')))},
    out: k.createIntegerBuffer(64, 256),
    scratch: [k.createUInt64Buffer(4161), ...[512,4,9,16,16,144,48,109,1,1,1].map(n => k.createIntegerBuffer(n,64))]};
}
function calculate(state, coefficients) {
  const input = state.k.packIntegerBuffer(coefficients.map(BigInt));
  const attempts = [];
  let accepted = false;
  for (const effort of efforts) {
    const start = process.hrtime.bigint();
    try {
      accepted = state.k(state.out, input, ...state.scratch, 0, effort, 1048576, 3145728);
      const ns = String(process.hrtime.bigint() - start);
      const output = state.out.toArray().map(String);
      attempts.push({effort, accepted, ns, output});
      if (accepted || !retryable(output)) break;
    } catch (error) {
      attempts.push({effort, error: String(error), ns: String(process.hrtime.bigint() - start)});
      return {accepted: false, error: String(error), attempts};
    }
  }
  return {accepted, attempts};
}
if (process.argv[2] === '--worker') {
  const state = loadKernel(process.argv[3]);
  for (let i=0; i<10; i++) assert.equal(calculate(state, ['-63','-11','-1','1']).accepted, true);
  process.send({ready: true, identity: state.identity});
  process.on('message', message => process.send({id: message.id, result: calculate(state, message.coefficients)}));
} else if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = {retryable};
async function main() {
  const [root, corpus, gp, limitText] = process.argv.slice(2);
  const raw = gunzipSync(fs.readFileSync(corpus));
  const corpusHash = hash(raw);
  assert.equal(corpusHash, '81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd');
  const all = raw.toString().trim().split('\n').map(JSON.parse);
  const limit = limitText === undefined ? all.length : Number(limitText);
  assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= all.length);
  const records = all.slice(0, limit);
  const commit = execFileSync('git', ['rev-parse','HEAD'], {cwd: root, encoding:'utf8'}).trim();
  const identity = loadKernel(root).identity;
  const observations = [];
  let child = null;
  function request(payload, ready = false) {
    return new Promise((resolve) => {
      const finish = value => {
        clearTimeout(timer); child.off('message', message); child.off('exit', exited); resolve(value);
      };
      const message = value => { if (ready ? value.ready : value.id === payload.id) finish(value); };
      const exited = (code, signal) => finish({workerFailure: {code, signal}});
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish({timeout: true}); }, 30000);
      child.on('message', message); child.on('exit', exited);
      if (!ready) child.send(payload);
    });
  }
  const sort = a => [...a].map(String).sort((x,y) => BigInt(x)<BigInt(y)?-1:BigInt(x)>BigInt(y)?1:0);
  try {
    for (let id=0; id<records.length; id++) {
      if (!child) {
        child = fork(__filename, ['--worker', root], {env: {...process.env, SAGEJS_NATIVE_REQUIRED:'1'}, stdio:['ignore','ignore','inherit','ipc']});
        const ready = await request(null, true);
        assert.deepEqual(ready.identity, identity, JSON.stringify(ready));
      }
      const record = records[id];
      const reply = await request({id, coefficients:record.coefficients});
      let result = reply.result || reply;
      if (!reply.result) { child.kill('SIGKILL'); child = null; }
      if (result.accepted) {
        const output = result.attempts.at(-1).output;
        result.agrees = output[1] === record.class_number && JSON.stringify(sort(output.slice(3,3+Number(output[2])))) === JSON.stringify(sort(record.class_group));
      }
      observations.push({label:record.label, coefficients:record.coefficients,
        discriminant_absolute:record.discriminant_absolute, class_number:record.class_number,
        class_group:record.class_group, lmfdb_field_index:record.equation_order_index,
        equation_order_index:cubicEquationIndex({...record, discriminant:'-'+record.discriminant_absolute}),
        selection:record.selection, native:result});
      if ((id+1)%100===0) console.error('staged native',id+1);
    }
  } finally { if (child) child.kill('SIGTERM'); }
  for (let id=0; id<observations.length; id++) {
    const row = observations[id];
    const source = 'default(parisizemax,8589934592);\nallocatemem(1073741824);\nsetrand(1);f=Polrev(['+row.coefficients.join(',')+']);b=bnfinit(f,0);t=getwalltime();for(i=1,25,b=bnfinit(f,0));print(getwalltime()-t);print(b.no);print(b.cyc);quit;\n';
    const r=spawnSync(gp,['-fq'],{input:source,encoding:'utf8',timeout:30000});
    if(r.status!==0) row.pari={error:r.error?.message || r.stderr,status:r.status};
    else {
      const lines=r.stdout.trim().split('\n');
      try {
        assert.equal(lines.length,3);
        assert.match(lines[2], /^\[\s*(?:\d+(?:\s*,\s*\d+)*)?\s*\]$/);
        const body=lines[2].slice(1,-1).trim();
        const invariants=body ? body.split(',').map(x=>x.trim()) : [];
        assert.match(lines[0], /^\d+$/);
        row.pari={ms:Number(lines[0])/25, class_number:lines[1], invariants,
          agrees:lines[1]===row.class_number && JSON.stringify(sort(invariants))===JSON.stringify(sort(row.class_group))};
      } catch(error) { row.pari={error:String(error),stdout:r.stdout,stderr:r.stderr}; }
    }
    if((id+1)%100===0)console.error('staged pari',id+1);
  }
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit);
  assert.deepEqual(loadKernel(root).identity,identity);
  console.log(JSON.stringify({schema:'sagejs.diagnostic/cubic-staged-survey-v2',
    public_census:false,independent_exact_replay:false,promotion:false,commit,identity,corpusHash,
    policy:{efforts,arena_bytes:1048576,checkpoint_bytes:3145728},
    sampling:'One native staged execution per field; 25 PARI executions after one warmup. Discovery only, not qualified speed ratios.',
    node:process.version,host:require('node:os').hostname(),gpHash:hash(fs.readFileSync(gp)),observations},null,2));
}
