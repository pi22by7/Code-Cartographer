# Code Cartographer

Code Cartographer is a powerful VS Code extension for automatically generating comprehensive documentation of your codebase.

## Features

- Generates structured documentation of your entire codebase
- Creates file hierarchies and code content analysis
- Respects .gitignore patterns and skips binary files
- Multiple output formats (JSON, TXT, CSV)
- Intelligent handling of different file types
- Documentation explorer view

## Usage

1. Open a workspace in VS Code
2. Right-click on a folder in the explorer and select "Generate Documentation"
3. Choose your output format and location
4. View the generated documentation in the editor

## Configuration

You can customize Code Cartographer in the VS Code settings:

- `codeCartographer.outputFormat`: Choose between JSON, TXT, or CSV output
- `codeCartographer.documentationType`: Generate structure only, documentation only, or both
- `codeCartographer.ignorePatterns`: Specify additional patterns to ignore

## Requirements

No additional requirements or dependencies needed!

## Extension Settings

This extension contributes the following settings:

* `codeCartographer.outputFormat`: Output format for documentation
* `codeCartographer.documentationType`: Type of documentation to generate
* `codeCartographer.ignorePatterns`: Additional patterns to ignore beyond .gitignore

## Known Issues

Please report issues on the GitHub repository.

## Release Notes

### 0.1.0

Initial release of Code Cartographer