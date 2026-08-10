# Change Log

All notable changes to the "cvucsedit" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.1] - 2026-08-10

Reported from a user's machine: in a folder that has not been trusted, the
extension is not merely limited but absent — the activity bar icon is not there,
and nothing on screen says why. VS Code disables an extension entirely in a
restricted workspace unless it says otherwise, and this one never said
otherwise. It does now. A fix to how the extension declares itself rather than
to what it does, so a patch.

### Fixed
- **The extension no longer disappears in an untrusted folder.** Opening the
  mirror — or the folder Cabinet Vision launches to debug in — without trusting
  it first took the whole extension out, activity bar icon included, with
  nothing on screen to explain it. It now runs in untrusted workspaces: the
  standards list, UCS:M support and saving back to the database all work
  normally. The database and mirror location settings are read from your user
  settings rather than the workspace's while untrusted, so a folder from
  someone else cannot redirect the connection.

  One part still needs trust, because it is VS Code's and not ours: TypeScript
  runs in a limited mode until the folder is trusted, so UCS:JS completion,
  hover, rename and find references stay unavailable. The status bar item says
  so while that is the case, and offers the way to grant it. Granting trust
  mid-session connects without a reload.

## [2.3.0] - 2026-08-10

Two things the UCS:JS completion list should have been showing and was not. The
snippets have not appeared since 2.0.0, when they went out with the rest of the
`javascript` language contributions and nothing put them back; they are now
served by the language server, which knows which files are UCS code. And a
library, at a call site, read as an anonymous `const` of a lowercased type —
TypeScript has only the declaration to report, so the declaration now says what
the thing is.

### Added
- **Three more UCS:JS snippets.** `NewHardware` creates a hardware child and
  positions it, and `NewAttribute` and `NewNote` each write the three calls a
  parameter needs to show up as an attribute or a note — the value, the style,
  and the prompt — which is easy to get half right from memory.

### Changed
- **Libraries now describe themselves in hover and IntelliSense.** Hovering
  `_cabshape` used to read `const _cabshape: cabshape`, which is everything
  TypeScript could tell from the declaration and nothing a reader did not
  already know. Library files now carry a generated JSDoc block above the
  wrapper line, so every hover and every completion says it is a Cabinet Vision
  UCS:JS library, names it, and explains that its body is a class body — in
  every standard that calls it, not just in the library itself. The type is
  named `<Name>Library`, which is the part visible without expanding a
  completion item, and it keeps the name's own capitalisation instead of being
  lowercased along with the global.

### Fixed
- **The UCS:JS snippets are back** — new part, route, dado, hole, linebore,
  connection and the rest all complete again. 2.0.0 dropped them along with the rest of the
  `javascript` language contributions, because a snippet contribution applies to
  every JavaScript file in the window, not just UCS code. They now come from the
  language server instead, which is already scoped to mirrored UCS:JS and Cabinet
  Vision's debug folder, so they appear where UCS code is and nowhere else.

## [2.2.1] - 2026-08-08

Packaging only. No behaviour changes.

### Changed
- **The extension is now bundled**, and the download is a twentieth of the size:
  742 KB across 34 files, where 2.2.0 was 5.0 MB across 2404. Almost all of that
  was the dependency tree shipped alongside the code — the SQL Server driver
  pulls in an Azure Active Directory authentication stack of some 1400 files,
  none of which this extension can use, since it connects with the fixed Cabinet
  Vision account. Installing and starting up both have less to walk through.

## [2.2.0] - 2026-08-08

Cabinet Vision can launch VS Code on its own `Temp\UCSJS` folder and attach its
script engine's debugger, so a standard can be run with breakpoints. The
extension did nothing in that window, because the files Cabinet Vision puts there
are plain `.js` rather than the `.ucs.js` of the mirror. It now recognises the
window and gives those files the same language support the mirror gets, without
ever writing to them.

### Added
- **Support for Cabinet Vision's UCS debugging window.** When Cabinet Vision
  launches VS Code on its `Temp\UCSJS` folder to debug a standard, the extension
  now recognises that window and connects to it. The plain `.js` files Cabinet
  Vision puts there get the full Cabinet Vision API — completion, hover,
  signature help and the constants — along with UCS:M completion and validation
  inside `Evaluate('…')` strings, the same as mirrored UCS:JS. Cabinet Vision
  keeps sole control of saving those files back to the database; the extension
  never writes to them.
