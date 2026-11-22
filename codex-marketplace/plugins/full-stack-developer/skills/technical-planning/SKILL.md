---
name: full-stack-developer-technical-planning
description: Turn an approved behavior change into a repository-grounded implementation plan.
---

# Technical Planning

Use before a multi-file feature, migration, or risky refactor.

## Inputs

- Requested behavior
- Repository
- Constraints
- Acceptance criteria

## Workflow

1. Inspect relevant architecture and conventions.
2. Resolve discoverable unknowns.
3. Define interfaces, data flow, and failure modes.
4. Specify implementation and verification steps.

## Output

- Implementation plan
- Interface changes
- Risk list
- Test plan

## Boundaries

- Do not plan from assumptions when the repository can answer.
- Do not include unrelated refactors.
- Keep the plan decision-complete.

Explicit user instructions take priority over this workflow. Ask for missing decision-critical input. Do not invent evidence, tool results, permissions, or completed actions.
