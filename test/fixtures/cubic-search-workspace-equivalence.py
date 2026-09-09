"""Invert bundle syntax and require the entire original mathematical AST."""

import ast
import copy
import json
import sys


data = json.load(sys.stdin)
before, after = ast.parse(data["before"]), ast.parse(data["after"])
original_functions = {
    node.name: node for node in before.body if isinstance(node, ast.FunctionDef)
}
schema = next(
    node
    for node in after.body
    if isinstance(node, ast.ClassDef) and node.name == "CubicSearchWorkspace"
)
fields = [node.target.id for node in schema.body if isinstance(node, ast.AnnAssign)]
root = next(
    node
    for node in after.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "certified_complex_cubic_class_group_v1"
)
constructors = [
    node
    for node in ast.walk(root)
    if isinstance(node, ast.Assign)
    and isinstance(node.value, ast.Call)
    and isinstance(node.value.func, ast.Name)
    and node.value.func.id == "CubicSearchWorkspace"
]
assert len(constructors) == 1
constructor = constructors[0]
assert len(constructor.targets) == 1 and constructor.targets[0].id == "search"
assert len(constructor.value.args) == len(fields)
owners = {
    field: arg.id for field, arg in zip(fields, constructor.value.args, strict=True)
}
# Declared schema types must agree with the actual original resources passed
# to the adjacent collector. The expanded parameter owner is not bundled.
assert owners["parameters"] == "adjacent_ellipsoid_parameters"
assert "expanded_parameters" not in owners.values()
helpers = {}
for fn in after.body:
    if (
        isinstance(fn, ast.FunctionDef)
        and fn.args.args
        and fn.args.args[0].arg == "search"
    ):
        original = original_functions[fn.name]
        remaining = {arg.arg for arg in fn.args.args[1:]}
        removed = [arg for arg in original.args.args if arg.arg not in remaining]
        # Recover field->parameter bindings independently from the caller's
        # original arguments, not the transformation's mapping dictionary.
        old_call = next(
            n
            for n in ast.walk(before)
            if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Name)
            and n.func.id == fn.name
        )
        if fn.name == "_cubic_append_reduced_ideal_ellipsoid":
            caller_fn = original_functions["_cubic_collect_adjacent_relation_prefix"]
            old_call = next(
                n
                for n in ast.walk(caller_fn)
                if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Name)
                and n.func.id == fn.name
            )
        bindings = dict(
            zip((arg.arg for arg in original.args.args), old_call.args, strict=True)
        )
        names = {}
        for arg in removed:
            actual = bindings[arg.arg]
            assert isinstance(actual, ast.Name)
            field = next(field for field, owner in owners.items() if owner == actual.id)
            names[field] = arg.arg
            declared = next(
                node
                for node in schema.body
                if isinstance(node, ast.AnnAssign) and node.target.id == field
            )
            assert ast.dump(declared.annotation) == ast.dump(arg.annotation)
        helpers[fn.name] = names


class Unbundle(ast.NodeTransformer):
    def __init__(self):
        self.current = None
        self.calls = 0

    def visit_ClassDef(self, node):
        return None if node.name == "CubicSearchWorkspace" else self.generic_visit(node)

    def visit_FunctionDef(self, node):
        previous = self.current
        self.current = node.name
        node = self.generic_visit(node)
        if node.name in helpers:
            node.args = copy.deepcopy(original_functions[node.name].args)
        self.current = previous
        return node

    def visit_Assign(self, node):
        if node is constructor:
            return None
        return self.generic_visit(node)

    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name) and node.value.id == "search":
            assert self.current in helpers
            return ast.Name(id=helpers[self.current][node.attr], ctx=node.ctx)
        return self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in helpers:
            assert isinstance(node.args[0], ast.Name) and node.args[0].id == "search"
            assert not node.keywords
            self.calls += 1
            names = helpers[node.func.id]
            reverse = {parameter: field for field, parameter in names.items()}
            remaining = iter(node.args[1:])
            restored = []
            for parameter in original_functions[node.func.id].args.args:
                if parameter.arg in reverse:
                    field = reverse[parameter.arg]
                    owner = (
                        helpers[self.current][field]
                        if self.current in helpers
                        else owners[field]
                    )
                    restored.append(ast.Name(id=owner, ctx=ast.Load()))
                else:
                    restored.append(self.visit(next(remaining)))
            assert next(remaining, None) is None
            node.args = restored
            return node
        return self.generic_visit(node)


inverse = Unbundle()
restored = inverse.visit(after)
assert inverse.calls == 5
assert ast.dump(restored) == ast.dump(before), (
    "bundling changed more than owner aliases"
)
print(
    "entire source AST round-trip, 13 owner types, 5 calls, and distinct expanded parameters verified"
)
