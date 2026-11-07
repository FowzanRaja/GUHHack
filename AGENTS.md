# Project conventions

- Keep financial calculations deterministic and separate from model interpretation.
- Store all money as integer pennies; convert only at UI boundaries.
- Reuse `FinancialState` for Overview, Cora, Calendar and Goals. Do not add view-local financial truth.
- Treat Pot allocations as earmarks (`balanceImpact: 0`), not completed payments.
- Never reduce known essential commitments to hide a shortfall.
- Model output is a proposal only. Validate it server-side, calculate its impact in the application, and require user confirmation before state mutation.
- Use explicit schedule anchors and dates. Monthly days above a month’s length fall on that month’s final day.
- Keep UK English, GBP formatting, accessible labels and keyboard focus states.
- The project is a concept prototype: never imply a bank connection or real transfer.
