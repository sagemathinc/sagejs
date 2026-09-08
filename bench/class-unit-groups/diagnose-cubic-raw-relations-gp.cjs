"use strict";
// Exact PARI forensic oracle, not the independent Sage.js certificate replay.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
function program(r) {
  const n = Number(r.output[50]), m = Number(r.output[51]);
  assert.deepEqual(r.coefficients,['122','-7','-1','1']);
  // This experiment uses the power integral basis, checked in captured analysis.
  assert.deepEqual(r.basis,['1','0','0','0','1','0','0','0','1']);
  assert.equal(r.output[5],'1');
  assert.deepEqual(r.output.slice(17,26),r.basis);
  assert.deepEqual(r.transcripts.map(x=>x.length),[9*n,n*m,3*m]);
  for(const values of r.transcripts) for(const value of values) assert.match(value,/^-?\d+$/);
  const matrix=x=>'['+Array.from({length:3},(_,j)=>x.slice(3*j,3*j+3).join(',')).join(';')+']';
  let s='f=Polrev(['+r.coefficients+']);nf=nfinit(f);T=matrix(3,3,i,j,nfalgtobasis(nf,x^(j-1))[i]);P=vector('+n+');\n';
  for(let i=0;i<n;i++)s+=`P[${i+1}]=idealhnf(nf,T*${matrix(r.transcripts[0].slice(9*i,9*i+9))}~);\n`;
  s+=`a=vector(${m});\n`;
  for(let i=0;i<m;i++)s+=`a[${i+1}]=Mod(Polrev([${r.transcripts[2].slice(3*i,3*i+3)}]),f);J=idealhnf(nf,1);`+
    Array.from({length:n},(_,j)=>`J=idealmul(nf,J,idealpow(nf,P[${j+1}],${r.transcripts[1][i*n+j]}));`).join('')+
    `if(J!=idealhnf(nf,a[${i+1}]),error("principal row ${i} failed"));\n`;
  const rows=Array.from({length:m},(_,i)=>r.transcripts[1].slice(i*n,(i+1)*n));
  s+=`M=[${rows.map(row=>row.join(',')).join(';')}];K=matkerint(M~);print([matrank(M),matsize(K)[2],abs(matdet(mathnf(M~)))]);\n`;
  s+=`for(j=1,matsize(K)[2],u=prod(i=1,${m},a[i]^K[i,j]);print([j,lift(u),norm(u)]));print("principal-rows-checked");\n`;
  // Specific forensic witness observed in PARI's trace, never a production rule.
  s+=`b=Mod(-11-4*x,f);fac=idealfactor(nf,b);v=vector(${n});for(i=1,matsize(fac)[1],for(j=1,${n},if(idealhnf(nf,fac[i,1])==P[j],v[j]=fac[i,2])));\n`;
  s+=`J=idealhnf(nf,1);for(j=1,${n},J=idealmul(nf,J,idealpow(nf,P[j],v[j])));if(J!=idealhnf(nf,b),error("new row is not factor-base smooth"));\n`;
  s+='K=matkerint(concat(M~,v~));aa=concat(a,[b]);print("additional-pari-generator");print(v);\n';
  s+='for(j=1,matsize(K)[2],u=prod(i=1,#aa,aa[i]^K[i,j]);if(u!=1&&u!= -1,print([K[,j],lift(u),norm(u)])));\n';
  if(r.analysis[505]==='901') {
    s+='print("candidate-ellipsoid-membership: zero-based ideal, coordinates, squared length, bound, ratio");\n';
    for(let i=0;i<n;i++) {
      const p=r.analysis.slice(128+11*i,139+11*i),u=r.analysis.slice(272+9*i,281+9*i);
      if(p[0]==='0')continue; // No plan was prepared for this ideal.
      for(const value of [...p,...u])assert.match(value,/^-?\d+$/);
      const h=r.transcripts[0].slice(9*i,9*i+9);
      s+=`U=${matrix(u)};if(abs(matdet(U))!=1,error("non-unimodular plan"));c=[-11,-4,0]/(U*${matrix(h)});G=[${p[0]},${p[1]},${p[2]};${p[1]},${p[3]},${p[4]};${p[2]},${p[4]},${p[5]}];if(denominator(c)==1,print([${i},c,c*G*c~,${p[6]},1.*c*G*c~/${p[6]}]));\n`;
    }
  }
  s+='quit;\n';
  return s;
}
function main() {
  const [capturePath,gp,...extra]=process.argv.slice(2);
  assert.ok(capturePath&&gp&&!extra.length);
  const capture=JSON.parse(fs.readFileSync(capturePath));
  assert.equal(capture.schema,'sagejs.diagnostic/raw-cubic-relations-v1');
  const records=capture.records.map(r=>{
    const source=program(r);
    const p=spawnSync(gp,['-fq'],{input:source,encoding:'utf8',timeout:30000});
    assert.equal(p.status,0,p.stderr);
    assert.equal(p.stderr.trim(),'');
    assert.ok(p.stdout.includes('principal-rows-checked'));
    return {name:r.name,sourceSha256:r.sourceSha256,gpProgram:source,stdout:p.stdout};
  });
  console.log(JSON.stringify({diagnostic_only:true,independent_exact_replay:false,records},null,2));
}
module.exports={program};
if(require.main===module)main();
