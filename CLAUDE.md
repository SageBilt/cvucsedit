# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Editing something under `cvucs/`?** Then you are writing Cabinet Vision UCS code, not extension
> code, and this file does not apply — read `cvucs/<Database>/AGENTS.md` instead. Those files mirror
> live database rows; saving one is an immediate `UPDATE` against the customer's database.

## Commands

```powershell
npm run bundle    # esbuild -> dist/          (what actually ships)
npm run watch     # esbuild --watch -> dist/  (part of the default build task, used by F5)
npm run compile   # tsc -p ./ -> out/         (type check + tests; nothing loads it at runtime)
npm run watch:tsc # tsc -watch -> out/        (the other half of the default build task)
npm run lint      # eslint src
npm run package   # compile + lint + production bundle; this is `vscode:prepublish`
npm test          # vscode-test: compile + lint, then runs out/test/**/*.test.js
```

Debugging: F5 (`.vscode/launch.json` "Run Extension") launches an Extension Development Host. There is
effectively no test suite yet ([src/test/extension.test.ts](src/test/extension.test.ts) is the stub),
so verification is done by running the extension against a real Cabinet Vision SQL database.

### There are two build outputs, and only one of them ships

`dist/` is the extension: two files, `extension.js` and `server.js`, bundled by
[esbuild.js](esbuild.js). `out/` is the `tsc` output, which is still what the type check and
`npm test` run against — **esbuild only strips types, it does not check them**, which is why the
default build task runs both watchers and why `package` runs `compile` before bundling.

Bundling is not an optimisation, it is what makes the VSIX publishable. `mssql` pulls `tedious`,
which has a top-level `require("@azure/identity")`, which drags in MSAL and Key Vault — roughly 1400
files of Azure AD authentication that this extension never uses, since the SQL credentials are a
hard-coded Cabinet Vision account. `.vscodeignore` cannot touch any of it: the requires are static
and real, so excluding them breaks `mssql` at runtime. Unbundled the VSIX held 2400 files, 2351 of
them `node_modules`, and `vsce` warned about it on every publish. Bundled it holds 32.

