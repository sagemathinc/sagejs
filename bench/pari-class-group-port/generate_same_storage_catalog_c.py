"""Generate a diagnostic fixed-word C translation of the bounded catalog.

This benchmark-only translator handles exactly the ordinary-Python constructs
used by the declared degree-at-most-four catalog subgraph. It is deliberately
not a production compiler or mathematical backend.
"""

from __future__ import annotations

import ast
import json
import pathlib
import sys


ROOT = pathlib.Path(sys.argv[1]).resolve()
FIXTURE = pathlib.Path(sys.argv[2]).resolve()
BASE = ROOT / "bench/pari-class-group-port"
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


def annotation_name(node: ast.expr | None) -> str:
    return node.id if isinstance(node, ast.Name) else "int"


def ctype(annotation: str) -> str:
    return {
        "UInt64Buffer": "u64_buffer",
        "IntegerBuffer": "i64_buffer",
        "uint64": "uint64_t",
        "bool": "int64_t",
        "int": "int64_t",
    }.get(annotation, "int64_t")


FUNCTIONS = {
    node.name: node for nodes in SELECTED.values() for node in nodes
}
BUFFER_ARGUMENTS: dict[str, dict[str, str]] = {}
for name, node in FUNCTIONS.items():
    BUFFER_ARGUMENTS[name] = {
        argument.arg: ctype(annotation_name(argument.annotation))
        for argument in node.args.args
        if annotation_name(argument.annotation) in ("UInt64Buffer", "IntegerBuffer")
    }


def merge_type(left: str, right: str) -> str:
    order = {"i64": 0, "u64": 1, "u128": 2}
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


