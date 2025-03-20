# Change Log

All notable changes to the "Code Cartographer" extension will be documented in this file.

## [0.3.0] - 2025-03-20

### Added
- Configuration file support with `cartographer.config.json`
- Interactive configuration UI for easier setup
- Custom file overrides for special cases
- Quick project analysis feature
- Enhanced documentation viewer with search capabilities
- Comprehensive logging system for better debugging
- Command to create a default configuration file

### Improved
- More intelligent file filtering with glob pattern support
- Better encoding detection for various file types
- Enhanced performance with parallel file processing
- More detailed statistics in generated documentation
- Fixed issues with .gitignore parsing
- Better handling of large projects
- Improved binary file detection

## [0.2.1] - 2025-03-01

### Fixed
- Fixed issue where the extension would generate empty documentation with no files
- Improved directory traversal to better handle large projects
- Enhanced file structure display with proper path tracking
- Made .gitignore parsing more robust (won't fail if file is missing)
- Added better error handling during file processing
- Improved performance by skipping ignored directories early
- Added detailed logging for troubleshooting

### Added
- Better sorting of file structure (directories first, then files alphabetically)
- More user-friendly progress reporting during documentation generation
- View documentation in a rich, interactive webview with search functionality

## [0.1.0] - 2025-02-28

### Added
- Initial release
- Generate documentation for your codebase in JSON, TXT or CSV format
- Support for file structure and content documentation
- Integration with .gitignore to exclude unwanted files
- Opens the generated document upon clicking 'View Documentation'