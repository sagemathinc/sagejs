import traitlets


assert traitlets.__version__ == "5.15.1"


class Demo(traitlets.HasTraits):
    count = traitlets.Int(2)


demo = Demo()
changes = []
demo.observe(lambda change: changes.append((change.old, change.new)), names="count")
demo.count = 7
assert demo.count == 7
assert changes == [(2, 7)]


class Listener:
    def callback(self, change):
        return change


listener = Listener()
callbacks = [listener.callback]
assert listener.callback == callbacks[0]
callbacks.remove(listener.callback)
assert callbacks == []
