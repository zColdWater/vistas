/*!
 * Vistas v1 - every address is a place.
 * Deterministic landscape identicons for wallet addresses (or any string).
 * Zero dependencies. Runs in browsers and Node. MIT licensed.
 * Made by Mira, an AI generative-artist agent.
 *
 *   Vistas.svg(input, { size: 128, shape: 'square' | 'rounded' | 'circle', title: true }) -> SVG string
 *   Vistas.dataUri(input, opts)  -> "data:image/svg+xml;charset=utf-8,..." for <img src>
 *   Vistas.describe(input)       -> { name, mood, terrain, celestial, palette, input }
 *   Vistas.normalize(input)      -> the exact string that seeds the picture
 *   Vistas.hydrate(root)         -> fills every element that has a data-vista="..." attribute
 *
 * The algorithm is frozen as "vistas-v1": the same input draws the same picture forever.
 * Only + - * / and lookup tables are used for geometry (no trig), so every JS engine agrees.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vistas = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 'vistas-v1';

  // ---------- deterministic randomness ----------
  function cyrb128(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var s = cyrb128(seed), r = sfc32(s[0], s[1], s[2], s[3]);
    for (var i = 0; i < 12; i++) r();
    return r;
  }
  function range(r, a, b) { return a + (b - a) * r(); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function weighted(r, table) { // [[value, weight], ...]
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i][1];
    var x = r() * total;
    for (i = 0; i < table.length; i++) { x -= table[i][1]; if (x < 0) return table[i][0]; }
    return table[table.length - 1][0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // ---------- 1D value noise (table based) ----------
  function makeNoise(r) {
    var v = new Array(257);
    for (var i = 0; i < 256; i++) v[i] = r() * 2 - 1;
    v[256] = v[0];
    function n1(x) {
      var X = Math.floor(x), t = x - X, i = ((X % 256) + 256) % 256;
      var f = t * t * t * (t * (t * 6 - 15) + 10);
      return v[i] + (v[i + 1] - v[i]) * f;
    }
    function fbm(x, oct) {
      var s = 0, a = 1, f = 1, n = 0;
      for (var o = 0; o < oct; o++) { s += a * n1(x * f + o * 31.7); n += a; a *= 0.5; f *= 2; }
      return s / n;
    }
    return { n1: n1, fbm: fbm };
  }

  // ---------- colour ----------
  function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgbToHex(c) {
    var s = '#';
    for (var i = 0; i < 3; i++) { var v = clamp(Math.round(c[i]), 0, 255); s += (v < 16 ? '0' : '') + v.toString(16); }
    return s;
  }
  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
  }
  function rotateHue(hex, deg) {
    var c = hexToRgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    h = (h + deg + 360) % 360;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) return hex.toLowerCase();
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hh = h / 360;
    return rgbToHex([hue2rgb(p, q, hh + 1 / 3) * 255, hue2rgb(p, q, hh) * 255, hue2rgb(p, q, hh - 1 / 3) * 255]);
  }

  // ---------- palettes: sky [top, horizon], celestial body, far ridge, near ground ----------
  var PALETTES = {
    dawn: [
      { name: 'Peach Fog', sky: ['#f3cbb8', '#fbeee2'], sun: '#ef7f5f', far: '#e2b0a0', near: '#584459' },
      { name: 'Linen Rose', sky: ['#e3bfcc', '#f8e9e1'], sun: '#fff6e6', far: '#cf9fb0', near: '#463750' },
      { name: 'First Light', sky: ['#b7cfe4', '#f6e2cc'], sun: '#f6a85c', far: '#a3b8cd', near: '#2c3d56' },
      { name: 'Mist Orchard', sky: ['#d2e0cb', '#f5efdf'], sun: '#f2b866', far: '#b3c7ab', near: '#37503f' },
      { name: 'Lavender Tide', sky: ['#c4bde4', '#f4e0e2'], sun: '#ffcf96', far: '#ada4d3', near: '#38305e' },
      { name: 'Apricot Salt', sky: ['#f1c194', '#fbe7cd'], sun: '#fffaf2', far: '#dda57c', near: '#673b2b' }
    ],
    day: [
      { name: 'Riso Meadow', sky: ['#86bee6', '#e4f2f6'], sun: '#ffc93c', far: '#98bf9f', near: '#1d5a37' },
      { name: 'Citrus Coast', sky: ['#74c3c4', '#ebf6ef'], sun: '#ff8a3d', far: '#a2d1b4', near: '#20525d' },
      { name: 'Bauhaus Noon', sky: ['#efe3c6', '#f8f3e6'], sun: '#d7263d', far: '#79b2ba', near: '#1b2a41' },
      { name: 'Paper Sky', sky: ['#b2d4ef', '#f5f1e8'], sun: '#f2c000', far: '#c4b49e', near: '#3b3733' },
      { name: 'Highland', sky: ['#92cdd1', '#f0f7f4'], sun: '#fffbe8', far: '#82a66f', near: '#2a3c1d' },
      { name: 'Mint Ledger', sky: ['#c6eadf', '#f7fbf6'], sun: '#ff6b55', far: '#8fc5b0', near: '#22413e' }
    ],
    dusk: [
      { name: 'Ember Tide', sky: ['#2b1b3d', '#f08a5d'], sun: '#ffd166', far: '#b4564a', near: '#1c1218' },
      { name: 'Violet Hour', sky: ['#3a2a5c', '#e9899f'], sun: '#ffe2a8', far: '#87599a', near: '#1d1430' },
      { name: 'Rust Meridian', sky: ['#55302b', '#f2a65a'], sun: '#fff2c6', far: '#a5533d', near: '#2a1410' },
      { name: 'Coral Smoke', sky: ['#45345b', '#ff9b77'], sun: '#fff4d8', far: '#bd6a82', near: '#2a1e33' },
      { name: 'Amber Harbor', sky: ['#1f3b57', '#f4a259'], sun: '#ffdd8a', far: '#5a6e89', near: '#121e2c' },
      { name: 'Plum Wine', sky: ['#2e1a2f', '#d8657a'], sun: '#ffc9a3', far: '#7b3a5b', near: '#160d17' }
    ],
    night: [
      { name: 'Ink Garden', sky: ['#0b1020', '#26365a'], sun: '#ece6d4', far: '#30476a', near: '#05070d' },
      { name: 'Moon Salt', sky: ['#111827', '#2f3c5e'], sun: '#f4f1e6', far: '#3c4d6e', near: '#080b14' },
      { name: 'Deep Kelp', sky: ['#06141a', '#14423f'], sun: '#d8ebd0', far: '#20595a', near: '#030a0c' },
      { name: 'Aurora', sky: ['#071a24', '#1f5d5b'], sun: '#bdf3da', far: '#25605c', near: '#04100f', aurora: true },
      { name: 'Velvet', sky: ['#140c24', '#3b2b60'], sun: '#f6dcff', far: '#403068', near: '#0a0614' },
      { name: 'Lantern', sky: ['#0f0f14', '#2c2432'], sun: '#ffcf6b', far: '#3b3242', near: '#070608' }
    ]
  };

  var ADJ = {
    dawn: ['Pale', 'Tender', 'Hushed', 'Rose', 'Early', 'Misted', 'Faint', 'Linen'],
    day: ['Bright', 'Open', 'Salt', 'Clear', 'Paper', 'Green', 'Wide', 'Lucid'],
    dusk: ['Amber', 'Ember', 'Velvet', 'Molten', 'Copper', 'Late', 'Gilded', 'Smoked'],
    night: ['Silent', 'Ink', 'Hollow', 'Distant', 'Starlit', 'Cold', 'Deep', 'Lantern']
  };
  var NOUN = {
    hills: ['Downs', 'Fells', 'Hollows', 'Meadows', 'Rises', 'Wolds'],
    peaks: ['Ridge', 'Range', 'Spires', 'Crags', 'Summit', 'Divide'],
    dunes: ['Dunes', 'Erg', 'Drifts', 'Sands', 'Barrens', 'Ripples'],
    mesas: ['Mesas', 'Buttes', 'Tables', 'Bluffs', 'Benches', 'Steps'],
    isles: ['Isles', 'Shoals', 'Archipelago', 'Atolls', 'Skerries', 'Keys']
  };
  var CELESTIAL = {
    dawn: [['sun', 50], ['halo', 30], ['ringed', 10], ['eclipse', 10]],
    day: [['sun', 50], ['halo', 30], ['ringed', 10], ['eclipse', 10]],
    dusk: [['sun', 45], ['halo', 25], ['crescent', 10], ['ringed', 10], ['eclipse', 10]],
    night: [['crescent', 45], ['sun', 30], ['ringed', 15], ['eclipse', 10]]
  };
  var CELESTIAL_LABEL = { sun: 'sun', halo: 'haloed sun', crescent: 'crescent moon', ringed: 'ringed planet', eclipse: 'eclipse' };

  // ---------- input ----------
  function normalize(input) {
    var s = String(input == null ? '' : input).trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase();          // EVM: checksum case is not identity
    if (/^(bc1|tb1|bcrt1)[0-9a-zA-Z]{6,}$/i.test(s)) return s.toLowerCase(); // bech32 is case-insensitive
    if (/\.eth$/i.test(s)) return s.toLowerCase();                        // ENS names
    return s;                                                             // Solana, base58, anything else: as is
  }

  // ---------- parameters ----------
  function params(input) {
    var norm = normalize(input);
    var r = makeRng(VERSION + ':' + norm);
    var mood = weighted(r, [['dawn', 22], ['day', 28], ['dusk', 28], ['night', 22]]);
    var base = pick(r, PALETTES[mood]);
    var shift = range(r, -14, 14);
    var pal = {
      name: base.name,
      sky: [rotateHue(base.sky[0], shift), rotateHue(base.sky[1], shift)],
      sun: rotateHue(base.sun, shift * 0.5),
      far: rotateHue(base.far, shift),
      near: rotateHue(base.near, shift),
      aurora: !!base.aurora
    };
    var terrain = weighted(r, [['hills', 28], ['peaks', 22], ['dunes', 16], ['mesas', 14], ['isles', 20]]);
    var celestial = weighted(r, CELESTIAL[mood]);
    var layers = weighted(r, [[3, 30], [4, 45], [5, 25]]);
    if (terrain === 'isles' && layers > 3) layers = 3;
    var name = pick(r, ADJ[mood]) + ' ' + pick(r, NOUN[terrain]);
    var h = cyrb128('id:' + norm);
    return {
      input: norm, rng: r, noise: makeNoise(r), mood: mood, pal: pal, terrain: terrain,
      celestial: celestial, layers: layers, name: name, id: 'vs' + h[0].toString(16)
    };
  }

  function describe(input) {
    var P = params(input);
    return {
      name: P.name, mood: P.mood, terrain: P.terrain, celestial: CELESTIAL_LABEL[P.celestial],
      layers: P.layers, palette: P.pal.name, colors: { sky: P.pal.sky.slice(), sun: P.pal.sun, far: P.pal.far, near: P.pal.near },
      input: P.input, version: VERSION
    };
  }

  // ---------- drawing helpers ----------
  function n2(v) { return String(Math.round(v * 100) / 100); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function ridge(P, i, n, baseY, amp, freq, off) {
    var nz = P.noise, t = P.terrain, pts = [];
    var thresh = i === 0 ? -0.25 : range(P.rng, -0.12, 0.12);
    var k = range(P.rng, 0.62, 0.8);
    for (var x = -2; x <= 102; x += 1) {
      var u = x * freq + off, hgt;
      if (t === 'hills') hgt = nz.fbm(u, 3) * 0.5 + 0.5;
      else if (t === 'peaks') {
        var rr = 1 - Math.abs(nz.n1(u));
        hgt = clamp(rr * rr * 0.8 + (nz.fbm(u * 2.7 + 9, 2) * 0.5 + 0.5) * 0.28, 0, 1.1);
      } else if (t === 'dunes') {
        var s = u * 0.5 + 0.3 * nz.n1(u * 0.5 + 4);
        s = s - Math.floor(s);
        var p = s < k ? s / k : smooth((1 - s) / (1 - k));
        hgt = (p * p * 0.55 + p * 0.45) * (0.6 + 0.4 * (nz.n1(u * 0.25 + 2) * 0.5 + 0.5));
      } else if (t === 'mesas') {
        var q = (nz.fbm(u, 2) * 0.5 + 0.5) * 3.2, fl = Math.floor(q), tt = q - fl;
        var step = tt < 0.72 ? 0 : smooth((tt - 0.72) / 0.28);
        hgt = (fl + step) / 3.2;
      } else { // isles
        var vv = nz.fbm(u, 3);
        hgt = Math.max(0, vv - thresh) / (1 - thresh);
      }
      pts.push([x, baseY - hgt * amp]);
    }
    return pts;
  }
  function closedPath(pts, bottom) {
    var s = 'M-2 ' + n2(bottom) + 'L' + n2(pts[0][0]) + ' ' + n2(pts[0][1]);
    for (var i = 1; i < pts.length; i++) s += 'L' + n2(pts[i][0]) + ' ' + n2(pts[i][1]);
    return s + 'L102 ' + n2(bottom) + 'Z';
  }

  // ---------- render ----------
  function render(input, opts) {
    opts = opts || {};
    var P = params(input), r = P.rng, pal = P.pal, out = [], defs = [];
    var shape = opts.shape === 'circle' || opts.shape === 'rounded' ? opts.shape : 'square';
    var id = P.id + shape.charAt(0);
    var isles = P.terrain === 'isles';
    var night = P.mood === 'night', dusk = P.mood === 'dusk';

    // layout
    var waterY = isles ? range(r, 62, 72) : 101;
    var firstBase = isles ? waterY : range(r, 50, 62);
    var lastBase = isles ? waterY : range(r, 84, 92);
    var ampFar = { hills: 15, peaks: 30, dunes: 12, mesas: 24, isles: 21 }[P.terrain] * range(r, 0.8, 1.2);
    var freq0 = { hills: 0.022, peaks: 0.03, dunes: 0.032, mesas: 0.02, isles: 0.03 }[P.terrain] * range(r, 0.8, 1.25);

    // sky
    defs.push('<linearGradient id="' + id + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.sky[0] + '"/><stop offset="1" stop-color="' + pal.sky[1] + '"/></linearGradient>');
    out.push('<rect width="100" height="100" fill="url(#' + id + 'k)"/>');

    // stars
    var starCount = night ? Math.floor(range(r, 12, 26)) : (dusk && r() < 0.35 ? Math.floor(range(r, 5, 10)) : 0);
    if (starCount) {
      var st = [];
      for (var s = 0; s < starCount; s++) {
        st.push('<circle cx="' + n2(range(r, 2, 98)) + '" cy="' + n2(range(r, 2, firstBase - 12)) + '" r="' + n2(range(r, 0.25, 0.75)) + '" opacity="' + n2(range(r, 0.35, 1)) + '"/>');
      }
      out.push('<g fill="' + mix(pal.sun, '#ffffff', 0.5) + '">' + st.join('') + '</g>');
    }

    // aurora ribbons
    if (night && (pal.aurora || r() < 0.22)) {
      var au = mix(pal.sun, pal.far, 0.25);
      for (var a = 0; a < 2; a++) {
        var ay = range(r, 14, 34), aoff = range(r, 0, 100), apts = [];
        for (var ax = -6; ax <= 106; ax += 4) apts.push([ax, ay + P.noise.fbm(ax * 0.035 + aoff, 2) * 9]);
        var ad = 'M' + n2(apts[0][0]) + ' ' + n2(apts[0][1]);
        for (var ai = 1; ai < apts.length; ai++) ad += 'L' + n2(apts[ai][0]) + ' ' + n2(apts[ai][1]);
        out.push('<path d="' + ad + '" fill="none" stroke="' + au + '" stroke-width="' + n2(range(r, 5, 9)) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + n2(range(r, 0.14, 0.26)) + '"/>');
      }
    }

    // celestial body
    var cr = range(r, 7, 12.5);
    var cx = range(r, 20, 80);
    var cy = range(r, Math.max(12, cr + 4), Math.max(cr + 6, firstBase - (isles ? 4 : 6)));
    var sun = pal.sun, C = P.celestial;
    // keep the whole body inside the inscribed circle, so circle avatars never cut it off
    var reach = C === 'ringed' ? cr * 1.9 : C === 'halo' ? cr * 1.3 : cr * 1.05, lim = 48 - reach;
    for (var guard = 0; guard < 80 && (cx - 50) * (cx - 50) + (cy - 50) * (cy - 50) > lim * lim; guard++) {
      cx = 50 + (cx - 50) * 0.95; cy = 50 + (cy - 50) * 0.95;
    }
    if (C === 'halo') {
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr * 2.3) + '" fill="' + sun + '" opacity="0.09"/>');
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr * 1.6) + '" fill="' + sun + '" opacity="0.18"/>');
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr) + '" fill="' + sun + '"/>');
    } else if (C === 'crescent') {
      var dir = r() < 0.5 ? -1 : 1;
      defs.push('<mask id="' + id + 'm"><rect width="100" height="100" fill="#fff"/><circle cx="' + n2(cx + dir * cr * 0.48) + '" cy="' + n2(cy - cr * 0.22) + '" r="' + n2(cr * 0.9) + '" fill="#000"/></mask>');
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr * 1.9) + '" fill="' + sun + '" opacity="0.07"/>');
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr) + '" fill="' + sun + '" mask="url(#' + id + 'm)"/>');
    } else if (C === 'ringed') {
      var ang = (r() < 0.5 ? -1 : 1) * range(r, 10, 26), rx = cr * 1.85, ry = cr * 0.46;
      var ring = mix(sun, pal.far, 0.35), rw = n2(cr * 0.16);
      var pr = cr * 0.82;
      out.push('<g transform="rotate(' + n2(ang) + ' ' + n2(cx) + ' ' + n2(cy) + ')">' +
        '<ellipse cx="' + n2(cx) + '" cy="' + n2(cy) + '" rx="' + n2(rx) + '" ry="' + n2(ry) + '" fill="none" stroke="' + ring + '" stroke-width="' + rw + '"/>' +
        '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(pr) + '" fill="' + sun + '"/>' +
        '<path d="M' + n2(cx - rx) + ' ' + n2(cy) + 'A' + n2(rx) + ' ' + n2(ry) + ' 0 0 0 ' + n2(cx + rx) + ' ' + n2(cy) + '" fill="none" stroke="' + ring + '" stroke-width="' + rw + '"/></g>');
    } else if (C === 'eclipse') {
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr * 1.55) + '" fill="' + sun + '" opacity="0.14"/>');
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr) + '" fill="' + mix(pal.sky[0], pal.near, 0.55) + '" stroke="' + sun + '" stroke-width="' + n2(cr * 0.14) + '"/>');
    } else {
      out.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(cr) + '" fill="' + sun + '"/>');
    }

    // birds (dawn / day)
    if ((P.mood === 'dawn' || P.mood === 'day') && r() < 0.35) {
      var bd = '', bc = Math.floor(range(r, 2, 4)), bx = range(r, 15, 75), by = range(r, 10, 30);
      for (var b = 0; b < bc; b++) {
        var x0 = bx + b * range(r, 3, 6), y0 = by + range(r, -3, 3), w = range(r, 1.1, 1.8);
        bd += 'M' + n2(x0 - w) + ' ' + n2(y0 - w * 0.35) + 'Q' + n2(x0 - w * 0.5) + ' ' + n2(y0 - w * 0.75) + ' ' + n2(x0) + ' ' + n2(y0) +
          'Q' + n2(x0 + w * 0.5) + ' ' + n2(y0 - w * 0.75) + ' ' + n2(x0 + w) + ' ' + n2(y0 - w * 0.35);
      }
      out.push('<path d="' + bd + '" fill="none" stroke="' + mix(pal.near, pal.sky[0], 0.25) + '" stroke-width="0.4" stroke-linecap="round"/>');
    }

    // water (isles)
    if (isles) {
      defs.push('<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(pal.sky[1], pal.near, 0.3) + '"/><stop offset="1" stop-color="' + mix(pal.sky[0], pal.near, 0.62) + '"/></linearGradient>');
      out.push('<rect y="' + n2(waterY) + '" width="100" height="' + n2(101 - waterY) + '" fill="url(#' + id + 'w)"/>');
      if (C !== 'eclipse') {
        var gl = [];
        for (var g = 0; g < 6; g++) {
          var gy = waterY + 2 + g * range(r, 2.6, 3.6), gw = cr * (1.3 - g * 0.16) * range(r, 0.8, 1.2);
          if (gy > 99 || gw <= 0.5) break;
          var jitter = range(r, -1.5, 1.5);
          gl.push('<path d="M' + n2(cx - gw + jitter) + ' ' + n2(gy) + 'H' + n2(cx + gw + jitter) + '" opacity="' + n2(0.7 - g * 0.1) + '"/>');
        }
        out.push('<g stroke="' + sun + '" stroke-width="0.9" stroke-linecap="round">' + gl.join('') + '</g>');
      }
    }

    // ridges, far to near
    var n = P.layers;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 1 : i / (n - 1);
      var baseY = isles ? waterY + 0.4 : lerp(firstBase, lastBase, t);
      var amp = ampFar * (isles ? lerp(1, 0.55, t) : lerp(1, 0.5, t));
      var farCol = night ? mix(pal.far, pal.sun, 0.1) : pal.far;
      var col = mix(mix(farCol, pal.sky[1], 0.18), pal.near, t * 0.85 + t * t * 0.15);
      var pts = ridge(P, i, n, baseY, amp, freq0 * (1 + i * 0.3), range(r, 0, 200));
      var bottom = isles ? waterY + 0.6 + (n - 1 - i) * 0.0 : 101;
      out.push('<path d="' + closedPath(pts, bottom) + '" fill="' + col + '"/>');
      if (P.mood === 'dawn' && i === 0 && !isles) {
        defs.push('<linearGradient id="' + id + 'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.sky[1] + '" stop-opacity="0"/><stop offset="0.62" stop-color="' + pal.sky[1] + '" stop-opacity="0.7"/><stop offset="1" stop-color="' + pal.sky[1] + '" stop-opacity="0"/></linearGradient>');
        out.push('<rect y="' + n2(baseY - amp * 0.6) + '" width="100" height="' + n2(amp * 0.6 + 6) + '" fill="url(#' + id + 'f)"/>');
      }
    }

    // frame
    var clip = '';
    if (shape === 'circle') { defs.push('<clipPath id="' + id + 'c"><circle cx="50" cy="50" r="50"/></clipPath>'); clip = ' clip-path="url(#' + id + 'c)"'; }
    else if (shape === 'rounded') { defs.push('<clipPath id="' + id + 'c"><rect width="100" height="100" rx="18"/></clipPath>'); clip = ' clip-path="url(#' + id + 'c)"'; }

    var size = opts.size === undefined ? 128 : opts.size;
    var dims = size === null || size === 'auto' ? '' : ' width="' + Number(size) + '" height="' + Number(size) + '"';
    var label = 'Vista: ' + P.name;
    var title = opts.title === false ? '' : '<title>' + esc(label) + '</title>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"' + dims + ' role="img" aria-label="' + esc(label) + '">' + title +
      '<defs>' + defs.join('') + '</defs><g' + clip + '>' + out.join('') + '</g></svg>';
  }

  function dataUri(input, opts) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(render(input, opts));
  }

  function hydrate(rootEl) {
    var scope = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return 0;
    var els = scope.querySelectorAll('[data-vista]'), count = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i], val = el.getAttribute('data-vista');
      var o = { size: el.getAttribute('data-vista-size') || 'auto', shape: el.getAttribute('data-vista-shape') || 'square' };
      if (o.size !== 'auto') o.size = Number(o.size) || 'auto';
      if (el.tagName === 'IMG') { el.src = dataUri(val, o); if (!el.alt) el.alt = 'Vista: ' + params(val).name; }
      else el.innerHTML = render(val, o);
      count++;
    }
    return count;
  }

  return { version: VERSION, svg: render, dataUri: dataUri, describe: describe, normalize: normalize, hydrate: hydrate };
}));
