"""Emit direct LLVM IR for the frozen bounded splitting-degree catalog.

This is an experiment, not a production Sage.js backend.  It deliberately
accepts exactly the same small ordinary-Python subset and fixed storage
contract as `generate_same_storage_catalog_c.py`. Mathematical function
bodies come from the Python AST; the generated C file is not an input.
"""

from __future__ import annotations

import ast
import json
import pathlib
import sys
from dataclasses import dataclass


ROOT = pathlib.Path(sys.argv[1]).resolve()
FIXTURE = pathlib.Path(sys.argv[2]).resolve()
BASE = ROOT / "bench/pari-class-group-port"
MODE = sys.argv[3] if len(sys.argv) > 3 else "ir"
POLICY = sys.argv[4] if len(sys.argv) > 4 else "baseline"
if POLICY not in ("baseline", "proved", "proved-noalias"):
    raise SystemExit("policy must be baseline, proved, or proved-noalias")
FILES = [
    "f2x_small.py",
    "f2x_small_factor.py",
    "bounded_flx_small.py",
    "bounded_flx_small_power.py",
    "bounded_flx_small_factor.py",
    "bounded_get_fs_small.py",
    "bounded_prime_degree_catalog.py",
]
SELECTED = {
    filename: [
        node
        for node in ast.parse((BASE / filename).read_text()).body
        if isinstance(node, ast.FunctionDef)
    ]
    for filename in FILES
}
sort_module = ast.parse((BASE / "flx_small_factor.py").read_text())
SELECTED["flx_small_factor.py"] = [
    node
    for node in sort_module.body
    if isinstance(node, ast.FunctionDef) and node.name == "pari_flx_small_sort_factor"
]
FUNCTIONS = {node.name: node for nodes in SELECTED.values() for node in nodes}


def annotation_name(node: ast.expr | None) -> str:
    return node.id if isinstance(node, ast.Name) else "int"


def scalar_kind(annotation: str) -> str:
    return "u64" if annotation == "uint64" else "i64"


def buffer_kind(annotation: str) -> str | None:
    return {
        "UInt64Buffer": "u64_buffer",
        "IntegerBuffer": "i64_buffer",
    }.get(annotation)


BUFFER_ARGUMENTS: dict[str, dict[str, str]] = {}
for name, node in FUNCTIONS.items():
    BUFFER_ARGUMENTS[name] = {
        argument.arg: kind
        for argument in node.args.args
        if (kind := buffer_kind(annotation_name(argument.annotation))) is not None
    }


def merge_type(left: str, right: str) -> str:
    order = {"i1": -1, "i64": 0, "u64": 1, "u128": 2}
    return max((left, right), key=order.__getitem__)


def constant_type(value: object) -> str:
    if isinstance(value, bool):
        return "i64"
    if isinstance(value, int):
        if value > 0xFFFFFFFFFFFFFFFF:
            return "u128"
        if value > 0x7FFFFFFFFFFFFFFF:
            return "u64"
    return "i64"


CONSTANTS = {
    item.targets[0].id: item.value.value
    for filename in ("bounded_flx_small_power.py",)
    for item in ast.parse((BASE / filename).read_text()).body
    if isinstance(item, ast.Assign)
    and len(item.targets) == 1
    and isinstance(item.targets[0], ast.Name)
    and isinstance(item.value, ast.Constant)
}


def infer_expression(
    node: ast.expr, types: dict[str, str], buffers: dict[str, str]
) -> str:
    if isinstance(node, ast.Constant):
        return constant_type(node.value)
    if isinstance(node, ast.Name):
        if node.id in CONSTANTS:
            return constant_type(CONSTANTS[node.id])
        return types.get(node.id, "i64")
    if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
        return "u64" if buffers.get(node.value.id) == "u64_buffer" else "i64"
    if isinstance(node, ast.UnaryOp):
        return infer_expression(node.operand, types, buffers)
    if isinstance(node, ast.BoolOp | ast.Compare):
        return "i64"
    if isinstance(node, ast.BinOp):
        return merge_type(
            infer_expression(node.left, types, buffers),
            infer_expression(node.right, types, buffers),
        )
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == "checked_uint64":
            return "u64"
        if isinstance(node.func, ast.Attribute) and node.func.attr == "bit_length":
            return "i64"
    return "i64"


