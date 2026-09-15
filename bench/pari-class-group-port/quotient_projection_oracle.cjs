"use strict";
// Exact PARI projection oracle using H=pradical, not Kummer-removed H.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {collect:collectRadical}=require('./pradical_oracle.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=collectRadical(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const start=source.indexOf('    M   = FpM_suppl(shallowconcat(H,UN), p);'),end=source.indexOf('    if (dim > 1)',start);assert(start>=0&&end>start);
 const projection=source.slice(start,end);
 const cases='['+prepared.rows.map(r=>'['+[r.n,r.p,'['+r.radical.join(',')+']','['+r.phi.join(',')+']',r.radicalColumns].join(',')+']').join(',')+']';
 const control=String.raw`#include "pari.h"
#include "paripriv.h"
static GEN matrix_from_vector(GEN v,long rows,long cols){GEN M=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){GEN c=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gel(c,i)=gel(v,(j-1)*rows+i);gel(M,j)=c;}return M;}
static void matrix_json(GEN M){putchar('[');for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}putchar(']');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){
 pari_sp av=avma;GEN input=gel(cases,ix),p=gel(input,2);long N=itos(gel(input,1)),r=itos(gel(input,5)),dim;
 GEN H=matrix_from_vector(gel(input,3),N,r),phi=matrix_from_vector(gel(input,4),N,N),UN=col_ei(N,1),M,Mi,M2,Mi2,phi2,mat1;
`+projection+String.raw`
 if(ix>1)putchar(',');printf("{\"M\":");matrix_json(M);printf(",\"Mi\":");matrix_json(Mi);
 printf(",\"M2\":");matrix_json(M2);printf(",\"Mi2\":");matrix_json(Mi2);printf(",\"phi2\":");matrix_json(phi2);
 printf(",\"kernel\":");matrix_json(mat1);printf(",\"dimension\":%ld,\"quotientDimension\":%ld}",dim,N-r);set_avma(av);
}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-projection-oracle-')),cPath=path.join(artifactDirectory,'oracle.c'),binaryPath=path.join(artifactDirectory,'oracle');fs.writeFileSync(cPath,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,cPath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binaryPath]);
 const results=JSON.parse(run(binaryPath,[]));assert.equal(results.length,prepared.rows.length);
 const rows=prepared.rows.map((r,i)=>{
  const out=results[i],d=r.n-r.radicalColumns;assert.equal(out.M.length,r.n*r.n);assert.equal(out.Mi.length,r.n*r.n);assert.equal(out.M2.length,r.n*d);assert.equal(out.Mi2.length,d*r.n);assert.equal(out.phi2.length,d*d);assert.equal(out.kernel.length,d*out.dimension);
  return {...r,...out};
 });
 const result={rows,identity:{...prepared.identity,projectionSourceHash:hash(projection),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binaryPath)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(prepared.rows)),layout:'All matrices column-major; M2 n×quotientDimension, Mi2 quotientDimension×n',boundary:'H is the actual radical basis. Valid etale quotient projection; not the Kummer-removed H of every primedec_aux branch.'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{console.log(JSON.stringify(collect(process.argv[2],process.argv[3])));}catch(e){console.error(e);process.exitCode=1;}}
