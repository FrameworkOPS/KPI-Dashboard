# Repository instructions

## Framework OPS brand system

Treat `DESIGN_SYSTEM.md` and `design/brand/brand-system.json` as core product
knowledge. Apply them to every UI, dashboard, agent surface, portal, website,
report, PDF, proposal, presentation, chart, email, and branded document in this
repository.

Brand Book v1.0 governs identity. Product Design System v1.0 governs visual
direction. The July 2026 UI/UX handoff governs v1.1 implementation corrections
and supersedes conflicting v1.0 interaction rules.

Use semantic tokens from `design/brand/framework-ops-v1.1.css` or the matching
JSON source. Do not invent colors, spacing, radii, typography, or motion values
inside components. Backend-only services retain the knowledge contract without
adding unused UI dependencies.

Do not claim `ui-verified` or v1.1 compliance merely because the files exist.
Verify responsive behavior, WCAG 2.2 AA, keyboard operation, asynchronous and
failure states, microcopy, and AI trust requirements first.