def local_types(node: ast.FunctionDef) -> tuple[dict[str, str], dict[str, str]]:
    buffers = BUFFER_ARGUMENTS[node.name]
    types = {
        argument.arg: scalar_kind(annotation_name(argument.annotation))
        for argument in node.args.args
        if argument.arg not in buffers
    }
    explicit: dict[str, str] = {}
    for item in ast.walk(node):
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            explicit[item.target.id] = scalar_kind(annotation_name(item.annotation))
    types.update(explicit)
    stores = {
        item.id
        for item in ast.walk(node)
        if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store)
    }
    for name in stores:
        types.setdefault(name, "i64")
    for _ in range(8):
        changed = False
        for item in ast.walk(node):
            assignments: list[tuple[str, ast.expr]] = []
            if isinstance(item, ast.Assign) and len(item.targets) == 1:
                target = item.targets[0]
                if isinstance(target, ast.Name):
                    assignments.append((target.id, item.value))
                elif isinstance(target, ast.Tuple | ast.List) and isinstance(
                    item.value, ast.Tuple | ast.List
                ):
                    assignments.extend(
                        (target_name.id, value)
                        for target_name, value in zip(target.elts, item.value.elts)
                        if isinstance(target_name, ast.Name)
                    )
            elif isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                if item.value is not None:
                    assignments.append((item.target.id, item.value))
            for name, value in assignments:
                inferred = infer_expression(value, types, buffers)
                if name in explicit:
                    inferred = explicit[name]
                merged = merge_type(types.get(name, "i64"), inferred)
                if merged != types.get(name):
                    types[name] = merged
                    changed = True
        if not changed:
            break
    return types, buffers


def llvm_type(kind: str) -> str:
    if kind in ("i64", "u64"):
        return "i64"
    if kind == "u128":
        return "i128"
    if kind == "i1":
        return "i1"
    if kind in ("i64_buffer", "u64_buffer"):
        return f"%{kind}"
    raise AssertionError(kind)


@dataclass(frozen=True)
class Value:
    kind: str
    name: str

    @property
    def llvm(self) -> str:
        return llvm_type(self.kind)


