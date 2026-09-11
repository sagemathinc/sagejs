"""Non-gating CPython witness for an existing static-method name collision.

The legacy class emitter assigns `Config.name` directly, but JavaScript
functions have a read-only `name` property. Sage.js currently raises TypeError
during this class definition. This is independent of prepared method-call
dispatch; the gating dispatch oracle uses `label` to isolate that contract.
Keep this witness until class attribute installation handles the collision.
"""


class Config:
    @staticmethod
    def name(value):
        return value

    @staticmethod
    def use(value):
        return Config.name(value)


assert Config.use("value") == "value"
