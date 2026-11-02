# Source-backed nutrition engine

## Guarantee

The engine can guarantee **100% traceability of the values it accepts**, not
that a manufacturer label or OCR transcription is truthful. A product number
is accepted only when it is either:

1. copied from a product-specific manufacturer label with a reviewed artefact;
2. taken from the registered IFCT 2017 composition table; or
3. mathematically derived from already sourced values with a recorded formula.

The engine does not silently claim that a value is official merely because an
administrator entered it. A label transcription is a different evidence class
from an ICMR-NIN/IFCT research value.

## Source hierarchy

| Source kind | Use | Example |
| --- | --- | --- |
| `MANUFACTURER_LABEL` | Product-specific packaged-food nutrition panel | `PACK_PHOTO:<gtin>:<review-id>` plus a table field locator, artefact hash/URL or capture date, and `VERIFIED` status |
| `OFFICIAL_RESEARCH_TABLE` | Generic Indian food composition only, in a `GENERIC_FOOD` input; rejected for packaged products | ICMR-NIN IFCT 2017 with a food-code locator |
| `PEER_REVIEWED_RESEARCH` | Reserved for a registered reviewed composition table | A registered source ID and row/table locator |
| `DERIVED` | Arithmetic only; never an estimate | sodium ↔ salt conversion with formula and input fields |

The source registry in `source-registry.ts` contains source metadata and
derivation rules. DGI, FSSAI, WHO, and RSSDI entries are citation/guidance
sources, not product composition evidence; the source gate rejects them for
nutrient fields. Ingredient names are useful for allergen/additive
classification, but they do not supply the nutrition value of a packaged
recipe.

## Fail-closed rules

- Missing values remain `null`; they are never changed to zero.
- Total sugar is never used as a substitute for added sugar.
- Missing added fat or fibre is optional and stays unknown. Missing trans fat,
  cholesterol, sodium/salt, or another mandatory field blocks a grade.
- A missing serving or package size is not replaced with a typical portion.
- A candidate with an unknown comparison nutrient cannot be ranked as a
  healthier swap.
- `SourceBackedNutritionEngine.assertCompleteForEvaluation()` rejects values
  that lack field-level evidence.
- A mathematical derivation retains its input fields, formula, and source ID.

## Product-data policy

For a branded packaged product, the manufacturer's current label is the only
appropriate source for the product's recipe-specific nutrition. IFCT values
may be used for generic foods such as rice, dal, atta, or banana, but must not
be substituted for a branded biscuit/noodle/namkeen label. A scanned label is
shown as transcribed/unverified until it is reviewed against the image and,
where required, an official or manufacturer source.

## Integration status

`SourceBackedNutritionEngine` provides the field-level evidence contract and
`EvaluationService` exposes `sourceIntegrity`, `evaluability`, and the
consistency audit in every evaluation. The bundled seed records remain
intentionally unverified (and are often `UNSUPPORTED` or `INCOMPLETE`) until
real product label artefacts are attached; this is safer than calling fixture
numbers “100% verified”. Database reads also preserve the distinction between a
declared sodium value and a salt value derived from it.
