"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function withSage(body) {
  const session = await createSage();
  try {
    await body(session);
  } finally {
    await session.close();
  }
}

function evaluated(session, lines) {
  return session.evaluate(Array.isArray(lines) ? lines.join("\n") : lines);
}

test("partitions enumerate in Sage's order with exact counts", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "Partitions(4).list()")).repr,
      "[[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]",
    );
    assert.equal((await evaluated(session, "Partitions(0).list()")).repr, "[[]]");
    assert.equal(
      (await evaluated(session, "Partitions(4)")).repr,
      "Partitions of the integer 4",
    );
    assert.equal(
      (await evaluated(session, "[Partitions(n).cardinality() for n in range(11)]"))
        .repr,
      "[1, 1, 2, 3, 5, 7, 11, 15, 22, 30, 42]",
    );
    // Counting must never depend on enumeration, so the two must agree.
    assert.equal(
      (
        await evaluated(session, [
          "[Partitions(n).cardinality() == len(Partitions(n).list())",
          " for n in range(13)] == [True] * 13",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (await evaluated(session, "Partitions(100).cardinality()")).repr,
      "190569292",
    );
    // Well past the double-precision range, and past any hope of listing.
    assert.equal(
      (await evaluated(session, "Partitions(1000).cardinality()")).repr,
      "24061467864032622473692149727991",
    );
    assert.equal(
      (await evaluated(session, "number_of_partitions(200)")).repr,
      "3972999029388",
    );
    assert.equal(
      (await evaluated(session, "number_of_partitions(0) == Partitions(0).cardinality()"))
        .repr,
      "True",
    );
  });
});

test("counting agrees across the FLINT and portable paths", async () => {
  await withSage(async (session) => {
    // FLINT's Rademacher implementation and the pentagonal recurrence are
    // independent algorithms; they must return the same exact integers.
    assert.equal(
      (
        await evaluated(session, [
          "sizes = list(range(0, 60)) + [100, 250, 400]",
          "[Partitions(n).cardinality() == Partitions(n)._portable_cardinality()",
          " for n in sizes] == [True] * len(sizes)",
        ])
      ).repr,
      "True",
    );
    // A third, unrelated route: the memoized recursion over the largest part.
    assert.equal(
      (
        await evaluated(session, [
          "cls = Partitions(120)",
          "cls._count(120, 120, 0, 120) == number_of_partitions(120)",
        ])
      ).repr,
      "True",
    );
    // Arguments far past the reach of enumeration stay exact.
    assert.equal(
      (await evaluated(session, "number_of_partitions(100000) % 10**12")).repr,
      "569421098519",
    );
    assert.equal(
      (await evaluated(session, "number_of_partitions(10**6) % 10**12")).repr,
      "467104673818",
    );
  });
});

test("partition classes honor the supported constraints", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "Partitions(5, max_part=3).list()")).repr,
      "[[3, 2], [3, 1, 1], [2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1]]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(5, length=2).list()")).repr,
      "[[4, 1], [3, 2]]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(5, min_part=2).list()")).repr,
      "[[5], [3, 2]]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(5, max_length=2).list()")).repr,
      "[[5], [4, 1], [3, 2]]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(5, min_length=4).list()")).repr,
      "[[2, 1, 1, 1], [1, 1, 1, 1, 1]]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(5, parts_in=[1, 2]).list()")).repr,
      "[[2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1]]",
    );
    // Constrained cardinality is also counted, never enumerated.
    assert.equal(
      (
        await evaluated(session, [
          "classes = [Partitions(9, max_part=4), Partitions(9, length=3),",
          "           Partitions(9, min_part=2), Partitions(9, parts_in=[2, 3])]",
          "[c.cardinality() == len(c.list()) for c in classes]",
        ])
      ).repr,
      "[True, True, True, True]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(7, min_part=8).cardinality()")).repr,
      "0",
    );
    // Restricting to one part size counts the multiples of that size.
    assert.equal(
      (
        await evaluated(session, [
          "[Partitions(n, parts_in=[3]).cardinality() for n in range(10)]",
        ])
      ).repr,
      "[1, 0, 0, 1, 0, 0, 1, 0, 0, 1]",
    );
  });
});

