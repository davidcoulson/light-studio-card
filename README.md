# light-studio-card

Two Home Assistant dashboard cards for one light, in a single file with no dependencies.

- `custom:light-studio-card`: brightness, presets, and warmth / colour / effect tabs that appear only when the light supports them.
- `custom:light-dial-card`: the same controls around a brightness dial, with themes and a compact layout.

![The studio card, the dial card in the thanksgiving theme, and its compact layout in the christmas theme](docs/cards.png)

The screenshots show the cards running on a pretend lamp outside Home Assistant.

## Install

### Marketplace or HACS

The card is not in the default catalogue, so add this repository yourself:

- Home Assistant 2026.11 and newer: Settings > Marketplace > Add from link, and enter `davidcoulson/light-studio-card`.
- Older versions with HACS: HACS > ⋮ > Custom repositories, and add `https://github.com/davidcoulson/light-studio-card` with type Dashboard.

[![Open your Home Assistant instance and add this repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=davidcoulson&repository=light-studio-card&category=plugin)

Then install Light Studio Card from the list. The dashboard resource is added for you.

### Manual

Copy `light-studio-card.js` to `/config/www/` and add it as a dashboard resource:

```yaml
url: /local/light-studio-card.js
type: module
```

## Use

```yaml
type: custom:light-studio-card
entity: light.office_lamp
name: Desk Lamp                        # optional
icon: mdi:desk-lamp                    # optional
subtitle: E14 colour bulb              # optional, shown after the area
presets:                               # optional; the defaults fit the light
  - { name: Focus, brightness: 100, kelvin: 5000 }
  - { name: Sunset, brightness: 90, color: [23, 95] }        # hue °, saturation %
  - { name: Candle, brightness: 40, effect: Candle Flicker }
```

A bulb exposed as several lights that are never on together (a white centre and a colour ring) goes in one card with `entities:`. Each tab drives the part that supports it, and moving to another part turns the lit one off.

```yaml
type: custom:light-dial-card
entities: [light.office_center_lights, light.office_accent_lights]
theme: auto        # glass (default) | midnight | paper | ember | ocean | forest | contrast | thanksgiving | christmas | winter | auto
compact: true      # header, brightness slider and preset chips only
```

### Themes

The dial card has seven themes and three seasonal ones. `theme: auto` uses midnight in dark mode and paper in light mode.

![The dial card in each theme: glass, midnight, paper, ember, ocean, forest, contrast, thanksgiving, christmas and winter](docs/themes.png)

Three seasonal themes add moving art behind the controls and dress the dial's centre: `thanksgiving` (falling leaves, a pumpkin), `christmas` (snow over a row of lit trees, Santa) and `winter` (snow, a snow-capped dial). Each card starts its animation at its own random point, so cards side by side don't move in step. The motion stops when the device asks for reduced motion.

![The thanksgiving, christmas and winter themes](docs/seasonal.png)

Seasonal presets like the ones in the screenshot are set with `presets:`; the themes change only the look.

### Warmth suggestion

On the dial card, the sun marker on the warmth slider shows a suggested warmth for the time of day; tap it to apply.

## Test

```bash
node tests/card_test.js
```
