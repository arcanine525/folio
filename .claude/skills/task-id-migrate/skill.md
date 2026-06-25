---
name: task-id-migrate
description: >
  Convert a task list file from plain checkbox style (- [ ] description) to
  ID-tagged style (- [ ] `P<phase>.<section>.<index>` description), preserving
  all existing content, checked/unchecked state, and structure.
  Handles any markdown task file — not just Folio's Tasks.md.
  Use when the user runs /task-id-migrate [filepath]
  (defaults to Tasks.md in the project root if no path given).
---

# task-id-migrate

Converts a plain markdown task list into the ID-tagged format consumed by
`/task-start`. Runs non-destructively: writes output to a new file first,
shows a diff, and only overwrites the original on explicit confirmation.

---

## Step 1 — Resolve the target file

Use the filepath argument if provided. Otherwise default to `Tasks.md` in the
current working directory.

```bash
TARGET="${1:-Tasks.md}"
```

If the file does not exist: **STOP** and tell the user.

Read the full file content into memory.

---

## Step 2 — Detect whether migration is needed

Scan every `- [ ]` and `- [x]` line. A line **already has an ID** if it matches:

```
- [ ] `P<something>` ...
- [x] `P<something>` ...
- [ ] `PD.<something>` ...   ← deployment section variant
```

Count:
- `already_tagged` — lines that already have an ID
- `needs_tag` — lines that do not

If `needs_tag === 0`: tell the user all tasks are already tagged and **STOP**.
If `already_tagged > 0` and `needs_tag > 0`: warn the user that the file is
**partially migrated** — confirm they want to complete the migration before
continuing. If they decline, **STOP**.

---

## Step 3 — Detect the ID scheme

Inspect the file structure to determine which ID scheme to apply.

### Scheme A — Phase / Section / Index  (default)

Applies when the file has headings of the form:

```
## Phase N — <title>          ← phase heading    → phase number N
### N.M — <title>             ← section heading  → section number M
- [ ] task                    ← task item        → index increments per section
```

IDs produced: `P<N>.<M>.<index>` e.g. `P2.4.3`

### Scheme B — Custom prefix

If the file does NOT have `## Phase N` headings but does have `## <Title>`
and `### <subtitle>` headings, ask the user:

> "I couldn't detect Phase/Section headings. What prefix should I use for IDs?
> Examples: `T` → `T1.2.3`, `TASK` → `TASK1.2.3`, or press Enter to use `P`."

Use the chosen prefix for all IDs.

### Scheme C — Flat list (no headings)

If the file has task items but no `##` or `###` headings at all, ask:

> "No section headings found. Should I number tasks sequentially as
> `<prefix>1`, `<prefix>2`, … or do you want to add headings first?"

If sequential: produce `<prefix>1`, `<prefix>2`, etc.
If headings first: **STOP** and tell the user to add headings then re-run.

---

## Step 4 — Parse the document structure

Walk the file line by line, building a list of nodes:

```
node types:
  HEADING_PHASE   ## Phase N — title         → phase = N
  HEADING_SECTION ### N.M — title            → section = M (or auto-increment)
  HEADING_OTHER   ## or ### lines not matching phase/section patterns
  TASK_UNTAGGED   - [ ] text  or  - [x] text  (no ID yet)
  TASK_TAGGED     - [ ] `Pn.m.i` text         (already has ID — preserve as-is)
  OTHER           blank lines, prose, code fences, blockquotes, tables, etc.
```

Rules:
- Reset `section_index` to 0 whenever a new `HEADING_SECTION` is encountered.
- Reset `section_index` and `task_index` to 0 whenever a new `HEADING_PHASE` is
  encountered.
- Increment `task_index` by 1 for each `TASK_UNTAGGED` encountered within the
  current section.
- `HEADING_OTHER` lines do not reset counters — they are prose headings inside a
  section (e.g. deployment sub-headings like `### Vercel`).

### Special case — deployment / appendix sections

Sections that don't belong to a numbered phase (e.g. `## Deployment checklist`,
`### Vercel`, `### Cloud Run`) use the prefix `PD` instead of `P<N>`:

```
### Vercel      → PD.V.1, PD.V.2, …
### Cloud Run   → PD.CR.1, PD.CR.2, …
```

Detect these by checking if the nearest parent `##` heading does **not** match
`## Phase \d+`. If so, derive a short uppercase slug from the `###` heading
(first word or abbreviation) and use it as the section slug, e.g.:
- `### Vercel` → `V`
- `### Cloud Run` → `CR`
- `### AWS ECS` → `AWS`

Full ID: `PD.<SLUG>.<index>` e.g. `PD.CR.3`

---

## Step 5 — Generate the tagged output

