## Cabinet Vision UCS debug folder

Every `fn*.js` file here is a Cabinet Vision User Created Standard, extracted by Cabinet Vision so it
can be run under a debugger with breakpoints. They are working copies of database rows, not ordinary
source files, and the usual assumptions do not hold.

- **The first and last lines are Cabinet Vision's, not the standard's.** Each file is
  `function fn<Name>() { … }` and only the body between those lines is the standard. Leave the
  wrapper alone — renaming it or removing it breaks the file's way back into the database.
- **Cabinet Vision owns saving.** Edits made here return to the database through Cabinet Vision, on
  its own terms. This extension does not push them, and a plain file save is not a database write.
- **This folder is temporary.** Cabinet Vision empties it when it restarts, taking every file with
  it — including `jsconfig.json`, `cv-api.d.ts` and this file, which are generated and will be
  written again on the next connection. Do not keep anything here.
- **Creating a file here does nothing.** A new `.js` is not a new standard; nothing will load it.

`cv-api.d.ts` in this folder declares the Cabinet Vision API — `_this`, `_cab`, the `_cv*` objects
and the constants — so completion, hover and type checking work on these files.

The durable, database-backed copy of every standard is mirrored separately, at:

```
{{MIRROR}}
```

That folder is the one to edit for a lasting change, and its own `AGENTS.md` carries the full UCS:JS
and UCS:M reference. **Do not edit the same standard in both places** — the two copies are not kept
in sync with each other, and whichever is written last silently wins.