- Those folders also get an `AGENTS.md` and `CLAUDE.md` explaining what the files
  are, so an AI agent asked to edit one knows that the `function fn<Name>() { … }`
  wrapper is Cabinet Vision's rather than part of the standard, that the folder is
  emptied when Cabinet Vision restarts, and where the durable copy of the same
  standard lives.
- `cvucsedit.DebugFolderSuffix` controls the folder ending that is recognised
  (default `Temp/UCSJS`). Clear it to turn the whole thing off.
- **Cabinet Vision UCS: Forget This Workspace**, which clears every answer this
  workspace has given — whether to connect here, where to mirror, and whether
  `AGENTS.md` may be written at its root — and offers a window reload. Useful
  after disconnecting somewhere you later want back, since disconnecting is
  remembered and no longer auto-connects there.

### Changed
- **Cabinet Vision 2026 is now supported**, and the default SQL server instance is
  `localhost\CV26` rather than `localhost\CV24`. The instance name tracks the
  Cabinet Vision version, so set `cvucsedit.Server` if you are running an earlier
  one. If you were relying on the old default rather than setting it yourself,
  the first connection after upgrading will fail and prompt you for the server
  and database; what you enter there is kept.

### Fixed
- The mirror is no longer placed inside Cabinet Vision's debug folder. Because
  Cabinet Vision empties that folder on restart, `manifest.json` went with it —
  and that file is the merge base, so the next sync had nothing to compare
  against, let the database win and silently discarded any edit made on disk but
  not yet saved. Debug windows now always mirror to the dedicated folder.

## [2.1.0] - 2026-08-07

2.0.0 assumed every VS Code window was a Cabinet Vision window. It activated in
all of them, connected to the database, mirrored a `cvucs/` folder into whatever
project happened to be open and added a block to that project's `AGENTS.md` and
`CLAUDE.md`. This release makes all three of those things something a workspace
opts in to.

Existing setups are unaffected: a workspace that already contains a mirror keeps
using it, in place, and keeps starting automatically.

### Changed
- **The extension no longer starts in a workspace that has not used it.** Opening
  an unrelated project now does nothing at all — no connection, no folder, no
  files written. Connect with **Cabinet Vision UCS: Connect** from the command
  palette or the button in the UCS tree view, and that workspace is remembered.
- **UCS code is mirrored outside your projects by default.** New setups mirror to
  `<your home folder>/Cabinet Vision UCS/<Database>/`, which you open as its own
  window with **Cabinet Vision UCS: Open UCS Workspace**. A workspace that
  already has a `cvucs/` folder in it carries on exactly as before. Choose
  explicitly with `cvucsedit.MirrorLocation` (`dedicated` or `workspace`), and
  set the path with `cvucsedit.MirrorPath`.
- **You are now asked before anything is written to your project's `AGENTS.md`
  or `CLAUDE.md`.** In the dedicated UCS folder the pointer block is still
  written straight away, because that folder belongs to the extension. In one of
  your own projects the prompt offers *Add*, *Not now* and *Never in this
  workspace*, and the answer is remembered for that workspace only. 2.0.0 wrote
  first and offered an undo afterwards, once ever, so a second project got no
  notice at all.
- Cancelling the SQL server/database prompt now stops asking. Previously
  escaping it re-used the current value and retried, so an unreachable database
  produced six input boxes and wrote the fallback into your global settings.

### Added
- `cvucsedit.AutoStart` (default on) — connect automatically when a workspace
  that has used the extension before is opened. Turn it off to start manually
  every time with **Cabinet Vision UCS: Connect**.
- **Cabinet Vision UCS: Disconnect** — stops the language servers and the file
  watcher, so no further save reaches the database, and stops this workspace
  starting automatically.
- **Cabinet Vision UCS: Remove UCS Files from This Workspace** — cleans up after
  an earlier version: takes the pointer block back out of `AGENTS.md` and
  `CLAUDE.md`, and optionally deletes the mirror folder. It works without
  connecting, and only deletes a folder it can identify as a mirror by its
  `manifest.json`.
- A status bar item showing whether the extension is connected, and a welcome
  view in the UCS tree with a Connect button.

