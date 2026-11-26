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
check(!h.includes("lsc-hub") && h.includes('class="t-glass'), "plain themes leave the hub alone");
dc.setConfig({ entity: "light.lamp", theme: "christmas" });
h = dc._html(dc._model());
check(h.includes('class="t-christmas') && h.includes("lsc-hub") && /--now:[\d.]+;--dx:\d+px;/.test(h) && ["thanksgiving", "winter"].every((t) => THEMES.includes(t)), "seasonal theme dresses the hub");
dc.setConfig({ entity: "light.lamp" });

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

// music-dial-card.js, loaded on top of the light card
const defs = {};
ctx.customElements = { whenDefined: () => ({ then: (f) => f() }), get: (n) => ({ "light-dial-card": LightDialCard })[n], define: (n, c) => { defs[n] = c; } };
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "music-dial-card.js"), "utf8"), ctx);
const Music = defs["music-dial-card"];
const ALL = 1 | 4 | 16 | 32 | 128 | 256 | 32768 | 262144;   // pause, volume, previous, next, on, off, shuffle, repeat
const player = (attrs = {}, state = "playing") => ({ state, attributes: { friendly_name: "Office Speaker", supported_features: ALL, volume_level: 0.4,
  media_title: "Song <i>x</i>", media_artist: "Artist", media_duration: 200, media_position: 5, media_position_updated_at: new Date(Date.now() - 5000).toISOString(),
  shuffle: false, repeat: "off", media_content_id: "library://playlist/2", ...attrs } });
const music = (st, cfg = {}) => {
  const calls = [];
  const c = new Music();
  c.setConfig({ entity: "media_player.o", ...cfg });
  c._hass = { states: { "media_player.o": st }, callService: (d, s, data) => calls.push([d + "." + s, data]) };
  return { c, calls, html: () => c._html(c._model()), tap: (act, i) => { c._click({ composedPath: () => [{ dataset: { act, i } }] }); return calls.at(-1); } };
};
const rejects = (cfg) => { try { new Music().setConfig(cfg); } catch { return true; } return false; };
check(rejects({ entity: "light.x" }) && rejects({ entity: "media_player.o", theme: "nope" }) && rejects({ entity: "media_player.o", favorites: [{ name: "Jazz" }] }), "music: rejects a light, an unknown theme and a favourite without an id");

let mu = music(player(), { favorites: [{ name: "Jazz", media_content_id: "library://playlist/2" }, { name: "Focus", media_content_id: "library://playlist/3", media_content_type: "playlist" }] });
h = mu.html();
check(!h.includes("<i>x</i>") && h.includes("Song &lt;i&gt;x"), "music: title is escaped");
check(h.indexOf('class="head"') < h.indexOf('class="vol"') && h.includes('<span class="st"><i></i>Playing</span>'), "music: the header leads the card with the status first, like the light dial card");
check(music(player({ entity_picture: "http://ma:8095/x", entity_picture_local: "/api/proxy/o" })).html().includes('src="/api/proxy/o"') && music(player({ entity_picture: "http://ma:8095/x" })).html().includes('src="http://ma:8095/x"'),
  "music: Home Assistant's copy of the cover is used before the player's own URL");
check(h.includes('class="pos">0:10<') && h.includes(">3:20<"), "music: position counts on from HA's last report while playing");
check(h.includes("VOL 40") && h.includes('aria-valuenow="40"') && h.includes('stroke-dasharray="40 100"'), "music: dial shows the volume");
check((h.match(/preset sel/g) || []).length === 1 && h.indexOf("preset sel") < h.indexOf("Jazz"), "music: the playing favourite is highlighted");
check(mu.tap("play")[0] === "media_player.media_play_pause" && mu.tap("next")[0] === "media_player.media_next_track" && mu.tap("prev")[0] === "media_player.media_previous_track", "music: transport buttons");
check(mu.tap("shuffle")[1].shuffle === true && mu.tap("repeat")[1].repeat === "all" && mu.tap("toggle")[0] === "media_player.turn_off", "music: shuffle, repeat and power");
check(music(player({ repeat: "one" })).tap("repeat")[1].repeat === "off", "music: repeat cycles back to off");
check(mu.tap("fav", "0")[1].media_content_type === "music" && mu.tap("fav", "1")[1].media_content_type === "playlist" && mu.calls.at(-1)[1].media_content_id === "library://playlist/3", "music: a favourite plays its media");

// the ring is the slider, the album art inside it is not
const press = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {},
  composedPath: () => [{ dataset: { slider: "vol" }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 240 }) }] });
mu.c._drag(press(120, 120));
check(!mu.c._endDrag && !mu.calls.some((c) => c[0].endsWith("volume_set")), "music: pressing the album art does not change the volume");
mu.c._drag(press(120, 16));
check(mu.calls.at(-1)[0] === "media_player.volume_set" && mu.calls.at(-1)[1].volume_level === 0.5, "music: pressing the top of the ring sets 50 %");
win.pointerup({ pointerId: 1, clientX: 224, clientY: 120 });
check(mu.calls.at(-1)[1].volume_level === 0.83 && !mu.c._endDrag && mu.html().includes("VOL 83"), "music: releasing the drag sends and shows the last level");
mu.c._key({ key: "ArrowLeft", composedPath: () => [{ dataset: { slider: "vol" } }], preventDefault() {} });
check(mu.calls.at(-1)[1].volume_level === 0.78, "music: arrow keys step the volume");

mu = music(player({ supported_features: 0, media_duration: undefined }, "idle"));
h = mu.html();
check(!/data-slider|skip-next|shuffle|pwr|class="prog"/.test(h) && mu.tap("play")[0] === "media_player.media_play", "music: a bare player shows only play");
mu = music(player({ supported_features: 4 }));
check(mu.html().includes("mdi:stop") && mu.tap("play")[0] === "media_player.media_stop", "music: a player that cannot pause stops");
h = music(player({}, "unavailable")).html();
check(h.includes("disabled") && !h.includes("data-slider") && h.includes("Unavailable"), "music: an unavailable player takes no input");
const themed = (theme, attrs, state) => music(player(attrs, state), { theme }).html();
h = themed("winter", { entity_picture: "/c.jpg" });
check(h.includes('<g class="cover"') && !h.includes('class="hub"'), "music: a cover wears the seasonal art");
check(!themed("christmas", {}, "idle").includes("lsc-hub") && themed("christmas", { entity_picture: "/c.jpg" }).includes("M58 73A50"), "music: christmas gets the snow cap, not Santa");
check(music(player({}, "idle"), { theme: "thanksgiving" }).html().includes('<g class="" transform="translate(120 120) scale(1.64) translate(-100 -100)"><circle class="hub"'), "music: with no cover the hub art is drawn whole, on a hub of its own");
check(!/class="hub"|class="cover"/.test(music(player()).html()), "music: other themes leave the dial as it was");

console.log(failures ?`${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
