"use strict";

const base = require("./row0_phase6_pari_prepared_adapter.cjs");
const ROW = 4;

module.exports = {
  ROW,
  SPECIFICATION: base.ROWS[ROW],
  buildHelper() { return base.buildHelper(ROW); },
  HelperClient: class Row4PariPhase6Client extends base.HelperClient {
    constructor(build = base.buildHelper(ROW)) { super(ROW, build); }
  },
  validateProjection(value) { return base.validateProjection(ROW, value); },
};
