# Framework OPS Product Design System v1.1

This repository treats the Framework OPS brand and product design system as
core engineering knowledge.

## Binding sources

1. Brand Book v1.0 owns identity.
2. Product Design System v1.0 owns interface philosophy and visual direction.
3. July 2026 UI/UX handoff owns v1.1 implementation corrections and supersedes
   conflicting v1.0 interaction rules.

Compliance level: **knowledge-aligned** until the repository's actual surfaces
pass responsive, accessibility, state, and microcopy review.

## Non-negotiable principles

- Ink-first for operational products; Paper for documents and reading.
- One emerald accent per task context.
- Geist reads; Geist Mono operates.
- Every asynchronous process exposes state, freshness, failure, and retry.
- Dense inside components, generous between groups.
- Buttons say what happens. Errors say what failed, what was preserved, and
  what the user can do next.
- AI is labeled, sourced, risk-tiered, reviewable, interruptible, and auditable.

## Canonical identity tokens

| Role | Token | Value |
|---|---|---|
| Ink | `--fo-ink` | `#07182B` |
| Ink Deep | `--fo-ink-deep` | `#030B17` |
| Surface | `--fo-surface` | `#0F2940` |
| Hairline | `--fo-hairline` | `#1B3A57` |
| Emerald | `--fo-emerald` | `#14B981` |
| Emerald Bright | `--fo-emerald-bright` | `#34D9A2` |
| Emerald Deep | `--fo-emerald-deep` | `#047857` |
| Bone | `--fo-bone` | `#F4F4EE` |
| Paper | `--fo-paper` | `#FAFAF7` |
| Fog | `--fo-fog` | `#D9DDD5` |
| Graphite | `--fo-graphite` | `#4A5868` |
| Ash | `--fo-ash` | `#8893A1` |
| Operational warning | `--fo-amber` | `#E8A33D` |
| Operational danger | `--fo-red` | `#E4604A` |

Product components use semantic `--ui-*` tokens, not raw hex.

## v1.1 interaction contract

- Container modes: compact below 768px, standard 768–1199px, wide at 1200px
  and above. Responsive behavior preserves task priority rather than shrinking
  the desktop view.
- Touch targets are at least 44px. Support safe areas, reflow, zoom, portrait,
  landscape, forced colors, high contrast, and reduced motion.
- Target WCAG 2.2 AA.
- Every page has a unique heading; breadcrumbs communicate hierarchy.
- Static tables use semantic table markup. Only true data grids capture arrow
  keys and manage cell focus.
- Control type communicates the kind of choice. The workflow declares immediate
  or deferred persistence and exposes pending, saved, failure, and rollback.
- Success and low-consequence information may auto-dismiss. Failures, warnings,
  and messages requiring action persist; timers pause on hover/focus.
- Truncated content is available on hover, keyboard focus, touch, and to
  assistive technology.
- Charts define window, unit, freshness, missing data, forecast/actual, targets,
  and an accessible summary or data table.
- AI surfaces show provenance, risk-based approval, pause and stop, partial
  failure, safe retry/idempotency, PII handling, and approver audit records.

## Governance

- 4px spacing base: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 6 controls, 10 inputs, 16 cards/dialogs, 22 feature panels.
- Motion: 120ms fast, 200ms base, 300ms slow, 400ms one-time data reveal;
  reduced motion uses 80ms opacity only.
- New visual primitives change the shared token source first. No silent drift.
- Backend-only services retain this contract but do not add unused UI
  dependencies.
