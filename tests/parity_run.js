// node tests/parity_run.js inputs.jsonl > outputs.jsonl
const fs = require("fs");
const path = require("path");
const M = JSON.parse(fs.readFileSync(path.join(__dirname, "../web/model/campusguard-model.json"), "utf8"));
const E = require("../web/js/campusguard-engine.js");
const cg = E.create(M);
const lines = fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const out = [];
for (const l of lines) {
  const x = JSON.parse(l);
  const r = cg.analyze(x.text, x.sender);
  delete r.trace; delete r.latency_ms;
  out.push(JSON.stringify(r));
}
fs.writeFileSync(process.argv[3], out.join("\n"));
