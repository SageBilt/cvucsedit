# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run compile   # tsc -p ./  -> out/
npm run watch     # tsc -watch (this is the default build task, used by F5 "Run Extension")
npm run lint      # eslint src
npm test          # vscode-test: compile + lint, then runs out/test/**/*.test.js
```

Debugging: F5 (`.vscode/launch.json` "Run Extension") launches an Extension Development Host. There is
effectively no test suite yet ([src/test/extension.test.ts](src/test/extension.test.ts) is the stub),
so verification is done by running the extension against a real Cabinet Vision SQL database.

`out/` is **committed to git** (not in `.gitignore`). A change to `src/` is not shipped until
`npm run compile` is run and the regenerated `out/` files are committed.

## Architecture

A VS Code extension that edits Cabinet Vision User Created Standards (UCS) stored as rows in a SQL
Server database. Two UCS languages are supported: **UCS:M** (legacy, `languageId: ucsm`) and
**UCS:JS** (JavaScript from CV 2024.1+, `languageId: javascript`).

### Two processes

[src/extension.ts](src/extension.ts) starts **two** language-server child processes from the same
[src/server/server.ts](src/server/server.ts) module, distinguished only by an `argv[2]` language id
(`ucsm` / `javascript`). Anything under [src/server/](src/server/) runs in that separate process and
must not `import 'vscode'` — it uses `vscode-languageserver` types instead. Everything else runs in
the extension host.
The two sides talk over LSP, with `initializationOptions` carrying `DynamicData` (materials,
constructions, schedules, doors, connections, part defs, parameters — all read from SQL at
activation). Because it is sent once at init, database changes require a window reload to appear in
UCS:M completions.

### Documents are real files in a mirrored workspace folder

[src/MirrorFileStore.ts](src/MirrorFileStore.ts) materialises every `UCS` row as a real file under
`<workspace>/.cvucs/<Database>/` (`cvucsedit.MirrorFolder`), so UCS code has a `file:` URI. That is
what makes it reachable by AI agents, `grep`, and — critically — VS Code's own TypeScript service,
which only forms a project over `file:` documents inside a workspace folder.

```
.cvucs/<Database>/
  .gitignore      "*" — the folder ignores itself, so we never touch the user's .gitignore
  jsconfig.json   generated
  cv-api.d.ts     generated
  manifest.json   relPath -> { ucsId, ucsName, isLibrary, kind, syncedHash }
  ucs/<Name>.ucs.js | <Name>.ucsm
  lib/<Name>.ucs.js
