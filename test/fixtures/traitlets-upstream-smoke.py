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
