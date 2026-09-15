"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process"), { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024, ...options });
  assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]), lib = path.join(pari, "Olinux-x86_64");
  const actual = process.argv.includes("--actual");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/lll.c"]);
  assert.equal(createHash("sha256").update(source).digest("hex"), "ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
  // Only initialize otherwise unread diagnostic slots; the final upstream
  // transformation is independently compared to an uninstrumented call.
  if (actual) {
    source = source.replace("{ return (dpe_t*) stack_malloc_align(d*sizeof(dpe_t), sizeof(dpe_t)); }",
      "{ dpe_t *v=(dpe_t*)stack_malloc_align(d*sizeof(dpe_t),sizeof(dpe_t)); for(long i=0;i<d;i++){v[i].d=0.;v[i].e=0;} return v; }");
    source = source.replace("\nBabai_dpe(", "\noriginal_Babai_dpe(");
    source = source.replace("\nZM_lll_norms(GEN x,", "\nprobe_ZM_lll_norms(GEN x,");
  }
  source = source.replace("static int\n" + (actual ? "original_Babai_dpe" : "Babai_dpe"), `
static long probe_start=1,probe_zeros=0,probe_max=0,probe_calls=0;
static void dump(long,long,long,long,GEN,GEN,GEN,dpe_t **,dpe_t **,dpe_t *);
static int
${actual ? "original_Babai_dpe" : "Babai_dpe"}`);
  if (actual) source = source.replace("static long\nfplll_dpe", `static int
Babai_dpe(pari_sp av,long k,GEN *G,GEN *B,GEN *U,dpe_t **mu,dpe_t **r,dpe_t *s,long a,long z,long maximum,dpe_t *eta){
 if(++probe_calls>512)pari_err_BUG("DPE trace cap");
 if(!*B||!*U||eta->d!=.51||eta->e!=0)pari_err_BUG("DPE trace boundary");
 probe_start=a;probe_zeros=z;probe_max=maximum;
 dump(lg(*G)-1,-1,k,0,*G,*B,*U,mu,r,s);
 int result=original_Babai_dpe(av,k,G,B,U,mu,r,s,a,z,maximum,eta);
 dump(lg(*G)-1,result,k,0,*G,*B,*U,mu,r,s);return result;
}
static long
fplll_dpe`);
  source += `
#include <stdint.h>
#include <inttypes.h>
static void dbits(double x){uint64_t b;memcpy(&b,&x,8);printf(" %" PRIu64,b);}
static void dump(long n,long status,long k,long flags,GEN G,GEN B,GEN U,dpe_t **mu,dpe_t **r,dpe_t *s){
 printf("%ld %ld %ld %ld %ld %ld %ld",n,status,k-1,flags,probe_start-1,probe_zeros,probe_max);
 for(long block=0;block<3;block++){GEN M=block==0?G:block==1?B:U;
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)pari_printf(" %Ps",gmael(M,j,i));}
 for(long block=0;block<2;block++){dpe_t **M=block==0?mu:r;
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)dbits(M[j][i].d);
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)printf(" %ld",M[j][i].e);}
 for(long i=1;i<=n;i++)dbits(s[i].d);
 for(long i=1;i<=n;i++)printf(" %ld",s[i].e);
 puts("");
}
int main(void){pari_init(128000000,10000);
 long shifts[]={0,1,52,53,62,63,100,1074,2098};
 for(long n=3;n<=4;n++)for(long sign=-1;sign<=1;sign+=2)for(long t=0;t<9;t++)for(long k=n-1;k<=n;k++)for(long flags=0;flags<4;flags++){
 pari_sp av=avma;GEN B=matid(n),U=matid(n);
 for(long j=1;j<k;j++){gmael(B,j,j)=stoi(j+1);gmael(B,k,j)=mulsi(sign,addiu(shifti(gen_1,shifts[t]),j));}
 GEN G=zeromatcopy(n,n);
 for(long j=1;j<=n;j++)for(long i=1;i<=j;i++)gmael(G,j,i)=ZV_dotproduct(gel(B,j),gel(B,i));
 dpe_t **mu=cget_dpemat(n+1),**r=cget_dpemat(n+1),*s=cget_dpevec(n+1),eta;
 affdbldpe(.51,&eta);
 for(long j=1;j<=n;j++){mu[j]=cget_dpevec(n+1);r[j]=cget_dpevec(n+1);
 for(long i=1;i<=n;i++){mu[j][i].d=r[j][i].d=0.;mu[j][i].e=r[j][i].e=0;}s[j].d=0.;s[j].e=0;}
 for(long j=1;j<k;j++)affidpe(gmael(G,j,j),&r[j][j]);
 probe_max=n;dump(n,-1,k,flags,G,B,U,mu,r,s);
 GEN pb=flags&1?NULL:B,pu=flags&2?NULL:U;
 long status=Babai_dpe(avma,k,&G,&pb,&pu,mu,r,s,1,0,n,&eta);
 if(pb)B=pb;if(pu)U=pu;
 dump(n,status,k,flags,G,B,U,mu,r,s);avma=av;
 }pari_close();return 0;}
`;
  if (actual) source = source.slice(0, source.indexOf("int main(void){pari_init")) + `
int main(void){pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
 for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));
 GEN B=ZM_mul(nf_get_roundG(nf),I);
 GEN U=probe_ZM_lll_norms(B,.99,LLL_IM,NULL);
 if(!gequal(U,ZM_lll_norms(B,.99,LLL_IM,NULL)))return 3;
 avma=av;}avma=outer;}
 fprintf(stderr,"captured %ld DPE Babai calls from 32 prepared ideals\\n",probe_calls);
 pari_close();return 0;}
`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-babai-dpe-")), c = path.join(dir, "oracle.c"), exe = path.join(dir, "oracle");
  fs.writeFileSync(c, source);
  run("cc", ["-O2", "-fvisibility=hidden", "-I" + path.join(pari, "src/headers"), "-I" + lib, c, "-L" + lib, "-Wl,-rpath," + lib, "-lpari", "-lm", "-o", exe]);
  const rows = run(exe, []).trim().split("\n").map(x => x.split(" "));
  if (actual) assert.ok(rows.length >= 64 && rows.length <= 1024 && rows.length % 2 === 0);
  else assert.equal(rows.length, 576);
  run("python3", ["-c", `
import sys,json,struct,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_babai_dpe').pari_babai_dpe
def decode(row):
 n=int(row[0]);pos=7;out=[]
 for count,integer in [(n*n,True)]*3+[(n*n,False),(n*n,True)]*2+[(n,False),(n,True)]:
  out.append([int(x) if integer else struct.unpack('>d',struct.pack('>Q',int(x)))[0] for x in row[pos:pos+count]]);pos+=count
 assert pos==len(row)
 return n,out
rows=json.load(sys.stdin)
for i in range(0,len(rows),2):
 n,a=decode(rows[i]);_,want=decode(rows[i+1]);flags=int(rows[i][3]);k=int(rows[i][2])
 result=f(*a[:3],0 if flags&1 else n,n,0 if flags&2 else n,k,*map(int,rows[i][4:7]),0.51,0,*a[3:],[0.0])
 assert result==int(rows[i+1][1]),i
 for j,(got,expected) in enumerate(zip(a,want)):
  if j in (3,5,7):assert [struct.pack('>d',x) for x in got]==[struct.pack('>d',x) for x in expected],(i,j,got,expected)
  else:assert got==expected,(i,j,got,expected)
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input: JSON.stringify(rows) });
  const built = await compileKernel({ sourcePath: path.join(__dirname, "lll_babai_dpe.py") }), f = require(built.modulePath).pari_babai_dpe;
  assert.equal(f.nativeAvailable, true);
  const bits = new DataView(new ArrayBuffer(8));
  function decode(row) {
    const n = Number(row[0]); let pos = 7; const out = [];
    for (const [count, integer] of [[n*n,1],[n*n,1],[n*n,1],[n*n,0],[n*n,1],[n*n,0],[n*n,1],[n,0],[n,1]]) {
      out.push(row.slice(pos, pos + count).map(x => { if (integer) return BigInt(x); bits.setBigUint64(0, BigInt(x), false); return bits.getFloat64(0, false); })); pos += count;
    }
    assert.equal(pos, row.length); return [n, out];
  }
  for (let i = 0; i < rows.length; i += 2) for (const backend of ["javascript", "gmp"]) {
    const [n, a] = decode(rows[i]), [, want] = decode(rows[i+1]), N = BigInt(n), flags = Number(rows[i][3]);
    // Fixed diagnostic capacity covers the declared 2098-bit input family.
    const pack = x => backend === "gmp" ? f.packIntegerBuffer(x, 128) : x;
    for (const j of [0,1,2,4,6,8]) a[j] = pack(a[j]);
    const result = f[backend](...a.slice(0,3), flags&1 ? 0n : N, N, flags&2 ? 0n : N, BigInt(rows[i][2]), ...rows[i].slice(4,7).map(BigInt), 0.51, 0n, ...a.slice(3), [0]);
    if (backend === "gmp") for (const j of [0,1,2,4,6,8]) a[j] = a[j].toArray();
    assert.equal(result, BigInt(rows[i+1][1]), `${i} ${backend} status`);
    assert.deepEqual(a, want, `${i} ${backend} state`);
  }
  const counters = { calls: rows.length/2, basisChanges: 0, nonzeroIncomingMu: 0, stagnation: 0 };
  for (let i=0;i<rows.length;i+=2) {
    const [,before]=decode(rows[i]),[,after]=decode(rows[i+1]);
    if(before[1].some((x,j)=>x!==after[1][j]))counters.basisChanges++;
    if(before[3].some(x=>x!==0))counters.nonzeroIncomingMu++;
    if(rows[i+1][1]==="1")counters.stagnation++;
  }
  console.log(`${rows.length/2} DPE Babai calls match PARI/CPython/JS/GMP (${actual ? "normal LLL path on 32 prepared ideals" : "synthetic exponent branches through 2098, optional B/U"})`);
  console.log(JSON.stringify({ counters, traceSha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") }));
})().catch(error => { console.error(error); process.exitCode = 1; });
