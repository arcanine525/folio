---
name: task-start
description: >
  Pick a task from Tasks.md by ID, show an implementation plan, confirm with the
  user, branch from develop, implement, write unit tests, run build + lint + tests,
  then mark the task done in Tasks.md.
  Use when the user runs /task-start <task-id>  (e.g. /task-start P2.4).
---

# task-start

Implements one section from `Tasks.md`. Steps run in order; a **STOP** means
tell the user what happened and end the skill.

The task file lives at `Tasks.md` in the docs/ folder.
Branch naming: `feature/folio-<task-id-lowercase>` (e.g. `feature/folio-p2-4`).
Base branch: `develop`.

---

## Step 1 — Parse the task ID

Accept the task ID passed as the argument to `/task-start`.
Valid formats: `P<phase>.<section>` for a whole section (e.g. `P2.4`) or
`P<phase>.<section>.<index>` for a single item (e.g. `P2.4.1`) or `P <phase>` for a phase.

If no argument was given, read `Tasks.md`, find the first section that has **any**
unchecked `- [ ]` item, and use that section ID. Tell the user which ID was
auto-selected.

If the ID is not found in `Tasks.md`, **STOP**: tell the user the ID doesn't
exist and list the available phase/section IDs.

---

## Step 2 — Check working tree

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
```

If there are **any** staged or unstaged changes: **STOP** and tell the user to
commit or stash before starting a new task.

---

## Step 3 — Read the task(s)

Parse `Tasks.md` to extract the full content of the target section (or single
item). Collect:

- **Section heading** — e.g. `2.4 — FileTreeItem component`
- **Target file(s)** — parsed from the heading or task text in backticks
- **All task items** — both checked and unchecked
- **Already-done count** — number of `- [x]` items in the section
- **Remaining items** — the `- [ ]` items to implement now

If **all items are already checked** (`- [x]`): **STOP** and tell the user this
section is complete. Suggest the next unchecked section.

---

## Step 4 — Show implementation plan and confirm

Present a concise plan **before writing any code**:

```
Task:    P2.4 — FileTreeItem component
File:    components/filetree/FileTreeItem.tsx
Branch:  feature/folio-p2-4 (from develop)

