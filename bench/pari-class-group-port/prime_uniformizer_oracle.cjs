"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=require('./prime_complements_oracle.cjs').collect(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const ns=source.indexOf('/* to compute norm of elt in basis form */'),ne=source.indexOf('/* f = f(pr/p)',ns),us=source.indexOf('static GEN\nuniformizer('),ue=source.indexOf('/*******************************************************************/',us);assert(ns>=0&&ne>ns&&us>=0&&ue>us);
 const norm=source.slice(ns,ne),uniformizer=source.slice(us,ue),inputs=[];
 for(const r of prepared.rows)if(!r.synthetic)for(let ideal=0;ideal<r.finalIdeals.length;ideal++)if(r.finalIdeals[ideal].rank>0)inputs.push({...r,ideal,P:r.finalIdeals[ideal],V:r.LV[ideal]});
 const cases='['+inputs.map(r=>'['+[JSON.stringify(r.polynomial),r.n,r.p,r.P.rank,'['+r.P.matrix.join(',')+']',r.V.rank,'['+r.V.matrix.join(',')+']'].join(',')+']').join(',')+']';
 const control='#include "pari.h"\n#include "paripriv.h"\n'+norm+String.raw`
static long candidates;
static void vector_json(GEN v){putchar('[');for(long j=1;j<lg(v);j++){if(j>1)putchar(',');pari_printf("\"%Ps\"",gel(v,j));}putchar(']');}
static void errprime(GEN p){pari_err_PRIME("idealprimedec",p);}
static int is_uniformizer(GEN a,GEN q,norm_S *S){GEN norm=get_norm(S,a);int accepted=!dvdii(norm,q);long error;GEN rounded=grndtoi(embed_norm(RgM_RgC_mul(S->M,a),S->r1),&error);if(!gequal(norm,rounded))pari_err_BUG("norm observation");if(candidates++)putchar(',');printf("{\"coordinates\":");vector_json(a);pari_printf(",\"norm\":\"%Ps\",\"error\":\"%ld\",\"accepted\":%s}",norm,error,accepted?"true":"false");return accepted;}
`+uniformizer+String.raw`
static GEN matrix(GEN v,long rows,long cols){GEN M=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){GEN z=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gel(z,i)=gel(v,(j-1)*rows+i);gel(M,j)=z;}return M;}
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN value=gel(column,r1+1+(row-r1)/2);if(typ(value)==t_COMPLEX)return gel(value,1+(row-r1)%2);return (row-r1)%2?gen_0:value;}
static void triple(GEN value){long precision=-1,exponent=0,de;GEN mantissa=value;if(typ(value)==t_REAL){precision=bit_prec(value);exponent=expo(value);mantissa=mantissa_real(value,&de);}else if(typ(value)!=t_INT)pari_err_TYPE("triple",value);pari_printf("[\"%Ps\",%ld,%ld]",mantissa,precision,exponent);}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN input=gel(cases,ix),nf=nfinit(gp_read_str(GSTR(gel(input,1))),nbits2prec(192)),p=gel(input,3);long n=itos(gel(input,2)),r1=nf_get_r1(nf);GEN P=matrix(gel(input,5),n,itos(gel(input,4))),V=matrix(gel(input,7),n,itos(gel(input,6))),M=nf_get_M(nf);int ramif=dvdii(nf_get_disc(nf),p);norm_S S;init_norm(&S,nf,p);
if(ix>1)putchar(',');printf("{\"r1\":%ld,\"ramif\":%d,\"embeddingMode\":%s,\"matrix\":[",r1,ramif,S.M?"true":"false");for(long row=0;row<n;row++)for(long j=1;j<=n;j++){if(row||j>1)putchar(',');triple(component(gel(M,j),row,r1));}printf("],\"candidates\":[");candidates=0;
if(S.M){GEN u=uniformizer(nf,&S,P,V,p,ramif);printf("],\"uniformizer\":");vector_json(u);putchar('}');}else printf("],\"uniformizer\":null,\"frontier\":\"init_norm resultant mode\"}");set_avma(av);
}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-uniformizer-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,inputs.length);
 const rows=inputs.map((r,i)=>{const out=outputs[i];if(out.embeddingMode){assert.equal(out.uniformizer.length,r.n);assert(out.candidates.length>=1);}return {field:r.field,polynomial:r.polynomial,n:r.n,p:r.p,ideal:r.ideal,P:r.P,V:r.V,table:r.table,...out};});
 const result={rows,identity:{...prepared.identity,normSourceHash:hash(norm),uniformizerSourceHash:hash(uniformizer),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(inputs)),layout:'P/V column-major; table[(i*n+j)*n+k]; matrix row-major component triples',boundary:'Actual radical-quotient final ideals; no Kummer removal. Literal uniformizer with observation-only is_uniformizer norm/error trace. Normal init_norm selection, resultant cases explicitly skipped. Unramified shifted return is not norm-tested when source short-circuits.'},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,candidates:r.rows.reduce((n,x)=>n+x.candidates.length,0),artifactDirectory:r.artifactDirectory}));}catch(e){console.error(e);process.exitCode=1;}}
