// Vistas tests. Zero dependencies: `node test/run-tests.js`
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', 'vistas.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + extra : '')); }
}
function fnv(s) { let a = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619) >>> 0; } return a.toString(16); }
function rnd(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
function addr(r) { let s = '0x'; for (let i = 0; i < 40; i++) s += Math.floor(r() * 16).toString(16); return s; }

// 1. Frozen output: vistas-v1 must draw exactly these pictures forever.
const GOLDEN = {
  '0x7c1f5120b22ce1fc0e7972e68f322d40b49578ad': 'a5d3a5aa',
  '7hz3VY14vs9YGFEdUSyfWihLS5fa5xDFmk2yUSyBSUBK': '86843d7e',
  'vistas': 'a1eae5e4',
  '': '6fc5b87c'
};
for (const k in GOLDEN) ok(fnv(V.svg(k)) === GOLDEN[k], 'golden ' + JSON.stringify(k), fnv(V.svg(k)));
ok(V.version === 'vistas-v1', 'version string');

// 2. Determinism
ok(V.svg('0xabc') === V.svg('0xabc'), 'same input, same svg');
ok(JSON.stringify(V.describe('hello')) === JSON.stringify(V.describe('hello')), 'same input, same description');

// 3. Normalisation
const cs = '0x7C1F5120B22ce1Fc0E7972e68F322d40B49578aD';
ok(V.svg(cs) === V.svg(cs.toLowerCase()), 'EVM checksum casing ignored');
ok(V.svg('  ' + cs + '\n') === V.svg(cs), 'whitespace trimmed');
ok(V.normalize('BC1QJ7G7PG6MQCNA5NSGS6XJXR6HWC62S839U2UESD') === 'bc1qj7g7pg6mqcna5nsgs6xjxr6hwc62s839u2uesd', 'bech32 lowercased');
ok(V.normalize('Vitalik.ETH') === 'vitalik.eth', 'ENS lowercased');
ok(V.svg('7hz3VY14vs9YGFEdUSyfWihLS5fa5xDFmk2yUSyBSUBK') !== V.svg('7hz3vy14vs9ygfedusyfwihls5fa5xdfmk2yusybsubk'), 'Solana stays case-sensitive');
ok(V.normalize(null) === '' && V.normalize(undefined) === '', 'null/undefined -> empty string');
ok(V.normalize(12345) === '12345', 'numbers become strings');

// 4. Look-alikes get different pictures (the address-poisoning case)
const a1 = '0x7c1f5120b22ce1fc0e7972e68f322d40b49578ad';
const a2 = '0x7c1f9999b22ce1fc0e7972e68f322d40b49578ad';
ok(V.svg(a1) !== V.svg(a2), 'look-alike differs');
const d1 = V.describe(a1), d2 = V.describe(a2);
ok(d1.name !== d2.name || d1.palette !== d2.palette || d1.terrain !== d2.terrain, 'look-alike differs in description');

// 5. Bulk: well-formed, finite, varied, fast
const r = rnd(42), N = 2000, moods = {}, terrains = {}, cel = {}, names = new Set(), svgs = new Set();
let bad = 0, maxLen = 0, unbalanced = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const a = addr(r), s = V.svg(a), d = V.describe(a);
  if (/NaN|undefined|Infinity|null/.test(s)) bad++;
  const open = (s.match(/<[a-zA-Z]/g) || []).length, close = (s.match(/<\/[a-zA-Z]/g) || []).length, self = (s.match(/\/>/g) || []).length;
  if (open !== close + self) unbalanced++;
  maxLen = Math.max(maxLen, s.length);
  moods[d.mood] = (moods[d.mood] || 0) + 1; terrains[d.terrain] = (terrains[d.terrain] || 0) + 1; cel[d.celestial] = (cel[d.celestial] || 0) + 1;
  names.add(d.name); svgs.add(s);
}
const ms = Date.now() - t0;
ok(bad === 0, 'no NaN/undefined/Infinity in output', bad);
ok(unbalanced === 0, 'tags balanced', unbalanced);
ok(maxLen < 12000, 'svg stays small (<12 KB)', maxLen);
ok(svgs.size === N, 'all outputs distinct', svgs.size);
ok(Object.keys(moods).length === 4, 'all 4 moods appear', JSON.stringify(moods));
ok(Object.keys(terrains).length === 5, 'all 5 terrains appear', JSON.stringify(terrains));
ok(Object.keys(cel).length === 5, 'all 5 celestial bodies appear', JSON.stringify(cel));
ok(Math.abs(moods.dusk / N - 0.28) < 0.04 && Math.abs(moods.night / N - 0.22) < 0.04, 'mood weights roughly as designed', JSON.stringify(moods));
ok(names.size > 150, 'many distinct names', names.size);
ok(ms < 4000, '2000 renders in under 4 s', ms + ' ms');

