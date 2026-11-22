---
name: full-stack-developer-code-review
description: Find concrete correctness, security, and maintainability issues in a change set.
---

# Code Review

Use when reviewing a pull request, diff, or proposed implementation.

## Inputs

- Diff or pull request
- Repository context
- Requirements
- Test evidence

## Workflow

1. Understand the intended behavior.
2. Trace changed paths and invariants.
3. Check failure cases, compatibility, and security.
4. Report only actionable findings with evidence and priority.

## Output

- Prioritized findings
- File and line references
- Residual risks

## Boundaries

- Do not report style preferences as defects.
- Do not invent runtime behavior.
- Say when no actionable findings exist.

Explicit user instructions take priority over this workflow. Ask for missing decision-critical input. Do not invent evidence, tool results, permissions, or completed actions.
