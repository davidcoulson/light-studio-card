// music-dial-card - the light-dial-card's glass card for a media player: a volume dial
// around the album art, the track, transport buttons and optional favourites. It lies
// down beside the dial when the card is 520px wide or more.
//
// It builds on light-studio-card.js, so add both files as dashboard resources.
//
//   type: custom:music-dial-card
//   entity: media_player.office_speaker
//   name: Office Speaker                   # optional
//   icon: mdi:speaker                      # optional
//   theme: midnight                        # optional, the same values as light-dial-card
//   favorites:                             # optional buttons that start something playing
//     - { name: Jazz, media_content_id: "library://playlist/12", media_content_type: playlist }

customElements.whenDefined("light-dial-card").then(() => {
  if (customElements.get("music-dial-card")) return;
  const Dial = customElements.get("light-dial-card"), Base = Object.getPrototypeOf(Dial);   // Base is LightStudioCard
  const { esc, clamp, num, sliderAttrs, dialPoint, dialDeg, dialFrac, checkTheme, themedCard } = Base.kit;

  // Volume dial: a 270° arc open at the bottom around the album art, in a 240 x 240 viewBox.
  const VOL = { cx: 120, cy: 120, r: 104, start: 225, span: 270 };
  const MP = { PAUSE: 1, VOLUME: 4, PREV: 16, NEXT: 32, TURN_ON: 128, TURN_OFF: 256, SHUFFLE: 32768, REPEAT: 262144 };   // HA's MediaPlayerEntityFeature bits
  const MP_STATE = { playing: "Playing", paused: "Paused", buffering: "Buffering", idle: "Idle", standby: "Standby", on: "On", off: "Off", unavailable: "Unavailable" };
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // [seconds played, seconds long], counting on from HA's last report while playing; null when the length is not known.
  function mediaPos(st, now = Date.now()) {
    const a = st.attributes, dur = num(a.media_duration), pos = num(a.media_position);
    if (!(dur > 0) || pos == null) return null;
    const run = st.state === "playing" ? (now - new Date(a.media_position_updated_at)) / 1000 : 0;
    return [clamp(pos + (run > 0 ? run : 0), 0, dur), dur];
  }
  function volSvg(v, live, muted) {
    const p = (f) => dialPoint(f, null, VOL).map((n) => n.toFixed(1)).join(" ");
    const arc = `d="M${p(0)} A${VOL.r} ${VOL.r} 0 1 1 ${p(1)}" fill="none" stroke-width="12" stroke-linecap="round"`;
    const [x, y] = p(v / 100).split(" ");
    return `<svg viewBox="0 0 240 240" aria-hidden="true">
      <path class="trk" ${arc}/>
      ${live ? `<path class="lvl" ${arc} pathLength="100" stroke-dasharray="${v} 100"/><circle class="knob" cx="${x}" cy="${y}" r="10"/>
      <text class="vl" x="120" y="229">${muted ? "MUTED" : "VOL " + v}</text>` : ""}
      <circle class="rim" cx="120" cy="120" r="82"/>
    </svg>`;
  }

  const MUSIC_CSS = Dial.css + `
:host { height: 100%; }   /* fill a dashboard cell that has a set height; no effect where the height is automatic */
ha-card { display: flex; flex-direction: column; justify-content: space-between; gap: 14px; height: 100%; box-sizing: border-box; padding: 18px; border-radius: 34px; }
ha-card.t-christmas { padding-bottom: 18px; }   /* no room to keep clear of the trees: the card sits over them */
.side { display: contents; }
.side > * { position: relative; z-index: 1; }   /* over a seasonal theme's art, like the card's own children */
.head { order: -1; margin: 0; gap: 12px; align-items: center; }
.ico { width: 48px; height: 48px; --mdc-icon-size: 26px; color: inherit; }
.name { font-size: 18px; }
.round { width: 44px; height: 44px; }
.na :is(.vol, .now, .prog, .ctl, .favs) { opacity: .4; }
.vol { position: relative; flex: 0 1 min(252px, 100cqw - 36px); min-height: 140px; aspect-ratio: 1; align-self: center; }   /* shrinks, still round, when the dashboard gives the card less height */
.vol[data-slider] { touch-action: none; }
.vol > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.art, .glow { position: absolute; inset: 15.8%; width: 68.4%; height: 68.4%; border-radius: 50%; object-fit: cover; }
.art { cursor: pointer; display: grid; place-items: center; background: var(--lsc-chip); color: var(--lsc-dim); --mdc-icon-size: 56px; }
.glow { filter: blur(30px) saturate(1.5); transform: scale(1.3); opacity: .5; pointer-events: none; will-change: filter; }   /* the cover, blurred, tints the card; will-change: a wall panel's graphics chip draws stray blocks without it */
.t-contrast .glow { display: none; }
.trk { stroke: rgba(128,128,128,.28); }
.lvl { stroke: var(--lsc-text); }
.knob { fill: var(--lsc-sel); filter: drop-shadow(0 1px 3px rgba(0,0,0,.5)); }
.rim { fill: none; stroke: var(--lsc-edge); }
.vl { font-size: 13px; font-weight: 600; letter-spacing: 1px; fill: var(--lsc-dim); text-anchor: middle; }
.now { text-align: center; min-width: 0; }
.song { font-size: 20px; font-weight: 600; line-height: 1.25; }
.now .sub { font-size: 14px; min-height: 1.5em; }
.song, .now .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prog { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--lsc-dim); font-variant-numeric: tabular-nums; }
.bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(128,128,128,.28); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; background: var(--lsc-text); }
.ctl { display: flex; align-items: center; justify-content: center; gap: 12px; }
.ctl button { flex: none; width: 48px; height: 48px; border-radius: 50%; background: var(--lsc-chip); display: grid; place-items: center; --mdc-icon-size: 24px; }
.ctl button:disabled { opacity: .35; cursor: default; }
.ctl .mode { width: 44px; height: 44px; background: none; color: var(--lsc-dim); --mdc-icon-size: 20px; }
.ctl .mode[aria-pressed="true"] { background: var(--lsc-chip); color: var(--lsc-text); }
.ctl .play { width: 64px; height: 64px; background: var(--lsc-sel); color: var(--lsc-sel-text); --mdc-icon-size: 30px; }
.favs { flex-direction: row; gap: 6px; max-height: none; overflow-x: auto; }
.favs .preset { flex: 1; justify-content: center; padding: 10px 12px; font-size: 14px; white-space: nowrap; }
@container (min-width: 520px) {
  ha-card, ha-card.t-christmas { flex-direction: row; align-items: center; gap: 18px; padding: 16px; }
  .side { display: flex; flex-direction: column; justify-content: space-between; gap: 12px; flex: 1; min-width: 0; align-self: stretch; }
  .vol { flex: none; width: clamp(200px, 44cqw, 300px); }
  .now { text-align: left; }
  .ctl { justify-content: space-between; }
}
`;

  class MusicDialCard extends Base {
    setConfig(config) {
      if (!String(config?.entity).startsWith("media_player.")) throw new Error("Set entity: to a media player");
      checkTheme(config);
      const favs = config.favorites ?? [];
      if (!Array.isArray(favs) || !favs.every((f) => f?.name && f.media_content_id)) throw new Error("favorites: each needs name and media_content_id");
      this._config = config;
      this._ids = [config.entity];
      this._endDrag?.();
      this._overUntil = 0;
      this._render();
    }

    connectedCallback() { this._tick = setInterval(() => this._progress(), 1000); }
    static getStubConfig(hass) {
      return { entity: Object.keys(hass.states).find((e) => e.startsWith("media_player.")) || "media_player.example" };
    }

    _model() { return this._hass.states[this._config.entity] || null; }
    _vol(st) { return Date.now() < this._overUntil ? this._over : Math.round(clamp(num(st.attributes.volume_level) ?? 0, 0, 1) * 100); }

    // Shows a volume straight away and, unless a drag is holding it back, sends it; HA's own value shows again 2.5 s after the last change.
    _volume(v, send = true) {
      this._over = v;
      this._overUntil = Date.now() + 2500;
      clearTimeout(this._overT);
      this._overT = setTimeout(() => this._render(), 2600);
      this._render();
      if (send) this._hass.callService("media_player", "volume_set", { entity_id: this._config.entity, volume_level: v / 100 });
    }

    // Moves the progress bar in place each second: a full render would rebuild the album art.
    _progress() {
      const st = this._hass && this._model(), p = st && mediaPos(st), bar = this.shadowRoot?.querySelector(".bar i");
      if (!p || !bar) return;
      bar.style.width = `${(p[0] / p[1] * 100).toFixed(1)}%`;
      this.shadowRoot.querySelector(".pos").textContent = clock(p[0]);
    }

    _html(st) {
      const cfg = this._config, id = cfg.entity, a = st.attributes, feat = num(a.supported_features) ?? 0;
      const na = st.state === "unavailable", off = st.state === "off", playing = st.state === "playing", dis = na ? "disabled" : "";
      const [, open] = themedCard(this, `${off || na ? "" : "on"} ${na ? "na" : ""}`, "--glow:0,0,0;--glow-a:0");   // the cover gives the glow, not a light's colour
      const v = this._vol(st), canVol = !na && !!(feat & MP.VOLUME), p = mediaPos(st);
      // Home Assistant's own copy first: a player's direct picture URL can be plain http, which an https dashboard blocks.
      const pic = [a.entity_picture_local, a.entity_picture].find((u) => typeof u === "string" && u);
      const src = pic && esc(pic.startsWith("/") ? this._hass.hassUrl?.(pic) ?? pic : pic);
      const btn = (act, icon, label, cls = "", pressed) => `<button class="${cls}" data-act="${act}" title="${label}" aria-label="${label}" ${pressed == null ? "" : `aria-pressed="${pressed}"`} ${dis}><ha-icon icon="mdi:${icon}"></ha-icon></button>`;
      const stops = playing && !(feat & MP.PAUSE);   // a player that cannot pause (a radio stream) stops instead
      return `${open}
        <div class="vol" ${canVol ? `data-slider="vol" ${sliderAttrs("Volume", v, 0, 100, v + "%")}` : ""}>
          ${src ? `<img class="glow" src="${src}" alt=""><img class="art" data-act="more" role="button" tabindex="0" src="${src}" alt="More info">`
      : `<div class="art" data-act="more" role="button" tabindex="0" aria-label="More info"><ha-icon icon="mdi:music"></ha-icon></div>`}
          ${volSvg(v, canVol, a.is_volume_muted)}
        </div>
        <div class="side">
          <div class="head">
            <div class="ico"><ha-icon icon="${esc(cfg.icon || a.icon || "mdi:speaker")}"></ha-icon></div>
            <div class="title"><div class="name">${esc(cfg.name || a.friendly_name || id)}</div>
              <div class="sub">${[this._area(id), MP_STATE[st.state] || "Unknown"].filter(Boolean).map(esc).join(" · ")}</div></div>
            ${feat & (off ? MP.TURN_ON : MP.TURN_OFF) ? btn("toggle", "power", "Power", "round pwr", !off) : ""}
          </div>
          <div class="now"><div class="song">${esc(a.media_title || (playing ? "Playing" : "Nothing playing"))}</div>
            <div class="sub">${[a.media_artist, a.media_album_name].filter(Boolean).map(esc).join(" · ")}</div></div>
          ${p ? `<div class="prog"><span class="pos">${clock(p[0])}</span><div class="bar"><i style="width:${(p[0] / p[1] * 100).toFixed(1)}%"></i></div><span>${clock(p[1])}</span></div>` : ""}
          <div class="ctl">
            ${feat & MP.SHUFFLE ? btn("shuffle", "shuffle", "Shuffle", "mode", !!a.shuffle) : ""}
            ${feat & MP.PREV ? btn("prev", "skip-previous", "Previous track") : ""}
            ${btn("play", stops ? "stop" : playing ? "pause" : "play", stops ? "Stop" : playing ? "Pause" : "Play", "play")}
            ${feat & MP.NEXT ? btn("next", "skip-next", "Next track") : ""}
            ${feat & MP.REPEAT ? btn("repeat", a.repeat === "one" ? "repeat-once" : "repeat", a.repeat === "one" ? "Repeat one" : "Repeat", "mode", a.repeat === "one" || a.repeat === "all") : ""}
          </div>
          ${cfg.favorites?.length ? `<div class="panel presets favs">${cfg.favorites.map((f, i) =>
      `<button class="preset ${f.media_content_id === a.media_content_id ? "sel" : ""}" data-act="fav" data-i="${i}" ${dis}>${esc(f.name)}</button>`).join("")}</div>` : ""}
        </div></ha-card>`;
    }

    _click(e) {
      const el = e.composedPath().find((n) => n.dataset?.act), id = this._config.entity, st = this._model();
      if (!el || !st) return;
      const a = st.attributes, call = (svc, data = {}) => this._hass.callService("media_player", svc, { entity_id: id, ...data });
      switch (el.dataset.act) {
        case "more": return this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
        case "toggle": return call(st.state === "off" ? "turn_on" : "turn_off");
        case "play": return call(a.supported_features & MP.PAUSE ? "media_play_pause" : st.state === "playing" ? "media_stop" : "media_play");
        case "prev": return call("media_previous_track");
        case "next": return call("media_next_track");
        case "shuffle": return call("shuffle_set", { shuffle: !a.shuffle });
        case "repeat": return call("repeat_set", { repeat: { off: "all", all: "one" }[a.repeat] || "off" });
        case "fav": {
          const f = this._config.favorites[Number(el.dataset.i)];
          return call("play_media", { media_content_id: f.media_content_id, media_content_type: f.media_content_type || "music" });
        }
      }
    }

    // Arrow keys step the volume; Enter or Space presses the album art.
    _key(e) {
      const el = e.composedPath()[0], d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if ((e.key === "Enter" || e.key === " ") && el?.dataset?.act && el.tagName !== "BUTTON") { e.preventDefault(); return this._click(e); }
      if (!d || !el?.dataset?.slider) return;
      e.preventDefault();
      this._volume(clamp(this._vol(this._model()) + d * 5, 0, 100));
    }

    _drag(e) {
      const el = e.composedPath().find((n) => n.dataset?.slider);
      if (!el || e.button > 0 || this._endDrag) return;
      const r = el.getBoundingClientRect();
      const at = (ev) => [(ev.clientX - r.left) * 240 / r.width - VOL.cx, (ev.clientY - r.top) * 240 / r.height - VOL.cy];
      const [dx, dy] = at(e), rad = Math.hypot(dx, dy), deg = dialDeg(dx, dy, VOL);
      if (rad < 86 || rad > 124 || (deg > VOL.span + 12 && deg < 348)) return;   // only the track, with a finger's margin: the art inside it is a button
      e.preventDefault();
      let pf, last = 0, sent;
      const pct = (ev) => {
        const f = dialFrac(...at(ev), VOL);
        pf = pf != null && Math.abs(f - pf) > 0.5 ? Math.round(pf) : f;   // past either end the level holds there, instead of flipping 0 <-> 100 across the gap
        return Math.round(pf * 100);
      };
      // The card re-renders while dragging, so follow the pointer on window. The player gets at most 4 commands a second.
      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const v = pct(ev), send = v !== sent && Date.now() - last >= 250;
        if (send) { last = Date.now(); sent = v; }
        this._volume(v, send);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        this._endDrag = null;
      };
      const up = (ev) => { if (ev.pointerId === e.pointerId) { stop(); this._volume(pct(ev)); } };
      // A cancelled gesture, or a card removed or reconfigured mid-drag, commits nothing more and shows HA's state again.
      const cancel = (ev) => { if (!ev || ev.pointerId === e.pointerId) { stop(); this._overUntil = 0; this._render(); } };
      this._endDrag = cancel;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      move(e);
    }
  }
  MusicDialCard.css = MUSIC_CSS;

  customElements.define("music-dial-card", MusicDialCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "music-dial-card",
    name: "Music Dial Card",
    description: "A media player in the light dial card's glass: a volume dial around the album art, transport buttons and favourites.",
    preview: true,
  });
});
