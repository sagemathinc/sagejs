"use strict";
// Permute a fixed coefficient box without changing its points or certificate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {radiusSource}=require('./diagnose-cubic-radius-build.cjs');
const mapping=`        proposal_zero = coefficient_zero + limit_zero
        proposal_one = coefficient_one + limit_one
        proposal_two = coefficient_two + limit_two
        centered_zero = -(proposal_zero // 2)
        if proposal_zero % 2 == 1:
            centered_zero = (proposal_zero + 1) // 2
        centered_one = -(proposal_one // 2)
        if proposal_one % 2 == 1:
            centered_one = (proposal_one + 1) // 2
        centered_two = -(proposal_two // 2)
        if proposal_two % 2 == 1:
            centered_two = (proposal_two + 1) // 2
`;
function centeredSource(source){
  const start=source.indexOf('def _cubic_append_reduced_ideal_ellipsoid('),stop=source.indexOf('\ndef ',start+1);
  assert.ok(start>=0&&stop>start);
  let body=source.slice(start,stop);
  const marker='        status, coordinate_zero, coordinate_one, coordinate_two = (\n';
  assert.equal(body.split(marker).length,2);
  const args='                coefficient_zero,\n                coefficient_one,\n                coefficient_two,\n';
  assert.equal(body.split(args).length,2);
  assert.ok(!body.includes(mapping));
  body=body.replace(marker,mapping+marker).replace(args,'                centered_zero,\n                centered_one,\n                centered_two,\n');
  return source.slice(0,start)+body+source.slice(stop);
}
async function main(){
  const [rootArg,dirArg,...extra]=process.argv.slice(2);assert.ok(rootArg&&dirArg&&!extra.length);
  const root=path.resolve(rootArg),directory=path.resolve(dirArg);assert.ok(!fs.existsSync(path.join(directory,'builds.json')));
  fs.mkdirSync(directory,{recursive:true});
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const candidates=[['centered',centeredSource(source)],['centered_radius',centeredSource(radiusSource(source))]];
  const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));const records=[];
  for(const [name,text] of candidates){
    const sourcePath=path.join(directory,name+'.py');fs.writeFileSync(sourcePath,text);
    const c=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+name)});
    records.push({name,sourcePath,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),cacheKey:c.cacheKey,modulePath:c.modulePath});console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({schema:'sagejs.diagnostic/cubic-centered-ablation-v1',
    promotion:false,public_receipt_qualified:false,resource_limits_changed:false,acceptance_rule_changed:false,records},null,2));
}
module.exports={centeredSource,mapping};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
