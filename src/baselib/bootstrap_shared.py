"""Shared host adapters for both compiler and Sage/Python bootstrap runtimes.

These unchanged native ABI and interruption primitives must be initialized
before builtins. They have no private state or mathematical implementation.
"""


def ρσ_copy_method_metadata(method, target_function):
    """Copy ordered adapter metadata without evaluating live getter properties."""
    return r"""%js (() => {
        for (const name of [
            "__annotations__",
            "__annotations_text__",
            "__code__",
            "__defaults__",
            "__doc__",
            "__globals__",
            "__handles_kwarg_interpolation__",
            "__kwdefaults__",
            "__kwonly__",
            "__module__",
            "__name__",
            "__positional_only__",
            "__python_type__",
            "__qualname__",
            "__varargs__",
            "__varkw__",
        ]) {
            const descriptor = Object.getOwnPropertyDescriptor(
                target_function, name
            );
            if (descriptor && typeof descriptor.get === "function") {
                Object.defineProperty(method, name, descriptor);
            } else {
                method[name] = target_function[name];
            }
        }
    })()"""


def ρσ_native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
        ρσ_copy_method_metadata(method, target_function);
        method.__sagejs_native_method__ = true;
        return method;
    })()"""


def ρσ_unbound_method_adapter(target_function):
    """Expose a JavaScript-receiver method as `method(self, *args)`."""
    return r"""%js (() => {
        if (target_function.__sagejs_unbound_adapter__) {
            return target_function.__sagejs_unbound_adapter__;
        }
        function method(receiver, ...args) {
            return Reflect.apply(target_function, receiver, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = ["self", ...target_function.__argnames__];
        }
        ρσ_copy_method_metadata(method, target_function);
        method.__func__ = target_function;
        // The adapter still represents an ordinary Python function.  Mark it
        // as a descriptor so aliases assigned back onto a class (for example
        // ``C.__rtruediv__ = C.__rdiv__``) bind their eventual instance
        // before receiving the operator's other operand.
        method.__python_descriptor__ = true;
        target_function.__sagejs_unbound_adapter__ = method;
        return method;
    })()"""


def ρσ_exact_integer_add(left, right, missing):
    return r"""%js (() => {
        const leftType = typeof left, rightType = typeof right;
        const exact = (type, value) => type === "boolean" || type === "bigint" ||
            (type === "number" && Number.isSafeInteger(value));
        if (!exact(leftType, left) || !exact(rightType, right)) return missing;
        if (leftType !== "bigint" && rightType !== "bigint") {
            const result = Number(left) + Number(right);
            if (Number.isSafeInteger(result)) return result === 0 ? 0 : result;
        }
        return BigInt(left) + BigInt(right);
    })()"""


def ρσ_exact_shift(left, right, op, missing):
    return r"""%js (() => {
        const e = v => typeof v === "boolean" || typeof v === "bigint" ||
            typeof v === "number" && Number.isSafeInteger(v);
        if (!e(left) || !e(right) || right < 0) return missing;
        if (typeof left !== "bigint" && typeof right !== "bigint") {
            if (op) {
                const v = right > 53 ? left < 0 ? -1 : 0 :
                    Math.floor(left / 2 ** right);
                return v === 0 ? 0 : v;
            }
            const v = left * 2 ** right;
            if (Number.isSafeInteger(v)) return v === 0 ? 0 : v;
        }
        const v = op ? BigInt(left) >> BigInt(right) :
            BigInt(left) << BigInt(right);
        const n = Number(v);
        return Number.isSafeInteger(n) ? n === 0 ? 0 : n : v;
    })()"""


def ρσ_exact_integer_submul(left, right, multiply, missing):
    return r"""%js (()=>{const a=typeof left,b=typeof right,e=(t,v)=>t==="boolean"||t==="bigint"||t==="number"&&Number.isSafeInteger(v);if(!e(a,left)||!e(b,right))return missing;if(a!=="bigint"&&b!=="bigint"){const v=multiply?Number(left)*Number(right):Number(left)-Number(right);if(Number.isSafeInteger(v))return v===0?0:v}return multiply?BigInt(left)*BigInt(right):BigInt(left)-BigInt(right)})()"""


def ρσ_int_pow(left, right, missing):
    return r"""%js (()=>{const a=typeof left,b=typeof right,e=(t,v)=>t==="boolean"||t==="bigint"||t==="number"&&Number.isSafeInteger(v);if(!e(a,left)||!e(b,right)||right<0)return missing;if(a!=="bigint"&&b!=="bigint"){const v=Number(left)**Number(right);if(Number.isSafeInteger(v))return v===0?0:v}return BigInt(left)**BigInt(right)})()"""


def ρσ_check_interrupt():
    return r"""%js (() => {
        const state = globalThis.__sagejs_interrupt_state__;
        if (
            state !== undefined
            && Atomics.exchange(state, 0, 0) !== 0
        ) {
            throw ρσ_exception_value(new KeyboardInterrupt());
        }
    })()"""


def ρσ_normalize_exception(error):
    return r"""%js (() => {
        if (error?.code !== "ERR_SCRIPT_EXECUTION_INTERRUPTED") {
            return error;
        }
        const state = globalThis.__sagejs_interrupt_state__;
        if (state !== undefined) {
            Atomics.store(state, 0, 0);
        }
        return ρσ_exception_value(new KeyboardInterrupt());
    })()"""


def ρσ_prepare_method_call(value, name):
    return r"""%js (() => {
        const p=value==null?undefined:Object.getPrototypeOf(value);
        let c=p===undefined?undefined:_builtins_descriptor_cache.get(p);
        if(c===undefined){
            c=_builtins_descriptor_cache.get(_builtins_attribute_owner(value));
            if(c!==undefined&&p!==undefined)_builtins_descriptor_cache.set(p,c);
        }
        const m=c===undefined?undefined:c.get(name);
        if(m!==undefined&&m[0]===_builtins_descriptor_epoch.value&&m[4]===true){
            const n=_builtins_instance_namespaces.get(value);
            if((n===undefined||!n.jsmap.has(name))&&!Object.hasOwn(value,name))
                return [m[3],value,m[5]];
        }
        const x=[undefined,undefined,false];
        const member=_builtins_public_getattr(value,name,_BUILTINS_MISSING,x);
        if(x[0]===undefined)x[0]=member;
        return x;
    })()"""


def ρσ_attr(value, name, member):
    return r"""%js (()=>{const r=arguments.length<3,p=value==null?0:Object.getPrototypeOf(value),c=p&&_builtins_store_cache.get(p),h=Object.hasOwn;if(c&&c.get(name)===_builtins_descriptor_epoch.value&&!_builtins_instance_namespaces.has(value)&&(r?h(value,name):!h(value,"__setattr__"))){if(r)return value[name];let f=_builtins_instance_fields.get(value);if(f===undefined){f=new Set;_builtins_instance_fields.set(value,f)}f.add(name);Object.defineProperty(value,name,{value:member,writable:true,enumerable:true,configurable:true});return null}return r?ρσ_getattr_internal(value,name,ρσ_getattr_missing):ρσ_setattr(value,name,member)})()"""


def ρσ_interpolate_kwargs(receiver, target_function, supplied_args):
    return r"""%js (() => {
        if(target_function===undefined&&Array.isArray(receiver)){
            const context=receiver;
            target_function=context[0];
            receiver=context[1];
            if(receiver===undefined)
                return ρσ_interpolate_kwargs(receiver,target_function,supplied_args);
            if(context[2]===true){supplied_args.unshift(receiver);receiver=undefined;}
        }else if(_internal_class_instance_function(receiver,target_function)&&
                 _internal_get_member(target_function,"__self__")===undefined){
            receiver=undefined;
        }else if(receiver!==null&&receiver!==undefined&&
                 _internal_get_member(target_function,"__self__")===undefined&&
                 Object.getOwnPropertyNames(receiver).some(name=>{
                     const descriptor=Object.getOwnPropertyDescriptor(receiver,name);
                     return descriptor!==undefined&&descriptor.value===target_function;
                 })){
            receiver=undefined;
        }
        if(!_internal_type_is(ρσ_native_jstype(target_function),"function")||
           _internal_get_member(target_function,"__sagejs_callable_instance__")===true){
            receiver=target_function;
            target_function=_internal_callable_slot(target_function);
        }else if(_internal_has_own(target_function,"__bases__")){
            receiver=undefined;
            if(_internal_keyword_constructor_prototypes.has(target_function.prototype))
                return Reflect.apply(target_function,undefined,supplied_args);
        }else if(!target_function.__argnames__&&!target_function.__kwonly__&&
                 _internal_get_member(target_function,"__sagejs_callable_instance_class__")!==true&&
                 !_internal_has_own(target_function,"__bases__")){
            const callable_method=Reflect.apply(_internal_builtin("ρσ_getattr"),
                undefined,[target_function,"__call__",null]);
            if(callable_method!==null&&(callable_method.__argnames__||callable_method.__kwonly__)){
                receiver=target_function;
                target_function=callable_method;
            }
        }
        let argnames=target_function.__argnames__;
        const keyword_only=target_function.__kwonly__;
        if(argnames===undefined&&keyword_only===undefined)
            return Reflect.apply(target_function,receiver,supplied_args);
        if(argnames===undefined)argnames=[];
        let positional_only=target_function.__positional_only__;
        if(positional_only===true)positional_only=argnames.length;
        else if(positional_only===undefined)positional_only=0;
        const keyword_object=supplied_args[supplied_args.length-1];
        if(target_function.__handles_kwarg_interpolation__){
            const supplied_count=supplied_args.length-1;
            const named_count=argnames.length;
            let direct=true;
            for(const property_name of Object.keys(keyword_object)){
                const index=argnames.indexOf(property_name);
                if(index>=positional_only){
                    if(index<supplied_count)
                        throw ρσ_exception_value(new TypeError("multiple values for argument '"+property_name+"'"));
                    direct=false;
                }else if(keyword_only&&keyword_only.indexOf(property_name)!==-1){
                    continue;
                }else if(!target_function.__varkw__){
                    throw ρσ_exception_value(new TypeError("unexpected keyword argument '"+property_name+"'"));
                }
            }
            if(direct)return Reflect.apply(target_function,receiver,supplied_args);
            supplied_args.pop();
            for(let index=0;index<named_count;index++){
                const property_name=argnames[index];
                if(index>=positional_only&&_internal_has_own(keyword_object,property_name)){
                    supplied_args[index]=keyword_object[property_name];
                    Reflect.deleteProperty(keyword_object,property_name);
                }
            }
            supplied_args.push(keyword_object);
            return Reflect.apply(target_function,receiver,supplied_args);
        }
        supplied_args.pop();
        for(let index=0;index<argnames.length;index++){
            const property_name=argnames[index];
            if(index>=positional_only&&_internal_has_own(keyword_object,property_name)){
                if(index<supplied_args.length)
                    throw ρσ_exception_value(new TypeError("multiple values for argument '"+property_name+"'"));
                supplied_args[index]=keyword_object[property_name];
                Reflect.deleteProperty(keyword_object,property_name);
            }
        }
        for(const unexpected of Object.keys(keyword_object)){
            if(!keyword_only||keyword_only.indexOf(unexpected)===-1)
                throw ρσ_exception_value(new TypeError("unexpected keyword argument '"+unexpected+"'"));
        }
        return Reflect.apply(target_function,receiver,supplied_args);
    })()"""
