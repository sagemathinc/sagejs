// sagejs-test-tier: unit
// sagejs-test-platform: true
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test');
const text=fs.readFileSync(path.join(__dirname,'../src/output/traceback_policy.py'),'utf8');
const source=/TRACEBACK_POLICY_RUNTIME = r"""([\s\S]*?)"""/.exec(text)?.[1];
assert.ok(source,'test the actual optional generated runtime');
function context() {
  const ctx=vm.createContext({});
  vm.runInContext(source,ctx);
  vm.runInContext(`
    var policy=ρσ_traceback_policy, captures=0;
    function OwnedError(message){this.__init__(message);}
    OwnedError.prototype=Object.create(Error.prototype,{constructor:{value:OwnedError}});
    OwnedError.prototype.__init__=function init(message){
      this.logical=policy.initialize(this);
      this.message=String(message);
      if(!this.logical){
        if(typeof Error.captureStackTrace==='function')Error.captureStackTrace(this,init);
        else this.stack=new Error(this.message).stack;
        captures++;
      }
    };
    function DerivedError(message){this.__init__(message);}
    DerivedError.prototype=Object.create(OwnedError.prototype,{constructor:{value:DerivedError}});
    policy.registerConstructor(OwnedError,OwnedError);
    policy.registerConstructor(DerivedError,OwnedError);
    function run(body){var token=policy.enter();try{return body();}finally{policy.leave(token);}}
  `,ctx);
  return ctx;
}
test('guarded synchronous roots share an outer stack without per-error native capture',()=>{
  const ctx=context();
  vm.runInContext(`
    var callback=policy.wrap(function callbackBody(){return new (policy.constructorTarget(OwnedError))('owned');});
    var errors=run(function(){return [policy.target(callback)(),policy.target(callback)()];});
  `,ctx);
  assert.equal(ctx.captures,0);
  assert.equal(ctx.errors[0].logical,true);
  assert.equal(ctx.errors[0].__sagejs_native_tb__,ctx.errors[1].__sagejs_native_tb__);
  assert.equal(typeof ctx.errors[0].__sagejs_native_tb__.stack,'string');
  assert.equal(ctx.errors[0].stack,undefined);
  const policy=ctx.policy;
  vm.runInContext(source,ctx);
  assert.equal(ctx.ρσ_traceback_policy,policy);
});
test('opaque callbacks and unregistered constructors retain native evidence',()=>{
  const ctx=context();
  vm.runInContext(`
    var callback=policy.wrap(function callbackBody(){return new (policy.constructorTarget(OwnedError))('opaque');});
    function opaqueShim(){return callback();}
    var outer=policy.wrap(function outerBody(){return opaqueShim();});
    var opaque=run(function(){return policy.target(outer)();});
    var unregistered=run(function(){return new OwnedError('unregistered');});
    var later=callback();
  `,ctx);
  assert.equal(ctx.captures,3);
  assert.equal(ctx.opaque.logical,false);
  assert.match(ctx.opaque.stack,/opaqueShim/);
  assert.equal(ctx.unregistered.logical,false);
  assert.equal(ctx.later.logical,false);
});
test('constructor permission is consumed before argument conversion callbacks',()=>{
  const ctx=context();
  vm.runInContext(`
    var nested;
    var outer=run(function(){return new (policy.constructorTarget(OwnedError))({
      toString:function opaqueConversion(){nested=new OwnedError('nested');return 'outer';}
    });});
  `,ctx);
  assert.equal(ctx.outer.logical,true);
  assert.equal(ctx.nested.logical,false);
  assert.match(ctx.nested.stack,/opaqueConversion/);
  assert.equal(ctx.captures,1);
});
test('initializer and ancestor mutation fall back without invoking guard getters',()=>{
  const ctx=context();
  vm.runInContext(`
    var original=OwnedError.prototype.__init__;
    OwnedError.prototype.__init__=function changed(message){original.call(this,message);};
    var changed=run(function(){return new (policy.constructorTarget(DerivedError))('changed');});
    var reads=0;
    Object.defineProperty(OwnedError.prototype,'__init__',{configurable:true,get:function(){reads++;return original;}});
    var getter=run(function(){return new (policy.constructorTarget(DerivedError))('getter');});
    Object.defineProperty(OwnedError.prototype,'__init__',{configurable:true,writable:true,enumerable:true,value:original});
    original.apply=function(){throw new Error('guard must not invoke apply');};
    var applyOverride=run(function(){return new (policy.constructorTarget(DerivedError))('apply override');});
    delete original.apply;
  `,ctx);
  assert.equal(ctx.changed.logical,false);
  assert.equal(ctx.getter.logical,false);
  assert.equal(ctx.reads,1);
  assert.equal(ctx.applyOverride.logical,false);
});
test('public function wrappers preserve receiver and descriptors and restore on throw',()=>{
  const ctx=context();
  vm.runInContext(`
    function implementation(value){if(value==='throw')throw new TypeError('foreign');return this.value+value;}
    Object.defineProperty(implementation,'custom',{get:function(){return 42;},configurable:true});
    var wrapped=policy.wrap(implementation);
    var answer=Reflect.apply(wrapped,{value:3},[4]);
    var descriptor=Object.getOwnPropertyDescriptor(wrapped,'custom');
    var originalDescriptor=Object.getOwnPropertyDescriptor(implementation,'custom');
    var caught;
    try{run(function(){wrapped('throw');});}catch(error){caught=error;}
    var restored=run(function(){return new (policy.constructorTarget(OwnedError))('restored');});
  `,ctx);
  assert.equal(ctx.answer,7);
  assert.equal(ctx.descriptor.get,ctx.originalDescriptor.get);
  assert.match(ctx.caught.stack,/implementation/);
  assert.equal(ctx.restored.logical,true);
});
test('binding targets unwrap even under opaque entry, and transparent binding gets records',()=>{
  const ctx=context();
  vm.runInContext(`
    function bindingBody(){
      var error=Object.create(TypeError.prototype);
      error.__sagejs_argument_error__=binding;
      error.logical=policy.initialize(error);
      if(!error.logical)Error.captureStackTrace(error,error.__sagejs_argument_error__);
      return error;
    }
    var binding=policy.wrap(bindingBody);
    function bindingCaller(){return binding();}
    var opaque=bindingCaller();
    var logical=run(function(){return policy.target(binding)();});
  `,ctx);
  assert.equal(ctx.opaque.logical,false);
  assert.match(ctx.opaque.stack,/bindingCaller/);
  assert.doesNotMatch(ctx.opaque.stack,/at bindingBody/);
  assert.equal(ctx.logical.logical,true);
});
test('engines without native boundary capture use an explicit native fallback',()=>{
  const ctx=context();
  vm.runInContext(`
    Error.captureStackTrace=undefined;
    var error=run(function(){return new (policy.constructorTarget(OwnedError))('fallback');});
  `,ctx);
  assert.equal(ctx.error.logical,false);
  assert.match(ctx.error.stack,/fallback/);
  assert.equal(ctx.error.__sagejs_native_tb__,undefined);
});