class FunctionEmitter:
    def __init__(self, node: ast.FunctionDef):
        self.node = node
        self.types, self.buffers = local_types(node)
        self.counter = 0
        self.label_counter = 0
        self.blocks: list[tuple[str, list[str]]] = []
        self.current_name = "body"
        self.current: list[str] = []
        self.terminated = False
        self.allocas: list[str] = []
        self.initializers: list[str] = []
        self.loop_stack: list[tuple[str, str]] = []
        arguments = {argument.arg for argument in node.args.args}
        for name in sorted(set(self.types) - arguments):
            self.allocas.append(
                f"  %{name}.addr = alloca {llvm_type(self.types[name])}"
            )
            self.initializers.append(
                f"  store {llvm_type(self.types[name])} 0, ptr %{name}.addr"
            )
        for argument in node.args.args:
            name = argument.arg
            if name not in self.buffers:
                self.allocas.append(
                    f"  %{name}.addr = alloca {llvm_type(self.types[name])}"
                )
                self.initializers.append(
                    f"  store {llvm_type(self.types[name])} %{name}, ptr %{name}.addr"
                )

    def temporary(self, prefix: str = "v") -> str:
        self.counter += 1
        return f"%{prefix}{self.counter}"

    def label(self, prefix: str) -> str:
        self.label_counter += 1
        return f"{prefix}{self.label_counter}"

    def emit(self, instruction: str) -> None:
        assert not self.terminated, (self.node.name, instruction)
        self.current.append(f"  {instruction}")

    def terminate(self, instruction: str) -> None:
        self.emit(instruction)
        self.terminated = True

    def switch(self, name: str) -> None:
        self.blocks.append((self.current_name, self.current))
        self.current_name = name
        self.current = []
        self.terminated = False

    def finish_block(self) -> None:
        self.blocks.append((self.current_name, self.current))

    def cast(self, value: Value, kind: str) -> Value:
        if value.kind == kind:
            return value
        if kind in ("i64", "u64") and value.kind in ("i64", "u64"):
            return Value(kind, value.name)
        source, target = value.llvm, llvm_type(kind)
        name = self.temporary("cast")
        if source == "i1" and target == "i64":
            self.emit(f"{name} = zext i1 {value.name} to i64")
        elif source == "i64" and target == "i128":
            operation = "zext" if value.kind == "u64" else "sext"
            self.emit(f"{name} = {operation} i64 {value.name} to i128")
        elif source == "i128" and target == "i64":
            self.emit(f"{name} = trunc i128 {value.name} to i64")
        else:
            raise NotImplementedError((value, kind))
        return Value(kind, name)

    def load_name(self, name: str) -> Value:
        if name in CONSTANTS:
            return self.constant(CONSTANTS[name])
        kind = self.types[name]
        result = self.temporary(name)
        self.emit(f"{result} = load {llvm_type(kind)}, ptr %{name}.addr")
        return Value(kind, result)

    def store_name(self, name: str, value: Value) -> None:
        kind = self.types[name]
        value = self.cast(value, kind)
        self.emit(f"store {value.llvm} {value.name}, ptr %{name}.addr")

    def constant(self, value: object) -> Value:
        if value is True:
            return Value("i64", "1")
        if value is False:
            return Value("i64", "0")
        assert isinstance(value, int), value
        return Value(constant_type(value), str(value))

    def buffer_element_pointer(self, node: ast.Subscript) -> tuple[str, str]:
        assert isinstance(node.value, ast.Name)
        buffer_name = node.value.id
        buffer = self.buffers[buffer_name]
        data = self.temporary("data")
        self.emit(f"{data} = extractvalue %{buffer} %{buffer_name}, 0")
        index = self.cast(self.expression(node.slice), "i64")
        pointer = self.temporary("element")
        qualifier = " inbounds" if POLICY != "baseline" else ""
        self.emit(
            f"{pointer} = getelementptr{qualifier} i64, ptr {data}, i64 {index.name}"
        )
        return buffer, pointer

    def load_subscript(self, node: ast.Subscript) -> Value:
        buffer, pointer = self.buffer_element_pointer(node)
        result = self.temporary("item")
        self.emit(f"{result} = load i64, ptr {pointer}")
        return Value("u64" if buffer == "u64_buffer" else "i64", result)

    def store_target(self, node: ast.expr, value: Value) -> None:
        if isinstance(node, ast.Name):
            self.store_name(node.id, value)
            return
        if isinstance(node, ast.Subscript):
            buffer, pointer = self.buffer_element_pointer(node)
            value = self.cast(value, "u64" if buffer == "u64_buffer" else "i64")
            self.emit(f"store i64 {value.name}, ptr {pointer}")
            return
        raise NotImplementedError(ast.dump(node, include_attributes=False))

    def bool_value(self, node: ast.expr) -> Value:
        slot = self.temporary("bool.addr")
        self.emit(f"{slot} = alloca i1")
        yes, no, done = (
            self.label("bool_yes"),
            self.label("bool_no"),
            self.label("bool_done"),
        )
        self.condition(node, yes, no)
        self.switch(yes)
        self.emit(f"store i1 true, ptr {slot}")
        self.terminate(f"br label %{done}")
        self.switch(no)
        self.emit(f"store i1 false, ptr {slot}")
        self.terminate(f"br label %{done}")
        self.switch(done)
        result = self.temporary("bool")
        self.emit(f"{result} = load i1, ptr {slot}")
        widened = self.temporary("bool64")
        self.emit(f"{widened} = zext i1 {result} to i64")
        return Value("i64", widened)

    def compare(self, left: Value, right: Value, operator: ast.cmpop) -> Value:
        kind = merge_type(left.kind, right.kind)
        left, right = self.cast(left, kind), self.cast(right, kind)
        signed = kind == "i64"
        predicate = {
            ast.Eq: "eq",
            ast.NotEq: "ne",
            ast.Lt: "slt" if signed else "ult",
            ast.LtE: "sle" if signed else "ule",
            ast.Gt: "sgt" if signed else "ugt",
            ast.GtE: "sge" if signed else "uge",
        }[type(operator)]
        result = self.temporary("cmp")
        self.emit(f"{result} = icmp {predicate} {left.llvm} {left.name}, {right.name}")
        return Value("i1", result)

    def condition(self, node: ast.expr, yes: str, no: str) -> None:
        if isinstance(node, ast.BoolOp):
            values = node.values
            for index, value in enumerate(values[:-1]):
                continuation = self.label(
                    "and_next" if isinstance(node.op, ast.And) else "or_next"
                )
                if isinstance(node.op, ast.And):
                    self.condition(value, continuation, no)
                else:
                    self.condition(value, yes, continuation)
                self.switch(continuation)
            self.condition(values[-1], yes, no)
            return
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            self.condition(node.operand, no, yes)
            return
        if isinstance(node, ast.Compare):
            left = self.expression(node.left)
            for index, (operator, comparator) in enumerate(
                zip(node.ops, node.comparators)
            ):
                right = self.expression(comparator)
                test = self.compare(left, right, operator)
                if index + 1 == len(node.ops):
                    self.terminate(f"br i1 {test.name}, label %{yes}, label %{no}")
                else:
                    continuation = self.label("compare_next")
                    self.terminate(
                        f"br i1 {test.name}, label %{continuation}, label %{no}"
                    )
                    self.switch(continuation)
                    left = right
            return
        value = self.expression(node)
        value = self.cast(value, "i64")
        test = self.temporary("truth")
        self.emit(f"{test} = icmp ne i64 {value.name}, 0")
        self.terminate(f"br i1 {test}, label %{yes}, label %{no}")

    def binary(self, node: ast.BinOp) -> Value:
        left, right = self.expression(node.left), self.expression(node.right)
        kind = merge_type(left.kind, right.kind)
        left, right = self.cast(left, kind), self.cast(right, kind)
        if isinstance(node.op, ast.Mod) and kind == "i64":
            result = self.temporary("mod")
            self.emit(
                f"{result} = call i64 @py_mod_i64(i64 {left.name}, i64 {right.name})"
            )
            return Value(kind, result)
        if isinstance(node.op, ast.FloorDiv) and kind == "i64":
            result = self.temporary("div")
            self.emit(
                f"{result} = call i64 @py_floor_div_i64(i64 {left.name}, i64 {right.name})"
            )
            return Value(kind, result)
        operation = {
            ast.Add: "add",
            ast.Sub: "sub",
            ast.Mult: "mul",
            ast.Mod: "urem",
            ast.FloorDiv: "udiv",
            ast.LShift: "shl",
            ast.RShift: "ashr" if kind == "i64" else "lshr",
            ast.BitAnd: "and",
            ast.BitOr: "or",
            ast.BitXor: "xor",
        }[type(node.op)]
        result = self.temporary("bin")
        flags = (
            " nsw"
            if POLICY != "baseline"
            and kind == "i64"
            and operation in ("add", "sub", "mul", "shl")
            else ""
        )
        self.emit(
            f"{result} = {operation}{flags} {left.llvm} {left.name}, {right.name}"
        )
        return Value(kind, result)

    def expression(self, node: ast.expr) -> Value:
        if isinstance(node, ast.Constant):
            return self.constant(node.value)
        if isinstance(node, ast.Name):
            return self.load_name(node.id)
        if isinstance(node, ast.Subscript):
            return self.load_subscript(node)
        if isinstance(node, ast.UnaryOp):
            value = self.expression(node.operand)
            if isinstance(node.op, ast.Not):
                return self.bool_value(node)
            if isinstance(node.op, ast.USub):
                value = self.cast(value, "i64")
                result = self.temporary("neg")
                self.emit(f"{result} = sub i64 0, {value.name}")
                return Value("i64", result)
            if isinstance(node.op, ast.Invert):
                result = self.temporary("not")
                self.emit(f"{result} = xor {value.llvm} {value.name}, -1")
                return Value(value.kind, result)
        if isinstance(node, ast.BoolOp | ast.Compare):
            return self.bool_value(node)
        if isinstance(node, ast.BinOp):
            return self.binary(node)
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                name = node.func.id
                if name == "len":
                    assert isinstance(node.args[0], ast.Name)
                    buffer_name = node.args[0].id
                    buffer = self.buffers[buffer_name]
                    result = self.temporary("length")
                    self.emit(f"{result} = extractvalue %{buffer} %{buffer_name}, 1")
                    return Value("i64", result)
                if name == "checked_uint64":
                    value = self.cast(self.expression(node.args[0]), "i64")
                    result = self.temporary("checked")
                    self.emit(f"{result} = call i64 @checked_u64(i64 {value.name})")
                    return Value("u64", result)
                if name == "int":
                    return self.cast(self.expression(node.args[0]), "i64")
                if name == "pari_word_mod_inverse":
                    signature = [("i64", "a"), ("i64", "p")]
                else:
                    target = FUNCTIONS[name]
                    signature = [
                        (
                            buffer_kind(annotation_name(argument.annotation))
                            or scalar_kind(annotation_name(argument.annotation)),
                            argument.arg,
                        )
                        for argument in target.args.args
                    ]
                arguments = []
                for value_node, (kind, _) in zip(node.args, signature):
                    if kind in ("i64_buffer", "u64_buffer"):
                        assert isinstance(value_node, ast.Name)
                        arguments.append(f"%{kind} %{value_node.id}")
                    else:
                        value = self.cast(self.expression(value_node), kind)
                        arguments.append(f"{value.llvm} {value.name}")
                result = self.temporary("call")
                self.emit(f"{result} = call i64 @{name}({', '.join(arguments)})")
                return Value("i64", result)
            if isinstance(node.func, ast.Attribute) and node.func.attr == "bit_length":
                value = self.cast(self.expression(node.func.value), "u128")
                result = self.temporary("bits")
                self.emit(f"{result} = call i64 @bit_length_u128(i128 {value.name})")
                return Value("i64", result)
        raise NotImplementedError(ast.dump(node, include_attributes=False))

    def statement_list(self, nodes: list[ast.stmt]) -> None:
        for node in nodes:
            if self.terminated:
                break
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
                continue
            if isinstance(node, ast.Assign):
                if len(node.targets) == 1 and isinstance(
                    node.targets[0], ast.Tuple | ast.List
                ):
                    assert isinstance(node.value, ast.Tuple | ast.List)
                    values = [self.expression(value) for value in node.value.elts]
                    for target, value in zip(node.targets[0].elts, values):
                        self.store_target(target, value)
                else:
                    value = self.expression(node.value)
                    for target in node.targets:
                        self.store_target(target, value)
            elif isinstance(node, ast.AnnAssign):
                if node.value is not None:
                    self.store_target(node.target, self.expression(node.value))
            elif isinstance(node, ast.AugAssign):
                left = self.expression(node.target)
                synthetic = ast.BinOp(
                    left=ast.Constant(0), op=node.op, right=ast.Constant(0)
                )
                right = self.expression(node.value)
                kind = merge_type(left.kind, right.kind)
                left, right = self.cast(left, kind), self.cast(right, kind)
                operation = {
                    ast.Add: "add",
                    ast.Sub: "sub",
                    ast.Mult: "mul",
                    ast.BitOr: "or",
                    ast.Mod: "srem" if kind == "i64" else "urem",
                    ast.RShift: "ashr" if kind == "i64" else "lshr",
                }[type(synthetic.op)]
                result = self.temporary("aug")
                flags = (
                    " nsw"
                    if POLICY != "baseline"
                    and kind == "i64"
                    and operation in ("add", "sub", "mul")
                    else ""
                )
                self.emit(
                    f"{result} = {operation}{flags} {left.llvm} {left.name}, {right.name}"
                )
                self.store_target(node.target, Value(kind, result))
            elif isinstance(node, ast.If):
                yes, no, done = (
                    self.label("if_yes"),
                    self.label("if_no"),
                    self.label("if_done"),
                )
                self.condition(node.test, yes, no)
                self.switch(yes)
                self.statement_list(node.body)
                yes_terminated = self.terminated
                if not yes_terminated:
                    self.terminate(f"br label %{done}")
                self.switch(no)
                self.statement_list(node.orelse)
                no_terminated = self.terminated
                if not no_terminated:
                    self.terminate(f"br label %{done}")
                if yes_terminated and no_terminated:
                    self.switch(done)
                    self.terminate("unreachable")
                else:
                    self.switch(done)
            elif isinstance(node, ast.While):
                condition, body, done = (
                    self.label("while_cond"),
                    self.label("while_body"),
                    self.label("while_done"),
                )
                self.terminate(f"br label %{condition}")
                self.switch(condition)
                self.condition(node.test, body, done)
                self.switch(body)
                self.loop_stack.append((condition, done))
                self.statement_list(node.body)
                self.loop_stack.pop()
                if not self.terminated:
                    self.terminate(f"br label %{condition}")
                self.switch(done)
            elif isinstance(node, ast.For):
                assert isinstance(node.target, ast.Name)
                assert isinstance(node.iter, ast.Call) and isinstance(
                    node.iter.func, ast.Name
                )
                assert node.iter.func.id == "range"
                arguments = node.iter.args
                if len(arguments) == 1:
                    start, stop, step = (
                        self.constant(0),
                        self.expression(arguments[0]),
                        self.constant(1),
                    )
                elif len(arguments) == 2:
                    start, stop, step = (
                        self.expression(arguments[0]),
                        self.expression(arguments[1]),
                        self.constant(1),
                    )
                else:
                    start, stop, step = map(self.expression, arguments)
                self.store_name(node.target.id, start)
                condition, body, increment, done = (
                    self.label("for_cond"),
                    self.label("for_body"),
                    self.label("for_inc"),
                    self.label("for_done"),
                )
                self.terminate(f"br label %{condition}")
                self.switch(condition)
                current = self.load_name(node.target.id)
                stop_value = self.cast(stop, current.kind)
                negative = (
                    len(arguments) == 3
                    and isinstance(arguments[2], ast.UnaryOp)
                    and isinstance(arguments[2].op, ast.USub)
                )
                predicate = (
                    "sgt" if negative else ("slt" if current.kind == "i64" else "ult")
                )
                test = self.temporary("for_test")
                self.emit(
                    f"{test} = icmp {predicate} {current.llvm} {current.name}, {stop_value.name}"
                )
                self.terminate(f"br i1 {test}, label %{body}, label %{done}")
                self.switch(body)
                self.loop_stack.append((increment, done))
                self.statement_list(node.body)
                self.loop_stack.pop()
                if not self.terminated:
                    self.terminate(f"br label %{increment}")
                self.switch(increment)
                current = self.load_name(node.target.id)
                step_value = self.cast(step, current.kind)
                next_value = self.temporary("for_next")
                flags = " nsw" if POLICY != "baseline" and current.kind == "i64" else ""
                self.emit(
                    f"{next_value} = add{flags} {current.llvm} {current.name}, {step_value.name}"
                )
                self.store_name(node.target.id, Value(current.kind, next_value))
                self.terminate(f"br label %{condition}")
                self.switch(done)
            elif isinstance(node, ast.Return):
                value = self.cast(self.expression(node.value), "i64")
                self.terminate(f"ret i64 {value.name}")
            elif isinstance(node, ast.Raise):
                self.emit("call void @word_control_fail()")
                self.terminate("unreachable")
            elif isinstance(node, ast.Break):
                self.terminate(f"br label %{self.loop_stack[-1][1]}")
            elif isinstance(node, ast.Continue):
                self.terminate(f"br label %{self.loop_stack[-1][0]}")
            elif isinstance(node, ast.Expr):
                self.expression(node.value)
            else:
                raise NotImplementedError(ast.dump(node, include_attributes=False))

    def render(self) -> str:
        parameters = []
        for argument in self.node.args.args:
            annotation = annotation_name(argument.annotation)
            kind = buffer_kind(annotation) or scalar_kind(annotation)
            parameters.append(f"{llvm_type(kind)} %{argument.arg}")
        self.statement_list(self.node.body)
        if not self.terminated:
            self.terminate("unreachable")
        self.finish_block()
        attributes = " nounwind" if POLICY != "baseline" else ""
        lines = [
            f"define internal i64 @{self.node.name}({', '.join(parameters)}){attributes} {{",
            "entry:",
        ]
        lines.extend(self.allocas)
        lines.extend(self.initializers)
        lines.append("  br label %body")
        for label, instructions in self.blocks:
            lines.append(f"{label}:")
            lines.extend(instructions)
        lines.append("}")
        return "\n".join(lines)


