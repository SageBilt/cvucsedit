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

Currently supports all Cabinet Versions from 2021 through to 2026. 
> **Note:** Version 12 may work but it has not been tested.

### Main Features

Addition to VSCode's built in features, this extension provides these features.

- **UCS & JavaScript library tree views**
  - UCS opens when clicked in tree view.
  - Search, clear search and reload list buttons for each list.
- **Opt in per workspace**
  - The extension does nothing in a workspace until you connect there, with **Cabinet Vision UCS: Connect** or the button in the UCS tree view. Opening an unrelated project never creates a folder, writes a file or touches the database.
  - Once you have connected in a workspace it is remembered and starts automatically next time. `cvucsedit.AutoStart` turns that off if you would rather start it by hand.
- **Mirrored UCS folder**
  - Every UCS and library is written as a real file under `<mirror>/<Database>/`, as `<Name>.ucs.js` or `<Name>.ucsm`. This is what allows UCS code to be searched across every UCS at once, opened by external tools, and read and edited by AI coding agents.
  - By default the mirror is a folder of its own outside your projects — `<your home folder>/Cabinet Vision UCS/` — which you open as its own window with **Cabinet Vision UCS: Open UCS Workspace**. Set `cvucsedit.MirrorLocation` to `workspace` to mirror into the project you have open instead, under `cvucs/`.
  - Sync is two way. Saving in the editor, an AI agent writing the file, and an external tool writing the file all take the same route back to the database.
  - On startup disk and database are reconciled. A change made only on disk is pushed to the database, a change made only in Cabinet Vision rewrites the file, and a file changed on both sides is reported as a conflict with neither side overwritten.
  - The folder ignores itself in git, so your own `.gitignore` is never touched.
  - Creating or deleting a UCS from the filesystem is not supported — use Cabinet Vision to add or remove a UCS.
- **Documentation for AI coding agents**
  - The mirrored folder documents itself. `AGENTS.md` (and a `CLAUDE.md` that imports it) tells an agent the things it cannot see from the files: that saving writes straight to the live database, that creating a file does not create a UCS, and which lines belong to the extension rather than to your code.
  - `ucsjs-reference.md` covers how Cabinet Vision executes a UCS:JS — why `return` is legal at the top level, why a `var` cannot appear inside an equation string, and why measurements must be compared with `_cvMath`.
  - `ucsm-reference.md` is a full UCS:M reference: the syntax, object tree navigation, value types, functions, object classes and types, and an index of all 683 system parameters grouped by the object they apply to. Written from Cabinet Vision's own help files, and generated from the same data the extension validates against, so it cannot drift.
  - Every mirrored file also carries a short generated header, so an agent is warned in the file it is editing even if it never opens the documentation. The header is not part of your standard and is never saved to the database.
  - A short pointer to all of this is kept in `AGENTS.md` and `CLAUDE.md` at the root of the folder holding the mirror, since most agent tools only look there. In the dedicated UCS folder that is written straight away; if you are mirroring into a project of your own you are asked first, per workspace. Only the marked block is ever rewritten, anything you write around it is left alone, `cvucsedit.WriteRootAgentFiles` turns it off, and **Cabinet Vision UCS: Remove UCS Files from This Workspace** takes it back out again.
  - The mirrored copies are regenerated on activation and on each list refresh, and are ignored by git along with the rest of the folder.
- **Cabinet Vision's UCS debugging window**
  - When Cabinet Vision launches VS Code on its `Temp\UCSJS` folder to run a standard with breakpoints, the extension recognises that window and connects there without being asked.
  - The plain `.js` files Cabinet Vision puts there get the same language support as mirrored UCS:JS — the Cabinet Vision API, completion, hover, signature help, the constants, and UCS:M inside `Evaluate('…')` strings.
  - Nothing in that folder is watched or written back. Cabinet Vision extracted those files and Cabinet Vision saves them; the extension only reads them. Your UCS code still mirrors as usual, to the dedicated folder rather than into Cabinet Vision's temporary one.
  - The folder gets its own `AGENTS.md` and `CLAUDE.md`, since an AI agent looking at it would otherwise see ordinary JavaScript and have no way to tell that the `function fn<Name>() { … }` wrapper is Cabinet Vision's, that the folder is emptied on restart, or that a durable copy of the same standard lives elsewhere.
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

