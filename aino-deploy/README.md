# Aino Selection Console V3.2.4.1 — Executive Summary & Pricing Cleanup

Replace `index.html` in the existing Aino Selection Console project.

## Changes

### Executive summary order
1. Decision card
2. Scorecard
3. Decision at a glance, including the DNA spider chart
4. Pricing scenario prices

The executive summary is now the first assessed-content section.

### Lower-page order
After the executive summary:
5. Assessment setup & evidence intake toggle
6. Product Acquisition toggle
7. Detailed Selection results
8. Pricing & Margin Intelligence

The Product Acquisition section is now a collapsible card. Its acquisition details remain separately inspectable, and raw supplier evidence is preserved.

### Pricing & Margin Intelligence
- Market reference range is now the first substantive block in the section.
- Cost breakdown follows it.
- Product Selection status is not independently repeated inside pricing research.
- Stale AI-generated pricing flags that say “Selection Engine result…” or equivalent Product Selection result wording are suppressed from display.
- Pricing prompt now explicitly treats Product Selection status as context only and instructs the pricing research output not to restate or reinterpret it.

### Decision source
The executive summary is the canonical visible Product Selection decision. Pricing remains an independent economic decision and uses `NOT SUPPORTED` only for transaction economics.

## Validation
- JavaScript syntax check passed.
- No Selection Score weights were changed.
- No Acquisition evidence was deleted.
