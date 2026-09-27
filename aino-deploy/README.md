# Aino Selection Console V3.2.5

## Evidence Reasoning Upgrade

V3.2.5 introduces the agreed sequential evidence-reasoning pipeline:

**GATHER → OBSERVE → SYNTHESIZE → FOOLPROOF → CRITIQUE → SCORE → NEXT EVIDENCE → GATHER**

### What changed

1. **GATHER**
   - The assessment records which evidence sources are available and which useful source types are missing.
2. **OBSERVE**
   - The AI records literal, source-linked observations before interpretation.
3. **SYNTHESIZE**
   - The AI separates established facts, supplier claims, customer reports, and unknowns.
4. **FOOLPROOF**
   - The AI explicitly checks for missing evidence, unsupported statements, contradictions, duplicates, overreach/inference, and weak-source dependence.
5. **CRITIQUE**
   - The predefined Aino DNA dimensions are critiqued using support, missing evidence, critique, conclusion, and confidence.
6. **SCORE**
   - Existing deterministic V_A, DNA, Gate, Selection Score and PASS/HOLD/REJECT logic remains unchanged.
7. **NEXT EVIDENCE**
   - The assessment identifies prioritized evidence actions that feed the next GATHER cycle.

### Important design rule

The score is the end of the reasoning chain, not the beginning. V3.2.5 does not change Aino DNA definitions, weights, floors, selection bands, Gate thresholds, pricing formulas, or commercial rules.

### Deployment

Replace the existing Console `index.html` with the V3.2.5 `index.html` in your GitHub repository. Existing `/api/assess` and `/api/storage` endpoints remain compatible.

Because V3.2.5 stores the new reasoning object in the product record, **re-run an assessment** to populate the new Evidence Reasoning Pipeline for an existing product.