def infer_expression(node: ast.expr, types: dict[str, str], buffers: dict[str, str]) -> str:
    if isinstance(node, ast.Constant):
        return constant_type(node.value)
    if isinstance(node, ast.Name):
        return types.get(node.id, "i64")
    if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
        return "u64" if buffers.get(node.value.id) == "u64_buffer" else "i64"
    if isinstance(node, ast.UnaryOp):
        return infer_expression(node.operand, types, buffers)
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
        argument.arg: (
            "u64" if annotation_name(argument.annotation) == "uint64" else "i64"
        )
        for argument in node.args.args
        if argument.arg not in buffers
    }
    explicit: dict[str, str] = {}
    for item in ast.walk(node):
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            explicit[item.target.id] = (
                "u64" if annotation_name(item.annotation) == "uint64" else "i64"
            )
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
                elif isinstance(target, (ast.Tuple, ast.List)) and isinstance(
                    item.value, (ast.Tuple, ast.List)
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


class Emitter:
    def __init__(self, types: dict[str, str], buffers: dict[str, str]):
        self.types = types
        self.buffers = buffers
        self.temporary = 0

    def constant(self, value: object) -> str:
        if value is True:
            return "1"
        if value is False:
            return "0"
        assert isinstance(value, int), value
        if value > 0xFFFFFFFFFFFFFFFF:
            high, low = divmod(value, 1 << 64)
            return f"(((__uint128_t){high}ULL << 64) | {low}ULL)"
        if value > 0x7FFFFFFFFFFFFFFF:
            return f"UINT64_C({value})"
        return str(value)

    def expression(self, node: ast.expr) -> str:
        if isinstance(node, ast.Constant):
            return self.constant(node.value)
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Subscript):
            return f"{self.expression(node.value)}.data[{self.expression(node.slice)}]"
        if isinstance(node, ast.UnaryOp):
            operator = {ast.USub: "-", ast.Not: "!", ast.Invert: "~"}[type(node.op)]
            return f"({operator}{self.expression(node.operand)})"
        if isinstance(node, ast.BoolOp):
            operator = " && " if isinstance(node.op, ast.And) else " || "
            return "(" + operator.join(self.expression(value) for value in node.values) + ")"
        if isinstance(node, ast.Compare):
            operators = {
                ast.Eq: "==",
                ast.NotEq: "!=",
                ast.Lt: "<",
                ast.LtE: "<=",
                ast.Gt: ">",
                ast.GtE: ">=",
            }
            parts = []
            left = node.left
            for operator, right in zip(node.ops, node.comparators):
                parts.append(
                    f"({self.expression(left)} {operators[type(operator)]} {self.expression(right)})"
                )
                left = right
            return "(" + " && ".join(parts) + ")"
        if isinstance(node, ast.BinOp):
            left, right = self.expression(node.left), self.expression(node.right)
            left_type = infer_expression(node.left, self.types, self.buffers)
            right_type = infer_expression(node.right, self.types, self.buffers)
            if isinstance(node.op, ast.Mod) and left_type == right_type == "i64":
                return f"py_mod_i64({left}, {right})"
            if isinstance(node.op, ast.FloorDiv) and left_type == right_type == "i64":
                return f"py_floor_div_i64({left}, {right})"
            operator = {
                ast.Add: "+",
                ast.Sub: "-",
                ast.Mult: "*",
                ast.Mod: "%",
                ast.FloorDiv: "/",
                ast.LShift: "<<",
                ast.RShift: ">>",
                ast.BitAnd: "&",
                ast.BitOr: "|",
                ast.BitXor: "^",
            }[type(node.op)]
            return f"({left} {operator} {right})"
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                name = node.func.id
                if name == "len":
                    return f"{self.expression(node.args[0])}.length"
                if name == "checked_uint64":
                    return f"checked_u64({self.expression(node.args[0])})"
                if name == "int":
                    return f"((int64_t){self.expression(node.args[0])})"
                return f"{name}({', '.join(self.expression(value) for value in node.args)})"
            if isinstance(node.func, ast.Attribute) and node.func.attr == "bit_length":
                return f"bit_length_u128({self.expression(node.func.value)})"
        raise NotImplementedError(ast.dump(node, include_attributes=False))

    def target(self, node: ast.expr) -> str:
        return self.expression(node)

    def statements(self, nodes: list[ast.stmt], indent: int = 1) -> list[str]:
        output: list[str] = []
        prefix = "    " * indent
        for node in nodes:
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
                continue
            if isinstance(node, ast.Assign):
                if len(node.targets) == 1 and isinstance(node.targets[0], (ast.Tuple, ast.List)):
                    assert isinstance(node.value, (ast.Tuple, ast.List))
                    temporaries = []
                    for value in node.value.elts:
                        name = f"swap_{self.temporary}"
                        self.temporary += 1
                        output.append(prefix + f"int64_t {name} = {self.expression(value)};")
                        temporaries.append(name)
                    for target, value in zip(node.targets[0].elts, temporaries):
                        output.append(prefix + f"{self.target(target)} = {value};")
                else:
                    value = self.expression(node.value)
                    for target in node.targets:
                        output.append(prefix + f"{self.target(target)} = {value};")
            elif isinstance(node, ast.AnnAssign):
                if node.value is not None:
                    output.append(prefix + f"{self.target(node.target)} = {self.expression(node.value)};")
            elif isinstance(node, ast.AugAssign):
                operator = {
                    ast.Add: "+=",
                    ast.Sub: "-=",
                    ast.Mult: "*=",
                    ast.BitOr: "|=",
                    ast.Mod: "%=",
                    ast.RShift: ">>=",
                }[type(node.op)]
                output.append(prefix + f"{self.target(node.target)} {operator} {self.expression(node.value)};")
            elif isinstance(node, ast.If):
                output.append(prefix + f"if ({self.expression(node.test)}) {{")
                output.extend(self.statements(node.body, indent + 1))
                if node.orelse:
                    output.append(prefix + "} else {")
                    output.extend(self.statements(node.orelse, indent + 1))
                output.append(prefix + "}")
            elif isinstance(node, ast.While):
                output.append(prefix + f"while ({self.expression(node.test)}) {{")
                output.extend(self.statements(node.body, indent + 1))
                output.append(prefix + "}")
            elif isinstance(node, ast.For):
                assert isinstance(node.target, ast.Name)
                assert isinstance(node.iter, ast.Call) and isinstance(node.iter.func, ast.Name)
                assert node.iter.func.id == "range"
                arguments = node.iter.args
                if len(arguments) == 1:
                    start, stop, step = "0", self.expression(arguments[0]), "1"
                elif len(arguments) == 2:
                    start, stop, step = self.expression(arguments[0]), self.expression(arguments[1]), "1"
                else:
                    start, stop, step = map(self.expression, arguments)
                negative_step = (
                    len(arguments) == 3
                    and isinstance(arguments[2], ast.UnaryOp)
                    and isinstance(arguments[2].op, ast.USub)
                )
                comparison = ">" if negative_step else "<"
                output.append(
                    prefix
                    + f"for ({node.target.id} = {start}; {node.target.id} {comparison} {stop}; {node.target.id} += {step}) {{"
                )
                output.extend(self.statements(node.body, indent + 1))
                output.append(prefix + "}")
            elif isinstance(node, ast.Return):
                output.append(prefix + f"return {self.expression(node.value)};")
            elif isinstance(node, ast.Raise):
                message = "translated Python exception"
                if isinstance(node.exc, ast.Call) and node.exc.args and isinstance(node.exc.args[0], ast.Constant):
                    message = str(node.exc.args[0].value)
                output.append(prefix + f'word_control_fail("{message}");')
            elif isinstance(node, ast.Break):
                output.append(prefix + "break;")
            elif isinstance(node, ast.Continue):
                output.append(prefix + "continue;")
            elif isinstance(node, ast.Expr):
                output.append(prefix + self.expression(node.value) + ";")
            else:
                raise NotImplementedError(ast.dump(node, include_attributes=False))
        return output


def prototype(node: ast.FunctionDef) -> str:
    arguments = []
    for argument in node.args.args:
        arguments.append(f"{ctype(annotation_name(argument.annotation))} {argument.arg}")
    return f"static int64_t {node.name}({', '.join(arguments)})"