test("partition classes support the rank and unrank protocol", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "[Partitions(5).first(), Partitions(5).last()]")).repr,
      "[[5], [1, 1, 1, 1, 1]]",
    );
    // Ranking must agree with the enumeration order it claims to index.
    assert.equal(
      (
        await evaluated(session, [
          "members = Partitions(11).list()",
          "ranks = [Partitions(11).rank(p) for p in members]",
          "unranked = [Partitions(11).unrank(i) for i in range(len(members))]",
          "[ranks == list(range(len(members))), unranked == members]",
        ])
      ).repr,
      "[True, True]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "cls = Partitions(12, max_part=5)",
          "members = cls.list()",
          "[[cls.rank(p) for p in members] == list(range(len(members))),",
          " [cls.unrank(i) for i in range(len(members))] == members]",
        ])
      ).repr,
      "[True, True]",
    );
    // Addressing by position does not enumerate, but must land in the same
    // place enumeration would.
    assert.equal(
      (
        await evaluated(session, [
          "members = Partitions(40).list()",
          "[Partitions(40).unrank(i) == members[i] for i in [0, 1, 999, 20000, 37337]]",
        ])
      ).repr,
      "[True, True, True, True, True]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def out_of_range():",
          "    try:",
          "        Partitions(4).unrank(5)",
          "    except ValueError as error:",
          "        return str(error)",
          "    return 'no error'",
          "out_of_range() == 'a rank must be smaller than the cardinality'",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "samples = [Partitions(30).random_element() for _ in range(20)]",
          "all([s in Partitions(30) for s in samples])",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "cls = Partitions(30, max_part=4)",
          "samples = [cls.random_element() for _ in range(20)]",
          "all([s in cls for s in samples])",
        ])
      ).repr,
      "True",
    );
  });
});

test("partition membership and construction", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, [
          "[[3, 1] in Partitions(4), [3, 2] in Partitions(4),",
          " [1, 3] in Partitions(4), [3, 1] in Partitions(4, max_part=2),",
          " Partition([3, 1]) in Partitions(4), [] in Partitions(0)]",
        ])
      ).repr,
      "[True, False, False, False, True, True]",
    );
    assert.equal(
      (await evaluated(session, "Partitions(4)([2, 2]).parent()")).repr,
      "Partitions of the integer 4",
    );
    assert.equal(
      (await evaluated(session, "Partition([3, 1]).parent()")).repr,
      "Partitions",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def decreasing():",
          "    try:",
          "        Partition([1, 3])",
          "    except ValueError as error:",
          "        return str(error)",
          "    return 'no error'",
          "decreasing() == 'partition parts must be weakly decreasing'",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def unsupported():",
          "    try:",
          "        Partitions(4, inner=[2])",
          "    except NotImplementedError as error:",
          "        return str(error)",
          "    return 'no error'",
          "unsupported() == \"the Partitions constraint 'inner' is not implemented\"",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def negative():",
          "    try:",
          "        Partitions(-1)",
          "    except ValueError as error:",
          "        return str(error)",
          "    return 'no error'",
          "negative() == 'the partitioned size must be nonnegative'",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def foreign():",
          "    try:",
          "        Partitions(4)([3, 2])",
          "    except ValueError as error:",
          "        return 'rejected'",
          "    return 'accepted'",
          "foreign()",
        ])
      ).repr,
      "'rejected'",
    );
  });
});

