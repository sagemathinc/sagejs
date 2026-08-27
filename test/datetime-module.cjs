// sagejs-test-tier: integration
// sagejs-test-smoke: true
"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate([
      "from datetime import date, datetime, timedelta, timezone",
      "leap = date(2024, 2, 29)",
      "print(leap.toordinal(), date.fromordinal(leap.toordinal()), leap.weekday())",
      "print(leap + timedelta(days=2))",
      "delta = timedelta(days=-1, seconds=1, microseconds=2)",
      "print(delta, delta.days, delta.seconds, delta.microseconds)",
      "value = datetime(2024, 1, 31, 12, 30, tzinfo=timezone.utc)",
      "print(value.isoformat())",
      "print(value.replace(month=2, day=29) + timedelta(hours=13, minutes=5))",
      "print(value.strftime('%Y-%m-%d %H:%M:%S %Z (%z)'))",
      "print((value + timedelta(days=3)) - value)",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "738945 2024-02-29 3",
      "2024-03-02",
      "-1 day, 0:00:01.000002 -1 1 2",
      "2024-01-31T12:30:00+00:00",
      "2024-03-01T01:35:00+00:00",
      "2024-01-31 12:30:00 UTC (+0000)",
      "3 days, 0:00:00",
    ].join("\n"));
  } finally {
    await session.close();
  }
  console.log("Sage.js datetime value compatibility passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