```

`.ucs.js` ends in `.js` so every JavaScript tool treats it natively; the `.ucs.` infix keeps UCS
files greppable and lets the LSP `documentSelector` be scoped by path.

**Sync is two-way and the file watcher is the single write path.** An editor save, an AI agent's
write and an external tool's write all take the identical route: watcher → strip sentinels → hash →
`UPDATE UCS SET Code`. There is deliberately no `onDidSaveTextDocument` hook. `syncedHash` in the
manifest is the three-way merge base at startup: disk-only change pushes to SQL, database-only change
rewrites the file, both changed is reported as a conflict and neither side is overwritten. Creating
or deleting UCS rows from the filesystem is **not** supported.

Tree item lookup is still by URI string (`findTreeItemByUri`), so the URI remains the primary key
linking editor ↔ tree item ↔ database row — it is now a `file:` URI assigned by `MirrorFileStore`
(`planPaths`) rather than built in the `CustomTreeItem` constructor.

### Sentinels, and why UCS:JS scoping depends on them

Sentinel lines are the only difference between the on-disk form and the database form. They exist to
make TypeScript reproduce UCS scoping exactly — a UCS is self-contained, a library is shared:

| kind | leading | trailing | TS sees | effect |
|---|---|---|---|---|
| `jsLibrary` | `const _<Name> = new class <Name> {` | `}();` | script | `_<Name>` is a project-wide global, callable/renameable from every UCS |
| `js` | — | `export {};` | module | own scope; one UCS cannot see another's declarations |
| `ucsm` | — | — | n/a | UCS:M is not in the TypeScript project |

A file with any top-level `import`/`export` is a module; without one it is a script whose top-level
declarations join the global scope. Both still see ambient globals. The `js` marker is **appended**
so line numbers are unaffected — only libraries carry a **+1 offset** (`leadingSentinelLines`).

The library wrapper must produce an **instance**, not a bare class. UCS code calls
`_<Name>.Method()` directly, and the members of `class _<Name> { … }` live on the prototype, so
`_<Name>.Method` does not resolve off the class — the symptom is a library that hovers correctly but
offers no members. The class expression is *named* only so hovers read `const _MyLib: MyLib` instead
of `(Anonymous class)`; that name is local to the expression and adds no global. Both are still one
line each, so the +1 offset is unchanged.

`leadingSentinel` / `trailingSentinel` are the single source of truth — `applySentinels` and the
editor's revert-on-edit guard in `SQLScriptProvider` both build from them.

`stripSentinels` is deliberately tolerant of a deleted or mangled sentinel, and **every hash and
comparison runs on the stripped form**, so sentinel edits never trigger a spurious `UPDATE`. It also
still accepts the older `class _<Name> {` / `}` pair so mirrors written by 2.0.0 round-trip without
pushing the stale wrapper into SQL; `syncFromDb` rewrites those files even when the code matches.
The trailing `()` is **required** when stripping the current form — without it a library whose own
last line is `}` would lose that brace.

### Where language knowledge lives

Static Cabinet Vision documentation is baked into JSON under [Languages/](Languages/) and loaded with
`fs.readFileSync` via paths in [src/constants.ts](src/constants.ts). Those paths are relative to
`__dirname`, i.e. `out/`, so `../Languages` resolves from the repo root at runtime — the folder is
shipped in the VSIX, not compiled.

- [Languages/data/system.json](Languages/data/system.json) — UCS:M keywords, ~680 system variables,
  functions, types, special objects. **Generated**, not hand-written: `initializeSystemJson()` in
  [src/jsonDocCreator.ts](src/jsonDocCreator.ts) parses [CVDoc/](CVDoc/) text dumps of the CV help
  files. The call is commented out in `activate()`; uncomment it to regenerate after updating CVDoc.
- [Languages/ucsjs/data/ucsjs_system.json](Languages/ucsjs/data/ucsjs_system.json) — UCS:JS objects,
  constants, properties, methods with `parameterDef[].DataType` and `returnType`. Adding new CV API
  surface is usually a pure edit to this file; it flows into `cv-api.d.ts` automatically.
- `Languages/ucsm/data/*.json` — syntax value/dim/forEach types and control structures, consumed by
  the validator.

### UCS:JS is served by TypeScript, not by this extension

[src/dtsGenerator.ts](src/dtsGenerator.ts) compiles `ucsjs_system.json` plus the live `DynamicData`
into `cv-api.d.ts` (interfaces `CVAsmManaged`/`CVShapeManaged`, the `_this`/`_cab`/`_cv*` globals,
174 constants as branded types, `MaterialName` and friends as string-literal unions, `description`
and `example` as JSDoc) and writes `jsconfig.json`. VS Code's TypeScript service then provides
completion, hover, signature help, go-to-definition, find-references, rename and diagnostics.

`cv-api.d.ts` must contain **no top-level import or export**, or its declarations stop being global.
Regenerated on activation and on each list refresh, so DB-derived unions stay current.

Two closed mapping vocabularies live in the generator: `returnType` (~28 distinct prose values such
as `"System::Collections::Generic::List - array of CVAsmManaged child objects"`, matched by ordered
rules, unmapped values fall back to `any` with a console warning) and `parameterDef[].DataType`
(14 values). `ParamName` is `"<type> <name>"`, so the identifier is the **second** token, and may
carry an `[optional]` / `(optional …)` marker.

### Server-side responsibilities

`LanguageServer` in [src/server/server.ts](src/server/server.ts) is now **UCS:M plus a thin
context layer for UCS:JS**. It delegates to [ucsmLanguageHandler](src/server/ucsmLanguageHandler.ts)
(UCS:M completions/hover + per-document symbol table),
[ucsjsLanguageHandler](src/server/ucsjsLanguageHandler.ts) (reduced to `AddObjects`/`AddConstants`)
and [ucsmValidation](src/server/ucsmValidation.ts) (diagnostics for both languages).

Definitions, references and JS hover deliberately return `null`/`undefined` for `languageId ==
'javascript'` — duplicating what TypeScript already provides would double every entry.

Context awareness hinges on two private helpers in `server.ts`:
- **`getWordAtPosition`** returns `[word, range, prefixWord]`. `prefixWord` is the preceding token when
  separated only by a delimiter (`.`, `:`, `=`, `(` …), uppercased. It is what makes `MATID = |` offer
  material names, `_CONNID` offer connections, `_M:` offer material parameters, etc. Its tokenizing
  regex and delimiter list differ per language.
- **`getMethodParamType`** (UCS:JS only) matches the line prefix against `ucsjs_system.json` methods
  and returns the `DataType` of the argument the cursor is in, plus whether the cursor is inside a
  string literal. **This is the whole reason the UCS:JS language server still exists:**
  `DataType: "ucsmSyntax"` injects UCS:M completion and validation inside JS string arguments such as
  `Evaluate('...')`, `"materials"` injects live SQL rows, and `"constants.<key>"` narrows to one
  constant group — none of which TypeScript can know.

## Gotchas

- `ucsjs_system.json` `properties[].parentObject` is usually `string[]` but is a **bare string** on
  11 entries. Normalise before iterating (`DtsGenerator.parents` does). `objects[]` used to use a
  lowercase `type` key; that has been normalised to `Type` to match `UCSJSObject`.
- An entry with an `objectType` (currently only `CVShapeManaged`) belongs to **that** interface, not
  to its `parentObject`.
- Some methods document their parameters in `definition` but ship an **empty `parameterDef`** (the
  six `_cvMath` comparison helpers). `DtsGenerator.paramsFromDefinition` falls back to parsing
  `definition`, otherwise they would emit a no-argument signature that rejects valid calls. Prefer
  filling in `parameterDef` when editing the JSON — it is the only source of `DataType`.
- Parameters are filled in on completion by TypeScript, not by us: `package.json`
  `contributes.configurationDefaults` turns on `javascript.suggest.completeFunctionCalls`. This
  changes the *default* window-wide (users can still override it), and it replaces the old
  hand-authored `method.value` snippets, which only covered `ucsjs_system.json` entries and never
  library methods.
- That snippet is built **by VS Code, not tsserver** — `getParameterListParts` in
  `typescript-language-features` walks the completion's `displayParts`, and `appendPlaceholder` is
  called with each `parameterName` part **verbatim**. Two consequences drive `dtsGenerator`:
  - Optional parameters are skipped (a `?` after the name), and only the **first overload** is read.
    So `DtsGenerator.signatures` emits **two** overloads for any method with optional parameters: an
    all-required one first (which the snippet reads) and the real one after (which accepts the
    shorter calls). Both carry the same JSDoc. Cost: errors now say "Overload 1 of 4".
  - The placeholder text is the **parameter name**, so that is the only way to reproduce the
    `${2:PARMOD_}` hints the old `method.value` snippets carried. `DtsGenerator.constantPrefix`
    derives each constant group's shared prefix (`VAL_`, `OBJ_`, `PARMOD_`, `ID_`, …) and uses it as
    the parameter name, giving `ModifyParameter(name, PARMOD_, PARSTYLE_)`. `ShapeSideType` has no
    shared prefix (`ASM_SIDE_` / `DOOR_SIDE_` / `TOP_SIDE_`) so it keeps its declared name. The
    `@param` names in `memberDoc` must stay in step or the docs silently detach.
  - Not reproducible: the old snippets quoted string arguments (`'${1:paramName}'`). A parameter
    name cannot contain a quote.
- Emitting the full argument list also repairs the LSP's contextual completion, which is keyed on
  `getParamCount(fullLine)` matching the `${n:…}` count in `method.value` — a partially filled call
  matched no overload, so `ucsmSyntax` and `constants.*` completions never fired inside it.
- `method.value` is no longer inserted as a snippet, but it is **not** dead: `getParamCount(methodDef.value)`
  counts its `${n:…}` placeholders to pick which overload the cursor is in
  ([server.ts:100](src/server/server.ts#L100), [ucsmValidation.ts:116](src/server/ucsmValidation.ts#L116)).
  Its placeholder count must stay in step with `parameterDef.length`.
- A library whose UCS name is not a valid JavaScript identifier produces `const _My Lib = …`, which
  will not parse. This is now *visible* rather than silently dropped; `MirrorFileStore` logs it to the
  "Cabinet Vision UCS Sync" output channel. The class-expression name is dropped separately when the
  bare name is not an identifier (`9Lib` — `_9Lib` is legal, `9Lib` is not).
- SQL credentials are hard-coded in [src/SQLConnection.ts](src/SQLConnection.ts) (fixed CV account);
  only server instance and database name are user settings (`cvucsedit.Server`, `cvucsedit.Database`).
  A failed connection prompts for both and retries up to 3 times.
- Database schema differs by CV version: `DbInfo.Version >= 2024` has the `MacroType` / `UCSLibrary`
  columns; older versions are UCS:M-only and those columns are synthesized as `0` in the query.
- The UCS:JS client still registers against `languageId: 'javascript'`, so its `documentSelector` is
  scoped by an absolute `pattern` built from the mirror root. Without that pattern it would serve
  every JavaScript document in the window. The same reasoning removed the `source.ucsjs` grammar
  injection and the `javascript`-scoped snippets from `package.json`; `Languages/ucsjs/ucsjs.tmLanguage.json`
  is retained but no longer contributed, since constants are now coloured via `cv-api.d.ts`.
- Both README.md and CHANGELOG.md carry release notes; keep them in sync with `package.json` `version`
  when publishing.
