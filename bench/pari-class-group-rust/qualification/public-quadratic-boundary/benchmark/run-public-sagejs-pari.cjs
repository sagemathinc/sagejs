#!/usr/bin/env node
"use strict";

// Diagnostic only: warm public Sage.js calls versus authenticated PARI/GP calls.
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "../../../../..");
const panel = require("./panel-v2.json");

function sha256(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function parseArguments(argv) {
  const options = { samples: 15, fieldId: undefined, boundary: "polynomial", receipt: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--samples" && argv[index + 1] !== undefined) {
      options.samples = Number(argv[++index]);
    } else if (flag === "--field" && argv[index + 1] !== undefined) {
      options.fieldId = argv[++index];
    } else if (flag === "--boundary" && argv[index + 1] !== undefined) {
      options.boundary = argv[++index];
    } else if (flag === "--receipt" && argv[index + 1] !== undefined) {
      options.receipt = argv[++index];
    } else {
      throw new Error(`unknown or incomplete option: ${flag}`);
    }
  }
  if (!Number.isSafeInteger(options.samples) || options.samples < 1 || options.samples > 100) {
    throw new Error("--samples must be an integer from 1 through 100");
  }
  if (!new Set(["polynomial", "prepared"]).has(options.boundary)) {
    throw new Error("--boundary must be polynomial or prepared");
  }
  if (options.fieldId !== undefined && !panel.fields.some((field) => field.id === options.fieldId)) {
    throw new Error(`unknown frozen field: ${options.fieldId}`);
  }
  if (options.receipt !== undefined &&
      !/^[a-z][a-z0-9-]*\.json$/.test(options.receipt)) {
    throw new Error("--receipt must be a simple JSON filename in the benchmark directory");
  }
  return options;
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function verifyPariIdentity() {
  const identity = require("../../pari-control/build/build-identity.json");
  const pin = identity.authenticatedPin;
  if (pin.version !== "2.17.4" || !path.isAbsolute(pin.root)) {
    throw new Error("PARI control identity does not pin the expected version and root");
  }
  for (const [relative, expected] of Object.entries(pin.files)) {
    const actual = sha256(path.join(pin.root, relative));
    if (actual !== expected) throw new Error(`PARI pin drift: ${relative}`);
  }
  return {
    executable: path.join(pin.root, "Olinux-x86_64/gp-dyn"),
    executableSha256: pin.files["Olinux-x86_64/gp-dyn"],
    librarySha256: pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"],
  };
}

class ResidentGp {
  constructor(executable) {
    const libraryDirectory = path.dirname(executable);
    this.child = spawn(executable, ["-q"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: libraryDirectory +
          (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""),
      },
    });
    this.pending = undefined;
    this.failure = undefined;
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4096);
    });
    readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity })
      .on("line", (line) => {
        const pending = this.pending;
        this.pending = undefined;
        if (pending === undefined) {
          this.failure = new Error(`unsolicited PARI output: ${line}`);
        } else {
          clearTimeout(pending.timer);
          pending.resolve(line);
        }
      });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.fail(new Error(`PARI exited (${code}, ${signal}): ${this.stderr}`));
    });
  }

  fail(error) {
    this.failure = error;
    if (this.pending !== undefined) {
      const pending = this.pending;
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  query(code) {
    if (this.failure !== undefined) return Promise.reject(this.failure);
    if (this.pending !== undefined) return Promise.reject(new Error("overlapping PARI calls"));
    if (code.includes("\n")) return Promise.reject(new Error("PARI command must be one line"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error("PARI public call timed out"));
        this.child.kill();
      }, 120_000);
      this.pending = { resolve, reject, timer };
      this.child.stdin.write(`${code}\n`, (error) => {
        if (error !== undefined && error !== null) this.fail(error);
      });
    });
  }

  async close() {
    this.child.stdin.end();
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => this.child.kill(), 2000);
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

function expectedSage(field) {
  const factors = field.expected.invariantFactors;
  const tuple = factors.length === 0
    ? "()" : `(${factors.join(", ")}${factors.length === 1 ? "," : ""})`;
  return `[${field.expected.discriminant}, ${field.expected.classNumber}, ` +
    `${tuple}, 'exact-unconditional', 'rust']`;
}

async function timeSage(sage, field, boundary) {
  const code = `${boundary === "polynomial" ? `K.<a> = NumberField(${field.pariPolynomial})\n` : ""}` +
    "G = K.class_group(algorithm='rust')\n" +
    "[K.discriminant(), G.order(), G.invariants(), G.proof_status, G.algorithm]";
  const start = performance.now();
  const response = await sage.evaluate(code);
  const elapsed = Math.round((performance.now() - start) * 1_000_000);
  if (response.repr !== expectedSage(field)) {
    throw new Error(`wrong Sage.js answer for ${field.id}: ${response.repr}`);
  }
  return elapsed;
}