### Fixed
- The published VSIX no longer contains a copy of the developer's own mirrored
  UCS code. `vsce` packs from the working directory and does not consult the
  mirror's `.gitignore`, and this repository is itself a test workspace.

## [2.0.0] - 2026-08-07

A major release. UCS code is no longer held in virtual documents — every UCS is
now mirrored as a real file in the workspace, UCS:JS is served by VS Code's own
TypeScript service instead of by this extension's language server, and the
mirror carries its own documentation so that AI coding agents working in it know
what they are editing.

### Added
- **Mirrored workspace folder.** Every UCS and library is written as a real file
  under `<workspace>/cvucs/<Database>/`, as `<Name>.ucs.js` or `<Name>.ucsm`.
  Because UCS code now lives at a real path it can be read by AI coding agents,
  found with search across all UCS's at once, and opened by any external editor
  or tool. The folder ignores itself in git, so your own `.gitignore` is never
  touched.
- **Two-way sync.** Saving in the editor, an AI agent writing the file and an
  external tool writing the file all take the same route back to the database.
  On startup, disk and database are reconciled: a change made only on disk is
  pushed to SQL, a change made only in Cabinet Vision rewrites the file, and a
  file changed on both sides is reported as a conflict with neither side
  overwritten.
- **Full TypeScript language support for UCS:JS.** The Cabinet Vision API is
  compiled into a generated `cv-api.d.ts`, giving completion, hover, go to
  definition, find all references, rename and (optionally) type checking for the
  whole API, your own libraries and your own code alike. Your libraries are
  covered exactly as your own code is: `_MyLib.Method()` completes, hovers, goes
  to definition, and can be renamed across every UCS that calls it.
- Parameters are now filled in automatically when a method is picked from the
  completion list, for library methods as well as documented Cabinet Vision
  methods. Constant arguments show their group as the placeholder, e.g.
  `ModifyParameter(name, PARMOD_, PARSTYLE_)`.
- **The mirror folder documents itself for AI agents.** Four generated files
  are written next to `cv-api.d.ts`: `AGENTS.md` with the rules that cannot be
  inferred from the files themselves — a save is an immediate write to the live
  database, a new file is silently ignored, the first and last lines of a
  `.ucs.js` are not code — plus `CLAUDE.md` importing it, `ucsjs-reference.md`
  for the UCS:JS execution model, and `ucsm-reference.md`, which is the first
  UCS:M reference to exist anywhere in the workspace. It covers the language and
  indexes all 683 system parameters, grouped by the object they apply to.
  Everything in them is drawn from Cabinet Vision's own help files and from the
  same JSON the language server validates against.
- **Agents are now pointed at that documentation three different ways**, because
  testing showed a mirror-local `AGENTS.md` is not reliably found — depending on
  the tool, instruction files in a subfolder are discovered late, only at the
  project root, or not at all.
  - Every mirrored file now opens with a four line generated header (`//~`, or
    `;~` for UCS:M) carrying the rules that are expensive to get wrong. It needs
    no discovery at all: it is in the file the agent was asked to edit. Like the
    other sentinel lines it is stripped before anything is saved, so it never
    reaches the database, and the editor reverts edits to it.
  - A short pointer block is kept in `AGENTS.md` and `CLAUDE.md` at the
    workspace root, which is where most tools actually look. Only the text
    between the markers is ever rewritten; an existing file is appended to.
    `cvucsedit.WriteRootAgentFiles` turns this off, and the notification shown
    the first time it happens offers to undo it.
- **Dynamic 2D CAD for UCS:JS.** The nine CAD entity
  classes — Arc, Circle, Dimension, Leader, Line, Rectangle, Symbol, Text and
  TextBox — are described to TypeScript with all of their properties, methods
  and Cabinet Vision documentation, so completion, signature help and hover work
  on them the same way they do on `_this`.
- `_cvSystem.CreateObject()` now returns the class matching the name it is given.
  `CreateObject('cvArc')` is a `CMCadArc`, `CreateObject('cvShape')` is still a
  `CVShapeManaged`, and each is nullable so a missing null check is caught when
  `cvucsedit.CheckJs` is on.
