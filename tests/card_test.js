// Host test for light-studio-card.js with node, no browser:  node tests/card_test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };

const win = {};
const ctx = { console, requestAnimationFrame() { return 1; }, setTimeout() { return 1; }, clearTimeout() {}, clearInterval() {}, window: { addEventListener: (t, f) => { win[t] = f; }, removeEventListener() {} }, HTMLElement: class {
  attachShadow() { this.shadowRoot = { addEventListener() {}, querySelectorAll() { return []; }, innerHTML: "" }; }
} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "light-studio-card.js"), "utf8")
  + "\nthis.LightStudioCard = LightStudioCard; this.LightDialCard = LightDialCard; this.THEMES = THEMES;", ctx);
const { hueName, presetMatches, defaultPresets, caps, partLabels, dialFrac, LightStudioCard, LightDialCard, THEMES } = ctx;

check(hueName(23) === "Orange" && hueName(355) === "Red" && hueName(230) === "Blue", "hueName");
check(partLabels(["Office Center Lights", "Office Accent Lights"]).join() === "Center,Accent", "part labels drop shared words");

// presets
const light = (attrs, state = "on") => ({ state, last_changed: new Date().toISOString(), attributes: {
  friendly_name: "Office <b>Lamp</b>", supported_color_modes: ["color_temp", "rgb"],
  min_color_temp_kelvin: 3000, max_color_temp_kelvin: 6500, effect_list: ["None", "Candle Flicker"], ...attrs } });
const ct = light({ color_mode: "color_temp", brightness: 204, color_temp_kelvin: 4000 });   // 80 %
check(presetMatches({ brightness: 80, kelvin: 4000 }, ct), "CT preset matches");
check(!presetMatches({ brightness: 80, kelvin: 5000 }, ct), "other kelvin does not match");
check(!presetMatches({ brightness: 80, kelvin: 4000 }, { ...ct, state: "off" }), "off never matches");
const col = light({ color_mode: "rgb", brightness: 230, hs_color: [358, 94] });               // 90 %
check(presetMatches({ brightness: 90, color: [2, 95] }, col), "hue wraps around 360");
const narrow = defaultPresets(caps(ct.attributes)).map((p) => p.kelvin).filter(Boolean);
check(narrow.every((k) => k >= 3000) && new Set(narrow).size === narrow.length, "default kelvins clamped and not repeated");

// a card on fake hass, recording service calls
const card = (cfg, states) => {
  const calls = [];
  const c = new LightStudioCard();
  c.setConfig(cfg);
  c._hass = { states, callService: (d, s, data) => calls.push([s, data]) };
  return { c, calls, html: () => c._html(c._model()) };
};

// single light
const one = card({ entity: "light.lamp" }, { "light.lamp": ct });
check(!one.html().includes("<b>Lamp</b>") && one.html().includes("&lt;b&gt;Lamp"), "name is escaped");
check(/data-t="cct"/.test(one.html()) && /data-t="hsi"/.test(one.html()) && /data-t="fx"/.test(one.html()), "all three tabs for a CT+RGB+FX light");
check(one.html().includes('class="preset sel"'), "Desk work preset highlighted");
check(!one.html().includes("EV"), "no EV left");
const white = card({ entity: "light.w" }, { "light.w": light({ supported_color_modes: ["color_temp"], effect_list: undefined, color_mode: "color_temp", brightness: 128, color_temp_kelvin: 3000 }) });
check(!white.html().includes("data-t=") && white.html().includes("Warmth"), "white-only light: no tabs, Warmth slider");
check(card({ entity: "light.x" }, { "light.x": light({}, "unavailable") }).html().includes(" na"), "unavailable dims the body");
let threw = false;
try { new LightStudioCard().setConfig({ entity: "switch.x" }); } catch { threw = true; }
check(threw, "rejects a non-light entity");

// two parts of one bulb: white centre (CT) and colour ring (RGB + FX)
const center = (state, extra = {}) => ({ state, last_changed: new Date().toISOString(), attributes: {
  friendly_name: "Office Center Lights", supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500,
  ...(state === "on" ? { color_mode: "color_temp", brightness: 153, color_temp_kelvin: 4000 } : {}), ...extra } });
const accent = (state) => ({ state, last_changed: new Date().toISOString(), attributes: {
  friendly_name: "Office Accent Lights", supported_color_modes: ["rgb"], effect_list: ["None", "Aurora"],
  ...(state === "on" ? { color_mode: "rgb", brightness: 102, hs_color: [200, 80], rgb_color: [51, 173, 255] } : {}) } });
const ids = ["light.center", "light.accent"];
let two = card({ entities: ids }, { "light.center": center("on"), "light.accent": accent("off") });
let h = two.html();
check(/data-t="cct"/.test(h) && /data-t="hsi"/.test(h) && /data-t="fx"/.test(h), "parts' tabs combine");
check(h.includes("On · Center ·") && h.includes('data-t="cct" ') === false && /class="sel" data-act="tab" data-t="cct"/.test(h), "centre lit: status names it, CCT tab open");