async function timePari(gp, field, fieldIndex, sampleIndex, boundary) {
  const seed = 2_026_092_600 + fieldIndex * 1000 + sampleIndex;
  const preparation = boundary === "polynomial" ? `nf=nfinit(${field.pariPolynomial});` : "";
  const code = `setrand(${seed});${preparation}b=bnfinit(nf,0);` +
    "print([nf.disc,b.no,Vecrev(b.clgp[2])])";
  const start = performance.now();
  const line = await gp.query(code);
  const elapsed = Math.round((performance.now() - start) * 1_000_000);
  let result;
  try { result = JSON.parse(line); }
  catch { throw new Error(`PARI returned non-JSON output: ${line}`); }
  if (!Array.isArray(result) || result.length !== 3 ||
      result[0] !== field.expected.discriminant ||
      result[1] !== field.expected.classNumber ||
      JSON.stringify(result[2]) !== JSON.stringify(field.expected.invariantFactors)) {
    throw new Error(`wrong PARI answer for ${field.id}: ${line}`);
  }
  return elapsed;
}

async function main() {
  const { createSage } = require(path.join(root, "dist/tools/kernel.js"));
  const options = parseArguments(process.argv.slice(2));
  const service = process.env.SAGEJS_CLASS_GROUP_SERVICE;
  if (!service || !path.isAbsolute(service) || !fs.existsSync(service)) {
    throw new Error("set SAGEJS_CLASS_GROUP_SERVICE to the built native service path");
  }
  const pari = verifyPariIdentity();
  const gp = new ResidentGp(pari.executable);
  let sage;
  const results = [];
  try {
    sage = await createSage();
    const version = JSON.parse(await gp.query("print(version())"));
    if (JSON.stringify(version) !== "[2,17,4]") throw new Error("unexpected PARI version");
    const policy = JSON.parse(await gp.query(
      "default(realbitprecision,192);default(nbthreads,1);" +
      "print([default(realbitprecision),default(nbthreads)])",
    ));
    if (JSON.stringify(policy) !== "[192,1]") {
      throw new Error("PARI precision or thread policy was not applied");
    }
    await sage.evaluate("R.<x> = QQ[]");
    for (const [fieldIndex, field] of panel.fields.entries()) {
      if (options.fieldId !== undefined && field.id !== options.fieldId) continue;
      process.stderr.write(`measuring ${field.id} (${options.boundary})\n`);
      if (options.boundary === "prepared") {
        await sage.evaluate(`K.<a> = NumberField(${field.pariPolynomial})`);
        const discriminant = Number(await gp.query(
          `nf=nfinit(${field.pariPolynomial});print(nf.disc)`,
        ));
        if (discriminant !== field.expected.discriminant) {
          throw new Error(`wrong prepared PARI discriminant for ${field.id}`);
        }
      }
      await timeSage(sage, field, options.boundary);
      await timePari(gp, field, fieldIndex, 0, options.boundary);
      const sageNanoseconds = [];
      const pariNanoseconds = [];
      for (let sample = 0; sample < options.samples; sample += 1) {
        const order = sample % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"];
        for (const arm of order) {
          if (arm === "sagejs") {
            sageNanoseconds.push(await timeSage(sage, field, options.boundary));
          } else {
            pariNanoseconds.push(await timePari(gp, field, fieldIndex, sample + 1, options.boundary));
          }
        }
      }
      const sageMedianNanoseconds = median(sageNanoseconds);
      const pariMedianNanoseconds = median(pariNanoseconds);
      results.push({
        fieldId: field.id,
        expected: field.expected,
        sageNanoseconds,
        pariNanoseconds,
        sageMedianNanoseconds,
        pariMedianNanoseconds,
        sageOverPariMedianRatio: sageMedianNanoseconds / pariMedianNanoseconds,
      });
      process.stderr.write(`${JSON.stringify(results.at(-1))}\n`);
    }
  } finally {
    if (sage !== undefined) await sage.close();
    await gp.close();
  }
  const output = {
    schema: "sagejs.public-quadratic/public-sagejs-pari-diagnostic-v1",
    promotedPerformanceReceipt: false,
    panelSchema: panel.schema,
    panelSha256: sha256(path.join(__dirname, "panel-v2.json")),
    boundary: options.boundary === "polynomial"
      ? "warm-resident-polynomial-to-public-class-group-and-projection-v1"
      : "warm-resident-prepared-field-to-public-class-group-and-projection-v1",
    caveat: "Both arms include interpreter evaluation and exact result projection. Sage.js additionally authenticates and retains a complete ideal-class map; PARI computes rank-zero units and regulator but does not project a complete map. Resident Node/Sage.js and GP have different IPC costs. This diagnostic is not the promoted matched native receipt.",
    samplesPerArmPerField: options.samples,
    runnerSha256: sha256(__filename),
    sageBuildReceiptSha256: sha256(path.join(root, "dist/build-receipt.json")),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: os.cpus()[0]?.model,
    loadAverage1m5m15m: os.loadavg(),
    serviceSha256: sha256(service),
    pariGpSha256: pari.executableSha256,
    pariLibrarySha256: pari.librarySha256,
    pariPrecisionBits: 192,
    pariThreads: 1,
    results,
  };
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (options.receipt !== undefined) {
    fs.writeFileSync(path.join(__dirname, options.receipt), text);
  }
  process.stdout.write(text);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  median,
  expectedSage,
  sha256,
  verifyPariIdentity,
  ResidentGp,
  timePari,
};