- `AddCAD(axis, cad)` on `_this` and `_cab`, which only accepts a CAD object.
- The CAD constant groups: line type, line weight, arrow type, vertical and
  horizontal text alignment, and dimension text position. Assigning one to the
  wrong property — an arrow type to `LineType`, say — is reported.
- New setting `cvucsedit.MirrorFolder` — the workspace folder UCS code is
  mirrored into (defaults to **cvucs**). Deliberately not dot prefixed, because
  some AI agent tools skip hidden folders when looking for context.
- New setting `cvucsedit.WriteRootAgentFiles` — maintain the pointer block in
  the workspace root `AGENTS.md` and `CLAUDE.md` (defaults to **true**).
- New setting `cvucsedit.CheckJs` — report TypeScript type errors in mirrored
  UCS:JS files (defaults to **false**, as it can be noisy). Completion, hover,
  go to definition and rename work either way.

### Changed
- UCS:JS completion, hover, definitions and references now come from
  TypeScript. The extension's language server keeps only what TypeScript cannot
  know: UCS:M completion and error checking inside string arguments such as
  `Evaluate()`, live material and connection lists, and constant groups narrowed
  to the argument being typed.
- Mirrored files are wrapped on disk so that TypeScript reproduces Cabinet
  Vision's scoping and execution model exactly — a library is visible from every
  UCS, a UCS is not visible from another UCS, and a top-level `return` is legal,
  because Cabinet Vision executes a UCS as a function body. The wrapper lines
  and the generated header are stripped before anything is written back, so they
  never reach the database, and the editor reverts edits made to them.
- An open folder is strongly recommended. With no folder open the mirror falls
  back to a location outside the workspace, with a warning — editing still
  works, but search, AI agents and the TypeScript project cannot reach it.

### Removed
- The extension no longer modifies your global
  `editor.semanticTokenColorCustomizations` setting. UCS:JS constants are now
  coloured by VS Code from the generated API definitions.
- UCS:JS snippets (new part, new route, new dado, new hole, new linebore, new
  connection) and the UCS:JS grammar injection. Both are superseded by
  TypeScript completion, which covers the entire API rather than a fixed list.
  UCS:M snippets are unchanged.
- The `@babel/parser`, `@babel/traverse` and `express` dependencies.

### Known limitations
- Creating or deleting a UCS from the filesystem is not supported — adding or
  deleting a file in the mirror folder does not add or delete the database row.
  Only edits to existing UCS's are synced.

## [1.1.0] - 2025-10-01

### Added
- new CV 2025 ucsjs objects and methods
  - GetChildren() and GetChildren(string filter) Method
  - _cvSystem API added
  - _cvMath API expanded
  - _cvString API added
  - Shape Objects (Assemblies, Parts, Operations) 
  - GetShape() Method added 
  - IsShaped() Method added 
  - SetShape() Method added


### Fixed
- Make Prefix word for autocompletion not case sensitive.
- Fixed null error on property "type" in preferenceParser class.

## [1.0.6] - 2025-06-16

### Fixed
- Fixed "Cannot read properties of undefined" when hovering or invoking completion with databases that don't contain specific data.
- #7 circular reference of CustomTreeItem when opening a UCS from the list.

## [1.0.5] - 2025-05-06

### Fixed
- Invalid error on (variable := value)

## [1.0.4] - 2025-05-03

### Fixed
- Invalid errors for For Each * {type}
- Invalid error on (variable!=condition) where no space was after an equals sign.

### Added
- ucsm snippets for attributes (by Streamlined)

## [1.0.3] - 2025-04-22

### Changed
- Improved handling of SQL database connection issues so that upto 3 tries are allowed.

### Fixed
- Hover not finding prefix word when using some comparision chars and data types.
- #2 corrected incorrect spelling of "Cannot" in "Cannot be a comparison operator." validation error message.
- #2 allow '!' flip for assignments.

### Added
- Added connection information to autocomplete and hover. Also made context aware when next to "_CONNID" parameter in both UCS:M and UCS:JS.
- Added snippets to UCS:JS for new part, new route, new dado, new hole, new linebore and new connection.

## [1.0.2] - 2025-04-17

### Fixed

- corrected missing "vscode-languageserver" in package.json dependencies which was preventing the exension to load. 

## [1.0.0] - 2025-04-16

- Initial release