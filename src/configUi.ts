import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigProcessor } from './configProcessor';
import { getLogger } from './logger';

export class ConfigUiProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private rootPath: string;
    private configProcessor: ConfigProcessor;
    private logger = getLogger();

    constructor(context: vscode.ExtensionContext, rootPath: string) {
        this.context = context;
        this.rootPath = rootPath;
        this.configProcessor = new ConfigProcessor(rootPath);
    }

    public show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'cartographerConfig',
                'Code Cartographer Configuration',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                    ]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'saveConfig':
                            await this.saveConfig(message.config);
                            return;
                        case 'generateConfig':
                            await this.generateDefaultConfig();
                            return;
                        case 'showFileExplorer':
                            await this.showFileExplorer(message.purpose);
                            return;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            this.updateWebviewContent();
        }
    }

    private async saveConfig(config: any): Promise<void> {
        try {
            const configPath = path.join(this.rootPath, 'cartographer.config.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

            vscode.window.showInformationMessage('Configuration saved successfully');
            this.logger.info(`Configuration saved to ${configPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save configuration: ${error}`);
            this.logger.error('Failed to save configuration:', error);
        }
    }

    private async generateDefaultConfig(): Promise<void> {
        try {
            const configPath = path.join(this.rootPath, 'cartographer.config.json');
            this.configProcessor.saveConfig(configPath);

            vscode.window.showInformationMessage('Default configuration generated successfully');
            this.logger.info(`Default configuration generated at ${configPath}`);

            // Reload the webview with the new config
            this.updateWebviewContent();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate default configuration: ${error}`);
            this.logger.error('Failed to generate default configuration:', error);
        }
    }

    private async showFileExplorer(purpose: string): Promise<void> {
        try {
            // Show file dialog according to purpose
            let files: string[] = [];

            if (purpose === 'include') {
                // Multi-select for including files
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    defaultUri: vscode.Uri.file(this.rootPath),
                    openLabel: 'Select Files to Include'
                });

                if (uris && uris.length > 0) {
                    files = uris.map(uri => path.relative(this.rootPath, uri.fsPath));
                }
            } else if (purpose === 'exclude') {
                // Multi-select for excluding files
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    defaultUri: vscode.Uri.file(this.rootPath),
                    openLabel: 'Select Files to Exclude'
                });

                if (uris && uris.length > 0) {
                    files = uris.map(uri => path.relative(this.rootPath, uri.fsPath));
                }
            } else if (purpose === 'output') {
                // Single-select for output file
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(this.rootPath, 'documentation.json')),
                    saveLabel: 'Set Output File'
                });

                if (uri) {
                    files = [path.relative(this.rootPath, uri.fsPath)];
                }
            }

            // Send selected files back to webview
            if (files.length > 0) {
                this.panel?.webview.postMessage({
                    command: 'filesSelected',
                    purpose,
                    files
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show file explorer: ${error}`);
            this.logger.error('Failed to show file explorer:', error);
        }
    }

    private updateWebviewContent(): void {
        if (!this.panel) {
            return;
        }

        // Load configuration
        let config = this.configProcessor.getConfig();

        // Generate HTML content for the webview
        const html = this.getWebviewContent(config);
        this.panel.webview.html = html;
    }

    private getWebviewContent(config: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Cartographer Configuration</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    max-width: 800px;
                    margin: 0 auto;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input[type="text"], select, textarea {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                textarea {
                    height: 100px;
                    font-family: monospace;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    margin-right: 5px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .actions {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 20px;
                }
                .config-section {
                    margin-bottom: 30px;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .section-title {
                    margin-top: 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 8px;
                }
                .help-text {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
                .path-input-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .path-input-group input {
                    flex-grow: 1;
                }
                .tag-group {
                    margin-top: 10px;
                }
                .tag {
                    display: inline-block;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin-right: 5px;
                    margin-bottom: 5px;
                }
                .tag button {
                    background: none;
                    border: none;
                    color: var(--vscode-badge-foreground);
                    cursor: pointer;
                    margin-left: 4px;
                    padding: 0 4px;
                }
            </style>
        </head>
        <body>
            <h1>Code Cartographer Configuration</h1>
            <p>Configure how the Code Cartographer extension documents your codebase.</p>
            
            <div class="config-section">
                <h2 class="section-title">Basic Settings</h2>
                
                <div class="form-group">
                    <label for="documentationType">Documentation Type:</label>
                    <select id="documentationType">
                        <option value="both" ${config.documentation.type === 'both' ? 'selected' : ''}>Both (Structure & Content)</option>
                        <option value="structure" ${config.documentation.type === 'structure' ? 'selected' : ''}>Structure Only</option>
                        <option value="documentation" ${config.documentation.type === 'documentation' ? 'selected' : ''}>Content Only</option>
                    </select>
                    <div class="help-text">Choose what kind of documentation to generate</div>
                </div>
                
                <div class="form-group">
                    <label for="outputFormat">Output Format:</label>
                    <select id="outputFormat">
                        <option value="json" ${config.documentation.format === 'json' ? 'selected' : ''}>JSON</option>
                        <option value="txt" ${config.documentation.format === 'txt' ? 'selected' : ''}>TXT</option>
                        <option value="csv" ${config.documentation.format === 'csv' ? 'selected' : ''}>CSV</option>
                    </select>
                    <div class="help-text">Choose format for the generated documentation</div>
                </div>
                
                <div class="form-group">
                    <label for="outputPath">Output Path:</label>
                    <div class="path-input-group">
                        <input type="text" id="outputPath" value="${config.documentation.outputPath || './documentation.json'}">
                        <button id="browseOutputPath">Browse</button>
                    </div>
                    <div class="help-text">Path where documentation will be saved (relative to workspace root)</div>
                </div>
            </div>
            
            <div class="config-section">
                <h2 class="section-title">File Filters</h2>
                
                <div class="form-group">
                    <label for="includePatterns">Include Patterns:</label>
                    <textarea id="includePatterns">${config.include.join('\n')}</textarea>
                    <div class="help-text">Glob patterns for files to include (one per line)</div>
                    <div class="tag-group" id="includeTagGroup">
                        ${config.include.map((pattern: any) => `
                            <span class="tag">${pattern}
                                <button class="remove-tag" data-pattern="${pattern}" data-type="include">×</button>
                            </span>
                        `).join('')}
                    </div>
                    <button id="addIncludeFiles" style="margin-top: 10px;">Add Files</button>
                </div>
                
                <div class="form-group">
                    <label for="excludePatterns">Exclude Patterns:</label>
                    <textarea id="excludePatterns">${config.exclude.join('\n')}</textarea>
                    <div class="help-text">Glob patterns for files to exclude (one per line)</div>
                    <div class="tag-group" id="excludeTagGroup">
                        ${config.exclude.map((pattern: any) => `
                            <span class="tag">${pattern}
                                <button class="remove-tag" data-pattern="${pattern}" data-type="exclude">×</button>
                            </span>
                        `).join('')}
                    </div>
                    <button id="addExcludeFiles" style="margin-top: 10px;">Add Files</button>
                </div>
            </div>
            
            <div class="config-section">
                <h2 class="section-title">Advanced Settings</h2>
                
                <div class="form-group">
                    <label for="maxFileSize">Max File Size (bytes):</label>
                    <input type="number" id="maxFileSize" value="${config.maxFileSize || 500000}">
                    <div class="help-text">Maximum size of files to include in documentation</div>
                </div>
                
                <div class="form-group">
                    <div>
                        <input type="checkbox" id="skipBinaryFiles" ${config.skipBinaryFiles ? 'checked' : ''}>
                        <label for="skipBinaryFiles" style="display: inline;">Skip Binary Files</label>
                    </div>
                    <div class="help-text">Automatically detect and skip binary files</div>
                </div>
                
                <div class="form-group">
                    <div>
                        <input type="checkbox" id="skipGeneratedFiles" ${config.skipGeneratedFiles ? 'checked' : ''}>
                        <label for="skipGeneratedFiles" style="display: inline;">Skip Generated Files</label>
                    </div>
                    <div class="help-text">Skip files that appear to be machine-generated</div>
                </div>
            </div>
            
            <div class="config-section">
                <h2 class="section-title">Custom File Overrides</h2>
                <p>Define specific rules for certain files that override the general settings.</p>
                
                <div id="customFilesContainer">
                    ${Object.entries(config.customFiles || {}).map(([key, value]) => `
                        <div class="custom-file-entry" data-key="${key}">
                            <h3>${key}</h3>
                            <div class="form-group">
                                <label>Include Patterns:</label>
                                <textarea class="custom-include">${(value as { include: string[] }).include.join('\n')}</textarea>
                            </div>
                            <div class="form-group">
                                <label>Max Size (bytes):</label>
                                <input type="number" class="custom-max-size" value="${(value as { maxSize?: number }).maxSize || config.maxFileSize}">
                            </div>
                            <button class="remove-custom-entry">Remove</button>
                        </div>
                    `).join('')}
                </div>
                
                <button id="addCustomEntry" style="margin-top: 10px;">Add Custom Override</button>
            </div>
            
            <div class="actions">
                <div>
                    <button id="saveConfig">Save Configuration</button>
                    <button id="generateConfig">Generate Default Config</button>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // State management
                    let config = ${JSON.stringify(config)};
                    
                    // Save configuration
                    document.getElementById('saveConfig').addEventListener('click', () => {
                        // Update config object from form values
                        config.documentation.type = document.getElementById('documentationType').value;
                        config.documentation.format = document.getElementById('outputFormat').value;
                        config.documentation.outputPath = document.getElementById('outputPath').value;
                        
                        config.include = document.getElementById('includePatterns').value
                            .split('\\n')
                            .map(line => line.trim())
                            .filter(line => line);
                            
                        config.exclude = document.getElementById('excludePatterns').value
                            .split('\\n')
                            .map(line => line.trim())
                            .filter(line => line);
                            
                        config.maxFileSize = parseInt(document.getElementById('maxFileSize').value);
                        config.skipBinaryFiles = document.getElementById('skipBinaryFiles').checked;
                        config.skipGeneratedFiles = document.getElementById('skipGeneratedFiles').checked;
                        
                        // Handle custom file entries
                        config.customFiles = {};
                        document.querySelectorAll('.custom-file-entry').forEach(entry => {
                            const key = entry.dataset.key;
                            const include = entry.querySelector('.custom-include').value
                                .split('\\n')
                                .map(line => line.trim())
                                .filter(line => line);
                            const maxSize = parseInt(entry.querySelector('.custom-max-size').value);
                            
                            config.customFiles[key] = {
                                include,
                                maxSize
                            };
                        });
                        
                        vscode.postMessage({
                            command: 'saveConfig',
                            config
                        });
                    });
                    
                    // Generate default config
                    document.getElementById('generateConfig').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'generateConfig'
                        });
                    });
                    
                    // Browse for output path
                    document.getElementById('browseOutputPath').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'showFileExplorer',
                            purpose: 'output'
                        });
                    });
                    
                    // Add include files
                    document.getElementById('addIncludeFiles').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'showFileExplorer',
                            purpose: 'include'
                        });
                    });
                    
                    // Add exclude files
                    document.getElementById('addExcludeFiles').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'showFileExplorer',
                            purpose: 'exclude'
                        });
                    });
                    
                    // Add custom entry
                    document.getElementById('addCustomEntry').addEventListener('click', () => {
                        const key = prompt('Enter a name for this custom override:');
                        if (!key) return;
                        
                        const container = document.getElementById('customFilesContainer');
                        const entryHtml = \`
                            <div class="custom-file-entry" data-key="\${key}">
                                <h3>\${key}</h3>
                                <div class="form-group">
                                    <label>Include Patterns:</label>
                                    <textarea class="custom-include"></textarea>
                                </div>
                                <div class="form-group">
                                    <label>Max Size (bytes):</label>
                                    <input type="number" class="custom-max-size" value="\${config.maxFileSize}">
                                </div>
                                <button class="remove-custom-entry">Remove</button>
                            </div>
                        \`;
                        
                        container.insertAdjacentHTML('beforeend', entryHtml);
                        attachRemoveEntryHandlers();
                    });
                    
                    // Remove tags
                    document.querySelectorAll('.remove-tag').forEach(button => {
                        button.addEventListener('click', (e) => {
                            const pattern = e.target.dataset.pattern;
                            const type = e.target.dataset.type;
                            
                            if (type === 'include') {
                                const patterns = document.getElementById('includePatterns').value
                                    .split('\\n')
                                    .filter(p => p.trim() !== pattern);
                                document.getElementById('includePatterns').value = patterns.join('\\n');
                                e.target.parentElement.remove();
                            } else if (type === 'exclude') {
                                const patterns = document.getElementById('excludePatterns').value
                                    .split('\\n')
                                    .filter(p => p.trim() !== pattern);
                                document.getElementById('excludePatterns').value = patterns.join('\\n');
                                e.target.parentElement.remove();
                            }
                        });
                    });
                    
                    // Attach handlers for remove custom entry buttons
                    function attachRemoveEntryHandlers() {
                        document.querySelectorAll('.remove-custom-entry').forEach(button => {
                            button.addEventListener('click', (e) => {
                                e.target.closest('.custom-file-entry').remove();
                            });
                        });
                    }
                    attachRemoveEntryHandlers();
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        if (message.command === 'filesSelected') {
                            if (message.purpose === 'include') {
                                const currentPatterns = document.getElementById('includePatterns').value;
                                const newPatterns = message.files.join('\\n');
                                document.getElementById('includePatterns').value = currentPatterns ? 
                                    currentPatterns + '\\n' + newPatterns : newPatterns;
                                
                                // Update tags
                                const tagGroup = document.getElementById('includeTagGroup');
                                message.files.forEach(file => {
                                    const tagHtml = \`
                                        <span class="tag">\${file}
                                            <button class="remove-tag" data-pattern="\${file}" data-type="include">×</button>
                                        </span>
                                    \`;
                                    tagGroup.insertAdjacentHTML('beforeend', tagHtml);
                                });
                                
                                // Attach handlers to new tags
                                tagGroup.querySelectorAll('.remove-tag').forEach(button => {
                                    button.addEventListener('click', (e) => {
                                        const pattern = e.target.dataset.pattern;
                                        const patterns = document.getElementById('includePatterns').value
                                            .split('\\n')
                                            .filter(p => p.trim() !== pattern);
                                        document.getElementById('includePatterns').value = patterns.join('\\n');
                                        e.target.parentElement.remove();
                                    });
                                });
                            } else if (message.purpose === 'exclude') {
                                const currentPatterns = document.getElementById('excludePatterns').value;
                                const newPatterns = message.files.join('\\n');
                                document.getElementById('excludePatterns').value = currentPatterns ? 
                                    currentPatterns + '\\n' + newPatterns : newPatterns;
                                
                                // Update tags
                                const tagGroup = document.getElementById('excludeTagGroup');
                                message.files.forEach(file => {
                                    const tagHtml = \`
                                        <span class="tag">\${file}
                                            <button class="remove-tag" data-pattern="\${file}" data-type="exclude">×</button>
                                        </span>
                                    \`;
                                    tagGroup.insertAdjacentHTML('beforeend', tagHtml);
                                });
                                
                                // Attach handlers to new tags
                                tagGroup.querySelectorAll('.remove-tag').forEach(button => {
                                    button.addEventListener('click', (e) => {
                                        const pattern = e.target.dataset.pattern;
                                        const patterns = document.getElementById('excludePatterns').value
                                            .split('\\n')
                                            .filter(p => p.trim() !== pattern);
                                        document.getElementById('excludePatterns').value = patterns.join('\\n');
                                        e.target.parentElement.remove();
                                    });
                                });
                            } else if (message.purpose === 'output') {
                                document.getElementById('outputPath').value = message.files[0];
                            }
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }
}