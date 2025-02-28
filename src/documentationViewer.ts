import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DocumentationViewer {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async showDocumentation(documentationPath: string): Promise<void> {
        const docFileName = path.basename(documentationPath);
        const docFileExt = path.extname(documentationPath).toLowerCase();

        // Create or reveal panel
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'codeCartographerDocViewer',
                `Documentation: ${docFileName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                    ]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        // Update panel title
        this.panel.title = `Documentation: ${docFileName}`;

        try {
            const docContent = fs.readFileSync(documentationPath, 'utf8');
            const parsedContent = this.parseDocumentation(docContent, docFileExt);
            this.panel.webview.html = this.generateHtml(parsedContent, docFileExt);

            // Handle webview messages
            this.panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'openFile':
                            if (message.filePath) {
                                // Convert the relative path to absolute
                                const projectPath = parsedContent.project_info.path;
                                const fullPath = path.join(projectPath, message.filePath);
                                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fullPath));
                            }
                            return;
                    }
                },
                undefined,
                this.context.subscriptions
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load documentation: ${error}`);
            this.panel.dispose();
        }
    }

    private parseDocumentation(content: string, fileExtension: string): any {
        switch (fileExtension) {
            case '.json':
                return JSON.parse(content);
            case '.txt':
                // For text files, we'll create a simple structure
                return {
                    project_info: {
                        path: 'Unknown',
                        generated_on: 'Unknown',
                        documentation_type: 'text',
                        total_files: 0,
                        total_size: content.length
                    },
                    content: content
                };
            case '.csv':
                // For CSV, parse as rows and columns
                const lines = content.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const rows = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const row: any = {};
                    headers.forEach((header, i) => {
                        row[header] = values[i]?.trim() || '';
                    });
                    return row;
                });
                return {
                    project_info: {
                        path: 'Unknown',
                        generated_on: 'Unknown',
                        documentation_type: 'csv',
                        total_files: rows.length,
                        total_size: content.length
                    },
                    files: rows
                };
            default:
                return {
                    project_info: {
                        path: 'Unknown',
                        generated_on: 'Unknown'
                    },
                    content: content
                };
        }
    }

    private generateHtml(data: any, fileExtension: string): string {
        // Base HTML template
        let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Cartographer Documentation</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    line-height: 1.5;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                header {
                    margin-bottom: 30px;
                }
                h1, h2, h3 {
                    color: var(--vscode-editor-foreground);
                }
                .info-box {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    padding: 15px;
                    margin-bottom: 20px;
                }
                .info-item {
                    display: flex;
                    margin-bottom: 8px;
                }
                .info-label {
                    font-weight: bold;
                    width: 140px;
                }
                .structure-container {
                    margin: 20px 0;
                }
                .file-tree {
                    margin: 0;
                    padding: 0;
                    list-style-type: none;
                }
                .file-tree li {
                    position: relative;
                    padding-left: 20px;
                    margin: 5px 0;
                }
                .file-tree details {
                    margin-left: 20px;
                }
                .file-tree summary {
                    cursor: pointer;
                    padding: 5px 0;
                }
                .file-tree summary:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .file {
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    padding: 5px 0;
                }
                .file:hover {
                    text-decoration: underline;
                    background-color: var(--vscode-list-hoverBackground);
                }
                .directory::before {
                    content: "📁 ";
                }
                .file::before {
                    content: "📄 ";
                }
                .file-contents {
                    margin-top: 30px;
                }
                .file-card {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .file-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .file-path {
                    font-weight: bold;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .file-size {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .file-content {
                    white-space: pre-wrap;
                    overflow-x: auto;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    line-height: 1.5;
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    border-radius: 4px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                }
                th, td {
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-panel-border);
                    text-align: left;
                }
                th {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    font-weight: bold;
                }
                tr:nth-child(even) {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .search-container {
                    margin-bottom: 20px;
                }
                .search-input {
                    width: 100%;
                    padding: 8px;
                    font-size: 16px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>Code Cartographer Documentation</h1>
                </header>`;

        // Project Info Section
        html += `
                <section>
                    <h2>Project Information</h2>
                    <div class="info-box">`;

        if (data.project_info) {
            const info = data.project_info;
            html += `
                        <div class="info-item">
                            <div class="info-label">Project Path:</div>
                            <div>${info.path || 'Unknown'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Generated On:</div>
                            <div>${info.generated_on || 'Unknown'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Document Type:</div>
                            <div>${info.documentation_type || 'Unknown'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Total Files:</div>
                            <div>${info.total_files || 0}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Total Size:</div>
                            <div>${this.formatBytes(info.total_size || 0)}</div>
                        </div>`;
        }

        html += `
                    </div>
                </section>`;

        // Different content based on file type
        switch (fileExtension) {
            case '.json':
                html += this.generateJsonDocView(data);
                break;
            case '.txt':
                html += this.generateTxtDocView(data);
                break;
            case '.csv':
                html += this.generateCsvDocView(data);
                break;
            default:
                html += `<p>Unsupported file format: ${fileExtension}</p>`;
        }

        // Add script for interactivity
        html += `
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        
                        // Handle clicks on file links
                        document.addEventListener('click', (event) => {
                            const fileElement = event.target.closest('.file');
                            if (fileElement && fileElement.dataset.path) {
                                vscode.postMessage({
                                    command: 'openFile',
                                    filePath: fileElement.dataset.path
                                });
                            }
                        });
                        
                        // Search functionality
                        const searchInput = document.getElementById('search-input');
                        if (searchInput) {
                            searchInput.addEventListener('input', (e) => {
                                const searchTerm = e.target.value.toLowerCase();
                                const fileCards = document.querySelectorAll('.file-card');
                                
                                fileCards.forEach(card => {
                                    const filePath = card.querySelector('.file-path').textContent.toLowerCase();
                                    const fileContent = card.querySelector('.file-content').textContent.toLowerCase();
                                    
                                    if (filePath.includes(searchTerm) || fileContent.includes(searchTerm)) {
                                        card.style.display = '';
                                    } else {
                                        card.style.display = 'none';
                                    }
                                });
                            });
                        }
                    })();
                </script>
            </div>
        </body>
        </html>`;

        return html;
    }

    private generateJsonDocView(data: any): string {
        let html = '';

        // File Structure Section
        if (data.file_structure) {
            html += `
                <section>
                    <h2>File Structure</h2>
                    <div class="structure-container">
                        ${this.renderFileTree(data.file_structure)}
                    </div>
                </section>`;
        }

        // File Contents Section
        if (data.files && data.files.length > 0) {
            html += `
                <section class="file-contents">
                    <h2>File Contents</h2>
                    <div class="search-container">
                        <input type="text" id="search-input" class="search-input" placeholder="Search in files...">
                    </div>`;

            data.files.forEach((file: any) => {
                html += `
                    <div class="file-card">
                        <div class="file-header">
                            <div class="file-path">${file.path}</div>
                            <div class="file-size">${this.formatBytes(file.size)}</div>
                        </div>
                        <div class="file-content">${this.escapeHtml(file.content)}</div>
                    </div>`;
            });

            html += `
                </section>`;
        }

        return html;
    }

    private generateTxtDocView(data: any): string {
        return `
            <section>
                <h2>Content</h2>
                <div class="file-card">
                    <div class="file-content">${this.escapeHtml(data.content)}</div>
                </div>
            </section>`;
    }

    private generateCsvDocView(data: any): string {
        let html = `
            <section>
                <h2>CSV Data</h2>`;

        if (data.files && data.files.length > 0) {
            const firstRow = data.files[0];
            const headers = Object.keys(firstRow);

            html += `
                <div class="search-container">
                    <input type="text" id="search-input" class="search-input" placeholder="Search in data...">
                </div>
                <table>
                    <thead>
                        <tr>`;

            headers.forEach((header: string) => {
                html += `<th>${header}</th>`;
            });

            html += `
                        </tr>
                    </thead>
                    <tbody>`;

            data.files.forEach((row: any) => {
                html += `<tr class="file-card">`;
                headers.forEach((header: string) => {
                    html += `<td>${this.escapeHtml(row[header])}</td>`;
                });
                html += `</tr>`;
            });

            html += `
                    </tbody>
                </table>`;
        } else {
            html += `<p>No data found in CSV file.</p>`;
        }

        html += `
            </section>`;

        return html;
    }

    private renderFileTree(node: any): string {
        if (!node) { return ''; }

        if (node.type === 'file') {
            const filePath = node.path || node.name;
            return `<li><div class="file" data-path="${filePath}">${node.name}</div></li>`;
        } else if (node.type === 'directory') {
            let html = `<li>
                    <details open>
                        <summary class="directory">${node.name}</summary>
                        <ul class="file-tree">`;

            if (node.children && node.children.length > 0) {
                node.children.forEach((child: any) => {
                    html += this.renderFileTree(child);
                });
            }

            html += `
                        </ul>
                    </details>
                </li>`;

            return html;
        }

        return '';
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) { return '0 Bytes'; }

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}