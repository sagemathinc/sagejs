"use strict";
// Untimed development smoke, deliberately distinct from public/holdout gates.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fields=[
  {coefficients:['122','-7','-1','1'],h:'8',invariants:['2','4']},
  {coefficients:['-55','9','0','1'],h:'5',invariants:['5']},
  {coefficients:['-4','3','-1','1'],h:'2',invariants:['2']},
  {coefficients:['-63','-11','-1','1'],h:'3',invariants:['3']},
];
function main(){
  const [manifestPath,corpusPath,...extra]=process.argv.slice(2);assert.ok(manifestPath&&!extra.length);
  let workloads=fields,corpusHash=null;
  if(corpusPath){
    const raw=require('node:zlib').gunzipSync(fs.readFileSync(corpusPath));
    corpusHash=crypto.createHash('sha256').update(raw).digest('hex');
    assert.equal(corpusHash,'81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd');
    workloads=raw.toString().trim().split('\n').map(JSON.parse).map(r=>({label:r.label,coefficients:r.coefficients,h:r.class_number,invariants:[...r.class_group].sort()}));
  }
  const manifest=JSON.parse(fs.readFileSync(manifestPath));
  assert.ok(['sagejs.diagnostic/twelve-ideal-ablation-build-v1','sagejs.diagnostic/cubic-radius-ablation-v1','sagejs.diagnostic/cubic-content-ablation-v1','sagejs.diagnostic/cubic-centered-ablation-v1','sagejs.diagnostic/cubic-expansion-ablation-v1','sagejs.diagnostic/cubic-recovery-log-ablation-v1'].includes(manifest.schema));
  const records=manifest.records.map(record=>{
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(record.sourcePath)).digest('hex'),record.sourceSha256);
    const module=require(record.modulePath);assert.equal(module.nativeAvailable,true);
    const k=module.certified_complex_cubic_class_group_v1;
    const observations=workloads.map((field,index)=>{
      if(index%100===0)console.error(record.name,index,'/',workloads.length);
      const out=k.createIntegerBuffer(64,256);
      const scratch=[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))];
      let accepted;
      try {
        accepted=k(out,k.packIntegerBuffer(field.coefficients.map(BigInt)),...scratch,0,5,1048576,3145728);
      } catch(error) {
        return {...field,accepted:false,error:String(error),output:out.toArray().map(String)};
      }
      const output=out.toArray().map(String);
      if(accepted){
        assert.equal(output[1],field.h);
        assert.deepEqual(output.slice(3,3+Number(output[2])).sort(),field.invariants);
      }
      return {...field,accepted,output};
    });
    return {...record,observations};
  });
  console.log(JSON.stringify({schema:'sagejs.diagnostic/cubic-ablation-smoke-v1',
    promotion:false,public_receipt_qualified:false,independent_exact_replay:false,corpusHash,records},null,2));
}
if(require.main===module)main();
