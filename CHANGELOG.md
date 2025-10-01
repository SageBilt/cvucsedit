# Change Log

All notable changes to the "cvucsedit" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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