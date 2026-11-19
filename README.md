# light-studio-card

Two Home Assistant dashboard cards for one light, in a single file with no dependencies.

- `custom:light-studio-card`: brightness, presets, and warmth / colour / effect tabs that appear only when the light supports them.
- `custom:light-dial-card`: the same controls around a brightness dial, with themes and a compact layout.

## Install

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
theme: auto        # glass (default) | midnight | paper | ember | ocean | forest | contrast | auto
compact: true      # header, brightness slider and preset chips only
```

`theme: auto` uses midnight in dark mode and paper in light mode. On the dial card, the sun marker on the warmth slider shows a suggested warmth for the time of day; tap it to apply.

## Test

```bash
node tests/card_test.js
```
