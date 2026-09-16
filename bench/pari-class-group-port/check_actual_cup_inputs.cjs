"use strict";
// Diagnostic fixture producer. Source relation records were already compared
// with CPython and both native backends by check_actual_initial_collector.cjs.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
function run(command,args,options={}) { const r=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:128*1024*1024,...options}); assert.equal(r.status,0,r.stderr||String(r.error)); return r.stdout; }
const hash=s=>createHash('sha256').update(s).digest('hex');
const pari=path.resolve(process.argv[2]), archive=path.resolve(process.argv[3]), lib=path.join(pari,'Olinux-x86_64');
assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
const paths=process.argv.slice(4); assert(paths.length>0,'supply actual-initial-collector fixtures');
const cases=paths.map(file=>{const raw=fs.readFileSync(file),f=JSON.parse(raw),e=f.expected[0]; assert(f.summary.native); assert(f.nativeInputs.some(x=>x.backend==='gmp')); assert.equal(f.summary.result[0].hnfStatus,-2); return {field:e.field,rows:e.KC,columns:e.last,k0:e.subfactorCount,cRows:(e.degree+e.real)/2,perm:e.initialPerm,mat:e.records,fixture:path.resolve(file),fixtureSha256:hash(raw)};});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-actual-cup-inputs-'));
const cp=JSON.parse(run('python3',['-c',`import decimal,sys,json,importlib
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.hnfspec_cleanup')
out=[]
for r in json.load(sys.stdin):
 rows=int(r['rows']);cols=int(r['columns']);k0=int(r['k0']);state=[0]*10;extra=[0]*(rows*cols);perm=r['perm'][:]
 status=m.pari_hnfspec_cleanup(list(map(int,r['mat'])),rows,cols,perm,k0,int(r['cRows']),[0]*(rows*cols),[0]*(k0*cols),[0]*(cols*cols),[0]*cols,[0],[0]*13,[0]*((rows-k0)*cols),[0]*(k0*cols),extra,state)
 assert status in (0,1)
 n=state[2]-1;mrows=state[3]
 out.append({'rows':mrows,'columns':n,'matrix':list(map(str,extra[:mrows*n])),'cleanupState':state,'cleanupStatus':status})
print(json.dumps(out))`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases)}));
const source=name=>run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+name]);
const hnf=source('hnf_snf.c'),flv=source('Flv.c');
const anchor='permpro = ZM_rowrankprofile(extramat, &nr);'; assert.equal(hnf.split(anchor).length,2);
// A checkpoint only: capture immediately before the genuine rank-profile call.
// The source driver continues normally. Zero archimedean entries retain C's
// dimensions/presence; this exact prefix does not inspect their values.
fs.writeFileSync(path.join(dir,'hnf.c'),'#include "pari.h"\nstatic GEN captured_extra;\n'+hnf.replace(anchor,'captured_extra = gclone(extramat); '+anchor)+`
extern void emit_cup(GEN X);
int main(void){pari_init(256000000,1000);long count;if(scanf("%ld",&count)!=1)return 2;
for(long z=0;z<count;z++){pari_sp av=avma;long rows,cols,k0,cr;if(scanf("%ld%ld%ld%ld",&rows,&cols,&k0,&cr)!=4)return 3;
GEN A=cgetg(cols+1,t_MAT),P=cgetg(rows+1,t_VECSMALL),C=zeromat(cr,cols),D=NULL,B=NULL;
for(long i=1;i<=rows;i++)if(scanf("%ld",&P[i])!=1)return 4;
for(long j=1;j<=cols;j++){gel(A,j)=cgetg(rows+1,t_VECSMALL);for(long i=1;i<=rows;i++)if(scanf("%ld",&mael(A,j,i))!=1)return 5;}
captured_extra=NULL;(void)hnfspec_i(A,P,&D,&B,&C,k0);if(!captured_extra)return 6;emit_cup(shallowtrans(captured_extra));gunclone(captured_extra);avma=av;}
pari_close();return 0;}
`);
fs.writeFileSync(path.join(dir,'flv.c'),flv+`
static void emit_words(GEN a){putchar('[');for(long i=1;i<lg(a);i++){if(i>1)putchar(',');printf("%lu",(ulong)a[i]);}putchar(']');}
static void emit_matrix(GEN a,long rows,long cols,int exact){putchar('[');for(long i=1;i<=rows;i++)for(long j=1;j<=cols;j++){if(i!=1||j!=1)putchar(',');if(exact)pari_printf("\\"%Ps\\"",gcoeff(a,i,j));else printf("%lu",ucoeff(a,i,j));}putchar(']');}
void emit_cup(GEN X){forprime_t S;init_modular_small(&S);ulong p=u_forprime_next(&S);long m=nbrows(X),n=lg(X)-1,nullity;
GEN A=ZM_to_Flm(X,p),R,C,U,P;long rank=Flm_CUP_pre(Flm_copy(A),&R,&C,&U,&P,p,get_Fl_red(p));GEN d=Flm_pivots(Flm_copy(A),p,&nullity,1);
printf("{\\"rows\\":%ld,\\"columns\\":%ld,\\"prime\\":%lu,\\"rank\\":%ld,\\"nullity\\":%ld,\\"matrix\\":",m,n,p,rank,nullity);emit_matrix(X,m,n,1);
printf(",\\"modularMatrix\\":");emit_matrix(A,m,n,0);printf(",\\"R\\":");emit_words(R);printf(",\\"P\\":");emit_words(P);printf(",\\"pivots\\":");emit_words(d);
printf(",\\"C\\":");emit_matrix(C,m,rank,0);printf(",\\"U\\":");emit_matrix(U,rank,n,0);puts("}");}
`);
const exe=path.join(dir,'oracle');run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'hnf.c'),path.join(dir,'flv.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const input=[cases.length,...cases.flatMap(r=>[r.rows,r.columns,r.k0,r.cRows,...r.perm,...r.mat])].join(' ');
const trace=run(exe,[],{input}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(expected.length,cases.length);
for(let z=0;z<cases.length;z++){const e=expected[z],q=cp[z];assert.equal(e.rows,q.rows);assert.equal(e.columns,q.columns);assert.deepEqual(e.matrix,q.matrix);assert.equal(e.rank+e.nullity,e.columns);const p=BigInt(e.prime);
 for(let k=0;k<e.matrix.length;k++)assert.equal(Number((BigInt(e.matrix[k])%p+p)%p),e.modularMatrix[k]);
 for(let k=0;k<e.rank;k++)assert.equal(e.pivots[e.P[k]-1],e.R[k]);
 // PARI retains packed Gaussian storage, not materialized triangular factors:
 // C has implicit unit pivots and zero entries above them; U is upper triangular.
 for(let i=0;i<e.rows;i++)for(let j=0;j<e.columns;j++){let sum=0n;for(let k=0;k<e.rank;k++){const c=i+1<e.R[k]?0n:i+1===e.R[k]?1n:BigInt(e.C[i*e.rank+k]);const u=j<k?0n:BigInt(e.U[k*e.columns+j]);sum+=c*u;}assert.equal(Number(sum%p),e.modularMatrix[i*e.columns+e.P[j]-1],'A*P = C*U with implicit triangles');}
}
const result={cases:cases.map((r,i)=>({...r,cleanup:cp[i],reference:expected[i]})),sourceHashes:{hnf:hash(hnf),flv:hash(flv)},traceSha256:hash(trace),ubsan:true,nativeCompiled:false,qualifiedTiming:false,boundary:'First modular trial before CUP; records previously matched by CPython/JS/GMP, cleanup replayed in CPython and independently captured from pinned hnfspec_i. Not a complete class-group result.'};
fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify(result));console.log(JSON.stringify({artifact:path.join(dir,'fixtures.json'),cases:result.cases.map(r=>({field:r.field,rows:r.reference.rows,columns:r.reference.columns,rank:r.reference.rank,prime:r.reference.prime})),traceSha256:result.traceSha256}));