Two entry points, because there are two processes ([Two processes](#two-processes) below), and both
outputs land **directly in `dist/`**, at the same depth `out/` had. That is load-bearing:
[src/constants.ts](src/constants.ts) resolves the `Languages/` data files through
`path.join(__dirname, '../Languages/...')`, and esbuild rewrites `__dirname` to the *bundle's*
directory rather than the original source file's — a server bundle in `dist/server/` would look for
`dist/Languages/` and find nothing. `SERVER_MODULE` in [src/extension.ts](src/extension.ts) is the
matching path on the client side.

`out/` is **committed to git**; `dist/` is not, because `vscode:prepublish` rebuilds it on every
publish and a megabyte of minified output would be churn. A change to `src/` reaches a running
Extension Development Host as soon as the esbuild watcher writes `dist/`.

## Architecture

A VS Code extension that edits Cabinet Vision User Created Standards (UCS) stored as rows in a SQL
Server database. Two UCS languages are supported: **UCS:M** (legacy, `languageId: ucsm`) and
**UCS:JS** (JavaScript from CV 2024.1+, `languageId: javascript`).

### Activating and starting are two different things

`onStartupFinished` fires in **every** VS Code window, and until 2.1 activation *was* startup: 2.0.0
connected to SQL, mirrored a `cvucs/` folder into whatever project happened to be open and wrote a
pointer block into that project's `AGENTS.md`, in every window, without being asked. Doing Cabinet
Vision work in one window and something unrelated in another was enough to hit it.

So `activate()` now only does what is free — constructs `SQLScriptProvider` (tree views, output
channel, no connection), registers commands, creates the status bar item, sets the
`cvucsedit.running` context key. Everything with a side effect is in `start()`, and reaching it takes
two gates:

- **`isEnabledWorkspace`** — `workspaceState[cvucsedit.enabledInWorkspace]`, deliberately
  three-valued: `true` connect, `false` the user disconnected *here* and meant it, `undefined` never
  asked. Only on `undefined` does it look for evidence that this window is a UCS window: the folder
  being the dedicated mirror base (`contains`, case-insensitive because Windows), or a mirror already
  sitting in it — the same upgrade path `resolveLocation` uses, so an existing 2.0.0 setup keeps
  starting automatically and only the workspaces that never wanted this go quiet.
- **`cvucsedit.AutoStart`** — the second gate, not the only one. A global "start everywhere" boolean
  on its own would put us straight back to connecting in unrelated projects.

`stop()` is a real disconnect, not just an idle flag: it stops both clients *and* calls
`MirrorFileStore.shutdown()`, because the file watcher is the write path to the database and a
disconnected window that still pushed saves to production would be the worst of both. `shutdown`
clears `initialised` so a later `start` re-resolves the root, and the watcher's own listeners live in
`watcherDisposables` rather than `disposables` so a connect cycle does not accumulate them. For the
same reason `LanguageClientWrapper` no longer registers itself in `context.subscriptions` — its
lifetime is now shorter than the extension's — and disposes its output channel and file watcher in
`stop()`.

Entry points when not running: `viewsWelcome` on both tree views (`when: !cvucsedit.running`), the
status bar item, and the refresh/reload commands, which call `ensureRunning` — pressing refresh in a
workspace that has not connected plainly means "connect", and failing silently there would be
baffling.

The way back out of `false` is `cvucsedit.forgetWorkspace`, and the reason it exists is that `false`
outranks every piece of evidence below it — including the debug folder and the dedicated mirror base,
so one *Disconnect* (or one **Remove UCS Files from This Workspace**, which calls `stop`) permanently
stops a window Cabinet Vision opens itself from connecting. Every answer the extension keeps is
`workspaceState`, which nothing in VS Code clears short of deleting the window's whole storage folder,
so the first run was also the one path that could not be tested twice. It clears `ENABLED_KEY` and
delegates the rest to `SQLScriptProvider.forgetWorkspaceState` (`rootPointerConsent`, the session flag
behind *Not now*, and `MirrorFileStore.forgetLocation`), then offers a reload — `shouldAutoStart` only
runs in `activate`, so nothing about the cleared state shows until the window returns. `stop` was
split into itself plus `disconnect` for it: forgetting must tear down the connection **without**
writing the `false` that is the very thing being erased.

### Workspace trust is a third gate, and it used to be a silent one

Until 2.3 `package.json` declared no `capabilities.untrustedWorkspaces`, which VS Code reads as
`supported: false`: in a restricted workspace the extension was not activated **at all**, and every
contribution went with it — including the `cvucs-container` activity bar entry. The symptom on a
user's machine was the sidebar icon simply vanishing until the folder was trusted, with nothing on
screen to say why, and none of the gating above even reached.

It now declares **`limited`**, so the extension loads and connects untrusted, with
`restrictedConfigurations` covering `Server`, `Database`, `MirrorPath`, `MirrorFolder` and
`DebugFolderSuffix` — VS Code ignores a *workspace* level value for those and falls back to the user
level one. That list is the security case for `limited` over plain `true`: the SQL credentials are a
hard-coded Cabinet Vision account, so a `.vscode/settings.json` in a folder someone was handed could
otherwise point `cvucsedit.Server` at an instance of its choosing and the credentials would go with
it. Restricting them costs nothing real, since both are set once per machine at user level.

**What the declaration cannot buy back is TypeScript.** VS Code's own TypeScript support is trust
gated too and runs syntax only until the folder is trusted, so the whole UCS:JS semantic layer —
completion off `cv-api.d.ts`, hover, rename, find references — stays dark regardless. That is the
same loss `warnIfMirrorIsOutOfSight` describes, reached by a different route, which is why
`warnIfUntrusted` stays quiet when the mirror is out of sight anyway: two notifications about one
missing feature is noise, and the offer that actually fixes it there is *Open UCS Workspace*. The
status bar item carries the state standing (`$(shield)`, warning background), since it is the only
explanation left once the notification is dismissed.

There is **no API to grant trust** — `workspace.requestWorkspaceTrust` never left proposed — so
`manageTrust` opens VS Code's trust editor and no further. Trust does propagate to subfolders,
which is worth knowing when telling users what to trust: trusting `~/Cabinet Vision UCS` once covers
`<Database>/` for every database, and trusting the CV install root covers a debug folder whose
version segment changes on every upgrade.

`onDidGrantWorkspaceTrust` handles trust arriving mid session: if we never started, this may be the
first moment we can. If we did, the restricted settings have just come into force under a connection
that already resolved them — but they are nearly always user level, so
`workspaceOverridesRestrictedSettings` checks `inspect` for an actual workspace value before offering
a reload rather than interrupting every window that gets trusted.

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
`<mirror root>/<Database>/`, so UCS code has a `file:` URI. That is what makes it reachable by AI
agents, `grep`, and — critically — VS Code's own TypeScript service, which only forms a project over
`file:` documents inside a workspace folder.

**Where that root is, is decided per workspace** (`resolveLocation`), because 2.0.0 always used
`workspaceFolders[0]` and so put a `cvucs/` folder into whatever project happened to be open:

| `cvucsedit.MirrorLocation` | root | |
|---|---|---|
| `dedicated` (default) | `~/Cabinet Vision UCS/<Database>/` | a folder of ours, outside every project. `cvucsedit.MirrorPath` overrides the base; `MirrorFileStore.dedicatedBase()` is static so the *Open UCS Workspace* command can resolve it before anything is initialised |
| `workspace` | `<workspace>/cvucs/<Database>/` | `cvucsedit.MirrorFolder`. The 2.0.0 behaviour |

Order of authority: an explicit setting, then the answer this workspace reached before
(`workspaceState`), then **whether a mirror is already sitting in this workspace** — which is the
upgrade path, and is why an existing 2.0.0 setup is never moved out from under someone who has
unpushed edits in it. Only then does it fall back to `dedicated`. `workspace` with no folder open
degrades to `dedicated` rather than mirroring somewhere nobody can find.

Not being in the open window has one cost, and only one: the TypeScript service forms no project, so
UCS:JS loses completion, rename and find-references (UCS:M and the tree are unaffected, since the LSP
`documentSelector` is an absolute path pattern, not a workspace membership test). `visibleToWorkspace`
tests for it and `warnIfMirrorIsOutOfSight` offers *Open UCS Workspace*, which is the whole reason
that command exists.

The folder name is **not** dot-prefixed, and that is deliberate: a hidden folder is skipped outright
by some agent tools when they scan for context and instruction files, which defeats the point of
mirroring to disk at all. `.cvucs` was the 2.0.0 default, so `migrateLegacyRoot` renames an existing
one on activation — a rename rather than a fresh start, because the manifest inside it is the
three-way merge base and losing it would silently discard unpushed disk edits. A folder the user set
explicitly (`inspect`, not `get`) is never moved. This only applies in `workspace` mode; the
dedicated folder has never had a dotted form.

```
cvucs/<Database>/
  .gitignore           "*" — the folder ignores itself, so we never touch the user's .gitignore
  jsconfig.json        generated
  cv-api.d.ts          generated
  AGENTS.md            generated — rules of the road for AI agents
  CLAUDE.md            generated — one line, `@AGENTS.md`
  ucsjs-reference.md   generated
  ucsm-reference.md    generated
  manifest.json        relPath -> { ucsId, ucsName, isLibrary, kind, syncedHash }
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

### The mirror carries its own instructions

Making UCS code reachable by AI agents means an agent will act on it, and everything that makes the
mirror work is invisible from inside a UCS file: that a save is an immediate `UPDATE` against
production, that a *new* file is silently dropped (it is not in the manifest — see the
`warnedAboutStrayFile` branch, which logs to an output channel no agent reads), and that the first
and last lines of a `.ucs.js` are not code. UCS:JS at least has `cv-api.d.ts`; UCS:M had nothing at
all in the workspace, since all of its knowledge sits in `Languages/data/system.json` inside the
extension's install directory.

[src/agentDocs.ts](src/agentDocs.ts) fills that in, writing four files through
`MirrorFileStore.writeAgentDocs` alongside `writeProjectFiles`:

| file | |
|---|---|
| `AGENTS.md` | the rules of the road, cross-tool convention |
| `CLAUDE.md` | `@AGENTS.md` — an import, not a copy, so the folder has one source of truth |
| `ucsjs-reference.md` | the execution model and the traps a `.d.ts` cannot express |
| `ucsm-reference.md` | the UCS:M language plus the full system reference — the `cv-api.d.ts` counterpart |

The prose lives in `Languages/agent/*.md`, matching how the rest of the CV documentation is kept: it
is content, not code, and editing it needs no recompile. `AgentDocsGenerator` only substitutes
`{{PLACEHOLDER}}` tokens — the database and server names, and the tables built from the same
`system.json` / `ucsm_syntax.json` / `control_structures.json` the language server reads, so the
reference cannot drift from what the validator enforces. Substitution is `split`/`join` rather than
`String.replace`, because CV's help text contains `$` sequences that a regex replacement would eat.

**Writing the documentation was not enough — it has to be *found*.** Testing against OpenCode and
Claude Code showed a mirror-local `AGENTS.md` is not reliably picked up: nested instruction files are
discovered lazily, at the project root only, or not at all, depending on the tool. Three mechanisms
now cover that, in decreasing order of how much they can be relied on:

1. **The generated header on every mirrored file** (see Sentinels below). Depends on no discovery
   mechanism whatsoever, because it is in the file the agent was asked to edit.
2. **A pointer block at the root of the folder holding the mirror.** `writeRootPointer` maintains a
   delimited block in that folder's `AGENTS.md` and `CLAUDE.md` — the one place every tool that
   supports the convention reads. `AgentDocsGenerator.mergeRootPointer` rewrites only what lies
   between `BLOCK_BEGIN`/`BLOCK_END` and appends when the markers are absent, and it returns
   `undefined` when nothing changed so an up-to-date folder is never written to.

   **Whether that needs permission is what `ownsRoot` decides.** In the dedicated location the root
   is the extension's own folder and the block goes straight in — which is a large part of why
   `dedicated` is the default at all. Anywhere else it is a file in someone's repository, so
   `requestConsent` runs *before* the first write and its answer is remembered per workspace
   (`cvucsedit.rootPointerConsent`: `yes` / `never`; *Not now* is not persisted but holds for the
   session so a list refresh does not re-ask). 2.0.0 had this backwards — it wrote first and offered
   an undo afterwards, and the announcement was keyed on `globalState`, so the *second* unrelated
   project it edited got no notice at all. `cvucsedit.WriteRootAgentFiles` still turns the whole
   thing off, and `cvucsedit.removeFromWorkspace` takes an already-written block back out without
   needing to connect.

   The pointer links to the mirror, so it interpolates `pointerLabel` (the path *relative to
   `pointerRoot`* — `CVData/` in the dedicated folder) rather than `rootLabel`, which is the
   human-readable `Cabinet Vision UCS/CVData/` used in prose and in the layout diagram inside
   `AGENTS.md`.
3. **The folder no longer being hidden**, covered above.

The mirror `.gitignore` is still `*`: these are generated, per-database and rewritten on every
activation, so committing them into the user's project would be churn.

### Cabinet Vision's debug folder is the other place UCS:JS lives

Cabinet Vision can launch VS Code on `…\CV <version>\Temp\UCSJS\` and attach its script engine's
debugger, so a UCS can be run with breakpoints. It extracts the standard it is about to debug into
that folder as a plain `.js`, and takes edits back into the database on its own terms — that path is
CV's, not ours, and the extension deliberately stays out of it (`startWatching` is a
`RelativePattern` on the mirror root, so those files are never watched and never pushed).

What it *is* is UCS:JS, so everything the extension knows about the language applies.
[src/debugFolder.ts](src/debugFolder.ts) recognises the window by the **tail** of the folder path
(`cvucsedit.DebugFolderSuffix`, default `Temp/UCSJS`) — only the tail is fixed, since the install
root and version segment vary per machine — and returns the workspace folder's own `Uri` rather than
a path rebuilt from the setting, because the result goes into a `documentSelector` glob and minimatch
is case-sensitive. Four things key off it:

- **`isEnabledWorkspace`** treats it as a UCS window, alongside the dedicated mirror base. CV opens
  that window itself, so there is nobody to press connect.
- **`resolveLocation` forces `dedicated`**, ahead of *everything* including an explicit
  `MirrorLocation`. CV empties the folder on restart, which makes `workspace` there destructive
  rather than untidy: `manifest.json` holds `syncedHash`, the three-way merge base, so losing it
  leaves `syncFromDb` nothing to merge against, the database silently wins, and any disk edit not yet
  pushed goes with the folder. `MirrorLocation` is also usually set globally, so honouring it would
  apply a decision about someone's projects to a scratch directory.
- **The UCS:JS `documentSelector` gains a second pattern**, `<debug folder>/*.js` — matched by
  location alone, since these files have no `.ucs.` infix. `LanguageClientConfig` therefore takes
  `patterns: string[]` rather than a root plus an extension, and `synchronize.fileEvents` takes the
  matching array of watchers. Flat `*.js`, not `**`: CV writes the copies directly in the folder, and
  a mirror left there by an earlier version must not be picked up through this pattern as well.
- **`cv-api.d.ts` and a `jsconfig.json` are written into it** (`writeDebugProjectFiles`), so
  TypeScript forms a project and gives the same completion and hover as the mirror gets. The include
  list is flat `*.js` plus `libraryInclude(debugRoot)`, a relative path back to the mirror's `lib/`
  — the debug copies still call `_<Library>.Method()`, and without it every such call is an undefined
  global. Failure is logged, not thrown: this is under `ProgramData` and a locked-down machine may
  refuse, which costs TypeScript's half of the support and is not worth failing a connect over.

`warnIfMirrorIsOutOfSight` is suppressed there — the mirror is deliberately elsewhere, and accepting
the offer would replace the window CV just launched to debug in.

**The folder gets its own `AGENTS.md`/`CLAUDE.md` block** (`buildDebugPointer`,
`Languages/agent/debug-pointer.template.md`), and it is the only thing in there that says what those
files are: an agent otherwise sees ordinary JavaScript, reads CV's `function fn<Name>() { … }`
wrapper as part of the standard, and cannot know the folder is wiped on restart or that a second,
durable copy of the same standard is mirrored elsewhere. It reuses `mergeRootPointer`, so a stale
mirror-pointer block written there by an earlier run is replaced rather than appended to. No consent
— this is CV's scratch directory, so there is nothing of the user's to overwrite; `writePointerBlock`
now takes `requestConsent` as optional and `writeRootPointer` passes it only when `!ownsRoot`.

### Sentinels, and why UCS:JS scoping depends on them

Sentinel lines are the only difference between the on-disk form and the database form. They exist to
make TypeScript reproduce how Cabinet Vision actually runs the code — a UCS is a function body and is
self-contained, a library is shared:

| kind | leading | trailing | TS sees | effect |
|---|---|---|---|---|
| `jsLibrary` | banner + JSDoc + `const _<Name> = new class <Name>Library {` | `}();` | script | `_<Name>` is a project-wide global, callable/renameable from every UCS |
| `js` | banner + `(function () {` | `})();` | script | function scope: top-level `return` is legal, and one UCS cannot see another's declarations |
| `ucsm` | banner | — | n/a | UCS:M is not in the TypeScript project |

Nothing in the mirror is a *module* — every file is a script, and scoping comes from the wrapper
rather than from module semantics.

**The banner is the four-line generated header**, `//~` for JS and `;~` for UCS:M, and it exists for
agent discovery rather than for TypeScript — see above. It made the leading sentinel multi-line, so
`leadingSentinelLines` is now **derived from `leadingSentinel` itself** rather than stated
separately, and is 11 for `jsLibrary`, 5 for `js` and 4 for UCS:M. It also gave UCS:M a leading sentinel where
it previously had none, which is why the editor guard and the dimming decoration no longer early-return
on `kind === 'ucsm'` — as the paragraph below already said they should, they now derive *which* lines
to protect purely from whether each sentinel function returns a value. `leadingRange` in
`SQLScriptProvider` turns that into a document range and clamps it, so a file truncated outside the
editor cannot throw.

`stripBanner` runs before every wrapper pattern, which is why those patterns can all stay anchored to
the start of the string. It removes a run of prefixed lines **only when the run starts on line 0 and
the first line contains the marker `cvucsedit`** — stripping is destructive, since it decides what is
*not* written to the database, so a `;~` comment of the user's own must never be mistaken for ours.
The UCS:M validator is unaffected: it splits each line on `;` and skips what is then empty
([ucsmValidation.ts:320](src/server/ucsmValidation.ts#L320)), so the banner does not shift the
`firstNonCommentLine` that `checkForEach` keys on.

The UCS wrapper replaced the trailing `export {};` module marker 2.0.0 wrote. The marker gave each UCS its
own scope but left the file a top-level script, so every top-level `return` — legal in a UCS, since
Cabinet Vision executes the body as a function — drew `TS1108: A 'return' statement can only be used
within a function body`. That is a *semantic* diagnostic, so it is invisible while `cvucsedit.CheckJs`
is off and unfixable by any compiler option; only reshaping the file fixes it. The function wrapper
also subsumes the marker's scoping job, so one mechanism does both. Cost: regular UCS files carry the
same reveal offset libraries already had.

The library wrapper must produce an **instance**, not a bare class. UCS code calls
`_<Name>.Method()` directly, and the members of `class _<Name> { … }` live on the prototype, so
`_<Name>.Method` does not resolve off the class — the symptom is a library that hovers correctly but
offers no members. The class expression is *named* so hovers read `const _mylib: MyLibLibrary`
instead of `(Anonymous class)`; that name is local to the expression and adds no global.

**The library wrapper is also the only thing that tells a reader what a library is**, because the
declaration is all TypeScript has to report at a call site. It got two additions for that, both in
`leadingSentinel`:

- **A JSDoc block between the banner and the wrapper** (`libraryDoc`). TypeScript attaches JSDoc to
  the declaration that follows it, so this text follows `_<name>` into every hover and completion in
  every file — the one mechanism here that reaches a call site at all. The `//~` banner above it is
  line comments, which TypeScript ignores, so the attachment holds. It says nothing about *this*
  file (that saving pushes to SQL, say): the banner covers that, and the text is read mostly in
  other files, where it would be about the wrong file.
- **`Library` on the type name** (`libraryTypeName`, skipped when the name already ends that way).
  The type is the only part of the declaration a *collapsed* completion item shows, and
  `const _cabshape: cabshape` said nothing the identifier had not. That lowercase was a bug of its
  own — `.toLowerCase()` was applied to the type as well as the const, though only
  `libraryClassName` needs it, since only the const is a name UCS code calls.

`LIBRARY_OPEN` therefore takes an **optional** leading JSDoc block, optional so older mirrors still
match. Consuming a comment is safe despite stripping being destructive, because it is only ever
taken as part of a match that also required the wrapper line, and a JSDoc of the user's own sits
inside the body, below that line. The legacy-form test reads past the same optional block rather
than the head of the match, so which wrapper pair gets stripped does not hinge on legacy mirrors
happening not to carry one.

The UCS wrapper is still a single line, so only `jsLibrary` pays the larger reveal offset.

`leadingSentinel` / `trailingSentinel` are the single source of truth — `applySentinels`, the
editor's revert-on-edit guard and the dimming decoration in `SQLScriptProvider` all build from them,
and the guard/decoration derive *which* lines to protect from whether each returns a value rather
than from the kind.

`stripSentinels` is deliberately tolerant of a deleted or mangled sentinel, and **every hash and
comparison runs on the stripped form**, so sentinel edits never trigger a spurious `UPDATE`. It also
still accepts both 2.0.0 forms — the `class _<Name> {` / `}` library pair and the trailing
`export {};` — so mirrors written by that version round-trip without pushing a stale wrapper into
SQL; `syncFromDb` rewrites those files even when the code matches, which is the whole migration.

Each trailing sentinel is matched only when its **opening** line was found, and both are shaped so
they cannot be confused with real code: `}();` requires the `()`, or a library whose own last line is
`}` would lose that brace, and `})();` is specific enough that a UCS ending in its own IIFE survives.

### Where language knowledge lives

Static Cabinet Vision documentation is baked into JSON under [Languages/](Languages/) and loaded with
`fs.readFileSync` via paths in [src/constants.ts](src/constants.ts). Those paths are relative to
`__dirname`, i.e. `dist/`, so `../Languages` resolves from the repo root at runtime — the folder is
shipped in the VSIX, not compiled or bundled. Both bundles sit directly in `dist/` to keep that one
`../` true for the extension host and the server process alike; see the build-outputs section above.

- [Languages/data/system.json](Languages/data/system.json) — UCS:M keywords, ~680 system variables,
  functions, types, special objects. **Generated**, not hand-written: `initializeSystemJson()` in
  [src/jsonDocCreator.ts](src/jsonDocCreator.ts) parses [CVDoc/](CVDoc/) text dumps of the CV help
  files. The call is commented out in `activate()`; uncomment it to regenerate after updating CVDoc.
- [Languages/ucsjs/data/ucsjs_system.json](Languages/ucsjs/data/ucsjs_system.json) — UCS:JS objects,
  classes, constants, properties, methods with `parameterDef[].DataType` and `returnType`. Adding new
  CV API surface is usually a pure edit to this file; it flows into `cv-api.d.ts` automatically.
  `classes[]` is the table of types `_cvSystem.CreateObject` can return — `CVShapeManaged` plus the
  nine 2D CAD entities (`CMCadArc`, `CMCadCircle`, `CMCadDimension`, `CMCadLeader`, `CMCadLine`,
  `CMCadRect`, `CMCadSymbol`, `CMCadText`, `CMCadTextBox`). Each entry emits one interface, built
  from the methods and properties carrying its `name` as their `objectType`, and one `CreateObject`
  overload keyed on its `createName` string literal. `cad: true` additionally puts the class into the
  `CVCadObject` union that `AddCAD` accepts.
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
(15 values). `ParamName` is `"<type> <name>"`, so the identifier is the **second** token, and may
carry an `[optional]` / `(optional …)` marker.

A `DataType` may list **several alternatives separated by `|`**, for a parameter the documentation
declares as `Object` because its type depends on an earlier argument — `ModifyParameter`'s third
argument is a description string, a `parameterTypes` constant or a `parameterModStyles` constant
according to its second. Naming any one of them rejects the other two, and the alternative that
TypeScript *could* discriminate on (an overload set keyed on the second argument) is not
expressible: every constant in a group shares one branded type, so `PARMOD_DESC` and `PARMOD_STYLE`
are the same type. Branding each constant individually would discriminate, but it would also break
`[ASM_CLASS_BASE, …].includes(_cab.CLASS)`, which is the pattern the branding exists to serve.

`|` is not a generator-only convention: `dataTypeAlternatives` in
[ucsmValidation.ts](src/server/ucsmValidation.ts) splits it, and **every** consumer matches on the
alternatives rather than on the raw string — the `ucsmSyntax`, `materials` and `constants.<group>`
tests in `server.ts` completion and hover, and `FindUCSJSSyntaxMethods`. A union naming more than one
constant group offers all of their constants at that argument.

A method with `"factory": true` — only `CreateObject` — ignores `returnType` entirely and emits one
overload per `classes[]` entry instead, plus a trailing `(className: string): any` so a computed or
undocumented class name still compiles.

Property `Type` accepts a `constants.<group>` reference, exactly as `parameterDef[].DataType` does,
which is how the CAD entities get `LineType`, `ArrowLeft`, `TextHAlign` and friends typed to their
constant group rather than to a bare number. `COLORREF` maps to `number` (colours are written as
literals — `0xff00`).

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
  A failed connection prompts for both and retries up to 3 times. Escaping either prompt now `break`s
  the retry loop: falling back to the current value and retrying put *six* input boxes in front of
  anyone who opened a window with Cabinet Vision not running, and wrote the fallback into **global**
  settings besides, so a stray keystroke in an unrelated project could change the real configuration.
- `.vscodeignore` excludes `cvucs/**` and the root `AGENTS.md`. This repository is itself a test
  workspace, so it has a mirror in it, and `vsce` packs from the working directory without consulting
  the mirror's own `.gitignore` — without those lines the VSIX ships a copy of whatever UCS code was
  last synced from the developer's database. It also excludes `out/**` and `node_modules/**`, which
  is only correct *because* the extension is bundled; both would have to come back if `main` ever
  pointed at `out/` again.
- Database schema differs by CV version: `DbInfo.Version >= 2024` has the `MacroType` / `UCSLibrary`
  columns; older versions are UCS:M-only and those columns are synthesized as `0` in the query.
- The UCS:JS client still registers against `languageId: 'javascript'`, so its `documentSelector` is
  scoped by an absolute `pattern` built from the mirror root. Without that pattern it would serve
  every JavaScript document in the window. The same reasoning removed the `source.ucsjs` grammar
  injection and the `javascript`-scoped snippets from `package.json`; `Languages/ucsjs/ucsjs.tmLanguage.json`
  is retained but no longer contributed, since constants are now coloured via `cv-api.d.ts`.
- `Languages/ucsjs/ucsjs.snippets.json` is still shipped and still a VS Code snippet file, but it is
  now **served rather than contributed**: `ucsjsLanguageHandler` reads it at construction and
  `AddSnippets` pushes it as `InsertTextFormat.Snippet` completion items. That is what puts it back
  behind the `documentSelector` — a `contributes.snippets` entry keys on the language id alone, which
  for UCS:JS is plain `javascript`, so it would reappear in every JS file in the window. `server.ts`
  offers them only where a statement can start (`isStatementPosition`: not after a `.`, where
  TypeScript is completing members, and not inside a string, where the UCS:M injection belongs).
  UCS:M snippets are still a `package.json` contribution, because `ucsm` is a language id of ours.
- Both README.md and CHANGELOG.md carry release notes; keep them in sync with `package.json` `version`
  when publishing.

<!-- BEGIN cvucsedit - generated, edits here are lost -->
## Cabinet Vision UCS code

This workspace contains Cabinet Vision User Created Standards, mirrored from a SQL database into
[`cvucs/CVData/`](cvucs/CVData/).

**Before editing anything under `cvucs/CVData/`, read [`cvucs/CVData/AGENTS.md`](cvucs/CVData/AGENTS.md).**
Those files are not ordinary source files — each one is a live database row, saving one writes
straight to the database with no undo, and creating a file there does not create a standard. The
rules, the UCS:JS API and a full UCS:M reference are all in that folder.
<!-- END cvucsedit -->