def function(node: ast.FunctionDef) -> str:
    types, buffers = local_types(node)
    emitter = Emitter(types, buffers)
    arguments = {argument.arg for argument in node.args.args}
    locals_ = sorted(set(types) - arguments)
    declarations = []
    for name in locals_:
        declarations.append(
            "    "
            + {"i64": "int64_t", "u64": "uint64_t", "u128": "__uint128_t"}[types[name]]
            + f" {name} = 0;"
        )
    body = emitter.statements(node.body)
    return prototype(node) + "\n{\n" + "\n".join(declarations + body) + "\n}\n"


fixture = json.loads(FIXTURE.read_text())["cases"][0]
primes = ",".join(map(str, fixture["primes"]))
functions = [node for nodes in SELECTED.values() for node in nodes]
constants = {
    name: value.value
    for filename in ("bounded_flx_small_power.py",)
    for item in ast.parse((BASE / filename).read_text()).body
    if isinstance(item, ast.Assign)
    and len(item.targets) == 1
    and isinstance(item.targets[0], ast.Name)
    and isinstance(item.value, ast.Constant)
    for name, value in [(item.targets[0].id, item.value)]
}

header = f"""/* Generated benchmark-only same-storage control; GPL-2.0-or-later.
 * Function bodies are mechanically translated from the hash-recorded Python
 * source files. It is not a Sage.js backend or a general Python compiler. */
#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
typedef struct {{ int64_t *data; int64_t length; }} i64_buffer;
typedef struct {{ uint64_t *data; int64_t length; }} u64_buffer;
static void word_control_fail(const char *message) {{ fprintf(stderr,"same-storage control: %s\\n",message); exit(3); }}
static uint64_t checked_u64(int64_t value) {{ if(value<0)word_control_fail("negative checked_uint64");return (uint64_t)value; }}
static int64_t py_mod_i64(int64_t a,int64_t b) {{ int64_t r=a%b;return r&&((r<0)!=(b<0))?r+b:r; }}
static int64_t py_floor_div_i64(int64_t a,int64_t b) {{ int64_t q=a/b,r=a%b;return r&&((r<0)!=(b<0))?q-1:q; }}
static int64_t bit_length_u128(__uint128_t value) {{ int64_t n=0;while(value){{value>>=1;n++;}}return n; }}
static int64_t pari_word_mod_inverse(int64_t a,int64_t p) {{ int64_t t=0,nt=1,r=p,nr=py_mod_i64(a,p);while(nr){{int64_t q=r/nr,x=t-q*nt;t=nt;nt=x;x=r-q*nr;r=nr;nr=x;}}if(r!=1)word_control_fail("noninvertible residue");return t<0?t+p:t; }}
"""
for name, value in constants.items():
    header += f"#define {name} {value}\n"
header += "\n".join(prototype(node) + ";" for node in functions) + "\n"

main = f"""
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
 i64_buffer coefficients={{coefficients_data,4}},primes={{(int64_t*)frozen_primes,1230}},exact={{exact_data,393}},metadata={{metadata_data,393}};
 u64_buffer words={{word_data,393}};
 i64_buffer fd={{factor_degrees_data,5}},fe={{factor_exponents_data,5}},gd={{group_degrees_data,5}},gc={{group_counts_data,5}},local={{local_state_data,5}};
 i64_buffer po={{pattern_offsets_data,1232}},pc={{pattern_counts_data,1232}},pd={{pattern_degrees_data,3692}},pm={{pattern_multiplicities_data,3692}};
 i64_buffer fo={{full_offsets_data,1232}},fc={{full_counts_data,1232}},full={{full_degrees_data,3692}},state={{state_data,6}};
 for(int64_t i=0;i<393;i++){{exact_data[i]=77;metadata_data[i]=77;word_data[i]=77;}}
 struct timespec w0,w1,c0,c1;clock_gettime(CLOCK_MONOTONIC,&w0);clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c0);
 for(long i=0;i<repetitions;i++){{int64_t result=bounded_pari_prime_degree_catalog(coefficients,3,1,primes,1230,exact,words,metadata,fd,fe,gd,gc,local,po,pc,pd,pm,fo,fc,full,state);if(result) return 5;}}
 clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c1);clock_gettime(CLOCK_MONOTONIC,&w1);
 printf("{{\\"wallSeconds\\":%.17g,\\"threadCpuSeconds\\":%.17g,\\"repetitions\\":%ld}}\\n",elapsed(w0,w1),elapsed(c0,c1),repetitions);
 printf("{{\\"state\\":");print_values(state_data,4);printf(",\\"patternOffsets\\":");print_values(pattern_offsets_data,1230);printf(",\\"patternCounts\\":");print_values(pattern_counts_data,1230);printf(",\\"patternDegrees\\":");print_values(pattern_degrees_data,state_data[2]);printf(",\\"patternMultiplicities\\":");print_values(pattern_multiplicities_data,state_data[2]);printf(",\\"fullOffsets\\":");print_values(full_offsets_data,1230);printf(",\\"fullCounts\\":");print_values(full_counts_data,1230);printf(",\\"fullDegrees\\":");print_values(full_degrees_data,state_data[3]);puts("}}");
 return 0;
}}
"""

sys.stdout.write(header)
for node in functions:
    sys.stdout.write(function(node))
sys.stdout.write(main)