def root_wrapper() -> str:
    root = FUNCTIONS["bounded_pari_prime_degree_catalog"]
    flat_parameters = []
    call_arguments = []
    for argument in root.args.args:
        annotation = annotation_name(argument.annotation)
        buffer = buffer_kind(annotation)
        if buffer:
            pointer_attributes = (
                " noalias nocapture" if POLICY == "proved-noalias" else ""
            )
            flat_parameters.extend(
                [
                    f"ptr{pointer_attributes} %{argument.arg}_data",
                    f"i64 %{argument.arg}_length",
                ]
            )
            assembled0 = f"%{argument.arg}_b0"
            assembled1 = f"%{argument.arg}_b1"
            call_arguments.append((buffer, assembled0, assembled1, argument.arg))
        else:
            kind = scalar_kind(annotation)
            flat_parameters.append(f"i64 %{argument.arg}")
            call_arguments.append((kind, f"%{argument.arg}", None, argument.arg))
    attributes = " nounwind" if POLICY != "baseline" else ""
    lines = [
        f"define i64 @sagejs_llvm_catalog({', '.join(flat_parameters)}){attributes} {{",
        "entry:",
    ]
    rendered = []
    for kind, first, second, name in call_arguments:
        if kind in ("i64_buffer", "u64_buffer"):
            lines.append(f"  {first} = insertvalue %{kind} poison, ptr %{name}_data, 0")
            lines.append(
                f"  {second} = insertvalue %{kind} {first}, i64 %{name}_length, 1"
            )
            rendered.append(f"%{kind} {second}")
        else:
            rendered.append(f"i64 {first}")
    lines.append(
        "  %result = call i64 @bounded_pari_prime_degree_catalog("
        + ", ".join(rendered)
        + ")"
    )
    lines.extend(["  ret i64 %result", "}"])
    return "\n".join(lines)


