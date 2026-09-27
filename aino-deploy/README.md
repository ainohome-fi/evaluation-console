# Aino Selection Console V3.2.2 patch

Replace `index.html` in the existing Console repository.

This patch:
- Makes captured variant and fulfilment selectors span the full assessment setup width.
- Keeps full captured option text visible instead of truncating it in the narrow first grid column.
- Keeps exact captured variant prices in EUR.
- Adds the Aino commercial rule `ALIEXPRESS_FI_IMPORT_CHARGE_001` for the tested AliExpress → Finland flow when the captured evidence contains `Price includes VAT | Import charges will apply`.
- Applies €3.00 observed import charge + 25.5% VAT (€0.77) as separate deterministic pricing cost items.
- Does not populate Known customs duty with the €3 rule.
- Shows commercial-rule provenance and caveat in the pricing setup and completed pricing scenario.
- Keeps the rule separate from Business Thresholds and supplier evidence.
- Console UI remains V3.2.2.

The €3 rule is scoped to the tested AliExpress → Finland checkout flow and is not represented as a universal AliExpress charge. Checkout remains the final verification point.
