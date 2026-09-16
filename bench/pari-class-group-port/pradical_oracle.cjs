"use strict";
// PARI-only test oracle. No implementation candidates or bnf-derived inputs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(command,args,options={}){
 const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
function collect(pariDirectory,archivePath){
 const pari=path.resolve(pariDirectory),archive=path.resolve(archivePath),lib=path.join(pari,'Olinux-x86_64');
 const archiveHash=hash(fs.readFileSync(archive));assert.equal(archiveHash,'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/base2.c']);
 const base2Hash=hash(source);assert.equal(base2Hash,'60c5d59b843d400a3aab248282464d6c5d47ee57f9d62634334603542abd1e91');
 const start=source.indexOf('typedef struct {\n  GEN nf, p;\n  long I;\n} eltmod_muldata;');
 const end=source.indexOf('/* return powers of a:',start);assert(start>=0&&end>start);
 const literalSource=source.slice(start,end);assert(literalSource.includes('pradical(GEN nf, GEN p, GEN *phi)'));
 const control='#include "pari.h"\n#include "paripriv.h"\n'+literalSource+String.raw`
static void exact_json(GEN x){pari_printf("\"%Ps\"",x);}
static void matrix_json(GEN x){
 putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++){
  if(j>1||i>1)putchar(',');exact_json(gcoeff(x,i,j));
 }putchar(']');
}
int main(void){
 pari_init(256000000,10000);
 const char *polynomials[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042","x^3-3","x^4-5"};
 const ulong primes[]={2,3,5,37};int first=1;putchar('[');
 for(long field=0;field<6;field++){
  pari_sp field_stack=avma;GEN P=gp_read_str(polynomials[field]),nf=nfinit(P,DEFAULTPREC);long n=nf_get_degree(nf);
  for(long pi=0;pi<4;pi++){
   pari_sp row_stack=avma;GEN p=utoipos(primes[pi]),frob=cgetg(n+1,t_MAT),q=p,phi,rad,m;long products=0;
   for(long j=1;j<=n;j++)gel(frob,j)=pow_ei_mod_p(nf,j,p);
   m=frob;while(abscmpiu(q,n)<0){q=mulii(q,p);m=FpM_mul(m,frob,p);products++;}
   rad=pradical(nf,p,&phi);
   GEN check=gcopy(frob);for(long j=1;j<=n;j++)gcoeff(check,j,j)=subiu(gcoeff(check,j,j),1);
   if(!gequal(phi,check)||!gequal(rad,FpM_ker(m,p)))return 10;
   if(!first)putchar(',');first=0;
   printf("{\"field\":%ld,\"polynomial\":\"%s\",\"n\":%ld,\"p\":%lu,\"equationIndex\":",field,polynomials[field],n,primes[pi]);exact_json(nf_get_index(nf));
   printf(",\"discriminant\":");exact_json(nf_get_disc(nf));
   printf(",\"coefficients\":[");for(long j=0;j<=n;j++){if(j)putchar(',');exact_json(gel(P,j+2));}
   printf("],\"integralBasis\":[");GEN zk=nf_get_zk(nf);for(long j=1;j<=n;j++){if(j>1)putchar(',');exact_json(gel(zk,j));}
   printf("],\"table\":[");for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++){if(i>1||j>1||k>1)putchar(',');exact_json(gel(v,k));}}
   printf("],\"frobenius\":");matrix_json(frob);printf(",\"frobeniusPower\":");matrix_json(m);
   printf(",\"finalQ\":");exact_json(q);printf(",\"matrixProducts\":%ld,\"phi\":",products);matrix_json(phi);
   printf(",\"radicalColumns\":%ld,\"radical\":",lg(rad)-1);matrix_json(rad);putchar('}');set_avma(row_stack);
  }set_avma(field_stack);
 }puts("]");pari_close();return 0;
}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-pradical-oracle-'));
 const cPath=path.join(artifactDirectory,'oracle.c'),binaryPath=path.join(artifactDirectory,'oracle');fs.writeFileSync(cPath,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,cPath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binaryPath]);
 const rows=JSON.parse(run(binaryPath,[]));assert.equal(rows.length,24);
 for(const r of rows){assert.equal(r.table.length,r.n**3);assert.equal(r.frobenius.length,r.n**2);assert.equal(r.phi.length,r.n**2);assert.equal(r.radical.length,r.n*r.radicalColumns);}
 const libraryPath=fs.realpathSync(path.join(lib,'libpari.so'));
 const result={rows,identity:{version:'2.17.4',archiveHash,base2Hash,literalSourceHash:hash(literalSource),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binaryPath)),libraryPath,libraryHash:hash(fs.readFileSync(libraryPath)),layout:'Matrices column-major; table[(i*n+j)*n+k], zero-based integral basis indices',provenance:'nfinit and literal base2.c pow_ei_mod_p/pradical; no bnf'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{console.log(JSON.stringify(collect(process.argv[2],process.argv[3])));}catch(e){console.error(e);process.exitCode=1;}}
