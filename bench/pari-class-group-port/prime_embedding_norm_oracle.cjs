"use strict";
// PARI source get_norm embedding branch; no determinant/resultant oracle values.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const pari=path.resolve(pariDirectory),archive=path.resolve(archivePath),lib=path.join(pari,'Olinux-x86_64');
 const archiveHash=hash(fs.readFileSync(archive));assert.equal(archiveHash,'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/base2.c']);
 const start=source.indexOf('/* to compute norm of elt in basis form */'),end=source.indexOf('/* f = f(pr/p)',start);assert(start>=0&&end>start);const literal=source.slice(start,end);
 const control='#include "pari.h"\n#include "paripriv.h"\n'+literal+String.raw`
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN value=gel(column,r1+1+(row-r1)/2);if(typ(value)==t_COMPLEX)return gel(value,1+(row-r1)%2);return (row-r1)%2?gen_0:value;}
static void triple(GEN value){long precision=-1,exponent=0,de;GEN mantissa=value;if(typ(value)==t_REAL){precision=bit_prec(value);exponent=expo(value);mantissa=mantissa_real(value,&de);}else if(typ(value)!=t_INT)pari_err_TYPE("oracle triple",value);pari_printf("[\"%Ps\",%ld,%ld]",mantissa,precision,exponent);}
static void vector_json(GEN v){putchar('[');for(long j=1;j<lg(v);j++){if(j>1)putchar(',');pari_printf("\"%Ps\"",gel(v,j));}putchar(']');}
int main(void){pari_init(256000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={3,37};int first=1;putchar('[');
for(long field=0;field<4;field++){pari_sp fa=avma;GEN nf=nfinit(gp_read_str(polys[field]),nbits2prec(192)),M=nf_get_M(nf);long n=nf_get_degree(nf),r1=nf_get_r1(nf);
for(long pi=0;pi<2;pi++){GEN p=stoi(primes[pi]);norm_S actual,forced;init_norm(&actual,nf,p);forced.r1=r1;forced.M=M;forced.D=forced.w=forced.T=NULL;long ex=gexpo(M)+gexpo(mului(8*n,p));
for(long candidate=0;candidate<11+n;candidate++){pari_sp av=avma;GEN a=zerocol(n);
if(candidate>=1&&candidate<=4)gel(a,1)=candidate==1?gen_1:candidate==2?gen_m1:candidate==3?p:negi(p);
else if(candidate>=5&&candidate<5+n)gel(a,candidate-4)=gen_1;
else if(candidate>=5+n)for(long j=1;j<=n;j++)gel(a,j)=stoi(j%2?(candidate-4-n)*j:-(candidate-4-n)-j);
GEN embeddings=RgM_RgC_mul(M,a),value=embed_norm(embeddings,r1);long error;GEN rounded=grndtoi(value,&error),answer=get_norm(&forced,a);if(!gequal(rounded,answer))return 11;
if(!first)putchar(',');first=0;printf("{\"field\":%ld,\"polynomial\":\"%s\",\"n\":%ld,\"r1\":%ld,\"p\":%ld,\"candidate\":%ld,\"coordinates\":",field,polys[field],n,r1,primes[pi],candidate);vector_json(a);
printf(",\"matrix\":[");for(long row=0;row<n;row++)for(long j=1;j<=n;j++){if(row||j>1)putchar(',');triple(component(gel(M,j),row,r1));}printf("],\"embeddings\":[");for(long row=0;row<n;row++){if(row)putchar(',');triple(component(embeddings,row,r1));}printf("],\"embeddedNorm\":");triple(value);
pari_printf(",\"norm\":\"%Ps\",\"roundingError\":\"%ld\",\"integerShortcut\":%s,\"initNormEmbeddingMode\":%s,\"criterion\":{\"ex\":%ld,\"matrixPrecision\":%ld,\"lhs\":%ld,\"rhs\":%ld}}",answer,error,typ(gel(embeddings,1))==t_INT?"true":"false",actual.M?"true":"false",ex,gprecision(M),n*ex,gprecision(M)-20);set_avma(av);
}}set_avma(fa);}
for(long k=4;k<=6;k++){pari_sp av=avma;long prec=nbits2prec(64),n=3;GEN M=zeromatcopy(n,n),a=mkcol3(gen_1,gen_1,gen_1);
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)gcoeff(M,i,j)=itor(i==j?gen_1:gen_0,prec);
gcoeff(M,1,1)=addrr(real_1(prec),real2n(-k,prec));GEN embeddings=RgM_RgC_mul(M,a),value=embed_norm(embeddings,3);long error;GEN rounded=grndtoi(value,&error);norm_S S;S.r1=3;S.M=M;S.D=S.w=S.T=NULL;
volatile int rejected=0;pari_CATCH(e_PREC){rejected=1;}pari_TRY{GEN answer=get_norm(&S,a);if(!gequal(answer,rounded))return 12;}pari_ENDCATCH;
if(rejected!=(error>-5))return 13;
putchar(',');printf("{\"synthetic\":true,\"kind\":\"real64-rounding-boundary\",\"n\":3,\"r1\":3,\"k\":%ld,\"accepted\":%s,\"coordinates\":[\"1\",\"1\",\"1\"],\"matrix\":[",k,rejected?"false":"true");
for(long row=0;row<n;row++)for(long j=1;j<=n;j++){if(row||j>1)putchar(',');triple(component(gel(M,j),row,3));}printf("],\"embeddings\":[");for(long row=0;row<n;row++){if(row)putchar(',');triple(component(embeddings,row,3));}printf("],\"embeddedNorm\":");triple(value);
pari_printf(",\"norm\":\"%Ps\",\"roundingError\":\"%ld\",\"integerShortcut\":false,\"initNormEmbeddingMode\":null,\"criterion\":null}",rounded,error);set_avma(av);}
puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-embedding-norm-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const rows=JSON.parse(run(binary,[]));assert.equal(rows.length,119);for(const r of rows){assert.equal(r.matrix.length,r.n*r.n);assert.equal(r.embeddings.length,r.n);assert.equal(r.coordinates.length,r.n);if(r.synthetic){assert.equal(r.accepted,BigInt(r.roundingError)<=-5n);assert.equal(r.roundingError,String(-r.k));}else{r.accepted=true;assert.equal(r.initNormEmbeddingMode,r.criterion.lhs<=r.criterion.rhs);assert(BigInt(r.roundingError)<=-5n);}}
 const libraryPath=fs.realpathSync(path.join(lib,'libpari.so'));
 const result={rows,identity:{version:'2.17.4',archiveHash,base2Hash:hash(source),literalSourceHash:hash(literal),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),libraryPath,libraryHash:hash(fs.readFileSync(libraryPath)),layout:'matrix row-major component triples [mantissa,precision,exponent]; real places then real/imag pairs; precision=-1 exact integer',boundary:'nfinit requested192bits. get_norm forced to its source embedding branch for these bounded diagnostic coordinates; actual init_norm decision separately recorded. No resultant/determinant substitution or claim fallback is implemented.'},artifactDirectory};
 result.identity.boundary+=' Three additional synthetic real64 diagonal matrices (not nf embeddings) test source precision errors -4/-5/-6; rejected norm is the diagnostic grndtoi value, not a get_norm return.';
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,integerShortcuts:r.rows.filter(x=>x.integerShortcut).length,actualEmbeddingRows:r.rows.filter(x=>x.initNormEmbeddingMode).length,artifactDirectory:r.artifactDirectory,identity:r.identity}));}catch(e){console.error(e);process.exitCode=1;}}
