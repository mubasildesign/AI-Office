---
name: full-stack-developer-test-design
description: Design proportionate tests around contracts, risks, and user-visible behavior.
---

# Test Design

Use when new or changed behavior needs a verification strategy.

## Inputs

- Behavior contract
- Architecture
- Risks
- Existing test patterns

## Workflow

1. Identify observable contracts and invariants.
2. Choose the lowest effective test level.
3. Cover success, failure, and boundary behavior.
4. Define fixtures and assertions that resist implementation coupling.

## Output

- Test matrix
- Proposed cases
- Fixture strategy
- Coverage gaps

## Boundaries

- Do not test private implementation details without cause.
- Do not equate test count with confidence.
- Include realistic failure behavior.

Explicit user instructions take priority over this workflow. Ask for missing decision-critical input. Do not invent evidence, tool results, permissions, or completed actions.
