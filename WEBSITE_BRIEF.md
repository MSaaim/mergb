# MeRGB Website — Design System Manifest

Spec for a **claude.ai/design** design-system project for the MeRGB showcase
site. This doc is a file manifest: every section below corresponds 1:1 to a
file to be created and pushed via the `DesignSync` tool (`/design-sync`
skill). Each file spec includes its path, its `@dsCard` marker (first line of
the file — this is what makes it show up in the Design System pane, grouped
and labeled), and its exact content requirements.

**Status:** no existing claude.ai/design project for this repo yet
(`list_projects` returned none). Next step to actually build this: create a
design-system project (`DesignSync.create_project`), then `finalize_plan`
with `writes: ["tokens/**/*.html", "components/**/*.html", "sections/**/*.html", "content/**"]`,
then `write_files` for each spec below, one group at a time — not as one
wholesale dump.

Each file's first line must be:
```html
<!-- @dsCard group="<Group>" name="<Name>" subtitle="<Subtitle>" -->
```
Group values used below: `Brand`, `Colors`, `Type`, `Spacing`, `Motion`,
`Iconography`, `Components`, `Sections`, `Content`.

---

## 0. Product facts (ground truth for every card's copy)

Pull copy from here — don't invent features. MeRGB is an Electron app
(macOS/Windows) that drives RGB lighting on the **Mountain Everest 60**
keyboard + detachable numpad directly over USB HID (no vendor app). MIT
licensed, on GitHub as `MSaaim/mergb`.

**Elevator pitch:** *The RGB software Mountain never shipped you. Full
per-key control, no bloat, open source.*

**Differentiators:** no vendor app/drivers · open source (MIT) · free · deep
per-key control, not just canned effects · Minecraft-reactive lighting ·
screen-color ambient lighting · real macOS-native app (menu bar, not a
Windows-only afterthought).

