// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const cases = new Map([
  ["definition-time storage and function identity", `
events = []
def make(label):
    events.append(label)
    return []
def function(a=make('a'), *, k=make('k')):
    return a, k
assert events == ['a', 'k']
assert isinstance(function.__defaults__, tuple)
assert isinstance(function.__kwdefaults__, dict)
a, k = function()
assert a is function.__defaults__[0]
assert k is function.__kwdefaults__['k']
assert function()[0] is a and function()[1] is k
def factory():
    def child(x=[]):
        return x
    return child
first, second = factory(), factory()
assert first() is not second()
def saved_name(x=1):
    return x
saved = saved_name
def saved_name(x=2):
    return x
assert saved() == 1 and saved_name() == 2
saved.__defaults__ = (3,)
assert saved() == 3 and saved_name() == 2
saved_name = None
assert saved() == 3
del saved_name
assert saved() == 3
anonymous = lambda x=4: x
anonymous.__defaults__ = (5,)
assert anonymous() == 5
def recurse(n):
    return 0 if n == 0 else recurse(n - 1) + 1
original = recurse
recurse = lambda n: 20
assert original(1) == 21
def published():
    return 'old'
old = published
def published(value=published()):
    return value
assert published() == 'old'
def fail_default():
    raise ValueError('default failed')
old = published
try:
    def published(value=fail_default()):
        return value
except ValueError:
    pass
else:
    raise AssertionError('raising default succeeded')
assert published is old
try:
    def never_published(value=fail_default()):
        return value
except ValueError:
    pass
try:
    never_published
except NameError:
    pass
else:
    raise AssertionError('failed definition published its name')
class GlobalDefinition:
    global class_global
    def class_global():
        return class_global
old = class_global
class_global = object()
assert old() is class_global
marker = object()
class MethodDefinition:
    method = marker
    def method(self, value=method):
        return value
assert MethodDefinition.method.__defaults__[0] is marker
assert MethodDefinition().method() is marker
class_global = marker
class GlobalDefaultDefinition:
    global class_global
    def class_global(*, value=class_global):
        return value
assert class_global.__kwdefaults__['value'] is marker
class_global = marker
try:
    class FailedGlobalDefinition:
        global class_global
        def class_global(*, value=fail_default()):
            return value
except ValueError:
    pass
else:
    raise AssertionError('class-global raising default succeeded')
assert class_global is marker
`],
  ["live positional and keyword slots", `
def raises(kind, function, *args, **kwargs):
    try:
        function(*args, **kwargs)
    except kind:
        return
    raise AssertionError('expected exception')
def required(a, b):
    return a, b
assert required.__defaults__ is None and required.__kwdefaults__ is None
required.__defaults__ = (10, 20)
assert required() == (10, 20)
assert required(b=4) == (10, 4)
required.__defaults__ = (30,)
assert required(2) == (2, 30)
raises(TypeError, required)
required.__defaults__ = None
raises(TypeError, required, 2)
required.__defaults__ = ()
assert required.__defaults__ == ()
del required.__defaults__
assert required.__defaults__ is None
required.__defaults__ = (1, 2)
raises(TypeError, setattr, required, '__defaults__', [3, 4])
assert required.__defaults__ == (1, 2)
def keyword(*, x, y=2):
    return x, y
defaults = {'x': 1, 'y': 3}
keyword.__kwdefaults__ = defaults
assert keyword.__kwdefaults__ is defaults and keyword() == (1, 3)
defaults['x'] = None
assert keyword() == (None, 3)
del defaults['y']
raises(TypeError, keyword)
assert keyword(y=4) == (None, 4)
keyword.__kwdefaults__ = {'x': 7, 'y': 8, 'extra': 9}
assert keyword() == (7, 8)
raises(TypeError, keyword, extra=9)
raises(TypeError, setattr, keyword, '__kwdefaults__', ())
assert keyword() == (7, 8)
keyword.__kwdefaults__ = {}
assert keyword.__kwdefaults__ == {}
raises(TypeError, keyword)
del keyword.__kwdefaults__
assert keyword.__kwdefaults__ is None
raises(TypeError, keyword)
def positional(a, /, b=2, *rest, k=3, **keywords):
    return a, b, rest, k, keywords
positional.__defaults__ = (4, 5)
assert positional(a=6) == (4, 5, (), 3, {'a': 6})
assert positional(1, 2, 3, 4, k=None, other=8) == (1, 2, (3, 4), None, {'other': 8})
raises(TypeError, required, 1, 2, 3, b=4)
raises(TypeError, keyword, 1)
namespace_value = 1
def namespace_default(*, namespace_value):
    return namespace_value
namespace_defaults = globals()
namespace_default.__kwdefaults__ = namespace_defaults
assert namespace_default.__kwdefaults__ is namespace_defaults
assert namespace_default() == 1
namespace_value = []
assert namespace_default() is namespace_value
assert namespace_default.__kwdefaults__ is namespace_defaults
del namespace_value
raises(TypeError, namespace_default)
assert namespace_default(namespace_value=9) == 9
namespace_defaults['namespace_value'] = None
assert namespace_default() is None
class Namespace:
    pass
owner = Namespace()
owner.live_field = []
def instance_default(*, live_field):
    return live_field
instance_defaults = owner.__dict__
instance_default.__kwdefaults__ = instance_defaults
assert instance_default.__kwdefaults__ is instance_defaults
assert instance_default() is owner.live_field
owner.live_field = 'updated'
assert instance_default() == 'updated'
del owner.live_field
raises(TypeError, instance_default)
instance_defaults['live_field'] = None
assert owner.live_field is None and instance_default() is None
class NoLookupHooks(dict):
    def __getitem__(self, key):
        raise AssertionError('default called __getitem__')
    def __contains__(self, key):
        raise AssertionError('default called __contains__')
    def __missing__(self, key):
        raise AssertionError('default called __missing__')
    def get(self, key, default=None):
        raise AssertionError('default called get')
without_hooks = NoLookupHooks()
default_identity = object()
dict.__setitem__(without_hooks, 'live_field', default_identity)
instance_default.__kwdefaults__ = without_hooks
assert instance_default() is default_identity
dict.__delitem__(without_hooks, 'live_field')
raises(TypeError, instance_default)
`],
  ["live constructors retain separate allocator and initializer defaults", `
events = []
class SeparateDefaults:
    def __new__(cls, *, value=1):
        events.append(('new', value))
        return object.__new__(cls)
    def __init__(self, *, value=2):
        events.append(('init', value))
        self.value = value
    def __call__(self):
        return self.value
assert SeparateDefaults()() == 2
assert events == [('new', 1), ('init', 2)]
events.clear()
SeparateDefaults.__new__.__kwdefaults__ = {'value': 3}
SeparateDefaults.__init__.__kwdefaults__ = {'value': 4}
assert SeparateDefaults(**{})() == 4
assert events == [('new', 3), ('init', 4)]
events.clear()
arguments = {'value': 5}
assert SeparateDefaults(**arguments)() == 5
assert arguments == {'value': 5}
assert events == [('new', 5), ('init', 5)]

class BaseDefaults:
    def __init__(self, old=6):
        self.value = old
class ChildDefaults(BaseDefaults):
    pass
def new_initializer(self, new=7, *, scale=8):
    self.value = new * scale
BaseDefaults.__init__ = new_initializer
new_initializer.__defaults__ = (9,)
new_initializer.__kwdefaults__ = {'scale': 10}
assert ChildDefaults().value == 90
assert ChildDefaults(**{}).value == 90
assert ChildDefaults(new=11).value == 110
try:
    ChildDefaults(old=12)
except TypeError:
    pass
else:
    raise AssertionError('constructor rebound against stale class signature')
`],
  ["bound methods and signature consumers", `
import inspect
class Example:
    def __init__(self, x=1, *, k=2):
        self.x = x
        self.k = k
    def method(self, x=3, *, k=4):
        return x, k
    @property
    def property_default(self, x=12):
        return x
instance = Example()
assert instance.property_default == 12
bound = instance.method
Example.method.__defaults__ = (5,)
Example.method.__kwdefaults__ = {'k': 6}
assert bound() == (5, 6)
assert bound.__defaults__ == (5,)
assert bound.__kwdefaults__ is Example.method.__kwdefaults__
try:
    bound.__defaults__ = (9,)
except AttributeError:
    pass
else:
    raise AssertionError('bound defaults assignment succeeded')
Example.__init__.__defaults__ = (7,)
Example.__init__.__kwdefaults__ = {'k': 8}
assert Example().x == 7 and Example().k == 8
signature = inspect.signature(Example)
assert signature.parameters['x'].default == 7
assert signature.parameters['k'].default == 8
signature = inspect.signature(bound)
assert signature.parameters['x'].default == 5
assert signature.parameters['k'].default == 6
def function(a, b=2, *, k=3):
    return a, b, k
function.__defaults__ = (8, 9)
function.__kwdefaults__ = {'k': 10}
signature = inspect.signature(function)
assert signature.parameters['a'].default == 8
assert signature.parameters['b'].default == 9
assert signature.parameters['k'].default == 10
spec = inspect.getfullargspec(function)
assert spec.defaults == (8, 9)
assert spec.kwonlydefaults == {'k': 10}
assert function() == (8, 9, 10)
`],
  ["tuple subclass slots preserve identity without invoking hooks", `
import builtins
import inspect
class Defaults(tuple):
    pass
class KeywordDefaults(dict):
    @property
    def __class__(self):
        raise AssertionError('keyword binder consulted __class__')
def keyword(*, value=1):
    return value
keyword.__kwdefaults__ = KeywordDefaults(value=7)
assert keyword() == 7
def function(a, b=2):
    return a, b
item = []
defaults = Defaults((item, 7))
function.__defaults__ = defaults
assert function.__defaults__ is defaults
assert function()[0] is item and function()[1] == 7
assert function(3) == (3, 7)
assert function(3, 4) == (3, 4)
assert inspect.signature(function).parameters['a'].default is item
class HostileDefaults(tuple):
    def __len__(self):
        raise AssertionError('tuple len override called by binder')
    def __getitem__(self, key):
        raise AssertionError('tuple getitem override called by binder')
    def __iter__(self):
        raise AssertionError('tuple iter override called by binder')
hostile = HostileDefaults((item, 8))
function.__defaults__ = hostile
assert function.__defaults__ is hostile
assert function()[0] is item and function()[1] == 8
assert function(3) == (3, 8)
function.__defaults__ = HostileDefaults(())
try:
    function()
except TypeError:
    pass
else:
    raise AssertionError('empty tuple subclass supplied a default')
saved_tuple, saved_dict = builtins.tuple, builtins.dict
try:
    builtins.tuple = list
    builtins.dict = list
    for name in ['__defaults__', '__kwdefaults__']:
        try:
            setattr(function, name, [])
        except TypeError:
            pass
        else:
            raise AssertionError('public builtin rebinding weakened slot validation')
finally:
    builtins.tuple, builtins.dict = saved_tuple, saved_dict
`],
  ["generators and coroutines bind at invocation", `
def generator(x=1, *, k=2):
    yield x, k
old = generator()
generator.__defaults__ = (3,)
generator.__kwdefaults__['k'] = 4
assert next(old) == (1, 2)
assert next(generator()) == (3, 4)
generator.__defaults__ = None
try:
    generator()
except TypeError:
    pass
else:
    raise AssertionError('generator argument binding was deferred')
async def coroutine(x=5):
    return x
old = coroutine()
coroutine.__defaults__ = (6,)
try:
    old.send(None)
except StopIteration as result:
    assert result.value == 5
else:
    raise AssertionError('coroutine failed to finish')
coroutine.__defaults__ = None
try:
    coroutine()
except TypeError:
    pass
else:
    raise AssertionError('coroutine argument binding was deferred')
`],
]);

