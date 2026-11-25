// light-studio-card - one light on a card: brightness, presets, and CCT / HSI / FX tabs
// that appear only when the light supports them.
//
//   type: custom:light-studio-card
//   entity: light.office_lamp
//   name: Desk Lamp                        # optional
//   icon: mdi:desk-lamp                    # optional
//   subtitle: IKEA GULLSUDARE — E14 CWS    # optional, shown after the area
//   presets:                               # optional; defaults fit the light
//     - { name: Focus, brightness: 100, kelvin: 5000 }
//     - { name: Sunset, brightness: 90, color: [23, 95] }        # hue °, saturation %
//     - { name: Candle, brightness: 40, effect: Candle Flicker }
//
// A bulb exposed as several lights that are never on together (a white centre and a
// colour ring) goes in one card with `entities:` instead of `entity:`. Each tab drives
// the part that supports it, and moving to another part turns the lit one off.
//
//   entities: [light.office_center_lights, light.office_accent_lights]
//
// custom:light-dial-card takes the same config: a glass card with a brightness dial,
// White / Color / Effects tabs and a time-of-day warmth suggestion. It also takes
//   theme: glass | midnight | paper | ember | ocean | forest | contrast     # default glass
//   theme: thanksgiving | christmas | winter    # seasonal: falling leaves or snow, and a dressed-up dial
//   theme: auto        # midnight in dark mode, paper in light mode
//   compact: true      # header, brightness slider and preset chips only
//
// music-dial-card.js, next to this file, is the same glass card for a media player; it needs this file loaded.

const SWATCHES = [["Red", 0], ["Orange", 23], ["Amber", 40], ["Green", 120],
                  ["Cyan", 185], ["Blue", 230], ["Violet", 275], ["Magenta", 310]];
const HUE_NAMES = [[12, "Red"], [35, "Orange"], [50, "Amber"], [68, "Yellow"], [160, "Green"],
                   [200, "Cyan"], [255, "Blue"], [290, "Violet"], [340, "Magenta"], [361, "Red"]];
const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
const STEP = 10;   // the − / + buttons, in %

// Card config and effect names are free text: show them as text, never as HTML.
function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function hueName(h) { return HUE_NAMES.find(([max]) => ((h % 360) + 360) % 360 < max)[1]; }
function kelvinName(k) { return k <= 2400 ? "Candle" : k <= 3200 ? "Warm" : k <= 4200 ? "Neutral" : k <= 5500 ? "Cool" : "Daylight"; }
// Tanner Helland's blackbody approximation, good enough for a gradient.
function kelvinRgb(k) {
  const t = k / 100;
  const [r, g, b] = t <= 66
    ? [255, 99.47 * Math.log(t) - 161.12, t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04]
    : [329.7 * (t - 60) ** -0.1332, 288.12 * (t - 60) ** -0.0755, 255];
  return [r, g, b].map((x) => Math.round(clamp(x, 0, 255)));
}
function hsRgb(h, s) {
  s /= 100;
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - s * clamp(Math.min(k, 4 - k), 0, 1))); };
  return [f(5), f(3), f(1)];
}
function pctOf(st) { return st.state === "on" ? Math.max(1, Math.round((num(st.attributes.brightness) ?? 255) / 2.55)) : 0; }

// Entity attributes come from integrations: only real numbers may reach markup.
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const rgbOk = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => num(n) >= 0 && n <= 255) ? v.map(Math.round) : null);
// "No effect" is None on most lights and off on some (Hue).
const noFx = (e) => !e || /^(none|off)$/i.test(e);
const fxOff = (a) => (a.effect_list || []).find(noFx);
const sliderAttrs = (label, now, min, max, text) =>
  `role="slider" tabindex="0" aria-label="${label}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${now}" aria-valuetext="${text}"`;

function caps(a) {
  const modes = a.supported_color_modes || [];
  return {
    dim: modes.some((m) => m !== "onoff"),
    ct: modes.includes("color_temp"),
    color: modes.some((m) => COLOR_MODES.includes(m)),
    fx: (a.effect_list || []).some((e) => !noFx(e)),
    kmin: num(a.min_color_temp_kelvin) || 2000,
    kmax: num(a.max_color_temp_kelvin) || 6500,
  };
}

// Which part drives each tab: the first that supports it.
function owners(parts) {
  const own = {};
  for (const [id, st] of parts) {
    const c = caps(st.attributes);
    for (const t of ["ct", "color", "fx"]) if (c[t] && !own[t]) own[t] = id;
  }
  return own;
}

// Each part's name without the words all parts share: "Office Center Lights" -> "Center".
function partLabels(names) {
  const words = names.map((n) => n.split(/\s+/));
  const common = (w) => words.every((ws) => ws.includes(w));
  return names.map((n, i) => words[i].filter((w) => !common(w)).join(" ") || n);
}

function defaultPresets(c) {
  const k = (v) => clamp(v, c.kmin, c.kmax);
  if (c.ct) return [
    ...(c.color ? [{ name: "Sunset", brightness: 90, color: [23, 95] }] : []),
    { name: "Focus", brightness: 100, kelvin: k(5000) },
    { name: "Desk work", brightness: 80, kelvin: k(4000) },
    { name: "Reading", brightness: 70, kelvin: k(3500) },
    { name: "Evening", brightness: 50, kelvin: k(2700) },
    { name: "Night", brightness: 10, kelvin: k(2200) },
  ].filter((p, i, all) => !p.kelvin || all.findLastIndex((q) => q.kelvin === p.kelvin) === i);   // a narrow bulb clamps several to one kelvin: keep the last (Night)
  if (c.color) return [
    { name: "Bright", brightness: 100, color: [0, 0] },
    { name: "Sunset", brightness: 80, color: [23, 95] },
    { name: "Ocean", brightness: 60, color: [200, 80] },
    { name: "Night", brightness: 10, color: [20, 90] },
  ];
  if (!c.dim) return [{ name: "On" }];   // on/off only: nothing to set but power
  return [{ name: "Bright", brightness: 100 }, { name: "Dim", brightness: 50 }, { name: "Night", brightness: 10 }];
}

function presetMatches(p, st) {
  if (!st || st.state !== "on") return false;
  const a = st.attributes;
  if (p.brightness != null && Math.abs(pctOf(st) - p.brightness) > 2) return false;
  if (p.effect) return a.effect === p.effect;
  if (!noFx(a.effect)) return false;
  if (p.kelvin) return a.color_mode === "color_temp" && Math.abs((a.color_temp_kelvin || 0) - p.kelvin) <= 60;
  if (p.color) {
    const hs = a.hs_color;
    if (!hs || a.color_mode === "color_temp") return false;
    const dh = Math.abs(hs[0] - p.color[0]);
    return (p.color[1] < 5 || Math.min(dh, 360 - dh) <= 4) && Math.abs(hs[1] - p.color[1]) <= 4;
  }
  return true;
}

function presetRgb(p) { return p.kelvin ? kelvinRgb(p.kelvin) : p.color ? hsRgb(p.color[0], p.color[1]) : [255, 214, 170]; }

