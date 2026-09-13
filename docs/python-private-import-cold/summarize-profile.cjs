// Read-only aggregation. Inclusive rows overlap; never sum across functions.
const fs = require('fs');
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map();
const totals = new Map();
for (const node of profile.nodes) {
    for (const child of node.children || []) parents.set(child, node.id);
}
function key(id) {
    const frame = nodes.get(id).callFrame;
    return `${frame.functionName}@${frame.url}:${frame.lineNumber + 1}`;
}
function add(name, field, duration) {
    const row = totals.get(name) || { self: 0, inclusive: 0 };
    row[field] += duration;
    totals.set(name, row);
}
for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i];
    const duration = profile.timeDeltas[i];
    add(key(id), 'self', duration);
    const seen = new Set();
    while (id) {
        seen.add(key(id));
        id = parents.get(id);
    }
    for (const name of seen) add(name, 'inclusive', duration);
}
console.log(JSON.stringify({
    sampledSeconds: profile.timeDeltas.reduce((a, b) => a + b, 0) / 1e6,
    rows: [...totals].sort((a, b) => b[1].self - a[1].self).map(([name, row]) => ({
        name, selfSeconds: row.self / 1e6, inclusiveSeconds: row.inclusive / 1e6,
    })),
}, null, 2));