two.c._click({ composedPath: () => [{ dataset: { act: "swatch", h: "120" } }] });
const [on1, off1] = two.calls;
check(on1[0] === "turn_on" && on1[1].entity_id === "light.accent" && on1[1].brightness_pct === 60 && on1[1].hs_color[0] === 120,
  "swatch while centre is lit: accent on at the centre's 60 %");
check(off1 && off1[0] === "turn_off" && off1[1].entity_id.join() === "light.center", "...and the centre off");

two = card({ entities: ids }, { "light.center": center("off"), "light.accent": accent("on") });
h = two.html();
check(h.includes("On · Accent ·") && /class="sel" data-act="tab" data-t="hsi"/.test(h), "accent lit: HSI tab open");
const focus = defaultPresets(two.c._model().c).findIndex((p) => p.name === "Focus");
two.c._click({ composedPath: () => [{ dataset: { act: "preset", i: String(focus) } }] });
check(two.calls[0][1].entity_id === "light.center" && two.calls[0][1].color_temp_kelvin === 5000 && two.calls[1][0] === "turn_off",
  "kelvin preset moves to the centre and turns the accent off");
two = card({ entities: ids }, { "light.center": center("off"), "light.accent": accent("on") });
two.c._click({ composedPath: () => [{ dataset: { act: "toggle" } }] });
check(two.calls[0][0] === "toggle" && two.calls[0][1].entity_id === "light.accent", "power toggles the lit part");

two = card({ entities: ids }, { "light.center": center("off"), "light.accent": accent("off") });
two.c._click({ composedPath: () => [{ dataset: { act: "effect", e: "Aurora" } }] });
check(two.calls.length === 1 && two.calls[0][1].entity_id === "light.accent" && two.calls[0][1].brightness_pct == null,
  "from off: only the chosen part is turned on");
check(two.c._model().active === "light.accent", "the last-used part shows while all are off");

// switching parts safely
two = card({ entities: ids }, { "light.center": center("on"), "light.accent": accent("unavailable") });
two.c._click({ composedPath: () => [{ dataset: { act: "swatch", h: "120" } }] });
check(two.calls.length === 0, "unavailable part: nothing sent, the lit part stays on");
two = card({ entities: ids }, { "light.center": center("on"), "light.accent": accent("off") });
two.c._click({ composedPath: () => [{ dataset: { act: "swatch", h: "120" } }] });
two.c._click({ composedPath: () => [{ dataset: { act: "preset", i: String(focus) } }] });   // HA still reports the old snapshot
check(two.calls.length === 4 && two.calls[2][1].entity_id === "light.center" && two.calls[3][0] === "turn_off" && two.calls[3][1].entity_id.join() === "light.accent",
  "switching back before HA reports also turns the pending part off");
two = card({ entities: ids }, { "light.center": center("on"), "light.accent": accent("off") });
two.c._click({ composedPath: () => [{ dataset: { act: "swatch", h: "120" } }] });
two.calls.length = 0;
two.c._click({ composedPath: () => [{ dataset: { act: "toggle" } }] });
check(two.calls.length === 1 && two.calls[0][0] === "turn_off" && two.calls[0][1].entity_id.join() === ids.join(), "power mid-switch turns every part off");

// dial variant
check(Math.abs(dialFrac(0, -50) - 0.5) < 1e-9 && dialFrac(0, 50) === 0 && dialFrac(60, 30) === 1 && dialFrac(-60, 20) < 0.2, "dial angle maps to brightness");
const dc = new LightDialCard();
dc.setConfig({ entity: "light.lamp" });
const dcalls = [];
dc._hass = { states: { "light.lamp": ct }, callService: (d, s, data) => dcalls.push([s, data]) };
h = dc._html(dc._model());
check(h.includes("80<tspan") && h.includes(">White<") && h.includes('data-act="recommend"') && !h.includes("OUTPUT") && h.includes('<span class="v"><b>4000</b> K</span>'), "dial card: dial, White tab, recommendation");
check(dc.constructor.css.includes(".dial"), "dial card gets its own CSS");
dc._click({ composedPath: () => [{ dataset: { act: "recommend", k: "3500" } }] });
check(dcalls[0][1].color_temp_kelvin === 3500 && dcalls[0][1].entity_id === "light.lamp", "recommendation sets the warmth");
check(one.html().includes("OUTPUT") && !one.html().includes("Recommended"), "studio card unchanged");

// dragging the dial sends while moving (throttled), then once more on release
dcalls.length = 0;
const ring = { dataset: { slider: "pct", dial: "1" }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 172 }) };
dc._drag({ composedPath: () => [ring], clientX: 100, clientY: 24, preventDefault() {} });   // top of the ring = 50 %
check(dcalls.length === 1 && Math.abs(dcalls[0][1].brightness_pct - 50) <= 1, "pointer down on the ring sends at once");
win.pointermove({ clientX: 176, clientY: 100 });
check(dcalls.length === 1, "a move straight after is throttled");
win.pointerup({ clientX: 176, clientY: 100 });
check(dcalls.length === 2 && dcalls[1][1].brightness_pct > 70, "release sends the final value");