RUNTIME = r"""
%i64_buffer = type { ptr, i64 }
%u64_buffer = type { ptr, i64 }

declare void @llvm.trap() cold noreturn nounwind
declare i128 @llvm.ctlz.i128(i128, i1 immarg) nounwind speculatable willreturn memory(none)

define internal void @word_control_fail() cold noreturn nounwind {
entry:
  call void @llvm.trap()
  unreachable
}

define internal i64 @checked_u64(i64 %value) alwaysinline nounwind {
entry:
  %bad = icmp slt i64 %value, 0
  br i1 %bad, label %fail, label %ok
fail:
  call void @word_control_fail()
  unreachable
ok:
  ret i64 %value
}

define internal i64 @py_mod_i64(i64 %a, i64 %b) alwaysinline nounwind {
entry:
  %r = srem i64 %a, %b
  %nonzero = icmp ne i64 %r, 0
  %rneg = icmp slt i64 %r, 0
  %bneg = icmp slt i64 %b, 0
  %different = xor i1 %rneg, %bneg
  %adjust = and i1 %nonzero, %different
  %sum = add i64 %r, %b
  %answer = select i1 %adjust, i64 %sum, i64 %r
  ret i64 %answer
}

define internal i64 @py_floor_div_i64(i64 %a, i64 %b) alwaysinline nounwind {
entry:
  %q = sdiv i64 %a, %b
  %r = srem i64 %a, %b
  %nonzero = icmp ne i64 %r, 0
  %rneg = icmp slt i64 %r, 0
  %bneg = icmp slt i64 %b, 0
  %different = xor i1 %rneg, %bneg
  %adjust = and i1 %nonzero, %different
  %minus = sub i64 %q, 1
  %answer = select i1 %adjust, i64 %minus, i64 %q
  ret i64 %answer
}

define internal i64 @bit_length_u128(i128 %value) alwaysinline nounwind {
entry:
  %leading = call i128 @llvm.ctlz.i128(i128 %value, i1 false)
  %bits128 = sub i128 128, %leading
  %bits = trunc i128 %bits128 to i64
  ret i64 %bits
}

define internal i64 @pari_word_mod_inverse(i64 %a, i64 %p) nounwind {
entry:
  %t = alloca i64
  %nt = alloca i64
  %r = alloca i64
  %nr = alloca i64
  store i64 0, ptr %t
  store i64 1, ptr %nt
  store i64 %p, ptr %r
  %initial = call i64 @py_mod_i64(i64 %a, i64 %p)
  store i64 %initial, ptr %nr
  br label %loop
loop:
  %nrv = load i64, ptr %nr
  %more = icmp ne i64 %nrv, 0
  br i1 %more, label %body, label %done
body:
  %rv = load i64, ptr %r
  %q = sdiv i64 %rv, %nrv
  %tv = load i64, ptr %t
  %ntv = load i64, ptr %nt
  %qnt = mul i64 %q, %ntv
  %x = sub i64 %tv, %qnt
  store i64 %ntv, ptr %t
  store i64 %x, ptr %nt
  %qnr = mul i64 %q, %nrv
  %y = sub i64 %rv, %qnr
  store i64 %nrv, ptr %r
  store i64 %y, ptr %nr
  br label %loop
done:
  %gcd = load i64, ptr %r
  %valid = icmp eq i64 %gcd, 1
  br i1 %valid, label %answer, label %fail
fail:
  call void @word_control_fail()
  unreachable
answer:
  %raw = load i64, ptr %t
  %negative = icmp slt i64 %raw, 0
  %adjusted = add i64 %raw, %p
  %result = select i1 %negative, i64 %adjusted, i64 %raw
  ret i64 %result
}
"""