test('only compiler-marked forwarding initializers qualify, with cycle rejection',()=>{
  const ctx=context();
  vm.runInContext(`
    function Custom(message){this.__init__(message);}
    Custom.prototype=Object.create(OwnedError.prototype,{constructor:{value:Custom}});
    Custom.prototype.__init__=function custom(message){OwnedError.prototype.__init__.call(this,message);};
    policy.registerConstructor(Custom,OwnedError);
    var custom=run(function(){return new (policy.constructorTarget(Custom))('custom');});
    function Forward(message){this.__init__(message);}
    Forward.prototype=Object.create(OwnedError.prototype,{constructor:{value:Forward}});
    Forward.prototype.__init__=function forward(){OwnedError.prototype.__init__.apply(this,arguments);};
    Forward.prototype.__init__.__sagejs_synthetic_init__=true;
    Forward.prototype.__init__.__sagejs_synthetic_init_target__=OwnedError.prototype.__init__;
    policy.registerConstructor(Forward,OwnedError);
    var forward=run(function(){return new (policy.constructorTarget(Forward))('forward');});
    Custom.prototype.__init__.__sagejs_synthetic_init__=true;
    Custom.prototype.__init__.__sagejs_synthetic_init_target__=Custom.prototype.__init__;
    policy.registerConstructor(Custom,OwnedError);
    var cycle=run(function(){return new (policy.constructorTarget(Custom))('cycle');});
  `,ctx);
  assert.equal(ctx.custom.logical,false);
  assert.equal(ctx.forward.logical,true);
  assert.equal(ctx.cycle.logical,false);
});

test('saved wrappers retain replacement defaults independently of name rebinding',()=>{
  const ctx=context();
  vm.runInContext(`
    var implementation=function original(){return original.__defaults__[0]+original.__kwdefaults__.extra;};
    implementation.__defaults__=[2];implementation.__kwdefaults__={extra:3};
    var wrapper=policy.wrap(implementation), saved=wrapper;
    wrapper=function replacement(){return 100;};
    saved.__defaults__=[5];saved.__kwdefaults__={extra:7};
    var opaque=saved(), transparent=run(function(){return policy.target(saved)();});
  `,ctx);
  assert.equal(ctx.opaque,12);
  assert.equal(ctx.transparent,12);
});

test('reinitialization on an opaque path discards a prior logical backstop',()=>{
  const ctx=context();
  vm.runInContext(`
    var error=run(function(){return new (policy.constructorTarget(OwnedError))('logical');});
    error.__sagejs_logical_exception__=true;
    OwnedError.prototype.__init__.call(error,'native');
  `,ctx);
  assert.equal(ctx.error.logical,false);
  assert.equal(ctx.error.__sagejs_native_tb__,undefined);
  assert.match(ctx.error.stack,/native/);
});