const ANCHORS = [[2200, "Candle"], [2700, "Warm"], [4000, "Neutral"], [5000, "Cool"], [6500, "Daylight"]];
function recommendedK(hour, c) {
  const k = hour < 6 ? 2200 : hour < 9 ? 4000 : hour < 17 ? 5000 : hour < 20 ? 3500 : hour < 22 ? 2700 : 2200;
  return clamp(k, c.kmin, c.kmax);
}

// Brightness dial: a 230° arc open at the bottom, in a 200 x 172 viewBox.
const DIAL = { cx: 100, cy: 100, r: 76, start: 205, span: 230, w: 200, h: 172 };
function dialPoint(f, r, g = DIAL) {
  const a = (g.start - f * g.span) * Math.PI / 180;
  return [g.cx + (r ?? g.r) * Math.cos(a), g.cy - (r ?? g.r) * Math.sin(a)];
}
// dx, dy from the centre (y down) -> 0..1 along the arc; the gap at the bottom snaps to the nearer end.
const dialDeg = (dx, dy, g = DIAL) => (((g.start - Math.atan2(-dy, dx) * 180 / Math.PI) % 360) + 360) % 360;
// Only the track, with a finger's margin, starts a drag; the rest of the dial lets the page scroll.
function dialHit(dx, dy) {
  const r = Math.hypot(dx, dy), d = dialDeg(dx, dy);
  return r >= 53 && r <= 99 && (d <= DIAL.span + 17 || d >= 343);
}
function dialFrac(dx, dy, g = DIAL) {
  const d = dialDeg(dx, dy, g);
  return d <= g.span ? d / g.span : d - g.span < 360 - d ? 1 : 0;
}
// A grey track filled from Dim up to the handle in the light's colour, so it reads as a level, not a colour scale.
function dialSvg(f, on, tint, pct, art = "") {
  const p = (v, r) => dialPoint(v, r).map((n) => n.toFixed(1)).join(" ");
  const sun = (v, s, lit) => {
    const [x, y] = dialPoint(v);
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const c = Math.cos(a * Math.PI / 180), si = Math.sin(a * Math.PI / 180);
      return `M${(4.6 * c).toFixed(2)} ${(4.6 * si).toFixed(2)}L${(6.8 * c).toFixed(2)} ${(6.8 * si).toFixed(2)}`;
    }).join("");
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})" style="stroke:${lit ? "rgba(0,0,0,.55)" : "var(--lsc-dim)"}" stroke-width="1.4" fill="none" stroke-linecap="round"><circle r="2.8"/><path d="${rays}"/></g>`;
  };
  const [tx, ty] = dialPoint(f);
  return `<svg viewBox="0 0 ${DIAL.w} ${DIAL.h}">
    <path d="M${p(0)} A${DIAL.r} ${DIAL.r} 0 1 1 ${p(1)}" fill="none" stroke="rgba(128,128,128,.28)" stroke-width="30" stroke-linecap="round"/>
    <path class="track" d="M${p(0)} A${DIAL.r} ${DIAL.r} 0 1 1 ${p(1)}" fill="none" stroke="transparent" stroke-width="46" stroke-linecap="round"/>
    ${on ? `<path d="M${p(0)} A${DIAL.r} ${DIAL.r} 0 ${f * DIAL.span > 180 ? 1 : 0} 1 ${p(f)}" fill="none" stroke="rgb(${tint})" stroke-width="30" stroke-linecap="round"/>` : ""}
    ${sun(0, 1, on)}${sun(1, 1.25, on && f > 0.97)}
    <text class="end" x="${dialPoint(0)[0].toFixed(1)}" y="167">Dim</text><text class="end" x="${dialPoint(1)[0].toFixed(1)}" y="167">Bright</text>
    ${on ? `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="11" fill="#fff"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="5" fill="rgb(${tint})"/>` : ""}
    <circle class="hub" data-act="toggle" role="button" tabindex="0" aria-label="Power" aria-pressed="${on}" cx="${DIAL.cx}" cy="${DIAL.cy}" r="50"/>${art}
    ${on ? `<polygon points="${p(f, 45)} ${p(f - 0.035, 37)} ${p(f + 0.035, 37)}" fill="#1d1e22"/>` : ""}
    <text class="val ${on ? "" : "off"}" x="${DIAL.cx}" y="${DIAL.cy + 1}">${on ? `${pct}<tspan class="unit" dx="1">%</tspan>` : "Off"}</text>
  </svg>`;
}

