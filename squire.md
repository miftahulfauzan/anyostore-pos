# Squire -- Agent Operating System

> Drop this file into your project root or `~/.claude/` to give your AI agent a behavioral operating system.
> Derived from 2,990 sessions, 3,307 commits, and 12 shipped products across 5 months.
> Customize the sections below for your workflow. Delete what you don't need.

---

## How to Use

**Project-level:** Copy `squire.md` to your project root. Claude Code reads it automatically.

**Global:** Copy to `~/.claude/CLAUDE.md` for rules that apply across all projects.

**Both:** Use global for behavioral rules, project-level for project-specific conventions.

---

## Behavioral Rules

These rules are derived from analyzing 1,075 real AI-assisted development sessions across 3,667 commits. They address the most common failure modes -- the patterns where agents waste time, introduce bugs, or frustrate developers.

### 1. Default to Implementation

When asked to implement something, start coding immediately. Do not spend the entire session exploring and planning unless explicitly asked to create a plan.

When continuing a prior session's work, execute the existing plan immediately. Do NOT re-present the plan for approval or ask "should I proceed?" The plan was already approved.

### 2. Plan Means Plan

When the user asks for "a plan", deliver a written plan document. Not an audit. Not a visualization. Not a deep exploration. A concise implementation plan with files, order, and rationale.

### 3. Preflight Before Push

Always run a preflight check (build, tests, lint, type-check) BEFORE pushing to any remote. Never push without explicit user approval. The sequence is: fix -> verify -> ask -> push. Never: fix -> push -> hope.

### 4. Investigate Bugs Directly

When the user reports a bug or runtime error, investigate and fix it directly. Do not dismiss issues as "stale cache", "hot reload artifact", or "transient" without concrete evidence. If it broke, something changed. Find what changed.

### 5. Scope Changes to the Target

Scope configuration changes to the specific project requested. Do not apply rules, env changes, hooks, or config globally across all repos unless the user explicitly says "all repos" or "globally." One project = one project.

### 6. Verify After Each Edit

After editing each file, run `npx tsc --noEmit` (or equivalent type-check) before moving to the next file. Do not batch 6 file edits and then discover cascading type errors. Catch them one at a time.

### 7. Visual Output Verification

When the user says something is visually wrong (colors, sizing, layout), check the rendered output or exact CSS/component values -- do not just re-read the source code and assume it's correct.

### 8. Check Your Environment

Before running database CLI commands, deployment commands, or environment-specific operations, verify you're targeting the correct project/environment. Never assume the current context is correct.

### 9. Don't Over-Engineer

Only make changes that are directly requested or clearly necessary. Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability.

---

## Execution Patterns

Seven patterns govern how the agent works. Apply always: Metacognitive + PEV + Inversion. Apply when appropriate: Reflection, Tree of Thoughts, Ensemble.

| Pattern | When | Signal |
|---------|------|--------|
| **Inversion** | Problem-solving, debugging, architecture | "What would guarantee failure?" -- eliminate wrong answers first |
| **Reflection** | Writing 50+ lines of code | Generate, critique, refine before presenting |
| **PEV** | Before commits/deploys | Plan, Execute, Verify outcomes |
| **Metacognitive** | Always, especially high-stakes | Express confidence: High/Medium/Low/Don't Know. Never hallucinate. |
| **Tree of Thoughts** | Complex decisions | Generate 2-3 approaches with pros/cons, recommend one |
| **Ensemble** | Important architectural choices | Consider builder/quality/user/maintenance perspectives |

---

## Git Workflow

### Branch Protection

Never commit directly to `main`. Use feature branches and PRs.

### Commit Convention

Use descriptive, stage-prefixed commits when working within a pipeline:

```
[Stage N: Stage Name] type: description
```

Types: `feat`, `fix`, `deps`, `docs`, `verify`, `refactor`, `test`

Gate commits: `[Stage N: Name] verify: gate PASSED -- description`

For work outside a pipeline stage, use conventional commits or `[Meta]` prefix.

### Merge Strategy

Never squash merge. Use regular merges to preserve granular commit history. Every commit tells the build story.

### Build Journal

Every project should have a `BUILDING.md` in the repo root -- a living document that captures what was built, why, and key decisions. Update it at every significant milestone. See `BUILDING-SETUP.md` in this repo for a self-installing version.

---

## Workspace System

File-based project organization for tasks, research, and decisions.

```
workspace/
  tasks/        # Active task files (YYYY-MM-DD-slug.md)
    .done/      # Completed archive
  prep/         # Research & architecture docs
  scratch/      # Quick experiments (gitignored)
  ideas/        # Future concepts
  decisions/    # Architecture Decision Records (NNNN-slug.md)
```

Use the generator scripts in `workspace/generators/` to create workspace items:

```bash
./generators/new-task.sh "Title" --priority high
./generators/new-feature.sh "Feature Name" --branch
./generators/new-bug.sh "Description" --severity critical
./generators/new-prep.sh "Topic" --type architecture
./generators/new-adr.sh "Decision title"
./generators/done-task.sh <task-file>
```

---

## Verification-First Development

Establish verification criteria BEFORE implementing:
- Test cases, screenshots, expected outputs, build/lint commands
- For UI changes: before/after screenshots
- For bug fixes: address root causes, don't suppress errors

---

## Pipeline Integration

Squire includes a stage-gate build pipeline (see `pipeline/`). The pipeline provides:

- **11 stages** from Concept Lock to Listen & Iterate
- **Gate questions** at each stage to prevent premature advancement
- **Branch hygiene** protocols for clean git history
- **Agent-native additions** for AI-assisted development at each stage

Use the pipeline for greenfield projects. For existing projects, assess the current state and resume from the appropriate stage.

---

## Multi-Model Orchestration

For complex builds, Squire supports a Director/Builder pattern (see `patterns/director-builder.md`):

- **Director** (reasoning model): Plans, reviews, integrates, ships
- **Builder** (code generation model): Executes scoped implementation tasks

The pattern provides error diversity (two models catch different bugs), context efficiency (builder gets focused prompts), and built-in code review.

---

## Thinking Frameworks

Squire includes reusable prompt templates for common tasks (see `prompts/`):

| Framework | Purpose |
|-----------|---------|
| `code-review.md` | Systematic code review across 7 dimensions |
| `debug-systematic.md` | Structured debugging: reproduce, isolate, hypothesize, fix |
| `ship-readiness.md` | Go/no-go deployment checklist |
| `performance-audit.md` | Measure-first performance investigation |
| `security-audit.md` | STRIDE-based security evaluation |
| `test-strategy.md` | Test pyramid planning and coverage |

---

## Document Templates

Squire includes templates for common project documents (see `doc-templates/`):

| Template | Purpose |
|----------|---------|
| `feature-spec.md` | Feature specification with technical design |
| `bug-investigation.md` | Structured bug report and investigation log |
| `adr.md` | Architecture Decision Record |
| `deployment-checklist.md` | Pre/post deploy verification |
| `implementation-plan.md` | Step-by-step implementation plan |
| `api-endpoint-design.md` | API endpoint specification |

---

## Customization

This file is a starting point. Adapt it:

1. **Delete sections you don't need.** If you don't use a pipeline, remove that section.
2. **Add your project specifics.** Tech stack, deployment targets, team conventions.
3. **Add your own rules.** Every team discovers its own failure modes. Document them here.
4. **Keep it honest.** Only add rules you actually follow. Dead rules erode trust in the whole document.

The best `squire.md` is one that reflects how you actually work, not how you wish you worked.
