#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const expectedAuthority = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const expectedFixture = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const rssLimitKib = 4 * 1024 * 1024;

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 900_000,
    maxBuffer: 256 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function processTree(rootPid) {
  const answer = [];
  const pending = [rootPid];
  const seen = new Set();
  while (pending.length) {
    const pid = pending.pop();
    if (!Number.isInteger(pid) || seen.has(pid)) continue;
    seen.add(pid);
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const rss = Number(/^VmRSS:\s+(\d+)\s+kB$/m.exec(status)?.[1] || 0);
      answer.push({ pid, rss });
      const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
      if (children) pending.push(...children.split(/\s+/).map(Number));
    } catch (_error) {
      // A short-lived child may disappear between /proc reads.
    }
  }
  return answer;
}

function monitored(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"], ...options,
    });
    const stdout = [];
    const stderr = [];
    let peak = 0;
    let killed = false;
    const timer = setInterval(() => {
      const rss = processTree(child.pid).reduce((sum, item) => sum + item.rss, 0);
      peak = Math.max(peak, rss);
      if (rss > rssLimitKib && !killed) {
        killed = true;
        try { process.kill(-child.pid, "SIGKILL"); } catch (_error) {}
      }
    }, 50);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      const output = Buffer.concat(stdout).toString("utf8");
      const errors = Buffer.concat(stderr).toString("utf8");
      if (killed) return reject(new Error(`relation map exceeded 4 GiB RSS; peak=${peak} KiB`));
      if (code !== 0) return reject(new Error(errors + output || `exit ${code}; signal ${signal}`));
      resolve({ output, errors, peakRssKib: peak });
    });
  });
}

function lastJson(text) {
  return JSON.parse(text.trim().split(/\r?\n/).at(-1));
}