- **Snippet completion**
  - Whole blocks for the things a standard usually starts with — `NewPart`, `NewRoute`, `NewDado`, `NewHole`, `NewLinebore`, `NewConnection`, `NewHardware`, and `NewAttribute` and `NewNote` for a parameter that has to appear as an attribute or a note. Type the name and pick it from the completion list, then tab through the values.
  - They are offered in mirrored UCS files and in Cabinet Vision's debug folder, and nowhere else — not in the ordinary JavaScript you happen to have open in the same window.
- **Code completions**
  - All documented constants, types and functions for UCS:JS, along with the CVAsmManaged, CVShapeManaged and 2D CAD objects and their properties and methods.
  - `_cvSystem.CreateObject()` is typed per class name, so `CreateObject('cvArc')` offers arc members, `CreateObject('cvDimension')` offers dimension members, and so on.
  - Completion is filtered by type, so `_this.` offers only CVAsmManaged members. This applies to the built in objects like `_this` and `_cab` and equally to your own variables assigned from them.
  - A collection returned by Cabinet Vision is typed as the .NET list it really is, so `GetChildren()` offers `Count`, `Item()`, `ForEach`, `Find` and the rest of `List<T>` rather than JavaScript array methods that are not there at runtime.
  - Cabinet Vision JavaScript libraries are offered project wide, with each library's public properties and methods. A library identifies itself in the list and in its hover — that it is a Cabinet Vision UCS:JS library, which one, and that its body is a class body — so a call site reads as more than someone's variable.
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

#### The UCS folder being open

UCS code is mirrored to real files on disk, and VS Code's JavaScript language features only cover files inside the folder you have open. So with the default `dedicated` mirror location, run **Cabinet Vision UCS: Open UCS Workspace** to open the mirror as its own window — the extension offers this if it notices the mirror is out of sight. Editing works either way, but UCS:JS completion, rename and find references, and anything an AI agent does, need the folder to be open.

## dependencies
- vscode-languageclient
- vscode-languageserver
- vscode-languageserver-protocol
- mssql

## Extension Settings

#### Available Setttings

