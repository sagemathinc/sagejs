// sagejs-test-tier: specialized
"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {lowerSource}=require('../tools/native-kernel/ir.cjs');
const {createNativeImportResolver}=require('../tools/native-kernel/native-imports.cjs');
const {searchWorkspaceSource}=require('../bench/class-unit-groups/diagnose-cubic-search-workspace-build.cjs');
const {resumableSource}=require('../bench/class-unit-groups/diagnose-cubic-resumable-expansion-build.cjs');
const {torsionProbeSource}=require('../bench/class-unit-groups/diagnose-cubic-torsion-probe-build.cjs');
const {shareRecoverySource}=require('../bench/class-unit-groups/diagnose-cubic-recovery-sharing-build.cjs');
const root=path.resolve(__dirname,'..');
const common={integers:'workspace',order:'adjacent_order',transforms:'adjacent_transforms',parameters:'adjacent_ellipsoid_parameters',relations:'relation_candidates',elements:'relation_elements',hnf_source:'hnf_source',hnf_result:'hnf_result',online_basis:'online_relation_basis',online_source:'online_relation_source',online_hnf:'online_relation_hnf',support:'relation_support',membership:'online_membership_coordinates'};
const maps={
  _cubic_collect_adjacent_relation_prefix:common,
  _cubic_collect_expanded_shell_prefix:{integers:'workspace',order:'order',transforms:'transforms',parameters:'parameters',relations:'candidates',elements:'elements',hnf_source:'source',hnf_result:'result',online_basis:'online_basis',online_source:'online_source',online_hnf:'online_hnf',support:'support',membership:'membership'},
  _cubic_append_reduced_ideal_ellipsoid:{...common,order:null,parameters:null,transforms:'transforms',relations:'relation_matrix',support:'online_relation_support'},
};
test('actual cubic bundle lowering preserves executable IR modulo borrowed parameter names and order',async t=>{
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const sourcePath=path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py');
  const beforeSource=shareRecoverySource(torsionProbeSource(resumableSource(require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline(),read('bench/class-unit-groups/cubic-expanded-shell-experiment.py'),read('bench/class-unit-groups/cubic-expanded-prefix-experiment.py'))));
  const afterSource=searchWorkspaceSource(beforeSource);
  const lower=source=>lowerSource(source,sourcePath,{resolveNativeImport:createNativeImportResolver({root,lowerSource,initialSourcePath:sourcePath})});
  const before=await lower(beforeSource),after=await lower(afterSource);
  const originals=new Map(before.functions.map(fn=>[fn.name,fn]));
  const candidates=new Map(after.functions.map(fn=>[fn.name,fn]));
  assert.deepEqual([...candidates.keys()].sort(),[...originals.keys()].sort());
  const rename=(name,fn)=>{
    const prefix='sagejs_workspace_search__';
    if(typeof name==='string'&&name.startsWith(prefix)){
      const fields=maps[fn];assert(fields&&Object.hasOwn(fields,name.slice(prefix.length)),`${fn}: unknown alias ${name}`);
      return fields[name.slice(prefix.length)];
    }
    return name;
  };
  function normalize(value,fn,bundled){
    if(typeof value==='string')return bundled?rename(value,fn):value;
    if(Array.isArray(value))return value.map(v=>normalize(v,fn,bundled));
    if(!value||typeof value!=='object')return value;
    const out={};
    for(const [key,item]of Object.entries(value)){
      if(['provenance','workspaceBundles'].includes(key))continue;
      const newKey=bundled?rename(key,fn):key;
      assert(newKey!==null,`${fn}: unused alias appears outside parameter declaration`);
      out[newKey]=normalize(item,fn,bundled);
    }
    if(bundled&&value.kind==='native.call'&&maps[value.function]){
      const callee=candidates.get(value.function),original=originals.get(value.function);
      assert.equal(callee.params.length,out.arguments.length);
      const byName=new Map(callee.params.map((p,i)=>[rename(p.name,callee.name),out.arguments[i]]));
      out.arguments=original.params.map(p=>{assert(byName.has(p.name));return byName.get(p.name);});
    }
    return out;
  }
  for(const candidate of after.functions){
    const original=originals.get(candidate.name);
    const params=candidate.params.filter(p=>rename(p.name,candidate.name)!==null);
    for(const unused of candidate.params.filter(p=>rename(p.name,candidate.name)===null)){
      assert(!JSON.stringify(candidate.body).includes(unused.name),`${candidate.name}: supposedly unused owner is consumed`);
    }
    const normalized=normalize(params,candidate.name,true);
    assert.deepEqual(normalized.toSorted((a,b)=>a.name.localeCompare(b.name)),normalize(original.params,candidate.name,false).toSorted((a,b)=>a.name.localeCompare(b.name)),`${candidate.name}.params`);
    for(const key of ['locals','body','dependencies','resourceAliases','returnType'])assert.deepEqual(normalize(candidate[key],candidate.name,true),normalize(original[key],candidate.name,false),`${candidate.name}.${key}`);
  }
  t.diagnostic(`Compared all ${after.functions.length} lowered functions; no arithmetic/control-flow/owner-allocation changes`);
});
