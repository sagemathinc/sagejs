// sagejs-test-tier: integration
// sagejs-test-smoke: true
"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate([
      "import calendar",
      "print(calendar.isleap(2000), calendar.isleap(1900))",
      "print(calendar.leapdays(1990, 2025))",
      "print(calendar.monthrange(2024, 2))",
      "print(calendar.weekday(2024, 2, 29))",
      "print(calendar.monthcalendar(2024, 2))",
      "calendar.setfirstweekday(calendar.SUNDAY)",
      "print(calendar.firstweekday(), calendar.monthcalendar(2024, 2)[0])",
      "try:",
      "    calendar.monthrange(2024, 13)",
      "except calendar.IllegalMonthError as error:",
      "    print(error.month)",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "True False",
      "9",
      "(3, 29)",
      "3",
      "[[0, 0, 0, 1, 2, 3, 4], [5, 6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24, 25], [26, 27, 28, 29, 0, 0, 0]]",
      "6 [0, 0, 0, 0, 1, 2, 3]",
      "13",
    ].join("\n"));
  } finally {
    await session.close();
  }
  console.log("Sage.js calendar compatibility passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