function duration(since) {
  const min = Math.floor((Date.now() - new Date(since)) / 60000);
  return min < 1 ? "now" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

const CSS = `
:host { --lsc-bg: #1b1d22; --lsc-panel: rgba(255,255,255,.055); --lsc-text: #f3f3f5;
  --lsc-dim: rgba(243,243,245,.55); --lsc-sel: #fff; --lsc-sel-text: #17181b; }
ha-card { position: relative; overflow: hidden; padding: 20px; border-radius: 28px; color: var(--lsc-text);
  border: 1px solid rgba(255,255,255,.09);
  background: radial-gradient(110% 55% at 0% 0%, rgba(var(--glow), var(--glow-a)), transparent 65%), var(--lsc-bg); }
.na .body { opacity: .4; pointer-events: none; }
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; }
.head { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
.ico { width: 64px; height: 64px; flex: none; border-radius: 16px; background: var(--lsc-panel);
  display: grid; place-items: center; --mdc-icon-size: 34px; color: rgb(var(--tint)); }
.title { flex: 1; min-width: 0; }
.name { font-size: 22px; font-weight: 600; line-height: 1.25; }
.sub { font-size: 13px; color: var(--lsc-dim); margin-top: 4px; line-height: 1.5; }
.st { color: var(--lsc-dim); font-weight: 500; }
.on .st { color: var(--lsc-text); }
.on .st i { background: rgb(var(--tint)); }
.st i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; margin-right: 5px; vertical-align: 1px; }
.round { width: 44px; height: 44px; border-radius: 50%; background: var(--lsc-panel); display: grid;
  place-items: center; --mdc-icon-size: 22px; border: 1px solid rgba(255,255,255,.1); flex: none; }
.on .pwr { background: var(--lsc-sel); color: var(--lsc-sel-text); }
.top { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
.panel { background: var(--lsc-panel); border-radius: 18px; padding: 12px; }
.out { display: flex; flex-direction: column; padding: 16px; }
.lbl { font-size: 12px; letter-spacing: .08em; color: var(--lsc-dim); font-weight: 600; }
.big { font-size: 52px; font-weight: 700; line-height: 1.1; margin: 8px 0 14px; }
.big small { font-size: 22px; font-weight: 500; color: var(--lsc-dim); }
.steps { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto; }
.steps button, .chip { background: rgba(255,255,255,.07); border-radius: 12px; padding: 12px 6px; font-weight: 600; font-size: 14px; }
.steps button:disabled { opacity: .35; cursor: default; }
.presets { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow: auto; }
.preset { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; font-size: 16px; font-weight: 500; text-align: left; }
.preset span { flex: 1; }
.preset em { font-style: normal; font-size: 13px; color: var(--lsc-dim); }
.preset i { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.sel { background: var(--lsc-sel); color: var(--lsc-sel-text); }
.sel em { color: inherit; opacity: .75; }
.row { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 0 10px; font-weight: 600; font-size: 16px; gap: 8px; }
.row .v { font-weight: 500; font-size: 14px; }
.row .v b { font-size: 16px; }
.sl { position: relative; height: 52px; border-radius: 16px; touch-action: pan-y; cursor: pointer; margin-bottom: 12px; }
.sl.thin { height: 34px; border-radius: 12px; }
.thumb { position: absolute; top: 50%; width: 16px; height: 34px; border-radius: 8px; background: #fff;
  transform: translate(-50%, -50%); box-shadow: 0 1px 6px rgba(0,0,0,.45); pointer-events: none; }
.thin .thumb { height: 24px; }
.tabs { display: inline-flex; background: rgba(0,0,0,.35); border-radius: 12px; padding: 3px; }
.tabs button { padding: 10px 22px; border-radius: 10px; font-weight: 600; font-size: 15px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.chip { display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip i { width: 14px; height: 14px; border-radius: 50%; flex: none; }
.fx { grid-template-columns: repeat(3, 1fr); max-height: 210px; overflow: auto; }
@media (max-width: 420px) { .top { grid-template-columns: 1fr; } .grid { grid-template-columns: repeat(2, 1fr); } }
.tick { position: absolute; top: 50%; width: 6px; height: 6px; border-radius: 50%; background: rgba(0,0,0,.28);
  transform: translate(-50%, -50%); pointer-events: none; }
`;

// Dial card in a narrow column or on a small panel.
const NARROW = `
ha-card { padding: 12px; border-radius: 26px; }
.head { gap: 10px; margin-bottom: 8px; }
.ico { width: 48px; height: 48px; --mdc-icon-size: 26px; }
.name { font-size: 18px; }
.round { width: 38px; height: 38px; }
.top { grid-template-columns: 124px 1fr; gap: 12px; margin-bottom: 8px; }
.preset { padding: 3px 10px; font-size: 15px; gap: 6px; }
.preset span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preset em { font-size: 12px; }
.row { flex-wrap: wrap; }
.row .v { margin-left: auto; white-space: nowrap; font-size: 14px; }
.row .v b { font-size: 16px; }
.tabs button { padding: 8px 12px; font-size: 14px; }
.grid { grid-template-columns: repeat(2, 1fr); }
.sl { height: 42px; margin-bottom: 8px; }
.thumb { height: 32px; }
.compact .presets { gap: 4px; overflow: hidden; }
.compact .preset { flex: 1 1 auto; min-width: 0; padding: 8px 5px; font-size: 12px; text-align: center; }
`;

// Seasonal dial themes: art behind the controls as SVG backgrounds, and a dressed-up hub.
const svgUrl = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;
const LEAF = "M21.79,13L16,16L17,18L13,17.25V21H11V17.25L7,18L8,16L2.21,13L3.21,11.27L1.61,8L5.21,7.77L6.21,6L9.63,9.9L8,5H10L12,2L14,5H16L14.37,9.9L17.79,6L18.79,7.73L22.39,7.96L20.79,11.19L21.79,13Z";   // leaf-maple, Material Design Icons (Apache 2.0)
const TREE = "M10 21V18H3L8 13H5L10 8H7L12 3L17 8H14L19 13H16L21 18H14V21Z";
// Both shapes sit in a 24 x 24 box: centred on x, y, turned and scaled.
const stamp = (d, list) => list.map(([x, y, rot, s, fill]) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-12 -12)" d="${d}" fill="${fill}"/>`).join("");
const flakes = (pts) => pts.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join("");
const LEAVES = [svgUrl(240, 300, stamp(LEAF, [[42, 52, 20, 1.35, "#e8912d"], [172, 112, -40, 1.6, "#c8502a"], [92, 204, 75, 1.15, "#f0c04a"], [204, 258, 150, 1.2, "#d9742a"], [26, 266, -110, .95, "#b5432a"]])),
  svgUrl(180, 220, stamp(LEAF, [[30, 40, -60, .8, "#f0c04a"], [130, 90, 35, .7, "#e8912d"], [70, 170, 120, .75, "#c8502a"]]))];
const SNOW = [svgUrl(200, 200, flakes([[18, 22, 2.2, .9], [64, 80, 1.6, .7], [120, 30, 2.6, .85], [170, 110, 1.8, .7], [36, 150, 2.4, .8], [96, 176, 1.5, .6], [150, 170, 2.1, .8], [186, 40, 1.4, .6], [84, 124, 2, .75]])),
  svgUrl(140, 140, flakes([[12, 30, 1.1, .7], [50, 12, .9, .6], [88, 60, 1.3, .7], [124, 100, 1, .6], [30, 96, 1.2, .65], [70, 126, .9, .55], [108, 22, 1, .6]]))];
// A row of three trees standing on snow, 170 x 64. Half the bulbs are drawn lit; the other half twinkle on a layer above.
const ROW = [[28, 2.4, "#1d5c40"], [84, 2.9, "#174a34"], [136, 1.9, "#236b4a"]].map(([x, s, fill]) => [x, 58 - 9 * s, 0, s, fill]);
const BULBS = [[12, 6.2], [10.6, 7.2], [13.2, 10.2], [9.4, 11.6], [14.6, 12], [11.2, 13.9], [7, 16.4], [10.2, 15.3], [13.6, 16.8], [17, 16.2]];
const bulbs = (odd) => ROW.map(([x, y, , s]) => BULBS.map(([u, v], i) => {
  const at = `cx="${x + (u - 12) * s}" cy="${y + (v - 12) * s}" fill="${["#ff5252", "#ffd24d", "#4da3ff", "#fff"][i % 4]}"`;
  return i % 2 === odd ? `<circle ${at} r="3.4" opacity=".28"/><circle ${at} r="1.3"/>` : "";
}).join("")).join("");
const TREES = [svgUrl(170, 64, stamp(TREE, ROW) + bulbs(1) + `<rect y="57" width="170" height="7" fill="#eaf3ff"/>`), svgUrl(170, 64, bulbs(0))];
const HUB_SNOW = "M58 73A50 50 0 0 1 142 73C136 80 128 70 120 76C113 81 108 72 100 76C92 80 88 71 80 77C72 82 64 72 58 73Z";
// Drawn over the dial's hub: a pumpkin, Santa with the level in his beard, a cap of snow.
const HUB_ART = {
  thanksgiving: `<defs><radialGradient id="lsc-pk" cx=".4" cy=".32" r=".8"><stop offset="0" stop-color="#ffb055"/><stop offset="1" stop-color="#e2700f"/></radialGradient></defs>
    <g fill="none" stroke="#8a3c00" stroke-opacity=".3" stroke-width="1.5"><ellipse cx="100" cy="100" rx="17" ry="49.2"/><ellipse cx="100" cy="100" rx="35" ry="49.6"/></g>
    <path d="M96.5 52.5C96 45 99 41.5 104.5 40.5L106.5 44.5C103.5 45.5 102.5 48 102.8 52.5Z" fill="#5d7a2e"/>`,
  christmas: `<defs><clipPath id="lsc-hub"><circle cx="100" cy="100" r="50"/></clipPath></defs>
    <ellipse cx="100" cy="81" rx="31" ry="15" fill="#f6c9a4"/><rect x="50" y="50" width="100" height="19" fill="#c8202b" clip-path="url(#lsc-hub)"/>
    <path d="M78 55C96 38 138 42 151.5 73L144 77A50 50 0 0 0 78 55Z" fill="#c8202b"/>
    <g fill="#fff" stroke="#dcdce4" stroke-width=".8"><rect x="52" y="64" width="96" height="11" rx="5.5"/><circle cx="148.5" cy="77" r="6"/></g>
    <circle cx="88" cy="82" r="2.4" fill="#2a1c16"/><circle cx="112" cy="82" r="2.4" fill="#2a1c16"/>
    <circle cx="79" cy="87" r="4.5" fill="#f09a8a" opacity=".55"/><circle cx="121" cy="87" r="4.5" fill="#f09a8a" opacity=".55"/>
    <g fill="#fff" stroke="#dcdce4" stroke-width=".8"><ellipse cx="91.5" cy="93" rx="10" ry="5"/><ellipse cx="108.5" cy="93" rx="10" ry="5"/></g><circle cx="100" cy="89" r="4" fill="#e8907c"/>`,
  winter: `<path d="${HUB_SNOW}" transform="translate(0 2)" fill="#3c6496" opacity=".25"/><path d="${HUB_SNOW}" fill="#fff"/>`,
};
const SEASON = ":is(.t-thanksgiving, .t-christmas, .t-winter)";
const NIGHT = "--lsc-edge: rgba(190,215,255,.28); --lsc-well: rgba(0,6,20,.35);";
const SEASON_CSS = `
${SEASON} > * { position: relative; z-index: 1; }
/* --now: the card rebuilds its markup on every change, and each layer picks its animation up where it was */
${SEASON}::before, ${SEASON}::after { content: ""; position: absolute; inset: 0; pointer-events: none; animation-delay: calc(var(--now, 0) * -1s) !important; }
@keyframes lsc-fall { from { background-position: var(--dx, 0) 0; } to { background-position: var(--dx, 0) var(--tile); } }
@keyframes lsc-sway { from { transform: translateX(-10px); } to { transform: translateX(10px); } }
@keyframes lsc-twinkle { 0%, 40% { opacity: 1; } 60%, 100% { opacity: .12; } }
@media (prefers-reduced-motion: reduce) { ${SEASON}::before, ${SEASON}::after { animation: none !important; } }
ha-card.t-thanksgiving { --lsc-card: linear-gradient(165deg, #5a2f22, #24130f 78%); --lsc-edge: rgba(255,180,110,.3); --lsc-sel: #ffd9a0; --lsc-sel-text: #2b140c;
  --lsc-well: rgba(20,8,4,.4); --lsc-chip: rgba(255,200,140,.12); }
.t-thanksgiving::before { inset: 0 -12px; background: ${LEAVES[0]} 0 0 / 240px 300px; --tile: 300px; opacity: .55; animation: lsc-fall 24s linear infinite, lsc-sway 7s ease-in-out infinite alternate; }
.t-thanksgiving::after { inset: 0 -12px; background: ${LEAVES[1]} 0 0 / 180px 220px; --tile: 220px; opacity: .3; animation: lsc-fall 15s linear infinite, lsc-sway 5s ease-in-out infinite alternate-reverse; }
.t-thanksgiving .hub { fill: url(#lsc-pk); }
.t-thanksgiving .val { fill: #3b1c08; }
ha-card.t-christmas { ${NIGHT} --lsc-card: ${TREES[0]} repeat-x var(--dx, 0) 100% / 170px 64px, linear-gradient(180deg, #14263f, #0b1422); --lsc-sel: #c8202b; --lsc-sel-text: #fff; padding-bottom: 82px; }
.t-christmas::before, .t-winter::before { background: ${SNOW[0]} 0 0 / 200px 200px; --tile: 200px; opacity: .8; animation: lsc-fall 13s linear infinite; }
.t-christmas::after { inset: auto 0 0; height: 64px; background: ${TREES[1]} repeat-x var(--dx, 0) 0 / 170px 64px; animation: lsc-twinkle 1.6s ease-in-out infinite alternate; }
.t-christmas .val { transform: translateY(15px); font-size: 24px; }
.t-christmas .val.off { font-size: 20px; }
ha-card.t-winter { ${NIGHT} --lsc-sel: #eaf3ff; --lsc-sel-text: #0f1b30;
  --lsc-card: radial-gradient(ellipse 110px 19px at 18% 100%, #eaf3ff 97%, transparent), radial-gradient(ellipse 150px 15px at 52% 100%, #dfeafa 97%, transparent),
    radial-gradient(ellipse 120px 21px at 88% 100%, #eaf3ff 97%, transparent), linear-gradient(180deg, #1c2e50, #0d1626); }
.t-winter::after { background: ${SNOW[1]} 0 0 / 140px 140px; --tile: 140px; opacity: .7; animation: lsc-fall 8s linear infinite; }
.t-winter .hub { fill: #dfeaf7; }
`;

// The dial variant: the same layout pieces, restyled as a frosted glass card.
const DIAL_CSS = CSS + `
ha-card { padding: 22px; border-radius: 34px; border: 1px solid var(--lsc-edge);
  --lsc-card: linear-gradient(165deg, #4b4f58, #30333a 75%); --lsc-edge: rgba(255,255,255,.22);
  --lsc-well: rgba(0,0,0,.2); --lsc-chip: rgba(255,255,255,.09);
  --lsc-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 10px 30px rgba(0,0,0,.35);
  box-shadow: var(--lsc-shadow);
  background: radial-gradient(70% 45% at 22% 38%, rgba(var(--glow), var(--glow-a)), transparent 70%), var(--lsc-card); }
.ico, .chip { background: var(--lsc-chip); }
.round { border-color: var(--lsc-edge); }
.top { grid-template-columns: minmax(170px, 210px) 1fr; align-items: center; gap: 22px; }
.dial { width: 100%; max-width: 230px; margin: 0 auto; }
.dial[data-slider] { touch-action: none; }   /* on the whole dial: the panel's browser ignores it on the SVG track alone */
.dial[data-slider] .track { pointer-events: stroke; cursor: pointer; }
.dial svg { display: block; width: 100%; height: auto; overflow: visible; }
.dial svg * { pointer-events: none; }
.dial .hub { pointer-events: auto; fill: #fff; cursor: pointer; filter: drop-shadow(0 4px 10px rgba(0,0,0,.35)); }
.val { font-size: 32px; font-weight: 600; fill: #1b1c20; text-anchor: middle; dominant-baseline: central; }
.val.off { fill: #8d8e93; font-weight: 500; font-size: 26px; }
.unit { font-size: 16px; font-weight: 500; }
.end { font-size: 12px; fill: var(--lsc-dim); text-anchor: middle; }
.presets { background: var(--lsc-well); padding: 6px; }
.preset { padding: 7px 14px; font-size: 18px; }
.preset i { display: none; }
.tabs { background: var(--lsc-well); }
.tabs button { padding: 10px 20px; font-size: 16px; }
.row { align-items: center; }
.row .v { font-size: 16px; }
.row .v b { font-size: 20px; font-weight: 700; }
.sl { height: 50px; }
.thumb { width: 18px; height: 40px; border-radius: 9px; }
.rec { position: absolute; top: 50%; width: 28px; height: 28px; transform: translate(-50%, -50%); display: grid; place-items: center;
  color: rgba(0,0,0,.45); --mdc-icon-size: 16px; }   /* a tick in the same ink as the dots, under the thumb */
ha-card.t-midnight { --lsc-card: #14161a; --lsc-edge: rgba(255,255,255,.09); --lsc-shadow: none; --lsc-well: rgba(255,255,255,.05); }
ha-card.t-paper { --lsc-card: linear-gradient(165deg, #fbfaf7, #ebe8e1); --lsc-edge: rgba(0,0,0,.12); --lsc-shadow: 0 6px 20px rgba(0,0,0,.12);
  --lsc-text: #1d1e22; --lsc-dim: rgba(29,30,34,.6); --lsc-panel: rgba(0,0,0,.05); --lsc-well: rgba(0,0,0,.06); --lsc-chip: rgba(0,0,0,.06);
  --lsc-sel: #1d1e22; --lsc-sel-text: #fff; }
ha-card.t-ember { --lsc-card: linear-gradient(165deg, #54392a, #2a1c16 75%); --lsc-edge: rgba(255,214,170,.25); --lsc-sel: #ffe9cf; --lsc-sel-text: #2a1c16; }
ha-card.t-ocean { --lsc-card: linear-gradient(165deg, #2b4d63, #14232e 75%); --lsc-edge: rgba(170,220,255,.25); --lsc-sel: #e6f5ff; --lsc-sel-text: #14232e; }
ha-card.t-forest { --lsc-card: linear-gradient(165deg, #3a5241, #1a251e 75%); --lsc-edge: rgba(190,235,200,.22); --lsc-sel: #ecf7ee; --lsc-sel-text: #1a251e; }
ha-card.t-contrast { --lsc-card: #000; --lsc-edge: rgba(255,255,255,.6); --lsc-shadow: none; --lsc-dim: rgba(255,255,255,.8);
  --lsc-well: #000; --lsc-chip: rgba(255,255,255,.16); --glow-a: 0 !important; border-radius: 18px; }
.t-contrast .presets, .t-contrast .tabs { border: 1px solid var(--lsc-edge); }
${SEASON_CSS}
:host { display: block; container-type: inline-size; }
.compact .head { margin-bottom: 12px; }
.compact .presets { flex-direction: row; overflow-x: auto; max-height: none; gap: 6px; background: none; border: 0; padding: 0; }
.compact .preset { flex: none; background: var(--lsc-chip); padding: 8px 14px; font-size: 15px; }
.compact .preset.sel { background: var(--lsc-sel); }
.compact .preset em { display: none; }
@container (max-width: 420px) {${NARROW}}
@media (max-width: 420px) {${NARROW}}
`;
const THEMES = ["glass", "midnight", "paper", "ember", "ocean", "forest", "contrast", ...Object.keys(HUB_ART)];

class LightStudioCard extends HTMLElement {
  setConfig(config) {
    const ids = config?.entities || (config?.entity ? [config.entity] : []);
    if (!ids.length || !ids.every((e) => String(e).startsWith("light."))) throw new Error("Set entity: (or entities:) to lights");
    this._config = config;
    this._ids = ids;
    this._endDrag?.();
    this._over = {};
    this._overUntil = 0;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    const changed = this._ids.some((id) => hass.states[id] !== this._hass?.states[id]) || hass.themes?.darkMode !== this._hass?.themes?.darkMode;
    this._hass = hass;
    if (first || changed) this._render();
  }

  connectedCallback() { this._tick = setInterval(() => this._render(), 60000); }   // keeps "On · 5 min" fresh
  disconnectedCallback() { clearInterval(this._tick); clearTimeout(this._overT); this._endDrag?.(); }
  getCardSize() { return 9; }
  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith("light.")) || "light.example" };
  }

  // [[id, state]] for the parts HA knows, the one showing on the card, and what it all supports.
  _model() {
    const parts = this._ids.map((id) => [id, this._hass.states[id]]).filter(([, st]) => st);
    if (!parts.length) return null;
    // The lit part, else the last one used, else the first, passing over parts that cannot come on.
    const ok = ([, s]) => s.state !== "unavailable";
    const active = (parts.find(([, s]) => s.state === "on") || parts.find((p) => p[0] === this._last && ok(p)) || parts.find(ok) || parts[0])[0];
    const st = this._hass.states[active];
    const own = owners(parts);
    const c = {
      dim: caps(st.attributes).dim, ct: !!own.ct, color: !!own.color, fx: !!own.fx,
      ...(own.ct ? { kmin: caps(this._hass.states[own.ct].attributes).kmin, kmax: caps(this._hass.states[own.ct].attributes).kmax } : { kmin: 2000, kmax: 6500 }),
    };
    return { parts, active, st, c, own };
  }

  // State values, with what the user just set laid over them until HA reports back.
  _values(m) {
    const o = Date.now() < this._overUntil ? this._over : {};
    const ct = m.own.ct && this._hass.states[m.own.ct].attributes;
    const col = m.own.color && this._hass.states[m.own.color].attributes;
    return {
      pct: o.pct ?? pctOf(m.st),
      kelvin: o.kelvin ?? num(ct?.color_temp_kelvin) ?? Math.round((m.c.kmin + m.c.kmax) / 2),
      hue: o.hue ?? num(col?.hs_color?.[0]) ?? 23,
      sat: o.sat ?? num(col?.hs_color?.[1]) ?? 95,
    };
  }

  // Turns `id` on with `data`. Moving to another part keeps the brightness and turns the lit part(s) off.
  _send(id, data, m = this._model()) {
    const st = this._hass.states[id];
    if (!st || st.state === "unavailable") return;   // never darken the lit part for one that is gone or cannot come on
    const pend = this._pending(), prev = this._last;
    const lit = m.parts.filter(([pid, st]) => pid !== id && st.state === "on").map(([pid]) => pid);
    const others = pend && pend !== id && !lit.includes(pend) ? [...lit, pend] : lit;
    if (others.length && data.brightness_pct == null) data.brightness_pct = this._values(m).pct;
    if (!caps(st.attributes).dim) delete data.brightness_pct;   // an on/off part takes no level
    this._last = id;
    if (m.parts.length > 1 && this._hass.states[id]?.state !== "on") this._pend = [id, Date.now() + 3000];
    // If the new part refuses, bring back the part that was lit.
    Promise.resolve(this._hass.callService("light", "turn_on", { entity_id: id, ...data })).catch(() => {
      this._pend = null; this._last = prev;
      if (lit.length) this._hass.callService("light", "turn_on", { entity_id: lit });
    });
    if (others.length) this._hass.callService("light", "turn_off", { entity_id: others });
  }

  // The part a switch is heading to, until HA reports it on (3 s at most): until then HA still shows the old part as the lit one.
  _pending() {
    const [id, until] = this._pend || [];
    return Date.now() < until && this._hass.states[id]?.state !== "on" ? id : null;
  }

  // Name of the area the entity, or else its device, is in.
  _area(id) {
    const ent = this._hass.entities?.[id];
    return this._hass.areas?.[ent?.area_id || this._hass.devices?.[ent?.device_id]?.area_id]?.name;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._click(e));
      this.shadowRoot.addEventListener("pointerdown", (e) => this._drag(e));
      this.shadowRoot.addEventListener("keydown", (e) => this._key(e));
    }
    const m = this._model();
    // Rebuilding the markup drops focus: put it back on the same control afterwards.
    const focus = this.shadowRoot.activeElement && JSON.stringify(this.shadowRoot.activeElement.dataset);
    this.shadowRoot.innerHTML = `<style>${this.constructor.css}</style>` + (m ? this._html(m)
      : `<ha-card><div class="name">${esc(this._ids.join(", "))} not found</div></ha-card>`);
    if (focus) [...this.shadowRoot.querySelectorAll("[data-act],[data-slider]")].find((n) => JSON.stringify(n.dataset) === focus)?.focus({ preventScroll: true });
  }

  _html(m) {
    const { on, na, tint, v, c, head, presetRows, tab, tabBar, readout, body, brightness } = this._parts(m);
    const output = c.dim ? `<div class="panel out">
        <div class="lbl">OUTPUT</div>
        <div class="big">${v.pct}<small>%</small></div>
        <div class="steps"><button data-act="step" data-d="-1" ${on ? "" : "disabled"}>− ${STEP}%</button><button data-act="step" data-d="1">+ ${STEP}%</button></div>
      </div>` : "";
    return `<ha-card class="${on ? "on" : ""} ${na ? "na" : ""}" style="--tint:${tint};--glow:${tint};--glow-a:${on ? 0.3 : 0}">
      ${head}
      <div class="body" ${na ? "inert" : ""}>
        <div class="top" style="${c.dim ? "" : "grid-template-columns:1fr"}">${output}<div class="panel presets">${presetRows}</div></div>
        ${brightness}
        ${tab ? `<div class="row">${tabBar}<span class="v">${readout}</span></div>${body}` : ""}
      </div></ha-card>`;
  }

  // The pieces both layouts share: header, presets, and the tab bar with its body.
  _parts(m) {
    const dial = this.constructor.dial;
    const cfg = this._config, { st, c, own } = m, a = st.attributes, v = this._values(m);
    const on = st.state === "on", na = st.state === "unavailable";
    const fxAttrs = own.fx && this._hass.states[own.fx].attributes;
    const effectOn = !!(fxAttrs && !noFx(fxAttrs.effect) && this._hass.states[own.fx].state === "on");
    const colorMode = a.color_mode && a.color_mode !== "color_temp" && m.active === own.color;
    const tint = on ? (rgbOk(a.rgb_color) || (num(a.color_temp_kelvin) ? kelvinRgb(a.color_temp_kelvin) : [255, 170, 90])) : [170, 170, 175];
    const tabs = [c.ct && "cct", c.color && "hsi", c.fx && "fx"].filter(Boolean);
    const tab = tabs.includes(this._tab) ? this._tab
      : effectOn ? "fx" : colorMode ? "hsi" : m.active === own.ct ? "cct" : tabs.find((t) => own[{ cct: "ct", hsi: "color", fx: "fx" }[t]] === m.active) || tabs[0];
    const presets = cfg.presets || defaultPresets(c);
    const where = [this._area(m.active), cfg.subtitle].filter(Boolean).map(esc).join(" · ");
    const part = m.parts.length > 1 && on
      ? " · " + esc(partLabels(m.parts.map(([id, s]) => s.attributes.friendly_name || id))[m.parts.findIndex(([id]) => id === m.active)]) : "";
    const status = na ? "Unavailable" : on ? `On${part} · ${duration(st.last_changed)}` : st.state === "off" ? "Off" : "Unknown";

    const head = `<div class="head">
      <div class="ico"><ha-icon icon="${esc(cfg.icon || a.icon || "mdi:lightbulb")}"></ha-icon></div>
      <div class="title"><div class="name">${esc(cfg.name || a.friendly_name || m.active)}</div>
        <div class="sub"><span class="st"><i></i>${status}</span>${where ? " · " + where : ""}</div></div>
      <button class="round" data-act="more" title="More info" aria-label="More info"><ha-icon icon="mdi:dots-horizontal"></ha-icon></button>
      <button class="round pwr" data-act="toggle" title="Power" aria-label="Power" aria-pressed="${on}" ${na ? "disabled" : ""}><ha-icon icon="mdi:power"></ha-icon></button>
    </div>`;

    const presetRows = presets.map((p, i) => {
      const tag = p.effect ? "FX" : p.kelvin ? `${p.kelvin} K` : p.color ? "HSI" : p.brightness != null ? `${p.brightness}%` : "";
      const sel = presetMatches(p, this._hass.states[this._presetTarget(p, m)]);
      return `<button class="preset ${sel ? "sel" : ""}" aria-pressed="${sel}" data-act="preset" data-i="${i}">
        <i style="background:rgb(${presetRgb(p)})"></i><span>${esc(p.name)}</span><em>${esc(tag)}</em></button>`;
    }).join("");

    const readout = tab === "cct" ? `${dial ? "" : kelvinName(v.kelvin) + " · "}<b>${v.kelvin}</b> K`
      : tab === "hsi" ? `${hueName(v.hue)} · <b>${Math.round(v.hue)}°</b> · ${Math.round(v.sat)}% sat`
      : tab === "fx" ? esc(effectOn ? fxAttrs.effect : "No effect") : "";
    const tabBar = tabs.length > 1
      ? `<div class="tabs">${tabs.map((t) => `<button aria-pressed="${t === tab}" class="${t === tab ? "sel" : ""}" data-act="tab" data-t="${t}">${dial ? { cct: "White", hsi: "Color", fx: "Effects" }[t] : t.toUpperCase()}</button>`).join("")}</div>`
      : `<span>${{ cct: "Warmth", hsi: "Color", fx: "Effect" }[tab] || ""}</span>`;

    let body = "";
    if (tab === "cct") {
      const stops = [0, .25, .5, .75, 1].map((f) => `rgb(${kelvinRgb(c.kmin + f * (c.kmax - c.kmin))})`).join(",");
      const kf = (k) => (k - c.kmin) / (c.kmax - c.kmin);
      const rec = dial && recommendedK(new Date().getHours(), c);
      const ticks = ANCHORS.filter(([k]) => k > c.kmin + 150 && k < c.kmax - 150 && k !== rec).map(([k]) => `<i class="tick" style="left:${this._pos(kf(k))}"></i>`).join("");
      // The dial card marks the warmth recommended for this time of day; tapping the marker sets it.
      const mark = rec ? `<button class="rec" data-act="recommend" data-k="${rec}" title="Recommended now: ${kelvinName(rec)} · ${rec} K" aria-label="Recommended now: ${kelvinName(rec)}, ${rec} K" style="left:${this._pos(kf(rec))}"><ha-icon icon="mdi:white-balance-sunny"></ha-icon></button>` : "";
      body = `<div class="sl" data-slider="kelvin" ${sliderAttrs("Warmth", v.kelvin, c.kmin, c.kmax, v.kelvin + " K")} style="background:linear-gradient(90deg,${stops})">
        ${ticks}${mark}<div class="thumb" style="left:${this._pos(kf(v.kelvin))}"></div></div>`;
    } else if (tab === "hsi") {
      const sw = SWATCHES.map(([n, h]) => {
        const sel = on && colorMode && Math.min(Math.abs(v.hue - h), 360 - Math.abs(v.hue - h)) <= 4 && v.sat > 80;
        return `<button class="chip ${sel ? "sel" : ""}" aria-pressed="${sel}" data-act="swatch" data-h="${h}"><i style="background:rgb(${hsRgb(h, 100)})"></i>${n}</button>`;
      }).join("");
      body = `<div class="sl" data-slider="hue" ${sliderAttrs("Hue", Math.round(v.hue), 0, 359, hueName(v.hue))} style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)">
          <div class="thumb" style="left:${this._pos(v.hue / 360)}"></div></div>
        <div class="sl thin" data-slider="sat" ${sliderAttrs("Saturation", Math.round(v.sat), 0, 100, Math.round(v.sat) + "%")} style="background:linear-gradient(90deg,#fff,rgb(${hsRgb(v.hue, 100)}))">
          <div class="thumb" style="left:${this._pos(v.sat / 100)}"></div></div>
        <div class="grid">${sw}</div>`;
    } else if (tab === "fx") {
      const off = fxOff(fxAttrs);   // the light's own "no effect" entry goes first, when it has one
      body = `<div class="grid fx">${[...(off ? [off] : []), ...fxAttrs.effect_list.filter((e) => !noFx(e))].map((e) => {
        const sel = (effectOn ? fxAttrs.effect : off) === e;
        return `<button class="chip ${sel ? "sel" : ""}" aria-pressed="${sel}" data-act="effect" data-e="${esc(e)}">${esc(e)}</button>`;
      }).join("")}</div>`;
    }

    const brightness = c.dim ? `<div class="row"><span>Brightness</span><span class="v"><b>${v.pct}</b> %</span></div>
      <div class="sl" data-slider="pct" ${sliderAttrs("Brightness", v.pct, 1, 100, on ? v.pct + "%" : "Off")} style="background:linear-gradient(90deg, rgba(255,255,255,.05), rgba(${tint},.95))">
        <div class="thumb" style="left:${this._pos(on ? (v.pct - 1) / 99 : 0)}"></div></div>` : "";
    return { on, na, tint, v, c, head, presetRows, tab, tabBar, readout, body, brightness };
  }

  // The part a preset drives: whichever supports what it sets, else the one showing.
  _presetTarget(p, m) { return m.own[this._presetKind(p, m)] || m.active; }

  // What a preset sets: one of effect, warmth or colour, and only when a part supports it.
  _presetKind(p, m) {
    const list = m.own.fx && this._hass.states[m.own.fx].attributes.effect_list;
    return p.effect && list?.includes(p.effect) ? "fx" : p.kelvin && m.own.ct ? "ct" : p.color && m.own.color ? "color" : null;
  }

  // The part a slider drives.
  _target(key, m) { return key === "pct" ? m.active : key === "kelvin" ? m.own.ct : m.own.color; }

  // Arrow keys step a focused slider; Enter or Space presses the dial's hub.
  _key(e) {
    const path = e.composedPath();
    if ((e.key === "Enter" || e.key === " ") && path[0]?.dataset?.act && path[0].tagName !== "BUTTON") { e.preventDefault(); return this._click(e); }
    const el = path.find((n) => n.dataset?.slider), d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!el || !d) return;
    e.preventDefault();
    const key = el.dataset.slider, m = this._model(), c = m.c, target = this._target(key, m);
    const [step, lo, hi] = { pct: [5, 1, 100], kelvin: [100, c.kmin, c.kmax], hue: [10, 0, 359], sat: [5, 0, 100] }[key];
    this._set(target, { [key]: clamp(this._values(m)[key] + d * step, lo, hi) }, key === "pct" ? {} : this._stopFx(target));
  }

  // Thumb position: sliders have a 12px inset at each end so the thumb never clips.
  _pos(f) { return `calc(12px + ${clamp(f || 0, 0, 1)} * (100% - 24px))`; }

  // Effect: "None" when this part is running an effect, so a colour or warmth change shows.
  _stopFx(id) {
    const a = this._hass.states[id]?.attributes || {}, off = fxOff(a);
    return !noFx(a.effect) && off ? { effect: off } : {};
  }

  _click(e) {
    const el = e.composedPath().find((n) => n.dataset?.act);
    if (!el) return;
    const m = this._model(), v = this._values(m), { own } = m;
    switch (el.dataset.act) {
      case "toggle":
        // Mid-switch a toggle of the "lit" part would hit the outgoing one: power then means everything off.
        if (this._pending()) { this._pend = null; return this._hass.callService("light", "turn_off", { entity_id: m.parts.map(([id]) => id) }); }
        return this._hass.callService("light", "toggle", { entity_id: m.active });
      case "more": return this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: m.active }, bubbles: true, composed: true }));
      case "tab": this._tab = el.dataset.t; return this._render();
      case "step": return this._set(m.active, { pct: clamp(v.pct + Number(el.dataset.d) * STEP, 1, 100) });
      case "swatch": return this._set(own.color, { hue: Number(el.dataset.h), sat: 100 }, this._stopFx(own.color));
      case "effect": return this._send(own.fx, { effect: el.dataset.e }, m);
      case "recommend": return this._set(own.ct, { kelvin: Number(el.dataset.k) }, this._stopFx(own.ct));
      case "preset": {
        const p = (this._config.presets || defaultPresets(m.c))[Number(el.dataset.i)];
        const id = this._presetTarget(p, m);
        const kind = this._presetKind(p, m);
        const data = kind === "fx" ? { effect: p.effect } : this._stopFx(id);
        if (p.brightness != null) data.brightness_pct = p.brightness;
        if (kind === "ct") data.color_temp_kelvin = clamp(p.kelvin, m.c.kmin, m.c.kmax);
        if (kind === "color") data.hs_color = p.color;
        this._tab = null;
        return this._send(id, data, m);
      }
    }
  }

  // Sends a change and shows it straight away, before HA reports the new state.
  _set(id, over, extra = {}) {
    const st = this._hass.states[id];
    if (!st || st.state === "unavailable") return;   // the part went away mid-gesture
    if (Date.now() >= this._overUntil) this._over = {};   // values that already lapsed must not come back
    Object.assign(this._over, over);
    this._overUntil = Date.now() + 2500;
    clearTimeout(this._overT);
    this._overT = setTimeout(() => this._render(), 2600);   // then show what HA reports
    this._render();
    const m = this._model(), data = { ...extra };
    if (over.pct != null) data.brightness_pct = over.pct;
    if (over.kelvin != null) data.color_temp_kelvin = over.kelvin;
    if (over.hue != null || over.sat != null) { const v = this._values(m); data.hs_color = [v.hue, v.sat]; }
    this._send(id, data, m);
  }

  _drag(e) {
    const el = e.composedPath().find((n) => n.dataset?.slider || n.dataset?.act);
    // A button on a slider (the recommendation marker) is a tap, not a drag. Primary button only, one gesture at a time.
    if (!el?.dataset.slider || e.button > 0 || this._endDrag) return;
    const r = el.getBoundingClientRect(), dial = el.dataset.dial;
    const at = (ev) => [(ev.clientX - r.left) * DIAL.w / r.width - DIAL.cx, (ev.clientY - r.top) * DIAL.h / r.height - DIAL.cy];
    if (dial && !dialHit(...at(e))) return;   // the hub is the power button; blank space scrolls the page
    e.preventDefault();
    const key = el.dataset.slider, m = this._model(), c = m.c;
    const target = this._target(key, m);
    let pf;
    const frac = (ev) => {
      if (!dial) return clamp((ev.clientX - r.left - 12) / (r.width - 24), 0, 1);
      const f = dialFrac(...at(ev));
      // Past either end the level holds there, instead of flipping 1 % <-> 100 % across the gap.
      return pf = pf != null && Math.abs(f - pf) > 0.5 ? Math.round(pf) : f;
    };
    const value = (f) => ({
      pct: () => Math.round(1 + f * 99),
      kelvin: () => clamp(Math.round((c.kmin + f * (c.kmax - c.kmin)) / 50) * 50, c.kmin, c.kmax),
      hue: () => Math.round(f * 360) % 360,
      sat: () => Math.round(f * 100),
    })[key]();
    // The card re-renders while dragging, so follow the pointer on window, not on the slider.
    const extra = key === "pct" ? {} : this._stopFx(target);
    // A touch on a straight slider may be the start of a page scroll: wait for sideways travel.
    let last = 0, sent, live = !!dial || e.pointerType !== "touch";
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId || !(live ||= Math.abs(ev.clientX - e.clientX) > 8)) return;
      this._over[key] = value(frac(ev));
      // Follow the drag on the light itself, at most 4 commands a second.
      if (this._over[key] !== sent && Date.now() - last >= 250) { last = Date.now(); sent = this._over[key]; this._set(target, { [key]: sent }, extra); }
      this._overUntil = Infinity;
      if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this._render(); });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      this._endDrag = null;
    };
    const up = (ev) => { if (ev.pointerId === e.pointerId) { stop(); this._set(target, { [key]: value(frac(ev)) }, extra); } };
    // A cancelled gesture, or a card removed or reconfigured mid-drag, commits nothing more and shows HA's state again.
    const cancel = (ev) => { if (!ev || ev.pointerId === e.pointerId) { stop(); this._overUntil = 0; this._render(); } };
    this._endDrag = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    move(e);
  }
}

