"use strict";
// Source-transparent search-policy experiment; exact acceptance is unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {radiusSource}=require('./diagnose-cubic-radius-build.cjs');
const {variants}=require('./diagnose-cubic-twelve-ideal-build.cjs');
const normalization = `    if not _cubic_coordinates_are_scalar(workspace, coordinate_zero, coordinate_one, coordinate_two):
        content, content_left, content_right = _cubic_extended_gcd(abs(coordinate_zero), abs(coordinate_one))
        content, content_left, content_right = _cubic_extended_gcd(content, abs(coordinate_two))
        if content > 1:
            coordinate_zero //= content
            coordinate_one //= content
            coordinate_two //= content
`;
function contentSource(source) {
  const start=source.indexOf('def _cubic_append_smooth_principal_relation(');
  assert.ok(start>=0);
  const stop=source.indexOf('\ndef ',start+1);
  assert.ok(stop>start);
  const body=source.slice(start,stop);
  const marker='    norm = _cubic_norm_form_value(\n';
  assert.equal(body.split(marker).length,2,'relation norm boundary drift');
  assert.ok(!body.includes('content, content_left, content_right ='),'already normalized; use the pre-integration source checkout');
  return source.slice(0,start)+body.replace(marker,normalization+marker)+source.slice(stop);
}
async function main(){
  const [rootArg,dirArg,...extra]=process.argv.slice(2);assert.ok(rootArg&&dirArg&&!extra.length);
  const root=path.resolve(rootArg),directory=path.resolve(dirArg);
  assert.ok(!fs.existsSync(path.join(directory,'builds.json')));
  fs.mkdirSync(directory,{recursive:true});
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const ordered=variants(source).find(v=>v.name==='ordering12').source;
  const candidates=[['content',contentSource(source)],['content_radius',contentSource(radiusSource(source))],
    ['content_radius_ordering12',contentSource(radiusSource(ordered))]];
  const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
  const records=[];
  for(const [name,text] of candidates){
    const sourcePath=path.join(directory,name+'.py');fs.writeFileSync(sourcePath,text);
    const c=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+name)});
    records.push({name,sourcePath,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),cacheKey:c.cacheKey,modulePath:c.modulePath});
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({schema:'sagejs.diagnostic/cubic-content-ablation-v1',
    promotion:false,public_receipt_qualified:false,resource_limits_changed:false,acceptance_rule_changed:false,records},null,2));
}
module.exports={contentSource,normalization};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
