"use strict";
// Extend the pristine-release full-driver diagnostic without changing its policy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const base = path.join(__dirname, 'check_default_driver_trace.cjs');
let driver = fs.readFileSync(base, 'utf8');
const helpers = String.raw`
static void audit_matrix(GEN a,int word) {
  printf("[");long first=1;
  for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){
    if(!first)putchar(',');first=0;
    if(word)printf("\"%ld\"",mael(a,j,i));else pari_printf("\"%Ps\"",gcoeff(a,i,j));
  }putchar(']');
}
static void audit_real(GEN x) {
  long e;
  if(typ(x)==t_INT){pari_printf("\"%Ps\",\"-1\",\"0\"",x);return;}
  pari_printf("\"%Ps\",\"%ld\",\"%ld\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));
}
static void audit_logs(GEN a) {
  putchar('[');long first=1;
  for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){
    if(!first)putchar(',');first=0;GEN x=gcoeff(a,i,j);
    if(typ(x)==t_COMPLEX){printf("\"2\",");audit_real(gel(x,1));putchar(',');audit_real(gel(x,2));}
    else{printf("\"1\",");audit_real(x);printf(",\"0\",\"-1\",\"0\"");}
  }putchar(']');
}
static void audit_hnf(GEN W,GEN dep,GEN B,GEN C,GEN perm) {
  printf("\"H\":");audit_matrix(W,0);printf(",\"D\":");audit_matrix(dep,0);
  printf(",\"B\":");audit_matrix(B,0);printf(",\"C\":");audit_logs(C);
  printf(",\"perm\":[");for(long i=1;i<lg(perm);i++){if(i>1)putchar(',');printf("%ld",perm[i]);}
  printf("],\"hRows\":%ld,\"bColumns\":%ld,\"totalColumns\":%ld,\"rows\":%ld,\"logRows\":%ld",lg(W)-1,lg(B)-1,lg(C)-1,lg(perm)-1,nbrows(C));
}
`;
const before = String.raw`
        { pari_sp audit_av=avma;
          printf("{\"event\":\"hnfadd_input\",\"chk\":%ld,\"last\":%ld,\"embsColumns\":%ld,\"need\":%ld,\"newColumns\":%ld,",cache.chk-cache.base,cache.last-cache.base,lg(embs)-1,need,lg(mat)-1);
          audit_hnf(W,dep,B,C,F.perm);printf(",\"newRelations\":");audit_matrix(mat,1);printf(",\"newLogs\":");audit_logs(E);
          printf(",\"newGenerators\":[");long first=1;
          for(REL_t *rel=cache.chk+1;rel<=cache.last;rel++)for(long q=1;q<=N;q++){
            if(!first)putchar(',');first=0;GEN m=rel->m;
            if(!m)printf("null");else pari_printf("\"%Ps\"",typ(m)==t_INT?(q==1?m:gen_0):gel(m,q));
          }printf("]}\n");set_avma(audit_av);
        }
        W = hnfadd_i(W, F.perm, &dep, &B, &C, mat, E);
        { pari_sp audit_av=avma;printf("{\"event\":\"hnfadd_output\",");audit_hnf(W,dep,B,C,F.perm);printf("}\n");set_avma(audit_av); }
`;
const afterAcceptance = String.raw`
    { pari_sp audit_av=avma;printf("{\"event\":\"acceptance_lattice\",\"code\":%ld,\"need\":%ld,\"L\":",i,need);if(L)audit_matrix(L,0);else printf("null");printf("}\n");set_avma(audit_av); }
`;
const insertion = [
  `replace('static void trace_integer', ${JSON.stringify(helpers + '\nstatic void trace_integer')});`,
  `replace('        W = hnfadd_i(W, F.perm, &dep, &B, &C, mat, E);', ${JSON.stringify(before)});`,
  `replace('    switch(i)\\n    {', ${JSON.stringify(afterAcceptance + '    switch(i)\n    {')});`,
  `replace('          small_norm(&cache, &F, nf, Nrelid, fact, j);', ${JSON.stringify(String.raw`
          printf("{\"event\":\"collector_search\",\"j\":%ld,\"search\":[",j);
          for(long q=1;q<lg(F.L_jid);q++){if(q>1)putchar(',');printf("%ld",F.L_jid[q]);}
          printf("],\"perm\":[");for(long q=1;q<lg(F.perm);q++){if(q>1)putchar(',');printf("%ld",F.perm[q]);}printf("]}\n");
          small_norm(&cache, &F, nf, Nrelid, fact, j);`)});`,
].join('\n');
assert.equal(driver.split('// Observe repeated driver').length, 2);
driver = driver.replace('// Observe repeated driver', insertion + '\n// Observe repeated driver');
// Run the same checker in a scoped context; its tar/source hash checks remain.
let receipt;
vm.runInNewContext(driver, {require, process, console: {error: console.error, log: text => { receipt=JSON.parse(text); }}}, {filename: base});
const python = String.raw`
import sys,json,importlib,ast
sys.path[:0]=sys.argv[1:3]
module=importlib.import_module('bench.pari-class-group-port.hnfadd')
sig=next(x for x in ast.parse(open(module.__file__).read()).body if isinstance(x,ast.FunctionDef)).args.args
events=json.load(sys.stdin);output=[];before=None
for e in events:
 if e['event']=='hnfadd_input':before=e
 if e['event']!='hnfadd_output':continue
 r=before;lig=r['rows']-r['bColumns'];width=r['newColumns']+r['hRows']
 cap=max(64,7*r['logRows']*(r['totalColumns']+r['newColumns']),(lig+width)**2,lig*r['rows'],r['rows'])
 v={a.arg:[77]*cap for a in sig}
 v.update(h=list(map(int,r['H'])),h_rows=r['hRows'],dep=list(map(int,r['D'])),b=list(map(int,r['B'])),b_columns=r['bColumns'],logs=list(map(int,r['C'])),total_columns=r['totalColumns'],log_rows=r['logRows'],perm=r['perm'][:],rows=r['rows'],new_relations=list(map(int,r['newRelations'])),new_columns=r['newColumns'],new_logs=list(map(int,r['newLogs'])))
 status=module.pari_hnfadd(**v)
 result={'chk':r['chk'],'last':r['last'],'rows':r['rows'],'retainedRows':lig,'rankColumns':width,'status':status,'state':v['state'][:9]}
 if status==0:
  for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:
   expected=list(map(int,e[key]));assert v[name][:len(expected)]==expected,(r['last'],key)
  assert v['perm']==e['perm'];assert v['state'][0]==e['hRows'] and v['state'][2]==e['bColumns']
  result['exactMatricesMatch']=True
 output.append(result)
print(json.dumps(output))
`;
const replay=spawnSync('python3',['-c',python,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(receipt.events),encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
assert.equal(replay.status,0,replay.stderr||String(replay.error));
const stages=JSON.parse(replay.stdout);
fs.writeFileSync(path.join(receipt.directory,'hnfadd-replay.json'),JSON.stringify(stages,null,2)+'\n');
console.log(JSON.stringify({field:receipt.field,sourceHash:receipt.sourceHash,directory:receipt.directory,stages,result:receipt.events.at(-1),qualifiedTiming:false},null,2));
