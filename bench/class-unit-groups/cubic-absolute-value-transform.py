"""Replace exact sign-normalization branches with ordinary Python abs calls."""

import ast
import sys


def transform(source):
    tree = ast.parse(source)
    assert not any(
        isinstance(node, ast.Name)
        and node.id == "abs"
        and not isinstance(node.ctx, ast.Load)
        for node in ast.walk(tree)
    )
    raw = source.encode()
    lines = raw.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    edits = []
    for parent in ast.walk(tree):
        for _, nodes in ast.iter_fields(parent):
            if not isinstance(nodes, list):
                continue
            for index, node in enumerate(nodes):
                if not isinstance(node, ast.If) or node.orelse or len(node.body) != 1:
                    continue
                condition, assignment = node.test, node.body[0]
                if not (
                    isinstance(condition, ast.Compare)
                    and isinstance(condition.left, ast.Name)
                    and len(condition.ops) == 1
                    and isinstance(condition.ops[0], ast.Lt)
                    and isinstance(condition.comparators[0], ast.Constant)
                    and condition.comparators[0].value == 0
                ):
                    continue
                name = condition.left.id
                if not (
                    isinstance(assignment, ast.Assign)
                    and len(assignment.targets) == 1
                    and isinstance(assignment.targets[0], ast.Name)
                    and assignment.targets[0].id == name
                    and isinstance(assignment.value, ast.UnaryOp)
                    and isinstance(assignment.value.op, ast.USub)
                    and isinstance(assignment.value.operand, ast.Name)
                    and assignment.value.operand.id == name
                ):
                    continue
                first = node
                value = name
                previous = nodes[index - 1] if index else None
                if (
                    isinstance(previous, ast.Assign)
                    and len(previous.targets) == 1
                    and isinstance(previous.targets[0], ast.Name)
                    and previous.targets[0].id == name
                    and previous.end_lineno + 1 == node.lineno
                    and "#" not in ast.get_source_segment(source, previous)
                ):
                    first = previous
                    value = ast.unparse(previous.value)
                begin, end = offsets[first.lineno - 1], offsets[node.end_lineno]
                # Never erase a mathematical comment along with a branch.
                if b"#" in raw[begin:end]:
                    continue
                replacement = " " * first.col_offset + f"{name} = abs({value})\n"
                edits.append((begin, end, replacement.encode()))
    edits.sort()
    assert edits, "no exact sign-normalization blocks"
    for left, right in zip(edits, edits[1:]):
        assert left[1] <= right[0], "overlapping sign normalization"
    for begin, end, value in reversed(edits):
        raw = raw[:begin] + value + raw[end:]
    ast.parse(raw.decode())
    return raw.decode()


if __name__ == "__main__":
    sys.stdout.write(transform(sys.stdin.read()))
