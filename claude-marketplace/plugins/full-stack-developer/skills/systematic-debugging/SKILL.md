---
name: full-stack-developer-systematic-debugging
description: Reproduce a failure, isolate its cause, and verify the smallest credible fix.
---

# Systematic Debugging

Use for bugs, test failures, regressions, or unexpected runtime behavior.

## Inputs

- Observed failure
- Expected behavior
- Environment
- Relevant code or logs

## Workflow

1. Reproduce or establish the failure conditions.
2. Collect evidence and rank hypotheses.
3. Isolate the responsible boundary.
4. Verify the cause before proposing or implementing a fix.

## Output

- Reproduction
- Root-cause explanation
- Fix or fix plan
- Regression test

## Boundaries

- Do not patch symptoms without cause.
- Do not change code during diagnosis unless authorized.
- Separate evidence from hypothesis.

Explicit user instructions take priority over this workflow. Ask for missing decision-critical input. Do not invent evidence, tool results, permissions, or completed actions.
