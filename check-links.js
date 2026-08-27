#!/usr/bin/env node
/**
 * ProgressScape — data link integrity check
 * Run before committing any data edit:  node tools/check-links.js
 *
 * Verifies:
 *   1. SPINE_DATA `order` values are unique          (order = permanent ID)
 *   2. Every *Id field resolves to a real entry
 *   3. Every *Id points at an entry whose name matches the label beside it
 *      -> this is what catches a MISTYPED ID, which a bare ID cannot
 *   4. Near-miss orphans: a name with no match that closely resembles a spine
 *      entry is almost always a rename that did not propagate
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2] || '.';
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

const s = {}; vm.createContext(s);
vm.runInContext(
  read('data.js') + '\n' + read('ironman_data.js') + '\n' + read('boss_data.js') + '\n' +
  read('ca_data.js') + '\n' + read('clog_data.js') + '\n' +
  'this.S=SPINE_DATA;this.IM=IRONMAN_DATA;this.B=BOSS_DATA;this.C=CA_DATA;this.L=CLOG_DATA;', s);

const { S, IM, B, C, L } = s;
let errors = 0, warnings = 0;
const err  = m => { console.error('  ✗ ' + m); errors++; };
const warn = m => { console.warn ('  ! ' + m); warnings++; };

const byId   = new Map(S.map(e => [e.order, e]));
const names  = new Set(S.map(e => e.name));
const norm   = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
const normMap = new Map(S.map(e => [norm(e.name), e.name]));

console.log('\n1. SPINE_DATA identity');
if (byId.size !== S.length) {
  const seen = new Set();
  S.forEach(e => { if (seen.has(e.order)) err(`duplicate id ${e.order}: ${e.name}`); seen.add(e.order); });
} else console.log(`  ✓ ${S.length} entries, ${byId.size} unique ids`);

console.log('\n2 & 3. ID references resolve and agree with their labels');
function checkRefs(rows, label, idField, nameField) {
  let bad = 0, nulls = 0;
  rows.forEach((r, i) => {
    const id = r[idField];
    if (id === null || id === undefined) { nulls++; return; }
    const target = byId.get(id);
    if (!target) { err(`${label}[${i}] ${idField}=${id} resolves to nothing`); bad++; return; }
    if (nameField && r[nameField] && target.name !== r[nameField]) {
      err(`${label}[${i}] ${idField}=${id} is "${target.name}" but ${nameField} says "${r[nameField]}" — mistyped id?`);
      bad++;
    }
  });
  if (!bad) console.log(`  ✓ ${label}.${idField}: ${rows.length - nulls} linked, ${nulls} null (ok), 0 mismatched`);
}
checkRefs(C, 'CA_DATA', 'spineId', 'spineMatch');
checkRefs(C, 'CA_DATA', 'bossId', 'boss');
checkRefs(L, 'CLOG_DATA', 'sourceId', 'source');
checkRefs(Object.entries(B).map(([name, v]) => ({ ...v, __key: name })), 'BOSS_DATA', 'spineId', '__key');

console.log('\n4. Near-miss orphans (likely un-propagated renames)');
function nearMiss(values, label) {
  [...new Set(values.filter(Boolean))].filter(n => !names.has(n)).forEach(o => {
    const exact = normMap.get(norm(o));
    if (exact) err(`${label}: "${o}" differs only in case/punctuation from "${exact}"`);
    else {
      const cand = S.map(e => e.name).filter(n => {
        const a = norm(n), b = norm(o);
        return (a.includes(b) || b.includes(a)) && Math.abs(a.length - b.length) <= 14;
      });
      if (cand.length) warn(`${label}: "${o}" resembles ${cand.slice(0, 2).map(x => `"${x}"`).join(', ')} — intentional?`);
    }
  });
}
nearMiss(IM.map(e => e.name), 'IRONMAN_DATA');
nearMiss(Object.keys(B), 'BOSS_DATA');
nearMiss(C.map(e => e.spineMatch), 'CA_DATA.spineMatch');
nearMiss(L.map(e => e.source), 'CLOG_DATA.source');
if (!errors && !warnings) console.log('  ✓ none');

console.log('\n5. IRONMAN_DATA coverage');
const imNames = new Set(IM.map(e => e.name));
IM.filter(e => !names.has(e.name)).forEach(e => err(`IRONMAN_DATA "${e.name}" has no spine entry — row is silently dropped`));
const invisible = S.filter(e => !imNames.has(e.name));
if (invisible.length) warn(`${invisible.length} spine entries never appear in Ironman mode: ` +
  invisible.slice(0, 5).map(e => e.name).join(', ') + (invisible.length > 5 ? ' …' : ''));
else console.log('  ✓ every spine entry appears in the Ironman route');

console.log(`\n${errors} error(s), ${warnings} warning(s)\n`);
process.exit(errors ? 1 : 0);
