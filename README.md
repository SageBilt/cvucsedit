# Cabinet Vision USC editor
----------

This extension adds features to VS Code for loading, editing and saving Cabinet Vision User Created Standards (UCS).

## Features


### Key benefits over existing UCS editor
- Edit multiple UCS's at the same time.
- Search UCS list and contents.
- Edit UCS's while testing in Cabinet Vision (requires a manual trigger to reload the UCS in Cabinet Vision. See Requirements below for more information).
- Nicer looking syntax highlighting.
- Cabinet Vision documented UCS parameters, functions, keywords etc., integrated into the editor via intellisense and hover.
- Intellisense that actually works and is context aware.
- Hover over element (variables, functions, keywords etc.) to see information about element.
- Database specific items like user added material, schedule & construction parameters integrated into intellisense & hover.
- Snippets (pre-built code).
- Syntax error checking.
- User defined variable references.
- User defined variable definitions.
- UCS code is mirrored as real files in your workspace, so it can be searched across every UCS at once, opened by any external tool, and read and edited by AI coding agents.

#### Supported UCS macro types
- **UCS:M** Legacy UCS syntax
- **UCS:JS** Javascript from version 2024.1+

#### Supported Versions

Currently supports all Cabinet Versions from 2021 through to 2025. 
> **Note:** Version 12 may work but it has not been tested.

### Main Features

Addition to VSCode's built in features, this extension provides these features.

- **UCS & JavaScript library tree views**
  - UCS opens when clicked in tree view.
  - Search, clear search and reload list buttons for each list.
- **Mirrored workspace folder**
  - Every UCS and library is written as a real file under `cvucs/<Database>/` in your workspace, as `<Name>.ucs.js` or `<Name>.ucsm`. This is what allows UCS code to be searched across every UCS at once, opened by external tools, and read and edited by AI coding agents.
  - Sync is two way. Saving in the editor, an AI agent writing the file, and an external tool writing the file all take the same route back to the database.
  - On startup disk and database are reconciled. A change made only on disk is pushed to the database, a change made only in Cabinet Vision rewrites the file, and a file changed on both sides is reported as a conflict with neither side overwritten.
  - The folder ignores itself in git, so your own `.gitignore` is never touched.
  - Creating or deleting a UCS from the filesystem is not supported — use Cabinet Vision to add or remove a UCS.
- **Documentation for AI coding agents**
  - The mirrored folder documents itself. `AGENTS.md` (and a `CLAUDE.md` that imports it) tells an agent the things it cannot see from the files: that saving writes straight to the live database, that creating a file does not create a UCS, and which lines belong to the extension rather than to your code.
  - `ucsjs-reference.md` covers how Cabinet Vision executes a UCS:JS — why `return` is legal at the top level, why a `var` cannot appear inside an equation string, and why measurements must be compared with `_cvMath`.
  - `ucsm-reference.md` is a full UCS:M reference: the syntax, object tree navigation, value types, functions, object classes and types, and an index of all 683 system parameters grouped by the object they apply to. Written from Cabinet Vision's own help files, and generated from the same data the extension validates against, so it cannot drift.
  - Every mirrored file also carries a short generated header, so an agent is warned in the file it is editing even if it never opens the documentation. The header is not part of your standard and is never saved to the database.
  - A short pointer to all of this is kept in `AGENTS.md` and `CLAUDE.md` at the root of your workspace, since most agent tools only look there. Only the marked block is ever rewritten, anything you write around it is left alone, and `cvucsedit.WriteRootAgentFiles` turns it off.
  - The mirrored copies are regenerated on activation and on each list refresh, and are ignored by git along with the rest of the folder.
- **Syntax highlighting**
  - Different elements like keywords, constraints, data types etc. are styled accordingly.
  - Syntax highlighting follows VSCode theming and can be customized by the user.
- **Snippets**
  - Prebuilt blocks of code which can easily be adding from the code completion (intellisense) list.
- **Code Completion (intellisense)**
  - Access to all documented Cabinet Vision parameters along with additional details.
- **Hover information**
  - When hovering over a documented Cabinet Vision parameter, details about the parameter will be displayed.
