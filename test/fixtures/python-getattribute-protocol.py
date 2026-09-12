"""Portable public lookup cases; failures are observations, not accepted differences."""

observations = []


def observe(name, action):
    try:
        observations.append([name, "value", action()])
    except Exception as error:
        observations.append([name, "error", type(error).__name__])


class Intercept:
    value = "stored"

    def __getattribute__(self, name):
        return "intercepted:" + name


observe("existing-intercept", lambda: Intercept().value)
observe("missing-intercept", lambda: getattr(Intercept(), "missing", "default"))
observe("default-bypass", lambda: object.__getattribute__(Intercept(), "value"))


delegation_events = []


class Delegate:
    value = "delegated"

    def __getattribute__(self, name):
        delegation_events.append(name)
        return object.__getattribute__(self, name)


observe("explicit-delegation", lambda: [Delegate().value, delegation_events[:]])


class Fallback:
    value = "stored"

    def __getattribute__(self, name):
        raise AttributeError(name)

    def __getattr__(self, name):
        return "fallback:" + name


observe("hook-failure-fallback", lambda: Fallback().value)
observe(
    "default-missing-no-fallback", lambda: object.__getattribute__(Fallback(), "absent")
)


class BrokenProperty:
    @property
    def value(self):
        raise AttributeError("inside-property")

    def __getattr__(self, name):
        return "fallback:" + name


observe("property-public-fallback", lambda: BrokenProperty().value)
observe(
    "property-default-no-fallback",
    lambda: object.__getattribute__(BrokenProperty(), "value"),
)


def method_order():
    events = []

    class C:
        def __getattribute__(self, name):
            events.append("lookup:" + name)
            return lambda value: events.append("call:" + value)

    def argument():
        events.append("argument")
        return "payload"

    C().method(argument())
    return events


observe("lookup-before-argument", method_order)


def mutation():
    class C:
        value = "original"

    obj = C()
    before = obj.value
    C.__getattribute__ = lambda self, name: "override"
    during = obj.value
    del C.__getattribute__
    return [before, during, obj.value]


observe("class-hook-mutation", mutation)


def instance_shadow():
    delegation_events.clear()
    obj = Delegate()
    obj.__getattribute__ = lambda name: "instance-shadow"
    return [obj.value, delegation_events[:]]


observe("instance-hook-shadow-ignored", instance_shadow)


class Special:
    def __len__(self):
        return 7

    def __getattribute__(self, name):
        return lambda: 99


observe("implicit-special-bypass", lambda: len(Special()))
observe("explicit-special-intercept", lambda: Special().__len__())


class Meta(type):
    def __getattribute__(cls, name):
        return "meta:" + name


class WithMeta(metaclass=Meta):
    value = "stored"


observe("metaclass-hook", lambda: WithMeta.value)