**Hardware support (state plainly, don't oversell):**
| Device | Status |
|---|---|
| Mountain Everest 60 (ANSI, `0x3282:0x0005`) | Supported |
| Mountain Everest 60 (ISO, `0x3282:0x0006`) | Supported |
| Numpad Module | Supported, auto-detected |

**Audience:** technical keyboard enthusiasts — comfortable with GitHub,
terminal, bypassing Gatekeeper. Copy tone: direct, a little dry, specific/
nerdy (LED counts, HID protocol) rather than hype-y gamer marketing. State
the single-keyboard limitation openly.

---

## 1. Tokens — `tokens/colors.html`

`@dsCard group="Colors" name="MeRGB Palette" subtitle="Dark-only, pulled directly from the app's styles.css"`

Render every token below as a swatch (color block + label + hex/rgba value).
These are copied verbatim from `src/styles.css` `:root` — **do not alter
them**, the whole point is 1:1 visual continuity with the shipping app.

```css
:root {
  --bg:          #151417;                 /* page background */
  --fill-1:      rgba(255,255,255,0.04);  /* subtlest panel fill */
  --fill-2:      rgba(255,255,255,0.07);  /* card / hover fill */
  --fill-3:      rgba(255,255,255,0.11);  /* active / pressed fill */
  --fill-4:      rgba(255,255,255,0.16);  /* strongest fill */
  --sep:         rgba(255,255,255,0.08);  /* hairline borders */
  --sep-strong:  rgba(255,255,255,0.14);  /* emphasized borders */
  --text:        #f6f6f8;                 /* primary text */
  --text-2:      #9a9aa2;                 /* secondary text */
  --text-3:      #66666e;                 /* tertiary / label text */
  --accent:      #ff596f;                 /* primary accent (coral-pink) */
  --accent-h:    #ff6e81;                 /* accent hover */
  --accent-q:    rgba(255,89,111,0.16);   /* accent quiet tint */
  --green:       #34c759;                 /* success / connected */
  --red:         #ff453a;                 /* error / destructive */
}
```

Card must also state the one sanctioned departure: **the hero section only**
may use a vivid cycling RGB gradient (spectrum sweep) as a backdrop/glow
accent — this is a lighting product and needs one moment that visually says
"RGB." Every other surface (nav, buttons, cards, badges) stays disciplined to
the palette above. No light theme — the app has none, don't invent one here.

---

## 2. Tokens — `tokens/type.html`

`@dsCard group="Type" name="Typography" subtitle="System font stack, no imported webfont"`

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
```

Show a type scale sample using this stack only: hero headline (~56/64px,
tight tracking), section heading (~28px), body (~15px, `--text-2`), label/
eyebrow (~11px, uppercase, `0.06em` tracking, `--text-3`, weight 600 — matches
`.control-label` in the app). Explicitly call out: **no display webfont** —
importing one breaks the "this feels like the same app" continuity. If a
heavier hero face is wanted, stay in the system/geometric-grotesk family.

---

## 3. Tokens — `tokens/spacing.html`

`@dsCard group="Spacing" name="Radius & Spacing" subtitle="14px / 7px radius pair, hairline borders"`

```css
--r-lg: 14px;   /* cards, panels */
--r-sm: 7px;    /* buttons, inputs, chips */
```

Borders: always 1px, always translucent white (`--sep` / `--sep-strong`),
never solid gray. Show radius examples at both sizes and a hairline-border
example on a `--fill-1` panel.

---

## 4. Tokens — `tokens/motion.html`

`@dsCard group="Motion" name="Easing" subtitle="Shared cubic-bezier for all hover/active transitions"`

```css
--ease: cubic-bezier(0.33, 0.68, 0, 1);
/* duration: 150–220ms for hover/active state changes */
```

Demo: a button/card that scales or lifts on hover using this exact curve.
Reuse it for every site interaction (nav hover, card lift, button press) —
this is what makes the site's motion feel like the app's motion.

---

## 5. Tokens — `tokens/icons.html`

`@dsCard group="Iconography" name="Icon System" subtitle="Lucide/Feather style, 24x24, stroke-2"`

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
```

Spec: 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`
— this is the exact signature of **Lucide** (maintained continuation of
Feather). Use Lucide's icon set site-wide (nav, feature grid, footer links).
Never mix in a filled/solid icon style. Show 6–8 representative icons from
Lucide at this spec as a reference grid.

---

## 6. Component — `components/button-primary.html`

`@dsCard group="Components" name="Primary Button" subtitle="Default, hover, active, disabled"`

Source: `.btn-primary` in the app.
```css
padding: 9px 20px; border: none; border-radius: var(--r-sm);
background: var(--accent); color: #fff;
font-size: 13px; font-weight: 590; letter-spacing: -0.01em;
box-shadow: 0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.18);
transition: all 0.16s var(--ease);
/* hover: */ background: var(--accent-h);
/* active: */ transform: scale(0.98); filter: brightness(0.96);
/* disabled: */ opacity: 0.4; cursor: not-allowed; box-shadow: none;
```
Show all four states side by side. This is the site's primary CTA style
("Download for Mac").

---

## 7. Component — `components/segmented-control.html`

`@dsCard group="Components" name="Segmented Control" subtitle="e.g. Mac / Windows download toggle"`

Source: `.segment-group` / `.seg-btn`.
```css
.segment-group { display: inline-flex; background: var(--fill-2);
  border: 1px solid var(--sep); border-radius: 9px; padding: 2px; }
.seg-btn { padding: 5px 14px; border: none; border-radius: 6.5px;
  background: transparent; color: var(--text-2); font-size: 12px; font-weight: 510; }
.seg-btn.active { background: var(--fill-3); color: var(--text);
  box-shadow: 0 1px 2px rgba(0,0,0,0.35); }
```
Show a 2-option example labeled "Mac / Windows" — this is the intended reuse
on the site's download section for platform switching.

---

## 8. Component — `components/card-feature.html`

`@dsCard group="Components" name="Feature Card" subtitle="Default and active/selected state"`

Source: `.effect-card` / `.info-card`.
```css
border: 1px solid var(--sep); border-radius: var(--r-lg);
background: var(--fill-1); color: var(--text-2);
transition: all 0.18s var(--ease);
/* hover: */ background: var(--fill-2); border-color: var(--sep-strong);
  color: var(--text); transform: translateY(-2px);