* `cvucsedit.Server`: The Cabinet Vision database SQL server instance name (defaults to **localhost\CV26**). The instance name tracks the Cabinet Vision version, so set this if you are running an earlier one — `localhost\CV24` for 2024, and so on.
* `cvucsedit.Database`: The name of the Cabinet Vision SQL database (defaults to **CVData**).
* `cvucsedit.AutoStart`: Connect automatically when a workspace that has used the extension before is opened (defaults to **true**). A workspace that has never connected is never started automatically, whatever this is set to.
* `cvucsedit.MirrorLocation`: Where UCS code is mirrored — **dedicated** (a folder of the extension's own, outside your projects) or **workspace** (the folder you have open). Leave it unset to let the extension decide per workspace: one that already contains a mirror keeps using it, anything else uses the dedicated folder.
* `cvucsedit.MirrorPath`: Full path of the dedicated mirror folder (defaults to **&lt;your home folder&gt;\Cabinet Vision UCS**). Each database gets a subfolder of its own. Avoid a cloud-synced folder such as OneDrive — the mirror tracks a live database.
* `cvucsedit.MirrorFolder`: The folder name used when `cvucsedit.MirrorLocation` is **workspace** (defaults to **cvucs**). Deliberately not hidden — some AI agent tools skip dot-prefixed folders. A mirror left in the old `.cvucs` folder is moved here automatically.
* `cvucsedit.WriteRootAgentFiles`: Keep a short Cabinet Vision UCS section in `AGENTS.md` and `CLAUDE.md` at the root of the folder holding the mirror, pointing AI agents at it (defaults to **true**). In your own project you are asked before this is written for the first time. Existing files are appended to between markers, never overwritten.
* `cvucsedit.CheckJs`: Report JavaScript type errors in mirrored UCS:JS files (defaults to **false**). Completion, hover, go to definition and rename work either way; enabling this also surfaces type errors, which can be noisy.
* `cvucsedit.DebugFolderSuffix`: The end of the folder path Cabinet Vision opens when it launches VS Code to debug a UCS (defaults to **Temp/UCSJS**). A window opened on a folder ending this way connects automatically and gets UCS:JS language support on its plain `.js` files. Only the ending is matched, since the install path and version differ per machine. Clear it to turn that off.

#### Available Commands

* `cvucsedit.start`: Connect to Cabinet Vision, and remember this workspace.
* `cvucsedit.stop`: Disconnect. Stops the language servers and the file watcher, so no further save reaches the database.
* `cvucsedit.openMirrorWorkspace`: Open the dedicated UCS folder as its own window.
* `cvucsedit.removeFromWorkspace`: Remove the UCS pointer block, and optionally the mirror folder, from this workspace.
* `cvucsedit.forgetWorkspace`: Forget every answer this workspace has given — whether to connect, where to mirror, and whether `AGENTS.md` may be written at its root — and offer a reload. Use it to undo a disconnect, or to see what a first visit does.
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

#### 2.3.4

Four methods Cabinet Vision documents on the assembly object were missing from the extension's description of the API, and two more were missing an optional argument. All six now match *JavaScript Assembly Object* in the Cabinet Vision help.

##### Fixed
- **`GetDescendants()` and `GetDescendants('filter')` are now offered.** The deep-dive version of `GetChildren` — every object below the current one, not just its immediate children — was missing altogether, so writing it was marked as an error and nothing was offered on the result. It takes the same name filters, with `?` and `*` wildcards and `|` between them.
- **`RemoveCAD(axis)` and `RemoveShape()` are now offered.** Both were missing, which left the documented way of taking dynamic CAD or a shape back off a top-level assembly — where, unlike on a part, they stay put — marked as an error.
- **`GetShape(axis)` and `GetParameterValue('DX', true)` are accepted.** Both methods were described without their optional argument, so the very calls Cabinet Vision's documentation gives as examples were reported as having too many arguments.

#### 2.3.3

Cabinet Vision exposes a .NET API, so `GetChildren` gives you a .NET list and not a JavaScript array — as Cabinet Vision's own documentation says. The extension's description of the API did not, and called it an array.

##### Fixed
- **Collections are described as the .NET lists they are.** Because `GetChildren` was described as returning an array, completion offered `length`, `forEach`, `map` and `filter` on the result, and none of those exist when the standard runs. `length` was the expensive one: it is not an error, it is simply `undefined`, so `for (var i = 0; i < children.length; i++)` never runs once and the standard appears to do nothing at all.

  The list now offers what it really has — `Count`, `Item()` and indexing, `Contains`, `IndexOf`, `GetRange`, `ToArray`, `Add`, `Remove` and the rest — with documentation on each. `ToArray()` is a .NET array in turn, counted with `Length`. Adding to or removing from one of these lists changes the list only, never the model.
- **Methods that take a callback are shown as unavailable, because Cabinet Vision cannot call them from a standard.** `ForEach`, `Find`, `FindAll`, `Exists`, `RemoveAll` and `Sort` with a comparison all expect a .NET delegate, and a JavaScript function is not one, so the standard stops with *"The best overloaded method match ... has some invalid arguments"*. They are struck through in the completion list and their hover says to use a counted `for` loop instead — rather than being hidden, since the method is genuinely on the object and you will see it in Cabinet Vision's debugger.
- The guidance the extension writes for AI agents covers this too, so an agent asked to loop over the children of a cabinet is told the same thing rather than assuming an array — and rather than reaching for `ForEach`.

#### 2.3.2

Reported from a user's machine: every enabled UCS:JS library in Cabinet Vision started failing to compile, all at once, each having acquired the extension's own wrapper lines in the database. Removing them by hand was the only way back. **Anyone who has seen this should install this version everywhere before connecting again** — the fault is in the older versions, so a single window still running one can still do it.

##### Fixed
- **The extension can no longer write its own wrapper lines into your standards.** 2.3.0 changed the block that sits above a library's code and taught itself to read the new form. What it could not teach was the older versions: a 2.2 window opened on the same mirrored files did not recognise the new form, mistook it for something you had typed, and saved the whole of it into the standard — every library at once, since every library file had changed in the same way. Cabinet Vision then reported a syntax error on each one.

  Saving is now checked before it happens rather than trusted: anything still carrying the extension's own lines is refused, the standard in the database is left exactly as it was, and the "Cabinet Vision UCS Sync" output channel says which file and why. A standard that already has those lines in it from an earlier version is now listed by name when you connect, so the remaining damage is easy to find. It is not repaired for you — which lines are yours is a judgement, not a rule.
- **A library whose name is not a valid JavaScript name no longer damages its own standard.** A library called `Cab Shape` produced a wrapper that could not be read back, with the same result as above. Such a name still needs changing in Cabinet Vision, and the output channel still says so, but it now saves correctly meanwhile.
- **A save that fails is no longer treated as one that worked.** If a save made while the lists were loading failed, the file was recorded as up to date anyway, so the next refresh saw nothing to do and the edit was quietly lost.

#### 2.3.1

Reported from a user's machine: in a folder that has not been trusted, the extension is not merely limited but absent — the activity bar icon is not there, and nothing on screen says why. VS Code disables an extension entirely in a restricted workspace unless it says otherwise, and this one never said otherwise. It does now.

##### Fixed
- **The extension no longer disappears in an untrusted folder.** Opening the mirror — or the folder Cabinet Vision launches to debug in — without trusting it first took the whole extension out, activity bar icon included. It now runs in untrusted workspaces: the standards list, UCS:M support and saving back to the database all work normally. While a folder is untrusted the database and mirror location settings are read from your user settings rather than the workspace's, so a folder from someone else cannot redirect the connection.
- One part still needs trust, because it belongs to VS Code rather than to this extension: TypeScript runs in a limited mode until the folder is trusted, so UCS:JS completion, hover, rename and find references stay unavailable there. The status bar item says so while that is the case and offers the way to grant trust; granting it connects without a reload. Trust applies to subfolders too, so trusting `Cabinet Vision UCS` once covers every database mirrored under it.

#### 2.3.0

Two things the UCS:JS completion list should have been showing and was not. The snippets have not appeared since 2.0.0, when they went out with the rest of the `javascript` language contributions and nothing put them back; they are now served by the language server, which knows which files are UCS code. And a library, at a call site, read as an anonymous `const` of a lowercased type — TypeScript has only the declaration to report, so the declaration now says what the thing is.

##### Added
- Three more UCS:JS snippets. `NewHardware` creates a hardware child and positions it, and `NewAttribute` and `NewNote` each write the three calls a parameter needs to show up as one — the value, the style and the prompt.

##### Changed
- **Libraries now describe themselves in hover and IntelliSense.** Hovering `_cabshape` used to read `const _cabshape: cabshape`, which is all TypeScript could tell from the declaration and nothing a reader did not already know. Library files now carry a generated documentation block above the wrapper line, so every hover and every completion says it is a Cabinet Vision UCS:JS library, names it, and explains that its body is a class body — in every standard that calls it, not just in the library itself. The type is named `<Name>Library`, which is the part visible without expanding a completion item, and it keeps the name's own capitalisation instead of being lowercased along with the global.

##### Fixed
- **The UCS:JS snippets are back** — new part, route, dado, hole, linebore, connection and the rest all complete again. 2.0.0 dropped them along with the rest of the `javascript` language contributions, because a snippet contribution applies to every JavaScript file in the window, not just UCS code. They now come from the language server instead, which is already scoped to mirrored UCS:JS and Cabinet Vision's debug folder, so they appear where UCS code is and nowhere else.

#### 2.2.1

Packaging only. No behaviour changes.

##### Changed
- **The extension is now bundled**, and the download is a twentieth of the size: 742 KB across 34 files, where 2.2.0 was 5.0 MB across 2404. Almost all of that was the dependency tree shipped alongside the code — the SQL Server driver pulls in an Azure Active Directory authentication stack of some 1400 files, none of which this extension can use, since it connects with the fixed Cabinet Vision account. Installing and starting up both have less to walk through.

#### 2.2.0

Cabinet Vision can launch VS Code on its own `Temp\UCSJS` folder and attach its script engine's debugger, so a standard can be run with breakpoints. The extension did nothing in that window, because the files Cabinet Vision puts there are plain `.js` rather than the `.ucs.js` of the mirror. It now recognises the window and gives those files the same language support the mirror gets, without ever writing to them.

##### Added
- **Support for Cabinet Vision's UCS debugging window.** The plain `.js` files Cabinet Vision extracts there get the full Cabinet Vision API — completion, hover, signature help and the constants — along with UCS:M completion and validation inside `Evaluate('…')` strings, the same as mirrored UCS:JS. Cabinet Vision keeps sole control of saving those files back to the database; the extension never writes to them and never syncs them.
- Those folders also get an `AGENTS.md` and `CLAUDE.md` explaining what the files are, so an AI agent asked to edit one knows that the `function fn<Name>() { … }` wrapper is Cabinet Vision's rather than part of the standard, that the folder is emptied when Cabinet Vision restarts, and where the durable copy of the same standard lives.
- `cvucsedit.DebugFolderSuffix` controls the folder ending that is recognised (default `Temp/UCSJS`). Clear it to turn the whole thing off.
- **Cabinet Vision UCS: Forget This Workspace** clears every answer a workspace has given — whether to connect here, where to mirror, and whether `AGENTS.md` may be written at its root — and offers a window reload. This is the way back after disconnecting somewhere you later want the extension again, since disconnecting is remembered and stops it starting there.

##### Changed
- **Cabinet Vision 2026 is now supported**, and the default SQL server instance is `localhost\CV26` rather than `localhost\CV24`. The instance name tracks the Cabinet Vision version, so set `cvucsedit.Server` if you are running an earlier one. If you were relying on the old default rather than setting it yourself, the first connection after upgrading will fail and prompt you for the server and database; what you enter there is kept.

##### Fixed
- The mirror is no longer placed inside Cabinet Vision's debug folder. Because Cabinet Vision empties that folder on restart, `manifest.json` went with it — and that file is the merge base, so the next sync had nothing to compare against, let the database win and silently discarded any edit made on disk but not yet saved. Debug windows now always mirror to the dedicated folder.

#### 2.1.0

2.0.0 assumed every VS Code window was a Cabinet Vision window: it connected to the database in all of them, mirrored a `cvucs/` folder into whatever project happened to be open, and added a block to that project's `AGENTS.md` and `CLAUDE.md`. This release makes all three of those something a workspace opts in to. Existing setups are unaffected — a workspace that already contains a mirror keeps using it, in place, and keeps starting automatically.

##### Changed
- **The extension no longer starts in a workspace that has not used it.** Opening an unrelated project does nothing at all: no connection, no folder, no files written. Connect with **Cabinet Vision UCS: Connect** from the command palette or the button in the UCS tree view, and that workspace is remembered.
- **UCS code is mirrored outside your projects by default.** New setups mirror to `<your home folder>/Cabinet Vision UCS/<Database>/`, opened as its own window with **Cabinet Vision UCS: Open UCS Workspace**. Set `cvucsedit.MirrorLocation` to `workspace` to keep mirroring into the folder you have open instead, and `cvucsedit.MirrorPath` to put the dedicated folder somewhere else.
- **You are asked before anything is written to your project's `AGENTS.md` or `CLAUDE.md`**, with *Add*, *Not now* and *Never in this workspace*, remembered for that workspace only. In the dedicated UCS folder the pointer is still written straight away, since that folder belongs to the extension.
- Cancelling the SQL server/database prompt now stops asking, instead of retrying with the same value and writing it into your global settings.

##### Added
- `cvucsedit.AutoStart` — connect automatically when a workspace that has used the extension before is opened. Turn it off to start manually every time.
- **Cabinet Vision UCS: Disconnect** — stops the language servers and the file watcher, so no further save reaches the database.
- **Cabinet Vision UCS: Remove UCS Files from This Workspace** — cleans up after an earlier version. Takes the pointer block back out of `AGENTS.md` and `CLAUDE.md` and optionally deletes the mirror folder, without needing to connect.
- A status bar item showing whether the extension is connected, and a welcome view in the UCS tree with a Connect button.

##### Fixed
- The published extension no longer contains a copy of the developer's own mirrored UCS code.

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