(async () => {
  assert.equal(process.argv.length, 4,
    "usage: check_field3_relation_replay_map.cjs AUTHORITY INITIAL_FIXTURE");
  const authorityPath = path.resolve(process.argv[2]);
  const fixturePath = path.resolve(process.argv[3]);
  assert.equal(sha256(authorityPath), expectedAuthority, "authority snapshot changed");
  assert.equal(sha256(fixturePath), expectedFixture, "initial fixture changed");

  const cpython = String.raw`
import copy, importlib, json, sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[3],sys.argv[3]+'/src/lib']
m=importlib.import_module('bench.pari-class-group-port.field3_relation_replay_map')
authority=json.load(open(sys.argv[1]))
owners=authority['authority']['owners']
table=json.load(open(sys.argv[2]))['expected'][0]['basisTable']
receipt=m.exact_field3_arbitrary_ideal_receipt(owners,table)
rejected=[]
for label,key,index in [('relation','relationRecords',0),('generator','principalGenerators',0),('packet','packetIdeals',0)]:
    changed=copy.deepcopy(owners); changed[key][index]=str(int(changed[key][index])+1)
    try: m.replay_field3_principal_relations(changed,table)
    except m.Field3RelationReplayError: rejected.append(label)
bad_table=list(table); bad_table[63]=str(int(bad_table[63])+1)
try: m.replay_field3_principal_relations(owners,bad_table)
except m.Field3RelationReplayError: rejected.append('basis-table')
assert rejected==['relation','generator','packet','basis-table'],rejected
enc=lambda x:[enc(y) for y in x] if isinstance(x,(list,tuple)) else str(x) if isinstance(x,int) else x
print(json.dumps({'receipt':enc(receipt),'rejected':rejected},sort_keys=True))
`;
  const cp = lastJson(run("python3", ["-c", cpython, authorityPath, fixturePath, root]));
  assert.equal(Number(cp.receipt.relations), 301);
  assert.equal(Number(cp.receipt.factor_base_size), 288);
  assert.equal(Number(cp.receipt.packet_index), 11);
  assert.deepEqual(cp.receipt.quotient_generator.map(Number), [1, 1, 0, 0]);

  // This deliberately imports only the mature matrix layer. The 301 exact
  // principal-ideal equations were already checked above from the same
  // byte-authenticated owners. The canonical row-HNF is an exact full-lattice
  // compression, not an answer fixture.
  const sage = String.raw`
import json,sys,time
from sagejs.number_fields.class_group_matrix import exact_relation_hnf_basis,extract_relation_presentation
a=json.load(open(sys.argv[-1]))['authority']['owners']
r=list(map(int,a['relationRecords']))
rows=[r[288*j:288*(j+1)] for j in range(301)]
started=time.time(); basis=exact_relation_hnf_basis(rows,288); hnf_seconds=time.time()-started
assert len(basis)==288
started=time.time(); p=extract_relation_presentation(basis,288,backend='flint',require_full_rank=True); presentation_seconds=time.time()-started
assert p.verify() and p.rank==288 and p.invariants==(2,2) and p.order==4
selected=(int(a['outerPermutation'][0])-1,int(a['outerPermutation'][1])-1)
alignment=[]
for index in selected:
    ambient=[0]*288; ambient[index]=1
    alignment.append(tuple(x%2 for x in p.class_coordinates(ambient)))
def inv2(m):
    a,b=m[0]; c,d=m[1]
    if (a*d-b*c)%2!=1: raise ValueError('singular F2 alignment')
    return ((d%2,b%2),(c%2,a%2))
inverse=inv2(alignment)
assert alignment==[(0,1),(1,0)] and inverse==((0,1),(1,0))
full=alignment[0]
suffix=((full[0]*inverse[0][0]+full[1]*inverse[1][0])%2,(full[0]*inverse[0][1]+full[1]*inverse[1][1])%2)
assert suffix==(1,0)
negative=[]
try: inv2(((0,0),(1,0)))
except ValueError: negative.append('singular-alignment')
bad=((suffix[0]+1)%2,suffix[1])
mapped=((bad[0]*alignment[0][0]+bad[1]*alignment[1][0])%2,(bad[0]*alignment[0][1]+bad[1]*alignment[1][1])%2)
assert mapped!=full; negative.append('coordinate-mutation')
print(json.dumps({'sourceRelations':301,'factorBase':288,'canonicalRows':len(basis),'canonicalNnz':sum(x!=0 for row in basis for x in row),'backend':p.backend,'rank':p.rank,'invariants':p.invariants,'order':p.order,'selected':[x+1 for x in selected],'alignment':alignment,'inverse':inverse,'fullCoordinates':full,'suffixCoordinates':suffix,'negative':negative,'hnfSeconds':hnf_seconds,'presentationSeconds':presentation_seconds},sort_keys=True))
`;
  const executable = process.env.SAGEJS_EXECUTABLE || path.join(root, "bin", "sagejs");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-map-"));
  const program = path.join(temporary, "map.py");
  fs.writeFileSync(program, sage);
  let js;
  try {
    js = await monitored(process.execPath, [executable, "--python", program, authorityPath], {
      env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
    });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  if (!js.output.trim()) throw new Error("Sage.js runner produced no receipt");

  const matrix = lastJson(js.output);
  assert.deepEqual(matrix.invariants, [2, 2]);
  assert.equal(matrix.order, 4);
  assert.deepEqual(matrix.selected, [11, 2]);
  assert.deepEqual(matrix.negative, ["singular-alignment", "coordinate-mutation"]);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group-port/field3-relation-replay-map/v1",
    field: 3,
    polynomial: "x^4 - 2000022*x - 2000042",
    authoritySha256: expectedAuthority,
    initialFixtureSha256: expectedFixture,
    fingerprintsAreAuthority: false,
    exactOwnersAreAuthority: true,
    pariCallsAfterBoundary: 0,
    cpython: cp,
    matrix,
    arbitraryIdeal: {
      ambientSupport: cp.receipt.ambient_support,
      fullCoordinates: matrix.fullCoordinates,
      suffixCoordinates: matrix.suffixCoordinates,
      quotientGenerator: cp.receipt.quotient_generator,
      exactQuotientReplay: true,
    },
    processTreePeakRssKib: js.peakRssKib,
    memoryLimitKib: rssLimitKib,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