for (const mode of ["python", "sage"]) {
  test(`Python function defaults are authoritative (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    for (const [name, source] of cases) {
      await context.test(name, async () => {
        const result = await session.evaluate(source + "\nprint('defaults-ok')\n");
        assert.equal(result.stdout.trim(), "defaults-ok");
      });
    }
  });
  test(`native omission fallback retains source-owned defaults (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(`
from sagejs.native import _bind_source_defaults
import sagejs.runtime as runtime
routes = []
def source(a, b=2):
    routes.append('dynamic')
    return a + b
def compiled(a, b):
    routes.append('compiled')
    return a + b
function = _bind_source_defaults(source, compiled)
assert function(3, 4) == 7 and routes[-1] == 'compiled'
assert function(3) == 5 and routes[-1] == 'dynamic'
assert function(a=3) == 5 and routes[-1] == 'dynamic'
function.__defaults__ = (10, 20)
assert function.__defaults__ is source.__defaults__
assert function() == 30 and routes[-1] == 'dynamic'
assert function(3) == 23 and routes[-1] == 'dynamic'
assert function(3, 4) == 7 and routes[-1] == 'compiled'
source.__defaults__ = (8,)
assert function(3) == 11
function.__defaults__ = None
try:
    function(3)
except TypeError:
    pass
else:
    raise AssertionError('compiled call consumed a removed default')
def other_source(a, b=99):
    return a + b
other = _bind_source_defaults(other_source, compiled)
assert other(1) == 100
source.__defaults__ = (7,)
assert function(1) == 8 and other(1) == 100
assert function.__wrapped__ is source and other.__wrapped__ is other_source
function.__name__ = 'renamed_source'
function.__doc__ = 'updated native documentation'
annotations = {'a': 'UpdatedAnnotation'}
function.__annotations__ = annotations
assert function.__name__ == source.__name__ == 'renamed_source'
assert function.__doc__ == source.__doc__ == 'updated native documentation'
assert function.__annotations__ is source.__annotations__ is annotations
assert compiled.__name__ == 'compiled'
assert compiled.__annotations__ is not annotations
wrapped_metadata = object()
function.__wrapped__ = wrapped_metadata
assert function.__wrapped__ is wrapped_metadata
assert function.__sagejs_native_source__ is source
function.__wrapped__ = source
def marked_source(a=1):
    routes.append('dynamic-marker')
    return a
def marked_compiled(a):
    routes.append('compiled-marker')
    return a
marked = _bind_source_defaults(marked_source, marked_compiled)
assert marked(a=7) == 7 and routes[-1] == 'dynamic-marker'
packet = runtime.object.create(None)
runtime.reflect.set(packet, runtime.kwargs_symbol, True)
runtime.reflect.set(packet, 'a', 11)
# One parameter, one marker, no undefined holes: length alone is not a guard.
assert runtime.reflect.apply(marked, runtime.undefined, [packet]) == 11
assert routes[-1] == 'dynamic-marker'
assert marked(13) == 13 and routes[-1] == 'compiled-marker'

# Artifact-owned immutable metadata must not constrain the source association
# of either decorated definition sharing that artifact.
immutable_host = runtime.reflect.apply(
    runtime.function_class.prototype.bind, compiled, [runtime.undefined])
for name, value in (
    ('__globals__', object()), ('__code__', object()),
    ('__defaults__', (1000,)), ('__kwdefaults__', {}),
    ('__name__', 'artifact-name'), ('__doc__', 'artifact-doc'),
    ('__annotations__', {'artifact': 'annotation'}),
    ('nativeAvailable', True),
):
    descriptor = runtime.object.create(None)
    runtime.reflect.set(descriptor, 'value', value)
    runtime.reflect.set(descriptor, 'configurable', False)
    runtime.reflect.set(descriptor, 'writable', False)
    runtime.object.defineProperty(immutable_host, name, descriptor)
first = _bind_source_defaults(source, immutable_host)
second = _bind_source_defaults(other_source, immutable_host)
assert first.__globals__ is source.__globals__
assert first.__code__ is source.__code__
assert second.__globals__ is other_source.__globals__
assert second.__code__ is other_source.__code__
assert first.nativeAvailable and second.nativeAvailable
first.__defaults__ = (8,)
second.__defaults__ = (9,)
assert first(1) == 9 and second(1) == 10
assert first.__defaults__ is source.__defaults__
assert second.__defaults__ is other_source.__defaults__
assert runtime.reflect.get(immutable_host, '__defaults__') == (1000,)
first.__name__ = 'first-renamed'
first.__doc__ = 'first-doc'
first_annotations = {'a': 'First'}
first.__annotations__ = first_annotations
assert first.__name__ == source.__name__ == 'first-renamed'
assert first.__doc__ == source.__doc__ == 'first-doc'
assert first.__annotations__ is source.__annotations__ is first_annotations
assert second.__name__ == other_source.__name__ == 'other_source'
assert runtime.reflect.get(immutable_host, '__name__') == 'artifact-name'
assert runtime.reflect.get(immutable_host, '__doc__') == 'artifact-doc'
assert runtime.reflect.get(immutable_host, '__annotations__') == {'artifact': 'annotation'}

# Deletion uses the same Python slot operation as the undecorated source;
# a missing host-own descriptor must not make forwarded metadata undeletable.
def deletion_source(value=3):
    return value
def deletion_baseline(value=3):
    return value
deleting = _bind_source_defaults(deletion_source, compiled)
deletion_source.__doc__ = deletion_baseline.__doc__ = 'deletable documentation'
del deletion_baseline.__doc__
del deleting.__doc__
assert runtime.reflect.get(deleting, '__doc__') is runtime.reflect.get(deletion_source, '__doc__')
assert runtime.reflect.get(deletion_source, '__doc__') is runtime.reflect.get(deletion_baseline, '__doc__')
deleting.__defaults__ = (11,)
del deleting.__defaults__
assert deletion_source.__defaults__ is deleting.__defaults__ is None
deleting.__defaults__ = (12,)
assert runtime.reflect.deleteProperty(deleting, '__defaults__')
assert deletion_source.__defaults__ is deleting.__defaults__ is None
for host_delete in (False, True):
    try:
        if host_delete:
            runtime.reflect.deleteProperty(deleting, '__sagejs_native_source__')
        else:
            delattr(deleting, '__sagejs_native_source__')
    except AttributeError:
        pass
    else:
        raise AssertionError('native source owner deletion accepted')
assert deleting.__sagejs_native_source__ is deletion_source
deleting.local_attribute = 4
del deleting.local_attribute
assert not hasattr(deleting, 'local_attribute')

# A constrained host target must fail before mutating the source, not report
# success and then violate the Proxy deleteProperty invariant.
for configurable in (False, True):
    constrained = _bind_source_defaults(deletion_source, compiled)
    deletion_source.__doc__ = 'keep source'
    descriptor = runtime.object.create(None)
    runtime.reflect.set(descriptor, 'value', 'keep source')
    runtime.reflect.set(descriptor, 'configurable', configurable)
    runtime.object.defineProperty(constrained, '__doc__', descriptor)
    if configurable:
        runtime.reflect.preventExtensions(constrained)
    assert not runtime.reflect.deleteProperty(constrained, '__doc__')
    assert deletion_source.__doc__ == 'keep source'
print('native-defaults-ok')
`);
    assert.equal(result.stdout.trim(), "native-defaults-ok");
  });
  test(`bound defaults use shared getters without sharing owners (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(`
import sagejs.runtime as runtime
class Left:
    def method(self, x=1, *, k=2):
        return x, k
class Right:
    def method(self, x=3, *, k=4):
        return x, k
left = Left().method
right = Right().method
for slot in ('__defaults__', '__kwdefaults__'):
    left_descriptor = runtime.object.getOwnPropertyDescriptor(left, slot)
    right_descriptor = runtime.object.getOwnPropertyDescriptor(right, slot)
    assert runtime.reflect.get(left_descriptor, 'get') is runtime.reflect.get(right_descriptor, 'get')
Left.method.__defaults__ = (5,)
Left.method.__kwdefaults__ = {'k': 6}
Right.method.__defaults__ = (7,)
Right.method.__kwdefaults__ = {'k': 8}
assert left() == (5, 6) and right() == (7, 8)
assert left.__defaults__ == (5,) and right.__defaults__ == (7,)
assert left.__kwdefaults__ == {'k': 6} and right.__kwdefaults__ == {'k': 8}
print('shared-bound-getters-ok')
`);
    assert.equal(result.stdout.trim(), "shared-bound-getters-ok");
  });
}
