"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {variants}=require('./diagnose-cubic-twelve-ideal-build.cjs');
const marker='        uncompacted_relation_count: uint64 = relation_count\n';
function captureSource(source) {
  assert.equal(source.split(marker).length,2);
  return source.replace(marker,`        # Diagnostic-only exit: detached raw rows, never a class-group result.
        output[0] = 0
        output[50] = factor_count
        output[51] = relation_count
        output[52] = adjacent_planned_count
        output[53] = adjacent_enumerated_count
        output[54] = relation_capacity
        output[62] = 0
        output[63] = 900
        if factor_count <= 12:
            capture_i: uint64 = 0
            while capture_i < factor_count:
                capture_j: uint64 = 0
                while capture_j < 11:
                    analysis_proof[128 + 11 * capture_i + capture_j] = adjacent_ellipsoid_parameters[capture_i, capture_j]
                    capture_j += 1
                capture_j = 0
                while capture_j < 9:
                    analysis_proof[272 + 9 * capture_i + capture_j] = adjacent_transforms[3 * capture_i + capture_j // 3, capture_j % 3]
                    capture_j += 1
                capture_i += 1
            analysis_proof[500] = adjacent_factor_cursor
            analysis_proof[501] = adjacent_phase
            analysis_proof[502] = ellipsoid_zero
            analysis_proof[503] = ellipsoid_one
            analysis_proof[504] = ellipsoid_two
            analysis_proof[505] = 901
        if not _cubic_publish_relation_factor_rows(workspace, factor_count, transcript_factor_rows):
            return False
        if not _cubic_publish_relation_rows(relation_candidates, relation_elements, relation_count, factor_count, transcript_relation_rows, transcript_relation_elements):
            return False
        output[62] = 1
        return False
${marker}`);
}
async function main(){
  const [rootArg,dirArg,...extra]=process.argv.slice(2);assert.ok(rootArg&&dirArg&&!extra.length);
  const root=path.resolve(rootArg),directory=path.resolve(dirArg);
  assert.ok(!fs.existsSync(path.join(directory,'builds.json')));
  fs.mkdirSync(directory,{recursive:true});
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
  const records=[];
  for(const v of variants(source).filter(v=>['baseline','ordering12'].includes(v.name))){
    const text=captureSource(v.source),sourcePath=path.join(directory,v.name+'.py');
    fs.writeFileSync(sourcePath,text);
    const c=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+v.name)});
    records.push({name:v.name,sourcePath,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),cacheKey:c.cacheKey,modulePath:c.modulePath});
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({schema:'sagejs.diagnostic/raw-cubic-relation-capture-v1',
    diagnostic_only:true,can_certify:false,can_time_production:false,records},null,2));
}
module.exports={captureSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
