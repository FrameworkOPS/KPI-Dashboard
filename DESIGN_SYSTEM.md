# Framework OPS Design System — v1.0 (July 2026)

**Directive: every UI, document, email, chart, or branded surface produced in this
repository — by a human or by an AI agent — follows this standard.** Source of
truth: *FrameworkOPS Product Design System v1.0* (extends *Brand Book v1.0*).
Brand Book governs identity; the design system governs interface. Components
reference semantic tokens, never raw hex. This file is the agent-consumable
digest; when in doubt, defer to the tokens.

## Tokens

```css
:root {
  /* Brand (--fo-*) — canonical, do not restyle */
  --fo-ink: #07182B;            /* app background, dark */
  --fo-ink-deep: #030B17;       /* hero / splash / sidebar */
  --fo-surface: #0F2940;        /* elevated surface on ink */
  --fo-hairline: #1B3A57;       /* borders / dividers */
  --fo-emerald: #14B981;        /* accent / action */
  --fo-emerald-bright: #34D9A2; /* accent hover / glow */
  --fo-emerald-deep: #047857;   /* accent on light mode */
  --fo-bone: #F4F4EE;           /* primary text on ink */
  --fo-paper: #FAFAF7;          /* light (document) background */
  --fo-fog: #D9DDD5;            /* borders, light mode */
  --fo-graphite: #4A5868;       /* secondary text, light mode */
  --fo-ash: #8893A1;            /* secondary text, dark mode */
  --fo-amber: #E8A33D;          /* status: degraded/waiting only */
  --fo-red: #E4604A;            /* status: failed/blocked only */
  --fo-font-sans: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --fo-font-mono: 'Geist Mono', ui-monospace, 'JetBrains Mono', Menlo, monospace;

  /* Semantic (--ui-*) — DARK is the default (ink-first) */
  --ui-bg: var(--fo-ink);
  --ui-bg-deep: var(--fo-ink-deep);
  --ui-surface: var(--fo-surface);
  --ui-border: var(--fo-hairline);
  --ui-fg: var(--fo-bone);
  --ui-fg-2: var(--fo-ash);
  --ui-accent: var(--fo-emerald);
  --ui-accent-hi: var(--fo-emerald-bright);

  /* Motion */
  --t-fast: 120ms ease-out;                      /* hover, focus, toggles */
  --t-base: 200ms cubic-bezier(.2,.8,.2,1);      /* menus, tabs, toasts */
  --t-slow: 300ms cubic-bezier(.2,.8,.2,1);      /* modals, drawers */
  --t-data: 400ms ease-in-out;                   /* chart draw-in, once */
}
/* LIGHT (paper) — documents, reports, PDFs, print only */
[data-mode="paper"] {
  --ui-bg: var(--fo-paper);
  --ui-bg-deep: var(--fo-bone);
  --ui-surface: var(--fo-bone);
  --ui-border: var(--fo-fog);
  --ui-fg: var(--fo-ink);
  --ui-fg-2: var(--fo-graphite);
  --ui-accent: var(--fo-emerald-deep); /* emerald fails AA on paper */
  --ui-accent-hi: var(--fo-emerald);
}
```

## Five principles (every screen)

1. **Ink-first.** Dark = working surfaces (dashboards, agents, tools). Paper =
   reading surfaces (documents, reports, PDFs). Never mix modes in one view.
2. **One accent per view.** Emerald is a scalpel: one primary action, one live
   status, one highlight. If two things are emerald, neither is important.
3. **Mono = machine.** IDs, timestamps, statuses, metrics, code → Geist Mono
   with `font-variant-numeric: tabular-nums`. Human prose → Geist.
4. **State is visible.** Every async thing shows running/queued/failed/done.
   No silent success. Timestamps on everything that changes.
5. **Density, then air.** Tight inside components, generous between them.

## Layout & type

- 4px base. Spacing: 4/8/12/16/24/32/48/64. Arbitrary values are bugs.
- Radius: 6 controls · 10 inputs · 16 cards/modals · 22 feature panels.
- Sidebar 240px Ink Deep, grouped by verb; topbar 56px with mono breadcrumb +
  ⌘K. Content max 1320px; reading views 720px.
- Elevation on ink = lighter surface + hairline border, never shadow.
- Type scale: page 24/600 · section 18/600 · card title 15/500 · body 14/400 ·
  meta 12 Ash · overline mono 11 +22% · data mono tabular. Sentence case
  everywhere; no type below 12px; no bold-for-emphasis in body.

## Components (digest)

- **Buttons:** one primary per view; 36px (32 compact), radius 6, Geist 500/14.
  Labels say what happens ("Create job", never "Submit"). Loading keeps width,
  label goes present-continuous. Destructive confirms in a modal naming the
  object; never the primary style.
- **Forms:** labels above fields; placeholder = example, never label. Validate
  on blur; errors = what's wrong + how to fix, under the field. Toggles act
  immediately; checkboxes wait for Save; never mix. Mark *optional*, not required.
- **Cards:** Surface on Ink + hairline border; 24px padding (16 compact); no
  cards in cards; no emerald borders as decoration; one metric per metric card.
- **Tables:** numbers right-aligned mono tabular; hairline dividers, no zebra;
  row 44px (36 dense); whole row clicks; "…" ghost menu; empty state, not blank grid.
- **Status:** dot + lowercase mono label, never color alone. Emerald=running,
  amber=degraded/waiting, red=failed/blocked, hollow=idle/draft. Amber/red are
  functional only — never decoration.
- **Toasts:** bottom-right, 5s, max 3. Success past tense; failure ships a next
  step. Blocking errors = inline banner, not toast.
- **Dashboards:** KPI row (3–4) → one primary chart → tables. Every number
  states window + freshness. Surface bars; emerald marks the one series that
  matters; max 3 series; no pies, no 3D, no gradients. One screen — scrolls
  twice, split it.
- **Motion:** opacity + transform only; nothing >300ms except chart draw-in;
  status dots may pulse 2s when live — the only ambient motion.
  `prefers-reduced-motion` → 80ms opacity, non-negotiable.

## Agent & AI surfaces (§13 — binding for every agent UI)

- **Labeled:** mono agent name + status dot header (`● triage.agent · running`).
  Customer-visible AI output defaults to "review before send".
- **Logged:** every action is a timestamped log line — inputs, decision,
  confidence. Below-threshold confidence routes to an approval card
  (Approve · Edit · Skip), never silent execution.
- **Interruptible:** Pause/Stop always visible while running; streaming shows a
  block cursor ▊; stopping keeps partial output.

## Accessibility & microcopy

- Focus ring 3px emerald @28% outside the control; full keyboard paths; Esc
  closes top layer only; touch targets ≥44px; status/charts never color-alone.
- Voice: concrete, measured, plain. No exclamation marks. Errors say what's
  next ("HubSpot didn't respond. Your changes are saved — retry when ready.").
  The read-aloud test: if an ops manager wouldn't say it on a job site, rewrite.

## Governance

Apps declare the version they build against (**this file: v1.0**). New
components compose existing tokens; if one needs a new color/radius/duration,
the system changes first, then the component ships. No silent drift.
