# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2023-06-01
This release requires at least glualint 1.17.0 to be installed
### Fixed
- Fixed indentation being broken on newer glualint versions
- Fixed pretty printing not working on newer glualint versions

## [0.9.0] - 2023-05-29
### Fixed
- Fixed warning thrown when changing documents

## [0.8.0] - 2022-10-22
### Fixed
- No longer attempt to set cwd on virtual filesystems (fixes #10)

## [0.7.0] - 2021-09-24
### Fixed
- Properly set working folder for subdirectories (fixes #8)

## [0.6.0] - 2021-02-08
### Fixed
- Fixed pretty print truncating files when `prettyprint_rejectInvalidCode` is enabled (#6)
- Support for multiple workspaces

## [0.5.0] - 2020-04-12
### Fixed
- Fixed linting being cleared when opening 0 problem files (#3)

## [0.4.1] - 2018-08-05
### Added
- Use vscode indentation settings for pretty printing
- Manual lint command

## [0.4.0] - 2018-08-04
### Added
- Added pretty printing support (#2)

## [0.3.0] - 2017-11-29
### Fixed
- Fix extension not being activated for regular lua files (#1)

## [0.2.0] - 2017-11-07
### Added
- Added configuration options

## [0.1.3] - 2017-11-07
### Added
- Added installation instructions

## [0.1.2] - 2017-11-06
### Fixed
- Fixed repository link in package

## [0.1.1] - 2017-11-06
### Fixed
- Corrected args passed to glualint

## [0.1.0] - 2017-11-06
- Cleaned up code

## [0.0.1] - 2017-11-06
- Initial Version

[Unreleased]: https://github.com/Goz3rr/vscode-glualint/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Goz3rr/vscode-glualint/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Goz3rr/vscode-glualint/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Goz3rr/vscode-glualint/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Goz3rr/vscode-glualint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Goz3rr/vscode-glualint/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/Goz3rr/vscode-glualint/commit/3553fd574848aef7dbcfd1fa1b9215cdab4563da