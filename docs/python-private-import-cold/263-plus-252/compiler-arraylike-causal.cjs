const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
function load(root) {
    const source = fs.readFileSync(root + '/dist/compiler/compiler.js', 'utf8');
    const close = source.lastIndexOf('})();');
    assert.ok(close > 0);
    const context = vm.createContext({console, require, exports: {},
        __sagejs_runtime_require__: require,
        readfile: p => fs.readFileSync(p, 'utf8'),
        sha1sum: s => crypto.createHash('sha1').update(s).digest('hex')});
    vm.runInContext(source.slice(0, close) +
        'globalThis.probeArraylike = ρσ_arraylike;\n' + source.slice(close), context);
    return context.probeArraylike;
}
const old = load('/home/user/sagejs-worktrees/python-import-ancestor-classification');
const candidate = load('/tmp/sagejs-263-plus-252.VJ1GCw');
for (const fn of [old, candidate]) {
    for (const [x, yes] of [[[],true],['x',true],[{},false],[null,false],
        [undefined,false],[new Float64Array(2),true],
        [vm.runInNewContext('new Float64Array(2)'),true],
        [{[Symbol.toStringTag]:'TouchList'},true],
        [{[Symbol.toStringTag]:'DataView'},false]]) assert.equal(fn(x),yes);
    let calls=0;
    const changing={get [Symbol.toStringTag](){calls++;return calls===1?'NodeList':'Object';}};
    assert.equal(fn(changing),true); assert.equal(fn(changing),false); assert.equal(calls,2);
    const e = new Error('tag getter');
    assert.throws(()=>fn({get [Symbol.toStringTag](){throw e;}}), error=>error===e);
    const {proxy,revoke}=Proxy.revocable({},{});revoke();assert.throws(()=>fn(proxy),e=>e.name==='TypeError');
}
console.log('actual baseline/candidate compiler arraylike contracts passed');