// review mediums
const tap = (c, dataset) => c._click({ composedPath: () => [{ dataset }] });
const hueLight = light({ effect_list: ["off", "candle"], effect: "candle", color_mode: "color_temp", brightness: 204, color_temp_kelvin: 4000 });
check(!caps({ effect_list: ["off"] }).fx && caps(hueLight.attributes).fx, "off counts as no effect");
let x = card({ entity: "light.h", presets: [{ name: "Both", kelvin: 4000, color: [10, 90] }, { name: "Gone", effect: "Nope", brightness: 40 }] }, { "light.h": hueLight });
tap(x.c, { act: "preset", i: "0" });
check(x.calls[0][1].effect === "off" && x.calls[0][1].color_temp_kelvin === 4000 && !("hs_color" in x.calls[0][1]), "preset: the light's own off token, warmth without colour");
tap(x.c, { act: "preset", i: "1" });
check(x.calls[1][1].effect !== "Nope" && x.calls[1][1].brightness_pct === 40, "an effect the light does not list is not sent");

x = card({ entity: "light.p" }, { "light.p": { state: "on", last_changed: new Date().toISOString(), attributes: { friendly_name: "Plug", supported_color_modes: ["onoff"] } } });
check(defaultPresets(x.c._model().c).length === 1 && !x.html().includes("undefined") && !x.html().includes('data-slider="pct"'), "on/off light: one power preset, no brightness control");
x.c._send("light.p", { brightness_pct: 50 });
check(!("brightness_pct" in x.calls[0][1]), "an on/off part is never sent a level");

const bar = (slider) => ({ dataset: { slider }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 224, height: 50 }) });
const down = (c, el, o) => c._drag({ composedPath: () => [el], preventDefault() {}, pointerId: 1, ...o });
x = card({ entity: "light.k" }, { "light.k": light({ supported_color_modes: ["color_temp"], max_color_temp_kelvin: 6535, color_mode: "color_temp", color_temp_kelvin: 4000 }) });
down(x.c, bar("kelvin"), { clientX: 224, clientY: 10 });
check(x.calls[0][1].color_temp_kelvin === 6535 && !x.c._pos(NaN).includes("NaN"), "kelvin stays inside the advertised range");
win.pointermove({ pointerId: 2, clientX: 12, clientY: 10 });
win.pointerup({ pointerId: 2, clientX: 12, clientY: 10 });
check(x.calls.length === 1 && x.c._endDrag, "another pointer neither moves nor ends the drag");
win.pointercancel({ pointerId: 1, clientX: 12, clientY: 10 });
check(x.calls.length === 1 && !x.c._endDrag, "a cancelled drag commits nothing");
down(x.c, bar("kelvin"), { clientX: 100, clientY: 10, button: 2 });
down(x.c, bar("kelvin"), { clientX: 100, clientY: 10, pointerType: "touch" });
win.pointermove({ pointerId: 1, clientX: 102, clientY: 40 });
win.pointercancel({ pointerId: 1 });
check(x.calls.length === 1, "a right click, and a touch that turns into a scroll, send nothing");
down(x.c, bar("kelvin"), { clientX: 100, clientY: 10 });
x.c.disconnectedCallback();
check(!x.c._endDrag, "removing the card ends its drag");

dcalls.length = 0;
dc._drag({ composedPath: () => [ring], clientX: 8, clientY: 8, preventDefault() {} });
check(dcalls.length === 0 && !dc._endDrag, "blank dial space starts no drag");
dc._drag({ composedPath: () => [ring], clientX: 176, clientY: 100, preventDefault() {} });
win.pointerup({ clientX: 60, clientY: 165 });
check(dcalls.at(-1)[1].brightness_pct === 100, "crossing the gap holds the bright end");

two = card({ entities: ids }, { "light.center": center("unavailable"), "light.accent": accent("off") });
check(two.c._model().active === "light.accent", "an unavailable part is passed over while another can come on");
x = card({ entity: "light.e" }, { "light.e": light({ color_mode: "rgb", rgb_color: ["1);} *{x:y", 0, 0], hs_color: ["<q>", 5], color_temp_kelvin: "<u>" }) });
check(!x.html().includes("x:y") && !x.html().includes("<q>") && !x.html().includes("<u>"), "non-numeric colour attributes never reach the markup");

x = card({ entity: "light.lamp" }, { "light.lamp": ct });
x.c._set("light.lamp", { hue: 200, sat: 50 });
x.c._overUntil = 1;
x.c._set("light.lamp", { pct: 30 });
check(x.c._over.hue === undefined, "lapsed values do not come back with the next change");
x.c._key({ key: "ArrowRight", composedPath: () => [{ dataset: { slider: "pct" } }], preventDefault() {} });
check(x.calls.at(-1)[1].brightness_pct === 35, "arrow keys step a slider");
h = x.html();
check(h.includes('role="slider"') && h.includes('aria-valuenow="35"') && h.includes('aria-pressed="true"'), "sliders and toggles carry their state");
h = card({ entity: "light.x" }, { "light.x": light({}, "unavailable") }).html();
check(h.includes("inert") && h.includes("disabled"), "an unavailable card takes no input");

console.log(failures ?`${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