- **Error checking (Syntax errors)**
  - Syntax error checking is provided on the fly as the user edits code. These errors are underlined with a red squiggly line under the code were the error exists. When the user hovers over the text, a description of the error is provided.
- **Definitions and References**
  - The existence and location of user defined variables (symbols) can be displayed for UCSM. 
  - Definitions and References for JavaScript library objects and CVAsmManaged object symbols can also be shown.
- **Language server**
    The extension uses a language server (LSP) to handle autocomplete, hover and references for declared variables for **UCS:M**, and to provide the Cabinet Vision specific completions inside **UCS:JS** string arguments. Using an LSP improves user experience as it runs under a separate process and reduces delay for the user typing. The rest of **UCS:JS** is handled by VS Code's own JavaScript/TypeScript service, working from a generated description of the Cabinet Vision API.

### Language Specific Features

#### UCS:M language features

- **Syntax highlighting**
  - Keywords, objects, constraints etc., are coloured according to VSCode theming.
- **Snippet completion**
  - Basic snippets are provided for control blocks (If Then, While Do), for each statements and Dim statements (Dim as new part, Dim as new Route etc.).
- **Code completions**
  - Code completion (intellisense) is provided for all documented Cabinet Vision parameters. 
  - Context aware Code completion is provided in some cases. For example when evoking the completion list (either by typing or pressing Ctrl + Space) next to the parameter "MATID", the user will provided with all material names from the Cabinet Vision database. When an item is selected, the ID of the material will be inserted. 
  - Context aware Code completion for objects like (_M:,_CV: etc.). When evoking the completion list to the right of these parameters, only the available properties will be displayed. 
- **Bracket matching**
  - Bracket matching is provided for IF,Then & Else blocks.
- **Comment toggling**
  - Whole sections of code can be commented out by simply pressing Ctrl + / and uncommented with the same key combination.
- **Hover information**
  - When the cursor is moved over a parameter or symbol, information about the parameter/symbol is displayed. In the case of Cabinet Vision parameters the documentation from the CV help files is displayed to the user. In the case of a symbol (user defined variable in the code) the defined type will be displayed.
- **Find References**
    - All symbol (user defined variable in the code) locations are stored for the current UCS. Go To References (Shift + F12) or Find All References (Shift + Alt + F12) will display all these locations within the UCS. Go To References will display these as an overlay while Find All References will display these in the left side bar. Clicking on a reference will jump to the line in the UCS.
- **Jump to definition**
  - Go To Definition (F12) will jump to the first symbol reference in the UCS.
- **Error checking (Diagnostics)**
  - Error checking features includes
    - Valid For Each statements.
    - Unclosed brackets.
    - Unclosed block statements (IF Then, While Do, Else).
    - Variable assignment and statement syntax checking.
  
#### UCS:JS language features

Because mirrored UCS:JS files are real JavaScript files in your workspace, VS Code's own TypeScript service handles them. The whole Cabinet Vision API is described to it in a generated definition file, so the standard JavaScript features work against the CV API and your own libraries exactly as they would in an ordinary JavaScript project.

- **Code completions**
  - All documented constants, types and functions for UCS:JS, along with the CVAsmManaged, CVShapeManaged and 2D CAD objects and their properties and methods.
  - `_cvSystem.CreateObject()` is typed per class name, so `CreateObject('cvArc')` offers arc members, `CreateObject('cvDimension')` offers dimension members, and so on.
  - Completion is filtered by type, so `_this.` offers only CVAsmManaged members. This applies to the built in objects like `_this` and `_cab` and equally to your own variables assigned from them.
  - Cabinet Vision JavaScript libraries are offered project wide, with each library's public properties and methods.
  - Parameters are filled in automatically when a method is picked from the list, for library methods as well as documented Cabinet Vision methods. Constant arguments show their group as the placeholder, for example `ModifyParameter(name, PARMOD_, PARSTYLE_)`.
  - Context aware completion inside string arguments. When the cursor is placed inside the string of `Evaluate()`, which evaluates an equation written in UCS:M, the list is populated with UCS:M parameters. Arguments that take a material or a connection are populated from your database, and arguments that take a constant are narrowed to just that group.
