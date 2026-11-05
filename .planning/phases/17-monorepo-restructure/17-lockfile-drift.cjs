"use strict";
// Phase 17 D-10 gate: compares the resolved versions in two bun.lock files.
//
// Usage: node 17-lockfile-drift.cjs <before.lock> <after.lock> [closureRoot]
//
// For every package name, it compares the set of versions present in each lockfile, ignoring where a version is
// hoisted (Bun may move a version between the top level and a nested path without changing what any consumer gets).
// A changed version set is "intended" when the name is reachable from closureRoot through dependencies or
// optionalDependencies in either lockfile (peers are not followed, so a peer such as vitest does not pull the whole
// tree into the allowed set). Every other change is drift, and the script exits 1.
//
// Without closureRoot, any change other than a new workspace entry is drift.
const fs = require("node:fs");

// bun.lock is JSON with trailing commas; integrity strings and specifiers never contain ",}" or ",]".
const parseLock = (path) => JSON.parse(fs.readFileSync(path, "utf8").replace(/,(\s*[}\]])/g, "$1"));

const indexByName = (lock) => {
    const byName = new Map();
    for (const entry of Object.values(lock.packages)) {
        const id = entry[0];
        const at = id.lastIndexOf("@");
        const name = id.slice(0, at);
        const meta = entry[2] !== null && typeof entry[2] === "object" ? entry[2] : {};
        const deps = Object.keys({ ...(meta.dependencies || {}), ...(meta.optionalDependencies || {}) });
        if (!byName.has(name)) {
            byName.set(name, { versions: new Set(), deps: new Set() });
        }
        const record = byName.get(name);
        record.versions.add(id.slice(at + 1));
        for (const dep of deps) {
            record.deps.add(dep);
        }
    }
    return byName;
};

const closureOf = (index, root) => {
    const seen = new Set();
    const stack = [root];
    while (stack.length > 0) {
        const name = stack.pop();
        if (seen.has(name) || !index.has(name)) {
            continue;
        }
        seen.add(name);
        for (const dep of index.get(name).deps) {
            stack.push(dep);
        }
    }
    return seen;
};

const [beforePath, afterPath, closureRoot] = process.argv.slice(2);
if (!beforePath || !afterPath) {
    console.error("usage: node 17-lockfile-drift.cjs <before.lock> <after.lock> [closureRoot]");
    process.exit(2);
}

const before = indexByName(parseLock(beforePath));
const after = indexByName(parseLock(afterPath));
const allowed = closureRoot ? new Set([...closureOf(before, closureRoot), ...closureOf(after, closureRoot)]) : new Set();

const intended = [];
const drift = [];
const workspaces = [];
for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const was = [...(before.get(name)?.versions || [])].sort().join(",");
    const now = [...(after.get(name)?.versions || [])].sort().join(",");
    if (was === now) {
        continue;
    }
    const line = `${name}: [${was}] -> [${now}]`;
    if (now.startsWith("workspace:") || was.startsWith("workspace:")) {
        workspaces.push(line);
    } else if (allowed.has(name)) {
        intended.push(line);
    } else {
        drift.push(line);
    }
}

console.log(`workspace entries:\n  ${workspaces.join("\n  ") || "none"}`);
console.log(`intended (closure of ${closureRoot || "none"}):\n  ${intended.join("\n  ") || "none"}`);
console.log(`DRIFT:\n  ${drift.join("\n  ") || "none"}`);
process.exit(drift.length > 0 ? 1 : 0);
