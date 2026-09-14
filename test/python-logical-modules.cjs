// sagejs-test-tier: integration
"use strict";
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {spawnSync}=require('node:child_process');
const {createContext,runInContext}=require('node:vm');
const test=require('node:test');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const createCompiler=require('../dist/tools/compiler.js').default;
const {createPythonCompilerFrontend}=require('../dist/tools/python/compiler-frontend.js');
const cases=[
 "raise ValueError('module')\n",
 "def leaf():\n    raise ValueError('leaf')\nleaf()\n",
 "try:\n    raise ValueError('bare')\nexcept ValueError:\n    raise\n",
 "def leaf():\n    raise ValueError('pending')\ntry:\n    leaf()\nfinally:\n    raise TypeError('cleanup')\n",
 "def required(x):\n    pass\nrequired()\n",
];
const oracle=spawnSync(pythonExecutable(),['-c',`
import json, traceback
cases=json.loads(${JSON.stringify(JSON.stringify(cases))})
result=[]
def frames(error):
    return [(f.name,f.lineno) for f in traceback.extract_tb(error.__traceback__) if f.filename == 'module.py'] if error else []
for source in cases:
    try:
        exec(compile(source,'module.py','exec'),{})
    except BaseException as error:
        result.append([type(error).__name__,frames(error),frames(error.__context__)])
print(json.dumps(result))
`],{encoding:'utf8',timeout:30000});
assert.equal(oracle.status,0,oracle.stderr);
const expected=JSON.parse(oracle.stdout);
for(const mode of ['python','sage']) test(`${mode}: module records and namespace survive unwind wrappers`,async t=>{
 const compiler=createCompiler(), frontend=await createPythonCompilerFrontend(compiler,mode);
 const baselib=readFileSync(join(__dirname,'../dist/compiler/baselib-plain-pretty.js'),'utf8');
 function compile(source,private_scope=false,reuse_main_module=false){
  const ast=frontend.parse(source,{filename:'module.py',strict_python_scopes:true,scoped_flags:{dict_literals:true,bound_methods:true}});
  const output=new compiler.OutputStream({private_scope,reuse_main_module,write_name:false,baselib_plain:baselib,
   python_attributes:true,python_truthiness:true,python_tuples:true,python_traceback_records:true});
  ast.print(output);return output.get();
 }
 function context(){return createContext({require,process,Buffer,console,__sagejs_runtime_require__:require,__sagejs_traceback_records_enabled__:true});}
 function frames(error){const result=[];for(let tb=error?.__traceback__;tb;tb=tb.tb_next){assert.equal(tb.code.filename,'module.py');result.push([tb.code.name,Number(tb.tb_lineno)]);assert.ok(result.length<20);}return result;}
 try{
  for(const privateScope of [false,true]) for(let i=0;i<cases.length;i++) await t.test(`${privateScope}:${i}`,()=>{
   const ctx=context();let caught;
   try{runInContext(compile(cases[i],privateScope),ctx,{timeout:30000});}catch(error){caught=error;}
   assert.ok(caught);
   assert.deepEqual([caught.name,frames(caught),frames(caught.__context__)],expected[i]);
  });
  for(const privateScope of [false,true]){
   const ctx=context();runInContext(compile('def exported():\n    return 42\nvalue = exported()\n',privateScope),ctx,{timeout:30000});
   assert.equal(Number(ctx.ρσ_modules.__main__.exported()),42);
   assert.equal(Number(ctx.ρσ_modules.__main__.value),42);
   runInContext(compile('class Exported:\n    def answer(self):\n        return 42\ninstance = Exported()\n',privateScope),ctx,{timeout:30000});
   assert.equal(typeof ctx.ρσ_modules.__main__.Exported, 'function');
   assert.equal(Number(ctx.ρσ_modules.__main__.instance.answer()),42);
  }
  const ctx=context();
  runInContext(compile("saved = ValueError('saved')\n",false,true),ctx,{timeout:30000});
  for(let i=1;i<=2;i++){
   let caught;try{runInContext(compile('raise saved\n',false,true),ctx,{timeout:30000});}catch(error){caught=error;}
   assert.equal(frames(caught).length,i);
  }
  assert.equal(Number(runInContext(compile('42\n',false,true),ctx,{timeout:30000})),42);
 }finally{frontend.close();}
});