def emit_ir() -> str:
    functions = [node for nodes in SELECTED.values() for node in nodes]
    return (
        "; Direct LLVM experiment from ordinary Python AST; GPL-2.0-or-later.\n"
        'source_filename = "same_storage_catalog.py"\n\n'
        + RUNTIME
        + "\n\n"
        + "\n\n".join(FunctionEmitter(node).render() for node in functions)
        + "\n\n"
        + root_wrapper()
        + "\n"
    )


def emit_harness() -> str:
    fixture = json.loads(FIXTURE.read_text())["cases"][0]
    primes = ",".join(map(str, fixture["primes"]))
    root = FUNCTIONS["bounded_pari_prime_degree_catalog"]
    declaration = []
    call = []
    for argument in root.args.args:
        name = argument.arg
        annotation = annotation_name(argument.annotation)
        if buffer_kind(annotation):
            declaration.extend([f"int64_t *{name}_data", f"int64_t {name}_length"])
            call.extend([f"{name}_data", f"{name}_length"])
        else:
            declaration.append(f"int64_t {name}")
            call.append(name)
    return f"""/* Host-only harness for the direct LLVM catalog experiment. */
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
extern int64_t sagejs_llvm_catalog({", ".join(declaration)});
static const int64_t frozen_primes[1230]={{{primes}}};
static int64_t coefficients_data[4]={{20034,-20018,0,1}}, exact_data[393], metadata_data[393];
static uint64_t word_data[393];
static int64_t factor_degrees_data[5],factor_exponents_data[5],group_degrees_data[5],group_counts_data[5],local_state_data[5];
static int64_t pattern_offsets_data[1232],pattern_counts_data[1232],pattern_degrees_data[3692],pattern_multiplicities_data[3692];
static int64_t full_offsets_data[1232],full_counts_data[1232],full_degrees_data[3692],state_data[6];
static double elapsed(struct timespec a,struct timespec b){{return (double)(b.tv_sec-a.tv_sec)+(double)(b.tv_nsec-a.tv_nsec)*1e-9;}}
static void print_values(const int64_t *v,int64_t n){{putchar('[');for(int64_t i=0;i<n;i++){{if(i)putchar(',');printf("%" PRId64,v[i]);}}putchar(']');}}
int main(int argc,char **argv){{
 if(argc!=2)return 2;char *end;long repetitions=strtol(argv[1],&end,10);if(!*argv[1]||*end||repetitions<1||repetitions>100000)return 2;
 for(int64_t i=0;i<393;i++){{exact_data[i]=77;metadata_data[i]=77;word_data[i]=77;}}
 struct timespec w0,w1,c0,c1;clock_gettime(CLOCK_MONOTONIC,&w0);clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c0);
 for(long i=0;i<repetitions;i++){{int64_t result=sagejs_llvm_catalog(coefficients_data,4,3,1,(int64_t*)frozen_primes,1230,1230,exact_data,393,(int64_t*)word_data,393,metadata_data,393,factor_degrees_data,5,factor_exponents_data,5,group_degrees_data,5,group_counts_data,5,local_state_data,5,pattern_offsets_data,1232,pattern_counts_data,1232,pattern_degrees_data,3692,pattern_multiplicities_data,3692,full_offsets_data,1232,full_counts_data,1232,full_degrees_data,3692,state_data,6);if(result)return 5;}}
 clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c1);clock_gettime(CLOCK_MONOTONIC,&w1);
 printf("{{\\\"wallSeconds\\\":%.17g,\\\"threadCpuSeconds\\\":%.17g,\\\"repetitions\\\":%ld}}\\n",elapsed(w0,w1),elapsed(c0,c1),repetitions);
 printf("{{\\\"state\\\":");print_values(state_data,4);printf(",\\\"patternOffsets\\\":");print_values(pattern_offsets_data,1230);printf(",\\\"patternCounts\\\":");print_values(pattern_counts_data,1230);printf(",\\\"patternDegrees\\\":");print_values(pattern_degrees_data,state_data[2]);printf(",\\\"patternMultiplicities\\\":");print_values(pattern_multiplicities_data,state_data[2]);printf(",\\\"fullOffsets\\\":");print_values(full_offsets_data,1230);printf(",\\\"fullCounts\\\":");print_values(full_counts_data,1230);printf(",\\\"fullDegrees\\\":");print_values(full_degrees_data,state_data[3]);puts("}}");
 return 0;
}}
"""


if MODE == "ir":
    sys.stdout.write(emit_ir())
elif MODE == "harness":
    sys.stdout.write(emit_harness())
else:
    raise SystemExit("mode must be ir or harness")
