# Cabinet Vision USC editor
----------

This extension adds features to VS Code for loading, editing and saving Cabinet Vision User Created Standards (UCS).

## Features


### key benefits over existing UCS editor
- Edit multiple UCS's at the same time.
- Search UCS list and contents.
- Edit UCS's while testing logic in the object.
- Nicer looking syntax highlighting.
- Cabinet Vision documented UCS parameters, functions, keywords etc, integrated into the editor via intellisense and hover.
- Intellisense that actually works and is context aware.
- Hover over element (variables, functions, keywords etc) to see information about element.
- Database specific items like user added material, schedule & construction parameters integrated into into intellisense & hover.
- Snippets (pre-built code).
- Syntax error checking.
- Find user defined variable references
- Find user defined variable definitions


### Main Features

- **UCS & JavaScript library tree views**
  - UCS opens when clicked in tree view.
  - Search, clear search and reload list buttons for each list.

- **Syntax highlighting**
  - Different elements like keywords, constraints, data types etc are styled accordingly.
  - Syntax highlighting follows VSCode theming and can be customized by the user.
  - 

- **Language server**
    The extension uses a language server (LSP) to handle autocomplete, hover and references for declared variables for both **UCS:M** and **UCS:JS**. Using an LSP inproves user experance as it runs under a seperate process and doesn't create any delay for the user typing.



## Requirements

#### Supported UCS macro types
- **UCS:M** Legacy UCS syntax
- **UCS:JS** Javascript from version 2024.1+


#### Supported Versions

Currently supports all Cabinet Versions from 2021 through to 2024. 
> **Note:** Version 12 may work but it has not been tested.

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

### 1.0.0

Initial release

---

**Enjoy!**
