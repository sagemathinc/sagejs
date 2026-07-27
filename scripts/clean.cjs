"use strict";

const { rmSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
rmSync(join(root, "dist"), { recursive: true, force: true });
rmSync(join(root, "tsconfig.tsbuildinfo"), { force: true });