/* active/selected: */ border-color: transparent; background: var(--accent-q);
  color: var(--accent); box-shadow: inset 0 0 0 1.5px var(--accent);
```
Show one card with icon + title + 1–2 line description, in default, hover,
and active states. This is the feature-grid tile used 9 times on the site
(see §14).

---

## 9. Component — `components/badge-status.html`

`@dsCard group="Components" name="Status Badge" subtitle="Connected / disconnected style, tinted not solid"`

Source: `.badge-connected` / `.badge-disconnected`.
```css
/* connected: */ background: rgba(52,199,89,0.14); color: var(--green);
  border: 1px solid rgba(52,199,89,0.3);
/* disconnected: */ background: var(--fill-2); color: var(--text-3);
```
Tinted-background + full-opacity semantic text color, never a solid fill.
Reuse for e.g. a GitHub-stars badge or a "Built for macOS/Windows" chip.

---

## 10. Component — `components/nav-sticky.html`

`@dsCard group="Components" name="Sticky Top Nav" subtitle="Logo + anchor links + persistent download CTA"`

Layout: logo mark + wordmark (left), anchor links — Features / Screenshots /
Download / GitHub↗ (center-right), primary-button-styled "Download" pinned
right. Background `--bg` at ~90% opacity + backdrop blur on scroll, `--sep`
hairline bottom border. Links use `--text-2`, `--text` on hover, `--accent`
for the active/current-section link — mirrors `.nav-btn` in the app.

---

## 11. Component — `components/download-cta.html`

`@dsCard group="Components" name="Download CTA Block" subtitle="OS-detected primary + secondary + install caveat"`

Composition: primary button (auto-detected OS label, e.g. "Download for
Mac"), secondary text link for the other OS, and — **must be visually
present, not collapsed/hidden** — a small caveat line below: unsigned app,
Gatekeeper/SmartScreen will warn, one-line fix (`right-click → Open`, or
`xattr -cr /Applications/MeRGB.app` if "damaged"). This caveat is the
single most important microcopy on the page; treat it as a first-class
element, not a footnote.

---

## 12. Section — `sections/hero.html`

`@dsCard group="Sections" name="Hero" subtitle="Headline, CTAs, RGB gradient moment, product visual"`

Content:
- Headline from the elevator pitch (§0)
- Subhead: one sentence — direct HID control, no vendor app, open source, free
- Primary CTA: Button Primary component, "Download for Mac"
- Secondary CTA: text link, "View on GitHub"
- Visual: app screenshot or looping clip of a live animation (Wave effect or
  the Ambience Circle pattern) — RGB software needs to *move* to sell itself;
  a static screenshot undersells it
- Small disclosure line under the fold: "Currently supports the Mountain
  Everest 60 — more keyboards planned."
- This is the one section allowed the cycling-RGB-gradient backdrop from §1.

---

## 13. Section — `sections/spotlight.html`

`@dsCard group="Sections" name="Spotlight Features" subtitle="Minecraft Mode, Screen Ambience, No Vendor Software"`

Three deep-dive blocks (bigger than a feature-grid card — each gets a
screenshot/GIF):
1. **Minecraft Mode** — most novel/shareable feature. Show dimension→color
   mapping visually: green Overworld, orange Nether, purple End, plus flash
   behavior on deaths/damage/advancements.
2. **Screen Ambience** — screen + keyboard shown reacting together in real
   time (like a Hue sync box built into the keyboard).
3. **No Vendor Software** — technical-credibility block: direct 65-byte HID
   feature reports, reverse-engineered protocol, credit BaseCamp-Linux and
   OpenRGB. Builds trust with the hobbyist audience that this isn't sketchy
   software.

---

## 14. Section — `sections/feature-grid.html`

`@dsCard group="Sections" name="Feature Grid" subtitle="9 Feature Card instances, full feature sweep"`

Use the Feature Card component (§8) for each entry, icon + title + 1-2 line
description:

| Title | Description |
|---|---|
| Lighting Effects | Static, Wave, Breathing, Reactive, Tornado, Matrix, Yeti, Ripple, Plasma, animated Shapes — configurable colour, speed, brightness, direction. |
| Per-Key Custom Lighting | Click-and-drag paint any key or strip LED any colour. Fill/clear keys and strips independently. |
| Ambience Strip Animations | Split or Circle (CW/CCW) patterns around the perimeter LED ring, with speed and smoothing control. |
| Screen Ambience | Keyboard lighting matches your screen's dominant colour in real time. |
| Minecraft Mode | Ambient colour shifts with dimension; flashes on deaths, damage, advancements. |
| Audio Visualizer | Mic-reactive lighting — Spectrum / Fire / Ocean / Matrix themes, configurable sensitivity and target. |
| Numpad Module Support | Full RGB for the detachable numpad, including its 22-LED perimeter ring. |
| Presets & Persistence | Save/load named per-key presets; lighting state survives app restarts. |
| Menu Bar / Tray | Switch modes without opening the window; closes to tray. Auto-connects over USB hotplug. |

---

## 15. Section — `sections/screenshots.html`

`@dsCard group="Sections" name="Screenshots Strip" subtitle="Real app captures, lightbox or horizontal scroll"`

Horizontal strip or lightbox gallery, one real screenshot per app tab:
Lighting, Per-Key, Ambience, Screen Ambience, Minecraft, Visualizer, Device.
Capture at 2x for retina, with a vivid multi-colour per-key layout active so
nothing looks monochrome. (No screenshots exist yet — must be captured fresh
from a running instance before this card can be finished.)

---

## 16. Section — `sections/hardware-download.html`

`@dsCard group="Sections" name="Hardware + Download" subtitle="Supported-device table, OS-detected download block"`

Combines the hardware table (§0) — framed positively, "Built specifically
for the Everest 60," not apologetically — with the Download CTA component
(§11). Download logic: fetch latest release from
`GET https://api.github.com/repos/MSaaim/mergb/releases/latest` at load time,
match `.dmg` / `.exe` assets by filename, point buttons at
`browser_download_url`. Never hardcode a version — releases auto-build on
every push to `main`. Fall back to linking the Releases page if the API call
fails/rate-limits (60 req/hr unauthenticated).

