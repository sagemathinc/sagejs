"use strict";
// Observation-only instrumentation of the pristine PARI quotient worklist.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {collect:collectRadical}=require('./pradical_oracle.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=collectRadical(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const fstart=source.indexOf('static GEN\nget_powers('),fend=source.indexOf('static GEN\nget_pr(',fstart);
 const start=source.indexOf('  UN = col_ei(N, 1);\n  for (c=1; c; c--)'),end=source.indexOf('  return primedec_end(nf, L, p, flim);',start);assert(fstart>=0&&fend>fstart&&start>=0&&end>start);
 const literal=source.slice(fstart,fend),worklist=source.slice(start,end);
 function once(s,a,b){assert.equal(s.split(a).length,2,'unique instrumentation target');return s.replace(a,b);}
 let observed=once(worklist,'    if (dim > 1)',String.raw`
    if(visit_count++)putchar(',');printf("{\"stackPosition\":%ld,\"rank\":%ld,\"H\":",c,r);matrix_json(H);
    printf(",\"dimension\":%ld,\"quotientDimension\":%ld,\"M\":",dim,N-r);matrix_json(M);printf(",\"Mi\":");matrix_json(Mi);
    printf(",\"M2\":");matrix_json(M2);printf(",\"Mi2\":");matrix_json(Mi2);printf(",\"phi2\":");matrix_json(phi2);printf(",\"kernel\":");matrix_json(mat1);
    if (dim > 1)`);
 observed=once(observed,'      n = lg(R)-1;',String.raw`      n = lg(R)-1;
      printf(",\"split\":true,\"a\":");vector_json(a);printf(",\"mula\":");matrix_json(mula);printf(",\"mul2\":");matrix_json(mul2);
      printf(",\"coefficients\":");GEN polynomial=pol_min(mul2,p),coeff=cgetg(degpol(polynomial)+2,t_VEC);for(long j=0;j<=degpol(polynomial);j++)gel(coeff,j+1)=gel(polynomial,j+2);vector_json(coeff);
      printf(",\"roots\":");vector_json(R);`);
 observed=once(observed,'      if (n == dim)',String.raw`      printf(",\"imageBases\":[");for(long j=c-n;j<c;j++){if(j>c-n)putchar(',');basis_json(gel(h,j));}putchar(']');
      printf(",\"immediateFinal\":%s",n==dim?"true":"false");
      if (n == dim)`);
 observed=once(observed,'      gel(L,iL++) = H;\n  }',String.raw`    {
      printf(",\"split\":false,\"a\":[],\"mula\":[],\"mul2\":[],\"coefficients\":[],\"roots\":[],\"imageBases\":[],\"immediateFinal\":true");
      gel(L,iL++) = H;
    }
    printf(",\"stackAfterBody\":%ld,\"finalCountAfterBody\":%ld}",c,iL-1);
  }`);
 const cases='['+prepared.rows.map(r=>'['+[JSON.stringify(r.polynomial),r.n,r.p,'['+r.radical.join(',')+']','['+r.phi.join(',')+']',r.radicalColumns].join(',')+']').join(',')+']';
 const control='#include "pari.h"\n#include "paripriv.h"\n'+literal+String.raw`
static GEN matrix(GEN v,long rows,long cols){GEN M=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){GEN z=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gel(z,i)=gel(v,(j-1)*rows+i);gel(M,j)=z;}return M;}
static void matrix_json(GEN M){putchar('[');for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}putchar(']');}
static void vector_json(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');pari_printf("\"%Ps\"",gel(v,i));}putchar(']');}
static void basis_json(GEN H){printf("{\"rank\":%ld,\"matrix\":",lg(H)-1);matrix_json(H);putchar('}');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN input=gel(cases,ix),nf=nfinit(gp_read_str(GSTR(gel(input,1))),DEFAULTPREC),p=gel(input,3);long N=itos(gel(input,2)),r=itos(gel(input,6)),i,c,iL=1,visit_count=0;
GEN Ip=matrix(gel(input,4),N,r),phi=matrix(gel(input,5),N,N),UN,h=cgetg(N+1,t_VEC),L=cgetg(N+1,t_VEC);gel(h,1)=Ip;
if(ix>1)putchar(',');printf("{\"visits\":[");
`+observed+String.raw`
printf("],\"finalIdeals\":[");for(long j=1;j<lg(L);j++){if(j>1)putchar(',');basis_json(gel(L,j));}printf("]}");set_avma(av);
}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-recursive-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,prepared.rows.length);
 const rows=prepared.rows.map((r,i)=>{const out=outputs[i];assert(out.visits.length>=1);assert(out.finalIdeals.length>=1&&out.finalIdeals.length<=r.n);for(const v of out.visits){assert.equal(v.H.length,r.n*v.rank);for(const b of v.imageBases)assert.equal(b.matrix.length,r.n*b.rank);}for(const b of out.finalIdeals)assert.equal(b.matrix.length,r.n*b.rank);return {...r,...out};});
 const result={rows,identity:{...prepared.identity,worklistSourceHash:hash(worklist),instrumentedWorklistHash:hash(observed),minpolySourceHash:hash(literal),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(prepared.rows)),layout:'Column-major matrices; signed source image columns retained; finalIdeals in source L order',boundary:'Full quotient worklist starting with actual radical H, no Kummer removal or prime descriptor construction. Observations add only JSON and an extra pol_min for coefficient capture.'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,visits:r.rows.reduce((n,x)=>n+x.visits.length,0),signedVisits:r.rows.reduce((n,x)=>n+x.visits.filter(v=>v.H.some(a=>BigInt(a)<0n)).length,0),artifactDirectory:r.artifactDirectory,identity:r.identity}));}catch(e){console.error(e);process.exitCode=1;}}
