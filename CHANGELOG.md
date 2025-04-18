# Change Log

All notable changes to the "cvucsedit" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Improved handling of SQL database connection issues so that upto 3 tries are allowed.

### Fixed
- Hover not finding prefix word when using some comparision chars and data types.

### Added
- Added connection information to autocomplete and hover. Also made context aware when next to "_CONNID" parameter in both UCS:M and UCS:JS.
- Added snippets to UCS:JS for new part, new route, new dado, new hole, new linebore and new connection.

## [1.0.2] - 2025-04-17

### Fixed

- corrected missing "vscode-languageserver" in package.json dependencies which was preventing the exension to load. 

## [1.0.0] - 2025-04-16

- Initial release