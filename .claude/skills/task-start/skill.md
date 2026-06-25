---
name: task-start
description: >
  Pick work from Tasks.md by ID at three granularities — a single task, a whole
  section, or an entire phase — show an implementation plan, confirm with the user,
  branch from develop, implement, write unit tests, run build + lint + tests, mark
  the work done in Tasks.md, and commit.
  Use when the user runs /task-start <id>  (e.g. /task-start P2.4.1, P2.4, or P2).
---

# task-start

Implements work from `Tasks.md`. Steps run in order; a **STOP** means tell the user
what happened and end the skill.

The task file lives at `Tasks.md` in the `docs/` folder.
Base branch: `develop`.

## Input granularity

The single argument decides scope, branch name, and commit granularity:

| Input | Example | Scope | Branch name | Commits |
|---|---|---|---|---|
| **task-id** `P<phase>.<section>.<index>` | `P2.4.1` | one task item | `feature/folio-<task-id><summary>` | **1 commit** |
| **section-id** `P<phase>.<section>` | `P2.4` | all unchecked items in the section | `feature/folio-<section-id><summary>` | **1 commit per task** |
| **phase-id** `P<phase>` | `P2` | all unchecked items in every section of the phase | `feature/folio-<phase-id><summary>` | **1 commit per task** |

Where:
- `<id>` is the ID lowercased with dots replaced by dashes (`P2.4.1` → `p2-4-1`, `P2.4` → `p2-4`, `P2` → `p2`).
- `<summary>` is a short kebab description, prefixed with a dash (e.g. `-filetree-item`).

So the resulting branch looks like `feature/folio-p2-4-filetree-item`.

The **only** difference between section-id and phase-id is how many tasks are in
scope — both commit once per task. A task-id produces a single commit.

---

## Step 1 — Parse the ID and determine granularity

Read the single argument to `/task-start` and classify it:

- `P<phase>.<section>.<index>` (e.g. `P2.4.1`) → **task-id** (single item)
- `P<phase>.<section>` (e.g. `P2.4`) → **section-id**
- `P<phase>` (e.g. `P2`) → **phase-id**

If no argument was given, read `Tasks.md`, find the first section that has **any**
unchecked `- [ ]` item, treat it as a **section-id**, and tell the user which ID was
auto-selected.

If the ID is not found in `Tasks.md`, **STOP**: tell the user the ID doesn't exist
and list the available phase/section IDs.