Reconstruct the file line by line:

- `HEADING_PHASE`, `HEADING_SECTION`, `HEADING_OTHER`, `OTHER` lines →
  copy verbatim, unchanged.
- `TASK_TAGGED` lines → copy verbatim, unchanged (never re-tag).
- `TASK_UNTAGGED` lines → insert the ID between the checkbox and the description:

  **Before:**
  ```
  - [ ] Implement readFile(path): Promise<string>
  - [x] Add .env.local to .gitignore
  ```

  **After:**
  ```
  - [ ] `P2.1.2` Implement readFile(path): Promise<string>
  - [x] `P1.1.6` Add .env.local to .gitignore
  ```

  Regex for insertion point (Python-style for clarity):
  ```
  ^(\s*- \[[ x]\] )(.+)$
         ↑ group 1     ↑ group 2
  replace with: group1 + "`ID` " + group2
  ```

Also update (or insert) the summary note near the top of the file. If a line
matching this pattern exists:

```
> Track progress phase by phase. Each task …
```

Replace it with:

```
> Track progress phase by phase. Each task has a unique ID in the format
> `P<phase>.<section>.<index>` (e.g. `P2.4.3`). Deployment tasks use `PD.V.1` / `PD.CR.1`.
```

If no such line exists, insert it as the first blockquote after the `#` title.

---

## Step 6 — Write to a staging file and show diff

Write the converted content to `<original-name>.migrated.md` (e.g.
`Tasks.migrated.md`) so the original is untouched.

Show the user a summary:

```
Migration preview
─────────────────────────────────────────
File:            Tasks.md
Tasks tagged:    47  (were untagged)
Already tagged:  0   (preserved as-is)
Checked tasks:   3   (state preserved)
Sections found:  23
ID range:        P1.1.1 → P7.6.6, PD.V.1 → PD.CR.5

Staged output:   Tasks.migrated.md

First 20 changed lines:
[show a compact before/after diff of the first 20 modified lines]
```

Then ask:

> "Overwrite `Tasks.md` with the migrated version? [y/n]
> (The original will be backed up as Tasks.md.bak)"

---

## Step 7 — Apply or abort

**If the user confirms (y):**

```bash
cp Tasks.md Tasks.md.bak          # backup
mv Tasks.migrated.md Tasks.md     # apply
```

Confirm:

```
✅  Migration complete
    Tasks.md updated  (backup: Tasks.md.bak)
    47 tasks now have IDs.
    Run /task-start to pick up the next unchecked task.
```

**If the user declines (n):**

```
Aborted. Tasks.migrated.md preserved for review.
Original Tasks.md unchanged.
```

Leave both files in place and end.

---

## Step 8 — Validate the output (always run, even on abort)

After generating the tagged content (whether applied or not), run these checks
against the output and report any warnings:

| Check | Pass condition |
|---|---|
| No duplicate IDs | Every ID string `Pn.m.i` appears exactly once |
| No skipped indexes | Within each section, indexes run 1, 2, 3, … with no gaps |
| No untagged tasks remain | Zero lines matching `^- \[[ x]\] [^\`]` that aren't in a code fence |
| Checkbox state preserved | Count of `- [x]` in output equals count in input |
| Total task count preserved | Total `- [ ]` + `- [x]` in output equals input |
| No content lost | Line count of non-blank lines is the same or greater |

If any check fails: print a `⚠️ Warning` for each failure with the line number
and content. Do **not** apply the migration automatically if there are failures —
ask the user to review `Tasks.migrated.md` manually before confirming.

---

## Notes

**Nested tasks** — if a `- [ ]` item is indented under another `- [ ]` item
(sub-tasks), treat each level as its own sequence within the section. Use a
fourth segment: `P2.4.1.a`, `P2.4.1.b`, etc. for sub-items of `P2.4.1`.
If sub-tasks are present, note this in the summary and ask the user to confirm
the sub-task ID format before proceeding.

**Code fences** — never tag lines inside a fenced code block (``` or ~~~).
Track fence open/close state while parsing and skip task-pattern matching inside
fences.

**Already-ID'd files with wrong scheme** — if the file has IDs but using a
different format (e.g. `[T1]` instead of `` `P1.1.1` ``), report the mismatch
and ask the user whether to:
  a) Re-tag everything using the standard scheme (stripping old IDs)
  b) Leave existing IDs and only tag untagged lines
  c) Abort

**Multiple files** — if the user passes a glob (`/task-id-migrate tasks/*.md`),
process each file independently and report a per-file summary. Back up each
original before overwriting.

**Dry-run mode** — if the user appends `--dry-run`, skip Step 7 entirely (never
write anything) and just print the diff and validation results.