What I'll implement:
  P2.4.1  Left-click → setActiveFile + load content from OPFS
  P2.4.2  Active file styling: #EBF0FF bg, 3px #0066FF left bar, Inter 600
  P2.4.3  Non-active file: Geist 12px #666666
  P2.4.4  Folder: Inter 500 12px #1A1A1A
  P2.4.5  Right-click context menu: Rename · Delete · New file · New folder
  P2.4.6  Unsaved-changes dot (Funnel Sans, #0066FF)
  P2.4.7  ContextMenu closes on outside click or Escape

Tests I'll write:
  - renders active file with correct styles
  - renders non-active file with correct styles
  - fires setActiveFile on left-click
  - opens context menu on right-click
  - context menu closes on Escape

Already done in this section: 0 / 7

Continue? [y/n]
```

Wait for the user to confirm. If they say **n** or ask to change scope: adjust
the plan and re-present. Do not proceed until explicitly confirmed.

---

## Step 5 — Branch from develop

```bash
git fetch origin develop
git switch -c feature/folio-<task-id-slug> <summary> origin/develop
```

Where
`<task-id-slug>` is the task ID lowercased with dots replaced by dashes (e.g. `P2.4` → `p2-4`, `P3.10` → `p3-10`)

`<summary>` is a brief description of the task (e.g. 'implement-file-tree-item-component').
```

Confirm which branch is now active before continuing.

---

## Step 6 — Implement

Write the code for every unchecked item in the section. Follow these rules:

**Design tokens** — all colours, fonts, and radii must come from the Minimal Ink
system defined in `app/globals.css` CSS variables. Never hardcode hex values in
component files; use `var(--color-accent)` etc., or Tailwind aliases if configured.

**Fonts** — heading/label text: Inter; body/paragraph text: Geist; captions/hints/
metadata: Funnel Sans; code/mono: Geist Mono. Apply via Tailwind font-family
utilities or inline `style={{ fontFamily: 'var(--font-inter)' }}`.

**File placement** — create or edit only the file(s) named in the task. Do not
refactor unrelated files. If a dependency (e.g. a UI primitive like `Button`) is
not yet built, inline a minimal version and add a `// TODO: replace with ui/Button`
comment.

**TypeScript** — no `any`. Use types from `types/index.ts`. Extend them there if
needed.

**Imports** — use project-relative paths (`@/components/…`, `@/lib/…`, `@/hooks/…`,
`@/store/…`). Never use relative `../../` paths.

After implementing, briefly summarise each item completed.

---

## Step 7 — Write unit tests

Create or update the test file co-located with the implementation:
- `components/**/*.test.tsx` for React components (use `@testing-library/react`)
- `lib/**/*.test.ts` for pure functions (use `vitest` or `jest`)
- `hooks/**/*.test.ts` for hooks (use `@testing-library/react` `renderHook`)

**Minimum test coverage per section:**

| File type | Required tests |
|---|---|
| React component | renders without crash · key props affect output · user interactions fire correct callbacks |
| Hook | initial state is correct · state transitions on actions · cleanup runs on unmount |
| Lib/utility | happy path · edge cases listed in task description · throws/rejects on invalid input |
| API route | 200 success · 4xx validation failures · upstream error passthrough |

Tests must not:
- Mock the entire module under test
- Use `any` casts to silence TypeScript errors
- Skip async behaviour (use `waitFor`, `act`, or `await` properly)

OPFS and IndexedDB are not available in jsdom — mock them at the module boundary
in `__mocks__/opfs.ts` and `__mocks__/indexeddb.ts` (create these if they don't
exist yet).

---

## Step 8 — Build + lint + test

Run in order. **Stop at the first failure** and fix it before continuing.

```bash
# 1. Type-check
npx tsc --noEmit

# 2. Lint
npx next lint

# 3. Unit tests (run only tests related to the changed files)
npx vitest run --reporter=verbose <test-file-pattern>

# 4. Full build (catches import errors and RSC boundary issues)
npx next build
```

If any step fails:
- Read the full error output
- Fix the root cause (not just suppress the error)
- Re-run **only the failing step** to confirm it passes
- Then re-run all four steps in order to confirm clean

Do not mark tasks done until all four steps pass with zero errors and zero
warnings that weren't already present before this task started.

---

## Step 9 — Mark tasks done in Tasks.md

For every item that was implemented and verified, change `- [ ]` to `- [x]` in
`Tasks.md`. Do not mark items you did not implement.

```bash
# Verify the checkbox pattern in the file first
grep "P2.4" Tasks.md
```

Use a targeted sed or direct file edit — do not rewrite the whole file. After
editing, confirm the diff looks correct:

```bash
git diff Tasks.md
```

If the section is now **fully complete** (all items `- [x]`), also update the
Progress summary table at the bottom of `Tasks.md`:

```
| 2 — OPFS + file tree | 2.1–2.8 | 🟡 In progress |
```

Change `⬜ Not started` → `🟡 In progress` when partially done,
`✅ Complete` when every section in the phase is fully checked.

---

## Step 10 — Commit

Stage only the files changed by this task (implementation + tests + Tasks.md):

```bash
git add <implementation-files> <test-files> Tasks.md
git commit -m "feat(folio): <task-id> <section-title>

- <one line per implemented item>

Tests: <test file(s) added/updated>"
```

Example:

```
feat(folio): P2.4 FileTreeItem component

- left-click sets active file and loads content from OPFS
- active file: #EBF0FF bg, 3px accent left bar, Inter 600
- non-active file: Geist 12px secondary colour
- folder label: Inter 500 primary colour
- right-click opens context menu with 4 actions
- unsaved-changes dot shown when dirty flag is set
- context menu closes on outside click and Escape

Tests: components/filetree/FileTreeItem.test.tsx
```

---

## Step 11 — Summarise and suggest next

Print a summary:

```
✅  P2.4 — FileTreeItem component

Branch:   feature/folio-p2-4
Files:    components/filetree/FileTreeItem.tsx
Tests:    components/filetree/FileTreeItem.test.tsx
Checks:   tsc ✓  lint ✓  vitest ✓  build ✓
Commit:   feat(folio): P2.4 FileTreeItem component

Tasks.md: 7 / 7 items checked in section 2.4
Phase 2:  5 / 8 sections complete

Next unchecked section: P2.5 — NewItemInput component
Run /task-start P2.5 to continue.
```

---

## Notes

**Skipping items** — if an item cannot be implemented yet (blocked by a missing
dependency from a prior task), note it clearly in the commit message and leave its
checkbox unchecked. Do not mark blocked items as done.

**Multi-file sections** — some sections touch several files (e.g. `P3.10` touches
`AIPanel`, `AIStream`, `QuickActions`, `ScopeSelector`). Implement all of them
before running Step 8. Stage all changed files together in the single commit.

**Sections with no testable code** — e.g. `P1.1` (project setup) or
`P1.2` (CSS variables). For these, skip Step 7. In Step 8, run only `tsc` and
`next build`. Note in the summary that unit tests were not applicable.

**Design review** — after any section that produces visible UI (components,
layouts, modals), open `http://localhost:3000` and visually verify against the
wireframes in `.claude/wireframes/` before committing. Note any discrepancies.