- **Hover information**
  - The Cabinet Vision documentation and an example for the constant, type, function, property or method under the cursor, and the inferred type of your own variables.
- **Find References**
  - References for anything you declare, including library objects and their properties and methods, across every UCS in the mirror folder.
- **Jump to definition**
  - Definitions for anything you declare, and for the Cabinet Vision API itself.
- **Rename**
  - Rename a symbol (F2) and every use of it is updated, including a library method renamed across every UCS that calls it.
- **Error checking (Diagnostics)**
  - Error checking for UCS:M context aware code is provided (see error checking under UCS:M language features above for more details).
  - JavaScript type checking against the Cabinet Vision API is available but off by default, as it can be noisy on existing code. Enable it with the `cvucsedit.CheckJs` setting.

## Requirements

#### Forcing Cabinet Vision to apply UCS updates edited outside of Cabinet Vision
Because UCS's are edited outside of Cabinet Vision, the user will need to force a reload for the changes to take effect.
This can be done by simply opening the UCS editor window and making any change. This could be just disabling and then re-enabling any UCS.
Alternatively the job can be closed and re-opened.

#### An open folder

UCS code is mirrored into the open workspace folder, which is created automatically. If no folder is open the mirror falls back to a location outside the workspace and a warning is shown — editing still works, but search, AI agents and the JavaScript language features cannot reach the files, so opening a folder is recommended.

## dependencies
- vscode-languageclient
- vscode-languageserver
- vscode-languageserver-protocol
- mssql

## Extension Settings

#### Available Setttings

* `cvucsedit.Server`: The Cabinet Vision database SQL server instance name (defaults to **localhost\CV24**).
* `cvucsedit.Database`: The name of the Cabinet Vision SQL database (defaults to **CVData**).
* `cvucsedit.MirrorFolder`: The folder inside the workspace that UCS code is mirrored into (defaults to **cvucs**). Deliberately not hidden — some AI agent tools skip dot-prefixed folders. A mirror left in the old `.cvucs` folder is moved here automatically.
* `cvucsedit.WriteRootAgentFiles`: Keep a short Cabinet Vision UCS section in `AGENTS.md` and `CLAUDE.md` at the root of the workspace, pointing AI agents at the mirrored folder (defaults to **true**). Existing files are appended to between markers, never overwritten.
* `cvucsedit.CheckJs`: Report JavaScript type errors in mirrored UCS:JS files (defaults to **false**). Completion, hover, go to definition and rename work either way; enabling this also surfaces type errors, which can be noisy.

#### Available Commands

* `cvucsedit.loadUCSLists`: Reload Cabinet Vision UCS & library lists.
* `cvucsedit.searchUCSList`: Search UCS List.
* `cvucsedit.clearSearchUCSList`: Clear UCS Search.
* `cvucsedit.refreshUCSList`: Refresh UCS List.
* `cvucsedit.searchUCSLibList`: Search library List.
* `cvucsedit.clearSearchUCSLibList`: Clear library Search.
* `cvucsedit.refreshUCSLibList`: Refresh library List.
* 
## Known Issues

