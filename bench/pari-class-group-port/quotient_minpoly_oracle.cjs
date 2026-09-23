"use strict";
// Test oracle only: literal PARI get_powers/pol_min, relative to e1.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const {spawnSync} = require("node:child_process"), {createHash} = require("node:crypto");
const hash = x => createHash("sha256").update(x).digest("hex");
function run(command,args) {
 const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:16*1024*1024});
 assert.equal(r.status,0,r.stderr||String(r.error)); return r.stdout;
}
function collect(pariDirectory,archivePath) {
 const pari=path.resolve(pariDirectory),archive=path.resolve(archivePath),lib=path.join(pari,"Olinux-x86_64");
 assert.equal(hash(fs.readFileSync(archive)),"02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
 const source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/base2.c"]);
 assert.equal(hash(source),"60c5d59b843d400a3aab248282464d6c5d47ee57f9d62634334603542abd1e91");
 const start=source.indexOf("static GEN\nget_powers("),end=source.indexOf("static GEN\nget_pr(",start);
 assert(start>=0&&end>start); const literal=source.slice(start,end);
 const rows=[];
 for(const p of [2,3,5,37,2147483659,3037000493]) for(let n=1;n<=4;n++) {
  const add=(kind,matrix)=>rows.push({kind,n,p,matrix:matrix.map(String)});
  for(const a of [0,1,p-1]) add("scalar",Array.from({length:n*n},(_,k)=>Math.floor(k/n)===k%n?a:0));
  for(let seed=0;seed<4;seed++) {
   const matrix=Array(n*n).fill(0);
   for(let j=0;j<n-1;j++) matrix[j*n+j+1]=1;
   for(let i=0;i<n;i++) matrix[(n-1)*n+i]=Number((BigInt(seed+1)*BigInt(i+3)*17n)%BigInt(p));
   add("companion",matrix);
  }
  for(let seed=1;seed<=5;seed++) add("random-relative-e1",Array.from({length:n*n},(_,k)=>Number((BigInt(seed)*982451653n+BigInt(k+1)*BigInt(k+seed+3)*32452843n)%BigInt(p))));
 }
 const cases="["+rows.map(r=>"["+[r.n,r.p,"["+r.matrix.join(",")+"]"].join(",")+"]").join(",")+"]";
 const control=String.raw`#include "pari.h"
#include "paripriv.h"
`+literal+String.raw`
static void vector_json(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');pari_printf("\"%Ps\"",gel(v,i));}putchar(']');}
static void matrix_json(GEN M){putchar('[');for(long j=1;j<lg(M);j++)for(long i=1;i<lg(gel(M,j));i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(M,i,j));}putchar(']');}
int main(void){pari_init(256000000,10000);GEN cases=gp_read_str(`+JSON.stringify(cases)+String.raw`);putchar('[');
for(long ix=1;ix<lg(cases);ix++){pari_sp av=avma;GEN row=gel(cases,ix),p=gel(row,2),flat=gel(row,3);long n=itos(gel(row,1));GEN M=cgetg(n+1,t_MAT);
for(long j=1;j<=n;j++){GEN c=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gel(c,i)=gel(flat,(j-1)*n+i);gel(M,j)=c;}
GEN powers=get_powers(M,p),dependency=FpM_deplin(powers,p),polynomial=pol_min(M,p);long first=lg(dependency)-1;while(first>0&&!signe(gel(dependency,first)))first--;
if(ix>1)putchar(',');printf("{\"powers\":");matrix_json(powers);printf(",\"coefficients\":");GEN coefficients=cgetg(degpol(polynomial)+2,t_VEC);for(long i=0;i<=degpol(polynomial);i++)gel(coefficients,i+1)=gel(polynomial,i+2);vector_json(coefficients);printf(",\"firstDependent\":%ld}",first);set_avma(av);}
puts("]");pari_close();return 0;}
`;
 const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-quotient-minpoly-oracle-"));
 const c=path.join(artifactDirectory,"oracle.c"),binary=path.join(artifactDirectory,"oracle");fs.writeFileSync(c,control);
 run("cc",["-O1","-fsanitize=undefined","-fno-sanitize-recover=undefined","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",binary]);
 const outputs=JSON.parse(run(binary,[]));assert.equal(outputs.length,rows.length);
 const libraryPath=fs.realpathSync(path.join(lib,"libpari.so"));
 const result={rows:rows.map((r,i)=>{const out=outputs[i];assert.equal(out.powers.length,r.n*(r.n+2));assert(out.firstDependent>=2&&out.firstDependent<=r.n+1);return {...r,...out};}),identity:{version:"2.17.4",archiveHash:hash(fs.readFileSync(archive)),base2Hash:hash(source),literalSourceHash:hash(literal),controlHash:hash(control),binaryHash:hash(fs.readFileSync(binary)),libraryPath,libraryHash:hash(fs.readFileSync(libraryPath)),layout:"column-major; polynomial coefficients low to high",boundary:"Annihilator relative to e1 for scalar/companion/random matrices. Random rows are not claimed to be whole-matrix minimal polynomials or actual quotient multiplication matrices."},artifactDirectory};
 fs.writeFileSync(path.join(artifactDirectory,"fixtures.json"),JSON.stringify(result));return result;
}
module.exports={collect};
if(require.main===module){try{const result=collect(process.argv[2],process.argv[3]);console.log(JSON.stringify({rows:result.rows.length,artifactDirectory:result.artifactDirectory,identity:result.identity}));}catch(e){console.error(e);process.exitCode=1;}}