---

## 17. Section — `sections/oss-footer.html`

`@dsCard group="Sections" name="Open Source + Footer" subtitle="Contributing call-out, credits, license"`

Open-source block: MIT license, repo link, concrete wanted contributions
(additional Mountain keyboards, Linux support, Intel Mac builds, new effects,
import/export presets), GitHub star count if easily embeddable.

Footer: logo mark, MIT license line, links (GitHub / Releases / Issues),
credits (BaseCamp-Linux, OpenRGB, node-hid, Electron).

---

## 18. Content — `content/copy.md`

`@dsCard group="Content" name="Copy Reference" subtitle="Tone rules + non-goals, not a visual card"`

**Tone:** direct, technical, a little dry. Not hype-y gamer marketing
("UNLEASH YOUR RGB"). Confident about strengths, plain about the
single-keyboard limitation — don't hide it. Nerdy specifics (HID report
sizes, LED counts) build credibility with this audience rather than
confusing them. Avoid corporate-SaaS phrasing ("empower your workflow").

**Explicit non-goals:** no user accounts/backend/analytics, no i18n, no blog
(link `CHANGELOG.md` on GitHub instead), no light theme, no implying hardware
support beyond the Everest 60 + numpad.

**Technical baseline for whoever builds this:** static site (plain HTML/CSS/
vanilla JS is enough), dark-only, responsive down to phone width, respect
`prefers-reduced-motion` for any looping hero video, standard SEO/OG meta
generated from the elevator pitch + a hero screenshot, deploy via GitHub
Pages off the `MSaaim/mergb` repo.
