# Code Cartographer

Code Cartographer is a powerful VS Code extension that automatically generates comprehensive documentation of your codebase, optimized for providing context to Large Language Models (LLMs).

## Features

- **Project Documentation**: Generate detailed file structure and content documentation
- **Flexible Configuration**: Use a dedicated configuration file to control what gets documented
- **Intelligent Filtering**: Skip binary files, generated code, and large files automatically
- **Multiple Output Formats**: Choose between JSON, TXT, and CSV outputs
- **Interactive Views**: Preview generated documentation in a rich interactive view
- **Quick Project Analysis**: Get a quick overview of your project's structure and file distribution
- **Enhanced Debugging**: Comprehensive logging to help diagnose issues
- **Manual Selection Mode**: Selectively choose files and directories to document with a hierarchical UI

## Why Use Code Cartographer with LLMs

Code Cartographer was designed with LLM workflows in mind:

- **Optimized Context**: Generate documentation that fits within LLM context windows
- **Better Comprehension**: Help LLMs understand your codebase structure and relationships
- **Efficient Interaction**: Get more accurate code suggestions by providing complete project context
- **Focused Documentation**: Include only the files and code that matter using flexible configuration

## Getting Started

### Installation

Install from the VS Code Marketplace or:

1. Press `Ctrl+P` (or `Cmd+P` on Mac)
2. Type `ext install pi22by7.code-cartographer`

### Quick Start

1. Right-click on a project folder in the explorer
2. Select "Generate Documentation"
3. Choose your output location
4. View the generated documentation

### Using Manual Selection Mode

For precise control over what gets documented:

1. Press `Ctrl+Shift+Alt+G` (or `Cmd+Shift+Alt+G` on Mac)
2. Use the hierarchical tree view to select specific files and folders
3. Toggle whether to honor .gitignore and cartographer.config.json settings
4. Click "Generate Documentation"

### Using a Configuration File

For more control over what gets documented, create a configuration file:

1. Right-click on a project folder in the explorer
2. Select "Create Config File" to generate a `cartographer.config.json` file
3. Customize the patterns for included and excluded files
4. Run "Generate Documentation" to use your custom configuration

## Configuration

### Configuration File

The recommended way to configure Code Cartographer is with a `cartographer.config.json` file in your project root. This gives you precise control over what gets documented:

```json
{
  "version": "1.0",
  "include": [
    "src/**/*",
    "*.json",
    "*.md"
  ],
  "exclude": [
    "**/*.min.js",
    "**/*.test.ts",
    "node_modules/**",
    ".git/**",
    "dist/**"
  ],
  "maxFileSize": 500000,
  "skipBinaryFiles": true,
  "skipGeneratedFiles": true,
  "customFiles": {
    "large-important-files": {
      "include": ["src/some-important-file.ts"],
      "maxSize": 2000000
    }
  },
  "documentation": {
    "type": "both",
    "format": "json",
    "outputPath": "./documentation.json"
  }
}
```

You can also configure the extension through the VS Code settings UI:

1. Go to the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
2. Type "Code Cartographer: Configure Settings" 
3. Use the form interface to adjust your configuration

### Configuration Options

| Option | Description |
|--------|-------------|
| `include` | Glob patterns for files to include |
| `exclude` | Glob patterns for files to exclude |
| `maxFileSize` | Maximum file size in bytes to include |
| `skipBinaryFiles` | Automatically skip binary files |
| `skipGeneratedFiles` | Skip files that appear to be machine-generated |
| `customFiles` | Special rules for specific files (overrides default settings) |
| `documentation.type` | Type of documentation to generate (`structure`, `documentation`, or `both`) |
| `documentation.format` | Output format (`json`, `txt`, or `csv`) |
| `documentation.outputPath` | Path where to save documentation |

## Keyboard Shortcuts

- `Ctrl+Alt+G` (or `Cmd+Alt+G` on Mac): Generate documentation using configuration files
- `Ctrl+Shift+Alt+G` (or `Cmd+Shift+Alt+G` on Mac): Open manual file selection interface

## Commands

Code Cartographer provides several commands available from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac):

- **Generate Documentation**: Creates comprehensive documentation for your project
- **Manual File Selection**: Opens a hierarchical UI for selecting specific files to document
- **View Documentation**: Opens an existing documentation file in the viewer
- **Configure Settings**: Opens the configuration UI
- **Create Config File**: Generates a default configuration file in your project root
- **Quick Analyze Project**: Provides a fast overview of your project structure
- **Show Logs**: Opens the extension logs for troubleshooting

## Troubleshooting

If you encounter issues with Code Cartographer, here are some steps to try:

1. **Enable Debug Mode**: Set `codeCartographer.debugMode` to `true` in your VS Code settings
2. **Check the Logs**: Run the "Show Logs" command to view detailed diagnostic information
3. **Verify Configuration**: Make sure your `cartographer.config.json` file or VS Code settings have the correct format and values
4. **Review Exclusions**: If files are missing, check that they aren't being excluded by your configuration

Common problems and solutions:

- **No files documented**: Check your include/exclude patterns and make sure they match your project structure
- **Large files skipped**: Increase the `maxFileSize` value or use `customFiles` to allow specific large files
- **Crashes on large projects**: Try documenting smaller parts of your project first, then increase scope
- **Output file not found**: If using relative paths, make sure they're relative to your project root

## Release Notes

See the [CHANGELOG.md](CHANGELOG.md) file for detailed release notes.