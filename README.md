# Code Cartographer

Code Cartographer is a powerful VS Code extension that automatically generates comprehensive documentation of your codebase, optimized for providing context to Large Language Models (LLMs).

## Features

- Generates structured documentation ideal for LLM context windows
- Creates file hierarchies and code content analysis
- Respects .gitignore patterns and skips binary files
- Multiple output formats (JSON, TXT, CSV)
- Intelligent handling of different file types
- Documentation explorer view
- Rich documentation viewer with search capabilities

## Why Use Code Cartographer with LLMs

Code Cartographer was designed with LLM workflows in mind:

- **Optimized Context**: Generate documentation that fits within LLM context windows
- **Better Comprehension**: Help LLMs understand your codebase structure and relationships
- **Efficient Interaction**: Get more accurate code suggestions by providing complete project context
- **Focused Documentation**: Include only the files and code that matter, excluding binaries and generated files

## Usage

1. Open a workspace in VS Code
2. Right-click on a folder in the explorer and select "Generate Documentation"
3. Choose your output format and location
4. View the generated documentation in the built-in viewer
5. Use the documentation file with your favorite LLM to provide project context

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

Initial release of Code Cartographer with direct documentation