// 6. Options
ok(/width="64" height="64"/.test(V.svg('x', { size: 64 })), 'size option');
const rootTag = s => s.slice(0, s.indexOf('>') + 1);
ok(!/ width=/.test(rootTag(V.svg('x', { size: 'auto' }))) && !/ width=/.test(rootTag(V.svg('x', { size: null }))), 'auto size omits width/height');
ok(/width="128"/.test(V.svg('x')), 'default size 128');
ok(/<clipPath id="[^"]+"><circle cx="50" cy="50" r="50"\/>/.test(V.svg('x', { shape: 'circle' })), 'circle shape');
ok(/rx="18"/.test(V.svg('x', { shape: 'rounded' })), 'rounded shape');
ok(!/clipPath/.test(V.svg('x', { shape: 'square' })) && !/clipPath/.test(V.svg('x', { shape: 'bogus' })), 'square / unknown shape has no clip');
const idOf = s => (s.match(/id="([a-z0-9]+?)[kmwfc]"/) || [])[1];
ok(idOf(V.svg('x', { shape: 'circle' })) !== idOf(V.svg('x', { shape: 'rounded' })), 'ids differ per shape (same address twice on a page)');
ok(idOf(V.svg('x')) !== idOf(V.svg('y')), 'ids differ per address');
ok(!/<title>/.test(V.svg('x', { title: false })) && /<title>Vista: /.test(V.svg('x')), 'title option');
ok(V.dataUri('x').indexOf('data:image/svg+xml;charset=utf-8,') === 0, 'dataUri prefix');
ok(decodeURIComponent(V.dataUri('x', { size: 40 }).split(',')[1]) === V.svg('x', { size: 40 }), 'dataUri round-trips');

// 7. Hostile input never reaches the markup
const evil = '<script>alert(1)</script>" onload="x';
const es = V.svg(evil);
ok(es.indexOf('<script') === -1 && es.indexOf('onload') === -1, 'input text never echoed into svg');
ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(V.describe(evil).name), 'name comes from word lists only');

// 8. hydrate() with a tiny fake DOM
function el(tag, attrs) {
  return { tagName: tag, attrs: attrs, innerHTML: '', src: '', alt: '', getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } };
}
const els = [el('DIV', { 'data-vista': '0xabc', 'data-vista-size': '40', 'data-vista-shape': 'circle' }), el('IMG', { 'data-vista': '0xabc' }), el('SPAN', { 'data-vista': '' })];
const fakeRoot = { querySelectorAll(sel) { return sel === '[data-vista]' ? els : []; } };
ok(V.hydrate(fakeRoot) === 3, 'hydrate counts elements');
ok(els[0].innerHTML === V.svg('0xabc', { size: 40, shape: 'circle' }), 'hydrate div -> inline svg');
ok(els[1].src.indexOf('data:image/svg+xml') === 0 && /^Vista: /.test(els[1].alt), 'hydrate img -> data uri + alt');
ok(V.hydrate({}) === 0, 'hydrate on non-DOM is a no-op');

console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed (' + ms + ' ms for ' + N + ' renders)');
process.exit(fail ? 1 : 0);
