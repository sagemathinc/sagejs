const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const [root, directory, baselineRevision = '434481d5e'] = process.argv.slice(2);
const {compileKernel} = require(path.join(root,'tools/native-kernel/compiler.cjs'));
const relative = 'src/lib/sagejs/number_fields/cubic_class_number_native.py';
fs.mkdirSync(directory,{recursive:true});
(async()=>{
 const records=[];
 for(const name of ['baseline','indexed']) {
  const source=name==='baseline'?execFileSync('git',['show',baselineRevision+':'+relative],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,relative),'utf8');
  const sourcePath=path.join(directory,name+'.py');fs.writeFileSync(sourcePath,source);
  const result=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+name)});
  records.push({name,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),modulePath:result.modulePath,cacheKey:result.cacheKey});
  console.log(name,result.modulePath);
 }
 fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({diagnostic:true,records},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
