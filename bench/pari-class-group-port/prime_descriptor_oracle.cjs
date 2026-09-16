"use strict";
// Test oracle for the noninert get_pr tail, not a candidate implementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=require('./prime_uniformizer_oracle.cjs').collect(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const base3=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base3.c']);
 const start=source.indexOf('    t = FpM_deplin(zk_multable(nf,u), p);'),end=source.indexOf('    t = mt;',start);assert(start>=0&&end>start);const literal=source.slice(start,end);
 const observed=literal.replace('t = FpM_deplin(zk_multable(nf,u), p);','multiplication = zk_multable(nf,u); before = gcopy(multiplication); t = FpM_deplin(multiplication, p);');
 const inputs=prepared.rows.filter(r=>r.embeddingMode);
 const cases='['+inputs.map(r=>'['+[JSON.stringify(r.polynomial),r.p,r.ramif,'['+r.uniformizer.join(',')+']'].join(',')+']').join(',')+']';
 const control='#include "pari.h"\n#include "paripriv.h"\n'+String.raw`
static GEN mk_pr(GEN p,GEN u,long e,long f,GEN t){return mkvec5(p,u,utoipos(e),utoipos(f),t);}
static void vector_json(GEN v){putchar('[');for(long j=1;j<lg(v);j++){if(j>1)putchar(',');pari_printf("\"%Ps\"",gel(v,j));}putchar(']');}
static void matrix_json(GEN M){putchar('[');for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}putchar(']');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN input=gel(cases,ix),nf=nfinit(gp_read_str(GSTR(gel(input,1))),nbits2prec(192)),p=gel(input,2),u=gtocol(gel(input,4)),t,mt,multiplication,before;long ramif=itos(gel(input,3)),e;
`+observed+String.raw`
if(ix>1)putchar(',');printf("{\"multiplicationBefore\":");matrix_json(before);printf(",\"multiplicationAfter\":");matrix_json(multiplication);printf(",\"antiuniformizer\":");vector_json(t);printf(",\"antiuniformizerTable\":");matrix_json(mt);printf(",\"ramificationIndex\":%ld,\"valuationCalled\":%s,\"valuation\":",e,ramif?"true":"false");if(ramif)printf("%ld",e-1);else printf("null");putchar('}');set_avma(av);
}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-descriptor-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,inputs.length);
 const rows=inputs.map((r,i)=>{const out=outputs[i];assert.equal(out.antiuniformizer.length,r.n);assert.equal(out.antiuniformizerTable.length,r.n*r.n);assert.equal(out.valuationCalled,Boolean(r.ramif));return {...r,residueDegree:r.n-r.P.rank,...out};});
 const result={rows,identity:{...prepared.identity,base3Hash:hash(base3),descriptorTailSourceHash:hash(literal),instrumentedTailHash:hash(observed),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(inputs)),boundary:'Noninert get_pr tail from source-produced uniformizers. Exact FpM_deplin and zk_multable, actual conditional ZC_nfval on provisional e=f=0 descriptor. Inert/Kummer/flim branches excluded. No candidate Python implementation.'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,valuations:r.rows.filter(x=>x.valuationCalled).length,artifactDirectory:r.artifactDirectory}));}catch(e){console.error(e);process.exitCode=1;}}
