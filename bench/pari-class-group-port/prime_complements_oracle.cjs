"use strict";
// Exact get_LV oracle restricted to its source t_MAT input branch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {collect:collectRecursive}=require('./quotient_split_recursive_oracle.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function collect(pariDirectory,archivePath){
 const prepared=collectRecursive(pariDirectory,archivePath),pari=path.resolve(pariDirectory),lib=path.join(pari,'Olinux-x86_64');
 const source=run('tar',['-xOf',path.resolve(archivePath),'pari-2.17.4/src/basemath/base2.c']);assert.equal(hash(source),prepared.identity.base2Hash);
 const mstart=source.indexOf('static GEN\nmul_intersect('),mend=source.indexOf('/* Fp-basis of (ZK/pr)',mstart);
 const start=source.indexOf('static GEN\nget_LV('),end=source.indexOf('static void\nerrprime(',start);assert(mstart>=0&&mend>mstart&&start>=0&&end>start);
 const multiply=source.slice(mstart,mend),literal=source.slice(start,end);
 assert.equal(literal.split('  return LV;').length,2);
 const observed=literal.replace('  return LV;','  observed_A = A; observed_B = B;\n  return LV;');
 const inputs=[...prepared.rows];
 for(const p of [2,3,37]) for(const signed of [false,true]) {
  const finalIdeals=[];
  for(let omitted=0;omitted<4;omitted++) {
   const matrix=[];
   for(let axis=0;axis<4;axis++)if(axis!==omitted)for(let row=0;row<4;row++)matrix.push(String(row===axis?(signed?1-p:1):0));
   finalIdeals.push({rank:3,matrix});
  }
  inputs.push({n:4,p,synthetic:true,kind:signed?'signed-coordinate-hyperplanes':'coordinate-hyperplanes',algebra:'Fp^4 with coordinatewise multiplication; not a number-field row',finalIdeals});
 }
 const cases='['+inputs.map(r=>'['+[r.n,r.p,'['+r.finalIdeals.map(b=>'['+[b.rank,'['+b.matrix.join(',')+']'].join(',')+']').join(',')+']'].join(',')+']').join(',')+']';
 const control='#include "pari.h"\n#include "paripriv.h"\n'+multiply+String.raw`
static GEN observed_A,observed_B;
/* Restrict Fp_basis to the exact first branch; descriptor inputs are invalid. */
static GEN Fp_basis(GEN nf,GEN pr){(void)nf;if(typ(pr)==t_MAT)return pr;pari_err_TYPE("matrix-only oracle",pr);return NULL;}
`+observed+String.raw`
static GEN matrix(GEN v,long rows,long cols){GEN M=cgetg(cols+1,t_MAT);for(long j=1;j<=cols;j++){GEN z=cgetg(rows+1,t_COL);for(long i=1;i<=rows;i++)gel(z,i)=gel(v,(j-1)*rows+i);gel(M,j)=z;}return M;}
static void basis_json(GEN M){if(!M){printf("null");return;}printf("{\"rank\":%ld,\"matrix\":[",lg(M)-1);for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}printf("]}");}
static void bases_json(GEN V){putchar('[');if(V)for(long j=1;j<lg(V);j++){if(j>1)putchar(',');basis_json(gel(V,j));}putchar(']');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN input=gel(cases,ix),p=gel(input,2),ideals=gel(input,3);long N=itos(gel(input,1));GEN L=cgetg(lg(ideals),t_VEC);
for(long j=1;j<lg(ideals);j++){GEN b=gel(ideals,j);gel(L,j)=matrix(gel(b,2),N,itos(gel(b,1)));}
observed_A=NULL;observed_B=NULL;GEN LV=get_LV(NULL,L,p,N);if(ix>1)putchar(',');printf("{\"A\":");bases_json(observed_A);printf(",\"B\":");bases_json(observed_B);printf(",\"LV\":");bases_json(LV);putchar('}');set_avma(av);
}puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-complements-oracle-')),c=path.join(artifactDirectory,'oracle.c'),binary=path.join(artifactDirectory,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,inputs.length);
 const rows=inputs.map((r,i)=>{const out=outputs[i],l=r.finalIdeals.length;assert.equal(out.LV.length,l);assert.equal(out.A.length,l===1?0:l);assert.equal(out.B.length,l===1?0:l);for(const b of [...out.A,...out.B,...out.LV])if(b)assert.equal(b.matrix.length,r.n*b.rank);if(r.synthetic)for(let j=0;j<4;j++){assert.equal(out.LV[j].rank,1);for(let k=0;k<4;k++){const entry=(BigInt(out.LV[j].matrix[k])%BigInt(r.p)+BigInt(r.p))%BigInt(r.p);assert.equal(entry!==0n,j===k);}}return {...r,...out};});
 const result={rows,identity:{...prepared.identity,getLVSourceHash:hash(literal),intersectionSourceHash:hash(multiply),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),preparedArtifact:prepared.artifactDirectory,preparedHash:hash(JSON.stringify(prepared.rows)),layout:'Column-major matrices with signed source inputs. A/B null means full algebra, not zero space. Single-prime A/B absent as empty arrays.',boundary:'Source get_LV on recursive radical final ideals, t_MAT-only Fp_basis branch. No Kummer descriptors. Observed A/B pointers added immediately before normal return.'},artifactDirectory};
 result.identity.syntheticRows=6;
 result.identity.inputHash=hash(JSON.stringify(inputs));
 result.identity.boundary+=' Six explicitly synthetic Fp^4 coordinate-hyperplane rows exercise four-prime prefix/suffix intersections; these are not number fields.';
 fs.writeFileSync(path.join(artifactDirectory,'fixtures.json'),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const r=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:r.rows.length,artifactDirectory:r.artifactDirectory,identity:r.identity}));}catch(e){console.error(e);process.exitCode=1;}}
