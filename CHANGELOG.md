# Change Log

All notable changes to the "Code Cartographer" extension will be documented in this file.

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