Please report all issues on [Github](https://github.com/SageBilt/cvucsedit/issues)


## Release Notes

#### 2.0.0

A major release. UCS code is no longer held in virtual documents — every UCS is now mirrored as a real file in the workspace, UCS:JS is served by VS Code's own TypeScript service instead of by this extension's language server, and the mirror carries its own documentation so that AI coding agents working in it know what they are editing.

##### Added
- **Mirrored workspace folder**
  - Every UCS and library is written as a real file under `cvucs/<Database>/`, so UCS code can be searched across every UCS at once, opened by any external tool, and read and edited by AI coding agents.
  - Sync is two way, and disk and database are reconciled on startup. A file changed on both sides is reported as a conflict with neither side overwritten.
  - The folder ignores itself in git, so your own `.gitignore` is never touched.
- **Full TypeScript language support for UCS:JS**
  - Completion, hover, go to definition, find all references, rename and optional type checking, covering the whole Cabinet Vision API, your own libraries and your own code alike. `_MyLib.Method()` behaves exactly as your own code does, right down to renaming a library method across every UCS that calls it.
  - Parameters are filled in automatically when a method is picked from the completion list, for library methods as well as documented Cabinet Vision methods. Constant arguments show their group as the placeholder, e.g. `ModifyParameter(name, PARMOD_, PARSTYLE_)`.
- **The mirror documents itself for AI agents**
  - `AGENTS.md`, `CLAUDE.md`, `ucsjs-reference.md` and `ucsm-reference.md` are generated next to your UCS files, covering the rules that cannot be inferred from the files themselves — a save writes straight to the live database, a new file is ignored, and the first and last lines of a `.ucs.js` are not code. `ucsm-reference.md` is the first UCS:M reference to exist anywhere in the workspace, indexing all 683 system parameters by the object they apply to.
  - Every mirrored file also opens with a short generated header carrying those rules, and a pointer block is kept in `AGENTS.md` and `CLAUDE.md` at the workspace root, since that is where most agent tools look. Both are stripped before anything is written back to the database.
- **Dynamic 2D CAD for UCS:JS**
  - The nine CAD entity classes — Arc, Circle, Dimension, Leader, Line, Rectangle, Symbol, Text and TextBox — are fully described, so completion, signature help and hover work on them just as they do on `_this`.
  - `_cvSystem.CreateObject()` returns the class matching the name it is given, `AddCAD(axis, cad)` accepts only a CAD object, and the CAD constant groups (line type and weight, arrow type, text alignment, dimension text position) are checked against the property they are assigned to.
- New settings `cvucsedit.MirrorFolder`, `cvucsedit.WriteRootAgentFiles` and `cvucsedit.CheckJs`.

##### Changed
- UCS:JS completion, hover, definitions and references now come from TypeScript. The extension's language server keeps only what TypeScript cannot know: UCS:M completion and error checking inside string arguments such as `Evaluate()`, live material and connection lists, and constant groups narrowed to the argument being typed.
- Mirrored files are wrapped on disk so that TypeScript reproduces Cabinet Vision's scoping and execution model exactly — a library is visible from every UCS, a UCS is not visible from another UCS, and a top-level `return` is legal, because Cabinet Vision executes a UCS as a function body. The wrapper lines never reach the database.
- An open folder is strongly recommended. With no folder open the mirror falls back to a location outside the workspace, where search, AI agents and the JavaScript language features cannot reach it.

##### Removed
- The extension no longer modifies your global `editor.semanticTokenColorCustomizations` setting.
- UCS:JS snippets (new part, new route, new dado, new hole, new linebore, new connection), superseded by TypeScript completion, which covers the entire API rather than a fixed list. UCS:M snippets are unchanged.

##### Known limitations
- Creating or deleting a UCS from the filesystem is not supported. Adding or deleting a file in the mirror folder does not add or delete the database row.

#### 1.1.0

### Added
- **new CV 2025 ucsjs objects and methods**
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

#### 1.0.6

#### Fixed
- Fixed "Cannot read properties of undefined" when hovering or invoking completion with databases that don't contain specific data.
- #7 circular reference of CustomTreeItem when opening a UCS from the list.

#### Fixed
- Invalid error on (variable := value)

### 1.0.4

#### Fixed
- Invalid errors for For Each * {type}
- Invalid error on (variable!=condition) where no space was after an equals sign.

#### Added
- ucsm snippets for attributes (by Streamlined)

### 1.0.3

#### Changed
- Improved handling of SQL database connection issues so that upto 3 tries are allowed.

#### Fixed
- Hover not finding prefix word when using some comparision chars and data types.
- #2 corrected incorrect spelling of "Cannot" in "Cannot be a comparison operator." validation error message.
- #2 allow '!' flip for assignments.

#### Added
- Added connection information to autocomplete and hover. Also made context aware when next to "_CONNID" parameter in both UCS:M and UCS:JS.
- Added snippets to UCS:JS for new part, new route, new dado, new hole, new linebore and new connection.

#### 1.0.0

Initial release

---

**Enjoy!**