Build the **work list** — the ordered set of `- [ ]` unchecked items now in scope:
- task-id → exactly that one item (if it's already `- [x]`, **STOP**: already done)
- section-id → every unchecked item in that section
- phase-id → every unchecked item across all sections of that phase, in document order

If the work list is empty (everything already `- [x]`): **STOP** and tell the user
the scope is complete; suggest the next unchecked ID.

---

## Step 2 — Check working tree

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
```

If there are **any** staged or unstaged changes: **STOP** and tell the user to
commit or stash before starting new work.

---

## Step 3 — Read the work

Parse `Tasks.md` to extract, for everything in scope:

- **Headings** — phase and/or section titles covered
- **Target file(s)** — parsed from headings and task text in backticks
- **Work list** — the unchecked `- [ ]` items to implement now, in order
- **Already-done count** — number of `- [x]` items already checked in scope

---

## Step 4 — Show implementation plan and confirm

Present a concise plan **before writing any code**. Show the scope, branch name, the
commit strategy, and the ordered work list. Example for a **section-id**:

```
Scope:    section P2.4 — FileTreeItem component
File:     components/filetree/FileTreeItem.tsx
Branch:   feature/folio-p2-4-filetree-item (from develop)
Commits:  1 per task (7 tasks → up to 7 commits)

Work list:
  P2.4.1  Left-click → setActiveFile + load content from OPFS
  P2.4.2  Active file styling: accent bg, 3px accent left bar, Inter 600
  P2.4.3  Non-active file: Geist 12px secondary
  P2.4.4  Folder: Inter 500 12px primary
  P2.4.5  Right-click context menu: Rename · Delete · New file · New folder
  P2.4.6  Unsaved-changes dot (Funnel Sans, accent)
  P2.4.7  ContextMenu closes on outside click or Escape

Already done in scope: 0 / 7

Continue? [y/n]
```

For a **task-id**, show the single item and `Commits: 1`. For a **phase-id**, group
the work list under each section heading and show the total task count.

Wait for the user to confirm. If they say **n** or ask to change scope: adjust and
re-present. Do not proceed until explicitly confirmed.

---

## Step 5 — Branch from develop

```bash
git fetch origin develop
git switch -c feature/folio-<id><summary> origin/develop
```

`<id>` is the input ID slugified (dots → dashes, lowercased); `<summary>` is a brief
kebab description with a leading dash. Examples:

- task-id `P2.4.1` → `feature/folio-p2-4-1-load-file-on-click`
- section-id `P2.4` → `feature/folio-p2-4-filetree-item`
- phase-id `P2` → `feature/folio-p2-opfs-persistence`

Confirm which branch is now active before continuing.

---

## Step 6 — Implement, test, and commit (per-task loop)

Process the work list **one task at a time, in order**. For section-id and phase-id
this yields **one commit per task**; for a task-id it runs once and yields a single
commit.

For each task item:

**6a. Implement** the item, following these rules:

- **Design tokens** — all colours, fonts, and radii come from the Minimal Ink system
  in `app/globals.css` CSS variables. Never hardcode hex values; use
  `var(--color-accent)` etc., or Tailwind aliases if configured.
- **Fonts** — headings/labels: Inter; body/paragraph: Geist; captions/hints/metadata:
  Funnel Sans; code/mono: Geist Mono. Apply via Tailwind utilities or inline
  `style={{ fontFamily: 'var(--font-inter)' }}`.
- **File placement** — create or edit only the file(s) named in the task. Don't
  refactor unrelated files. If a not-yet-built dependency (e.g. a `Button` primitive)
  is needed, inline a minimal version with a `// TODO: replace with ui/Button` comment.
- **TypeScript** — no `any`. Use types from `types/index.ts`; extend them there if needed.
- **Imports** — use project-relative paths (`@/components/…`, `@/lib/…`, `@/hooks/…`,
  `@/store/…`). Never use `../../` paths.

**6b. Write unit tests** co-located with the implementation (see the coverage table in
Step 7). Skip only for items with no testable code (e.g. setup/CSS items) — note this.

**6c. Run targeted checks** (fast feedback per task):

```bash
npx tsc --noEmit
npx vitest run <test-file-pattern for this task>
```

Fix the root cause of any failure before committing this task. Do not suppress errors.

**6d. Mark the task done** — change this item's `- [ ]` to `- [x]` in `Tasks.md`.
Edit only that line; do not rewrite the file.

**6e. Commit just this task.** Stage only the file(s) this task changed plus `Tasks.md`:

```bash
git add <files-for-this-task> docs/Tasks.md
git commit -m "feat(folio): <task-id> <short item description>"
```

Example:

```
feat(folio): P2.4.1 load file content from OPFS on left-click
```

Then move to the next task in the work list.

**Coupled items** — if two items genuinely cannot compile or be tested independently
(e.g. a handler and the state it sets, added in the same edit), implement them together
and note in the commit body which task-ids are covered. Prefer one commit per task;
combine only when separation would break the build.

---

## Step 7 — Test coverage reference

Co-locate tests with the code:
- `components/**/*.test.tsx` for React components (`@testing-library/react`)
- `lib/**/*.test.ts` for pure functions (`vitest`)
- `hooks/**/*.test.ts` for hooks (`@testing-library/react` `renderHook`)

**Minimum coverage per task:**

| File type | Required tests |
|---|---|
| React component | renders without crash · key props affect output · user interactions fire correct callbacks |
| Hook | initial state correct · state transitions on actions · cleanup runs on unmount |
| Lib/utility | happy path · edge cases from the task description · throws/rejects on invalid input |
| API route | 200 success · 4xx validation failures · upstream error passthrough |

Tests must not: mock the entire module under test; use `any` casts to silence TS;
skip async behaviour (use `waitFor`, `act`, or `await` properly).

OPFS and IndexedDB are unavailable in jsdom — mock them at the module boundary in
`__mocks__/opfs.ts` and `__mocks__/indexeddb.ts` (create if missing).

---

## Step 8 — Branch-level verification

After the whole work list is committed, verify the branch as a whole (the per-task
loop already ran `tsc` + targeted tests, so run the slower checks once here):

```bash
npx next lint
npx vitest run            # full suite
npx next build            # catches import errors and RSC boundary issues
```

If any step fails:
- Read the full error output and fix the root cause.
- Re-run the failing step to confirm, then re-run all three clean.
- Commit the fix as its own `fix(folio): …` commit (or `git commit --amend` only if it
  belongs to the immediately preceding, not-yet-pushed task commit).

Do not finish until lint, the full test suite, and the build all pass with zero new
errors or warnings.

---

## Step 9 — Update the Progress summary table

If a **section** became fully `- [x]`, or a **phase** is now fully complete, update the
Progress summary table at the bottom of `Tasks.md`:

```
| 2 — OPFS + file tree | 2.1–2.8 | 🟡 In progress |
```

`⬜ Not started` → `🟡 In progress` when partially done, `✅ Complete` when every
section in the phase is fully checked. Commit this as a small docs commit:

```bash
git add docs/Tasks.md
git commit -m "docs(folio): update progress for <id>"
```

---

## Step 10 — Summarise and suggest next

```
✅  P2.4 — FileTreeItem component (section scope)

Branch:   feature/folio-p2-4-filetree-item
Files:    components/filetree/FileTreeItem.tsx
Tests:    components/filetree/FileTreeItem.test.tsx
Checks:   tsc ✓  lint ✓  vitest ✓  build ✓
Commits:  7 (one per task)
  P2.4.1  load file content from OPFS on left-click
  P2.4.2  active file styling
  …

Tasks.md: 7 / 7 items checked in section 2.4
Phase 2:  5 / 8 sections complete

Next unchecked section: P2.5 — NewItemInput component
Run /task-start P2.5 to continue.
```

For a task-id, report the single commit; for a phase-id, list commits grouped by section.

---

## Notes

**Skipping items** — if an item can't be implemented yet (blocked by a missing
dependency from a prior task), note it in scope, leave its checkbox unchecked, skip its
commit, and call it out in the final summary. Do not mark blocked items as done.

**Multi-file tasks** — a single task item may touch several files (e.g. a component plus
its store slice). Stage all of that task's files into its one commit.

**Tasks with no testable code** — e.g. `P1.1` (project setup) or `P1.2` (CSS variables).
Skip Step 6b for these; in their per-task check run only `tsc` (and `next build` at the
branch level). Note in the summary that unit tests were not applicable.

**Design review** — after any task that produces visible UI, open
`http://localhost:3000` and visually verify against the wireframes in
`.claude/wireframes/` before the branch-level verification. Note any discrepancies.
