# Change Log

All notable changes to the "cvucsedit" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-08-07

A major release. UCS code is no longer held in virtual documents — every UCS is
now mirrored as a real file in the workspace, and UCS:JS is served by VS Code's
own TypeScript service instead of by this extension's language server.

### Added
- **Mirrored workspace folder.** Every UCS and library is written as a real file
  under `<workspace>/.cvucs/<Database>/`, as `<Name>.ucs.js` or `<Name>.ucsm`.
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
  whole API, your own libraries and your own code alike — including renaming a
  library method across every UCS that calls it.
- Parameters are now filled in automatically when a method is picked from the
  completion list, for library methods as well as documented Cabinet Vision
  methods. Constant arguments show their group as the placeholder, e.g.
  `ModifyParameter(name, PARMOD_, PARSTYLE_)`.
- New setting `cvucsedit.MirrorFolder` — the workspace folder UCS code is
  mirrored into (defaults to **.cvucs**).
- New setting `cvucsedit.CheckJs` — report TypeScript type errors in mirrored
  UCS:JS files (defaults to **false**, as it can be noisy). Completion, hover,
  go to definition and rename work either way.

### Changed
- UCS:JS completion, hover, definitions and references now come from
  TypeScript. The extension's language server keeps only what TypeScript cannot
  know: UCS:M completion and error checking inside string arguments such as
  `Evaluate()`, live material and connection lists, and constant groups narrowed
  to the argument being typed.
- Libraries are wrapped on disk so that TypeScript reproduces Cabinet Vision's
  scoping exactly — a library is visible from every UCS, a UCS is not visible
  from another UCS. The wrapper lines are stripped before anything is written
  back, so they never reach the database.
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