test("partition elements expose the standard Sage methods", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(
          session,
          "[Partition([4, 2, 1]).size(), Partition([4, 2, 1]).length()]",
        )
      ).repr,
      "[7, 3]",
    );
    assert.equal(
      (await evaluated(session, "Partition([4, 2, 1]).conjugate()")).repr,
      "[3, 2, 1, 1]",
    );
    // Conjugation is an involution on every partition of a small integer.
    assert.equal(
      (
        await evaluated(session, [
          "all([p.conjugate().conjugate() == p",
          "     for n in range(9) for p in Partitions(n)])",
        ])
      ).repr,
      "True",
    );
    // Conjugation permutes each class, so it must reproduce the whole class.
    assert.equal(
      (
        await evaluated(session, [
          "images = sorted([str(p.conjugate()) for p in Partitions(7)])",
          "members = sorted([str(p) for p in Partitions(7)])",
          "images == members",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(
          session,
          "[Partition([3, 2, 2, 1]).to_exp(), Partition([3, 2, 2, 1]).to_exp(5)]",
        )
      ).repr,
      "[[1, 2, 1], [1, 2, 1, 0, 0]]",
    );
    assert.equal(
      (await evaluated(session, "Partition([3, 2, 1]).hook_lengths()")).repr,
      "[[5, 3, 1], [3, 1], [1]]",
    );
    assert.equal(
      (await evaluated(session, "Partition([4, 2]).hook_lengths()")).repr,
      "[[5, 4, 2, 1], [2, 1]]",
    );
    // The hook length formula counts standard Young tableaux, and the sum of
    // their squares over a class is n!.  That checks the hook lengths and the
    // enumeration against each other.
    assert.equal(
      (
        await evaluated(session, [
          "def product(values):",
          "    total = 1",
          "    for value in values:",
          "        total *= value",
          "    return total",
          "def tableaux(p):",
          "    hooks = product([product(row) for row in p.hook_lengths()])",
          "    return product(range(2, p.size() + 1)) // hooks",
          "totals = [sum([tableaux(p)**2 for p in Partitions(n)])",
          "          == product(range(2, n + 1)) for n in range(1, 8)]",
          "totals == [True] * 7",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (await evaluated(session, "Partition([2, 1]).cells()")).repr,
      "[(0, 0), (0, 1), (1, 0)]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "[Partition([3, 1]).dominates([2, 2]),",
          " Partition([2, 2]).dominates([3, 1]),",
          " Partition([4]).dominates([1, 1, 1, 1])]",
        ])
      ).repr,
      "[True, False, True]",
    );
    assert.equal(
      (
        await evaluated(
          session,
          "Partition([3, 1]).ferrers_diagram() == '***' + chr(10) + '*'",
        )
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "p = Partition([4, 2, 1])",
          "[len(p), list(p), p[1], p == [4, 2, 1], p == [4, 2], p.to_list()]",
        ])
      ).repr,
      "[3, [4, 2, 1], 2, True, False, [4, 2, 1]]",
    );
  });
});

test("the class of all partitions is infinite and ordered by size", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "Partitions()")).repr, "Partitions");
    assert.equal(
      (await evaluated(session, "Partitions().cardinality()")).repr,
      "+Infinity",
    );
    assert.equal(
      (await evaluated(session, "[Partitions().unrank(i) for i in range(7)]")).repr,
      "[[], [1], [2], [1, 1], [3], [2, 1], [1, 1, 1]]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "positions = [Partitions().rank(Partitions().unrank(i))",
          "             for i in range(12)]",
          "positions == list(range(12))",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "[[3, 1] in Partitions(), [1, 3] in Partitions(),",
          " Partitions().first()]",
        ])
      ).repr,
      "[True, False, []]",
    );
  });
});

test("partitions are importable from the Sage module path", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, [
          "from sage.combinat.partition import Partitions as P",
          "P(6).cardinality()",
        ])
      ).repr,
      "11",
    );
    assert.equal(
      (
        await evaluated(session, [
          "from sage.combinat import number_of_partitions as count",
          "count(50)",
        ])
      ).repr,
      "204226",
    );
  });
});
