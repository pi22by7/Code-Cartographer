# Change Log

All notable changes to the "Code Cartographer" extension will be documented in this file.

## [0.4.1] - 2025-04-01

### Fixed
- Fixed issue where cartographer.config.json settings were being ignored when VS Code settings were present
- Ensured file-based configuration takes precedence over workspace settings
- Resolved conflict between output formats specified in config file vs VS Code settings

### Added
- CI/CD pipeline for automated releases to GitHub
- Better error handling for configuration file parsing

## [0.4.0] - 2025-04-01

### Added
- **Manual File Selection Mode**: New hierarchical tree view interface for selecting specific files
  - Accessed via `Ctrl+Shift+Alt+G` (or `Cmd+Shift+Alt+G` on Mac)
  - Allows direct selection of individual files and folders
  - Shows file sizes for better context
- **Configuration Toggle Options**:
  - Options to honor or ignore .gitignore and cartographer.config.json settings
  - Visual indicators showing when configuration files are available
  - Default behavior automatically adjusts based on available configurations
- **Enhanced Path Handling**:
  - Improved handling of relative vs. absolute paths for output files
  - Better cross-platform path normalization
- **Search Functionality**:
  - Live file/folder search in the tree view
  - Auto-expands parent folders of search matches
- **UI Improvements**:
  - Expand/collapse all buttons for easier navigation
  - Better file/folder selection indicators (full/partial states)
  - Selected items panel for easy review

### Fixed
- Resolved issue where output files weren't properly generated with relative paths
- Fixed performance issues when browsing large directory structures
- Improved handling of file selection propagation to parent/child nodes
- Fixed CSS selector syntax in file selection interface
- Better handling of directory filtering for UI performance

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