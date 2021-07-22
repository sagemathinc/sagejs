module.exports = async (size = 536608768) => {
  const module = await require("./dist/gp-sta.js")({ noInitialRun: true });
  module.ccall("gp_embedded_init", null, ["number", "number"], [size, size]);
  return module.cwrap("gp_embedded", "string", ["string"]);
};
