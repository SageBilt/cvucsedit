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

#### Supported UCS macro types
- **UCS:M** Legacy UCS syntax
- **UCS:JS** Javascript from version 2024.1+

#### Supported Versions

Currently supports all Cabinet Versions from 2021 through to 2024. 
> **Note:** Version 12 may work but it has not been tested.

### Main Features

Addition to VSCode's built in features, this extension provides these features.

- **UCS & JavaScript library tree views**
  - UCS opens when clicked in tree view.
  - Search, clear search and reload list buttons for each list.
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
    The extension uses a language server (LSP) to handle autocomplete, hover and references for declared variables for both **UCS:M** and **UCS:JS**. Using an LSP improves user experience as it runs under a separate process and reduces delay for the user typing.

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

In additional to the standard language features for JavaScript provided by VSCode, the below UCSJS features exist.

- **Snippet completion**
  - Snippets for
    - new part
    - new route
    - new dado
    - new hole
    - new linebore
    - new connection
- **Code completions**
  - All documented constants, types, functions for UCSJS have been added to the code completion for JavaScript along with the CVAsmManaged objects with their associated properties and methods.
  - Context aware code completion exists based on the parameter type of specific CVAsmManaged object methods. For example when the cursor is placed inside a string for the method Evaluate(), which evaluates an equation written in UCSM, the completion list will populate USCM parameters. 
  - Context aware code completion also exists for CVAsmManaged object so that only the completion list is filtered to provide CVAsmManaged methods and properties. This applies to both the inbuilt CVAsmManaged object like "_this" & "_cab" and also symbols which are assigned to these CVAsmManaged objects.
  - Additionally context aware code completion also exists for Cabinet Vision JavaScript libraries so that any public properties or methods will be provided for these objects.
- **Hover information**
  - Same as UCSM above but specific to the Cabinet Vision documented JavaScript constants, types, functions and CVAsmManaged objects with their associated properties and methods.
- **Find References**
  - References are provided for JavaScript library objects (and their associated properties and methods) and CVAsmManaged object symbols.
- **Jump to definition**
  - Definitions are provided for JavaScript library objects (and their associated properties and methods) and CVAsmManaged object symbols.
- **Error checking (Diagnostics)**
  - Error checking for UCSM context aware code is provided (see error checking under UCS:M language features above for more details).

## Requirements

#### Forcing Cabinet Vision to apply UCS updates edited outside of Cabinet Vision
Because UCS's are edited outside of Cabinet Vision, the user will need to force a reload for the changes to take effect.
This can be done by simply opening the UCS editor window and making any change. This could be just disabling and then re-enabling any UCS.
Alternatively the job can be closed and re-opened.

## dependencies
- vscode-languageclient
- vscode-languageserver
- vscode-languageserver-protocol
- mssql
- npm install @babel/parser
- npm install @babel/traverse

## Extension Settings

#### Available Setttings

* `cvucsedit.Server`: The Cabinet Vision database SQL server instance name (defaults to **localhost\CV24**).
* `cvucsedit.Database`: The name of the Cabinet Vision SQL database (defaults to **CVData**).

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

### 1.0.6

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