LightStudioCard.css = CSS;

function checkTheme(config) {
  if (config?.theme && config.theme !== "auto" && !THEMES.includes(config.theme)) throw new Error(`theme: must be auto or one of ${THEMES.join(", ")}`);
}
// [theme, opening <ha-card> tag] for a themed card.
function themedCard(card, cls, style) {
  const cfg = card._config, theme = cfg.theme === "auto" ? (card._hass.themes?.darkMode ? "midnight" : "paper") : cfg.theme || "glass";
  card._seed ??= Math.random();   // each card starts its seasonal art at its own point, so cards side by side don't move in step
  const now = (Date.now() - (card._t0 ??= Date.now())) / 1000 + card._seed * 600;   // seconds this card has been up: keeps the animation going across renders
  return [theme, `<ha-card class="t-${theme} ${cls}" style="--now:${now};--dx:${Math.round(card._seed * 240)}px;${style}">`];
}

class LightDialCard extends LightStudioCard {
  setConfig(config) {
    checkTheme(config);
    super.setConfig(config);
  }

  _html(m) {
    const { on, na, tint, v, c, head, presetRows, tab, tabBar, readout, body, brightness } = this._parts(m);
    const [theme, open] = themedCard(this, `${this._config.compact ? "compact" : ""} ${on ? "on" : ""} ${na ? "na" : ""}`, `--tint:${tint};--glow:${tint};--glow-a:${on ? 0.22 : 0}`);
    if (this._config.compact) return `${open}${head}<div class="body" ${na ? "inert" : ""}>${brightness}<div class="panel presets">${presetRows}</div></div></ha-card>`;
    return `${open}
      ${head}
      <div class="body" ${na ? "inert" : ""}>
        <div class="top">
          <div class="dial" ${c.dim ? `data-slider="pct" data-dial="1" ${sliderAttrs("Brightness", v.pct, 1, 100, on ? v.pct + "%" : "Off")}` : ""}>${dialSvg(on ? (v.pct - 1) / 99 : 0, on, tint, v.pct, HUB_ART[theme])}</div>
          <div class="panel presets">${presetRows}</div></div>
        ${tab ? `<div class="row">${tabBar}<span class="v">${readout}</span></div>${body}` : ""}
      </div></ha-card>`;
  }
}
LightDialCard.css = DIAL_CSS;
LightDialCard.dial = true;

// What music-dial-card.js builds on.
LightStudioCard.kit = { esc, clamp, num, sliderAttrs, dialPoint, dialDeg, dialFrac, checkTheme, themedCard };

if (typeof customElements !== "undefined" && !customElements.get("light-studio-card")) {
  customElements.define("light-studio-card", LightStudioCard);
  customElements.define("light-dial-card", LightDialCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "light-studio-card",
    name: "Light Studio Card",
    description: "One light, or the white and colour parts of one bulb: brightness, presets, and CCT / HSI / FX controls.",
    preview: true,
  }, {
    type: "light-dial-card",
    name: "Light Dial Card",
    description: "The Light Studio card as a glass card with a brightness dial and White / Color tabs.",
    preview: true,
  });
}
