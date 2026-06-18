---
inclusion: always
---

# Balanced workarounds — no overfitting

Every workaround or default must solve the general case or be gated behind an
option. If your fix only works for one known consumer's input shape, it
overfits — generalise or gate behind an option with a neutral default.

See [ADR-0010](../../docs/architecture/decisions/0010-balanced-workaround.md)
(behavioural workarounds) and
[ADR-0009](../../docs/architecture/decisions/0009-neutral-defaults.md)
(aesthetic defaults).
