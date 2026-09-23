"use strict";
// PARI-only one-step quotient split oracle; H is radical, not Kummer-removed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {collect:collectRadical}=require('./pradical_oracle.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=collectRadical(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const fstart=source.indexOf('static GEN\nget_powers('),fend=source.indexOf('static GEN\nget_pr(',fstart);assert(fstart>=0&&fend>fstart);
 const start=source.indexOf('    M   = FpM_suppl(shallowconcat(H,UN), p);'),end=source.indexOf('      if (n == dim)',start);assert(start>=0&&end>start);
 const literal=source.slice(fstart,fend),split=source.slice(start,end);
 const cases='['+prepared.rows.map(r=>'['+[JSON.stringify(r.polynomial),r.n,r.p,'['+r.radical.join(',')+']','['+r.phi.join(',')+']',r.radicalColumns].join(',')+']').join(',')+']';
 const control='#include "pari.h"\n#include "paripriv.h"\n'+literal+String.raw`
static GEN matrix(GEN v,long rows,long cols){GEN M=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){GEN z=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gel(z,i)=gel(v,(j-1)*rows+i);gel(M,j)=z;}return M;}
static void matrix_json(GEN M){putchar('[');for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}putchar(']');}
static void vector_json(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');pari_printf("\"%Ps\"",gel(v,i));}putchar(']');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN input=gel(cases,ix),nf=nfinit(gp_read_str(GSTR(gel(input,1))),DEFAULTPREC),p=gel(input,3);long N=itos(gel(input,2)),r=itos(gel(input,6)),dim,i,c=1;
GEN H=matrix(gel(input,4),N,r),phi=matrix(gel(input,5),N,N),UN=col_ei(N,1),M,Mi,M2,Mi2,phi2,mat1,h=cgetg(N+1,t_VEC);
if(ix>1)putchar(',');
`+split+String.raw`
printf("{\"split\":true,\"dimension\":%ld,\"quotientDimension\":%ld,\"a\":",dim,N-r);vector_json(a);
printf(",\"mula\":");matrix_json(mula);printf(",\"mul2\":");matrix_json(mul2);printf(",\"coefficients\":");GEN poly=pol_min(mul2,p),coeff=cgetg(degpol(poly)+2,t_VEC);for(long j=0;j<=degpol(poly);j++)gel(coeff,j+1)=gel(poly,j+2);vector_json(coeff);
printf(",\"roots\":");vector_json(R);printf(",\"imageBases\":[");for(long j=1;j<c;j++){if(j>1)putchar(',');printf("{\"rank\":%ld,\"matrix\":",lg(gel(h,j))-1);matrix_json(gel(h,j));putchar('}');}printf("]}");
}else printf("{\"split\":false,\"dimension\":%ld,\"quotientDimension\":%ld,\"a\":[],\"mula\":[],\"mul2\":[],\"coefficients\":[],\"roots\":[],\"imageBases\":[]}",dim,N-r);
set_avma(av);}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-split-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,prepared.rows.length);
 const rows=prepared.rows.map((r,i)=>{const out=outputs[i];if(out.split){assert.equal(out.a.length,r.n);assert.equal(out.mula.length,r.n*r.n);assert.equal(out.mul2.length,out.quotientDimension**2);assert.equal(out.roots.length,out.imageBases.length);for(const b of out.imageBases)assert.equal(b.matrix.length,r.n*b.rank);}else assert.equal(out.dimension,1);return {...r,...out};});
 const result={rows,identity:{...prepared.identity,splitSourceHash:hash(split),minpolySourceHash:hash(literal),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(prepared.rows)),layout:'Matrices column-major; a and roots vectors; polynomial low-to-high; imageBases in source root iteration order',boundary:'One source splitting step with actual radical H, not Kummer-removed H. Recursive splitting, source L reversal, and prime descriptors are not performed.'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,splitRows:r.rows.filter(x=>x.split).length,artifactDirectory:r.artifactDirectory,identity:r.identity}));}catch(e){console.error(e);process.exitCode=1;}}
