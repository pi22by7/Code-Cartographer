import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger } from './logger';
import { CodeCartographer } from './codeCartographer';
import { parseGitignore } from './gitignoreParser';
import { ConfigProcessor } from './configProcessor';

/**
 * FileSelector provides a UI for manually selecting directories and files
 * to include in documentation, bypassing normal configuration settings.
 */
export class FileSelector {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private rootPath: string;
    private logger = getLogger();
    private cartographer: CodeCartographer;
    private selectedItems: string[] = [];
    private configProcessor: ConfigProcessor;
    private gitignoreMatcher: ((path: string) => boolean) | null = null;

    constructor(context: vscode.ExtensionContext, rootPath: string) {
        this.context = context;
        this.rootPath = rootPath;
        this.cartographer = new CodeCartographer(rootPath);
        this.configProcessor = new ConfigProcessor(rootPath);
        this.loadGitignore();
    }

    private loadGitignore(): void {
        const gitignorePath = path.join(this.rootPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            this.gitignoreMatcher = parseGitignore(gitignorePath);
        }
    }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'fileSelector',
                'Select Files to Document',
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
                        case 'generateDocumentation':
                            await this.generateDocumentation(
                                message.selectedItems,
                                message.outputPath,
                                message.honorGitignore,
                                message.honorConfigFile
                            );
                            return;
                        case 'getDirectoryTree':
                            await this.getDirectoryTree();
                            return;
                        case 'refresh':
                            await this.refreshDirectoryTree();
                            return;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            // Initialize webview content
            await this.updateWebviewContent();
        }
    }

    private async updateWebviewContent(): Promise<void> {
        if (!this.panel) {
            return;
        }

        // Check if config files exist for toggle state
        const gitignoreExists = fs.existsSync(path.join(this.rootPath, '.gitignore'));
        const configExists = fs.existsSync(path.join(this.rootPath, 'cartographer.config.json'));

        // Generate HTML content for the webview
        const html = this.getWebviewContent(gitignoreExists, configExists);
        this.panel.webview.html = html;

        // Send directory tree data after the webview is loaded
        await this.getDirectoryTree();
    }

    private async getDirectoryTree(): Promise<void> {
        try {
            const treeData = await this.buildDirectoryTree('', this.rootPath);

            this.panel?.webview.postMessage({
                command: 'setDirectoryTree',
                tree: treeData
            });
        } catch (error) {
            this.logger.error(`Error building directory tree: ${error}`);
            vscode.window.showErrorMessage(`Error loading directory structure: ${error}`);
        }
    }

    private async refreshDirectoryTree(): Promise<void> {
        await this.getDirectoryTree();
    }

    private shouldIncludeFile(filePath: string): boolean {
        // This is only used for display in the UI - the actual filtering will happen during generation
        // Skip standard directories that are almost never wanted
        const normalizedPath = filePath.replace(/\\/g, '/');
        const skipDirs = ['node_modules', '.git', '.vscode', '__pycache__'];

        for (const dir of skipDirs) {
            if (normalizedPath.includes(`/${dir}/`) || normalizedPath.endsWith(`/${dir}`)) {
                return false;
            }
        }

        return true;
    }

    private async buildDirectoryTree(relativePath: string, absolutePath: string): Promise<any> {
        try {
            const stats = await fs.promises.stat(absolutePath);
            const fileName = path.basename(absolutePath);

            // Skip some standard directories for UI performance
            if (!this.shouldIncludeFile(absolutePath) && relativePath !== '') {
                return null;
            }

            // Base node for this file/directory
            const node: any = {
                name: fileName,
                path: relativePath || fileName,
                isDirectory: stats.isDirectory()
            };

            if (stats.isFile()) {
                node.size = stats.size;
                return node;
            }

            // For directories, recursively process contents
            const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
            const children = [];

            for (const entry of entries) {
                // Skip hidden files/folders except .gitignore
                if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
                    continue;
                }

                const childRelativePath = relativePath
                    ? path.posix.join(relativePath, entry.name)
                    : entry.name;

                const childAbsolutePath = path.join(absolutePath, entry.name);

                try {
                    const childNode = await this.buildDirectoryTree(childRelativePath, childAbsolutePath);
                    if (childNode) {
                        children.push(childNode);
                    }
                } catch (error) {
                    this.logger.error(`Error processing ${childAbsolutePath}: ${error}`);
                    // Continue with other entries if one fails
                }
            }

            // Sort children: directories first, then files alphabetically
            children.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            node.children = children;
            return node;
        } catch (error) {
            this.logger.error(`Error building tree for ${absolutePath}: ${error}`);
            throw error;
        }
    }

    private async generateDocumentation(
        selectedItems: string[],
        outputPath: string,
        honorGitignore: boolean = false,
        honorConfigFile: boolean = false
    ): Promise<void> {
        if (!selectedItems || selectedItems.length === 0) {
            vscode.window.showWarningMessage('No files selected for documentation');
            return;
        }

        // Close the panel
        this.panel?.dispose();

        // Convert relative paths to absolute
        let absolutePaths = selectedItems.map(item => path.join(this.rootPath, item));

        // Apply filtering based on chosen options
        if (honorGitignore && this.gitignoreMatcher) {
            this.logger.info('Applying gitignore filtering');
            absolutePaths = absolutePaths.filter(filePath => !this.gitignoreMatcher!(filePath));
        }

        if (honorConfigFile) {
            this.logger.info('Applying cartographer.config.json filtering');
            absolutePaths = absolutePaths.filter(filePath => this.configProcessor.shouldIncludeFile(filePath));
        }

        // Check if we still have files after filtering
        if (absolutePaths.length === 0) {
            vscode.window.showWarningMessage('No files remain after applying gitignore and config filters');
            return;
        }

        // Ensure the output path is absolute if it's relative
        if (!path.isAbsolute(outputPath)) {
            outputPath = path.join(this.rootPath, outputPath);
        }

        // Create progress indicator
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating custom documentation',
            cancellable: true
        }, async (progress, token) => {
            progress.report({ message: 'Processing selected files...' });

            try {
                // Generate documentation with only selected files
                await this.cartographer.document({
                    outputPath,
                    includeItems: absolutePaths,
                    onProgress: (message: string, percent: number) => {
                        progress.report({ message, increment: percent });
                    },
                    debugMode: true
                });

                // Show success message
                vscode.window.showInformationMessage(
                    `Documentation generated at ${outputPath}`,
                    'View Documentation'
                ).then(selection => {
                    if (selection === 'View Documentation') {
                        vscode.commands.executeCommand('code-cartographer.view', outputPath);
                    }
                });
            } catch (err) {
                this.logger.error(`Error generating documentation: ${err}`);
                vscode.window.showErrorMessage(`Error generating documentation: ${err}`);
            }
        });
    }

    private getWebviewContent(gitignoreExists: boolean, configExists: boolean): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Select Files for Documentation</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    max-width: 1200px;
                    margin: 0 auto;
                }
                h1 {
                    margin-bottom: 20px;
                }
                .container {
                    display: flex;
                    gap: 20px;
                    height: calc(100vh - 200px);
                }
                .file-browser {
                    flex: 2;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: auto;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                }
                .selected-files {
                    flex: 1;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: auto;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                }
                .tree-container {
                    user-select: none;
                }
                .tree-node {
                    padding: 3px 0;
                    cursor: pointer;
                }
                .tree-node:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .tree-content {
                    display: flex;
                    align-items: center;
                    white-space: nowrap;
                }
                .tree-caret {
                    width: 16px;
                    text-align: center;
                    cursor: pointer;
                    margin-right: 3px;
                }
                .tree-icon {
                    margin-right: 5px;
                }
                .tree-label {
                    margin-right: 5px;
                }
                .tree-size {
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                }
                .tree-children {
                    margin-left: 16px;
                    display: none;
                }
                .tree-node.expanded > .tree-children {
                    display: block;
                }
                .checkbox {
                    margin-right: 5px;
                    width: 16px;
                    height: 16px;
                    border: 1px solid var(--vscode-checkbox-border);
                    background-color: var(--vscode-checkbox-background);
                    display: inline-block;
                    vertical-align: middle;
                    position: relative;
                    cursor: pointer;
                    border-radius: 3px;
                }
                .checkbox.checked::after {
                    content: "✓";
                    position: absolute;
                    color: var(--vscode-foreground);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 12px;
                }
                .checkbox.partial::after {
                    content: "◼";
                    position: absolute;
                    color: var(--vscode-foreground);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 8px;
                }
                .dir-icon::before {
                    content: "📁";
                }
                .file-icon::before {
                    content: "📄";
                }
                .selected-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px;
                    margin-bottom: 5px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 3px;
                }
                .remove-btn {
                    background: none;
                    border: none;
                    color: var(--vscode-errorForeground);
                    cursor: pointer;
                }
                .footer {
                    margin-top: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .footer-options {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .footer-settings {
                    flex: 1;
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }
                .footer-right {
                    text-align: right;
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
                input[type="text"] {
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    width: 300px;
                }
                .toolbar {
                    margin-bottom: 10px;
                    display: flex;
                    gap: 8px;
                }
                .loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }
                .spinner {
                    border: 4px solid rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    border-top: 4px solid var(--vscode-progressBar-background);
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                    margin-right: 10px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .search-box {
                    flex: 1;
                    position: relative;
                }
                .search-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding-right: 30px;
                }
                .search-icon {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    opacity: 0.7;
                }
                /* Expander buttons */
                .expander-buttons {
                    display: flex;
                    gap: 5px;
                    margin-left: auto;
                }
                /* Toggle switch */
                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 38px;
                    height: 20px;
                    vertical-align: middle;
                }
                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: var(--vscode-inputOption-activeBackground);
                    transition: .4s;
                    border-radius: 20px;
                    opacity: 0.3;
                }
                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 14px;
                    width: 14px;
                    left: 3px;
                    bottom: 3px;
                    background-color: var(--vscode-foreground);
                    transition: .4s;
                    border-radius: 50%;
                }
                input:checked + .toggle-slider {
                    background-color: var(--vscode-inputOption-activeBackground);
                    opacity: 1;
                }
                input:checked + .toggle-slider:before {
                    transform: translateX(18px);
                }
                .toggle-label {
                    margin-left: 8px;
                }
                /* Status indicator */
                .status-indicator {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-right: 6px;
                }
                .status-indicator.exists {
                    background-color: var(--vscode-testing-iconPassed);
                }
                .status-indicator.missing {
                    background-color: var(--vscode-errorForeground);
                }
                .toggle-container {
                    display: flex;
                    align-items: center;
                }
            </style>
        </head>
        <body>
            <h1>Select Files for Documentation</h1>
            <p>Select specific directories and files to include in your documentation. You can also choose whether to respect existing configuration files.</p>
            
            <div class="container">
                <div class="file-browser">
                    <div class="toolbar">
                        <button id="refreshBtn">Refresh</button>
                        
                        <div class="search-box">
                            <input type="text" id="searchInput" class="search-input" placeholder="Search files and folders...">
                            <span class="search-icon">🔍</span>
                        </div>
                        
                        <div class="expander-buttons">
                            <button id="expandAllBtn">Expand All</button>
                            <button id="collapseAllBtn">Collapse All</button>
                        </div>
                    </div>
                    
                    <div id="treeContainer" class="tree-container">
                        <div id="loadingIndicator" class="loading">
                            <div class="spinner"></div>
                            <div>Loading directory structure...</div>
                        </div>
                    </div>
                </div>
                
                <div class="selected-files">
                    <h3>Selected Items</h3>
                    <div id="selectedItems">
                        <div class="no-selection">No items selected yet. Use the checkboxes to select files and directories.</div>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <div class="footer-options">
                    <div class="footer-settings">
                        <label for="outputPath">Output Path:</label>
                        <input type="text" id="outputPath" value="./documentation.json" placeholder="Path for generated documentation">
                    </div>
                    
                    <div class="footer-settings">
                        <div class="toggle-container">
                            <span class="status-indicator ${gitignoreExists ? 'exists' : 'missing'}"></span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="honorGitignoreToggle" ${gitignoreExists ? '' : 'disabled'}>
                                <span class="toggle-slider"></span>
                            </label>
                            <span class="toggle-label">Honor .gitignore</span>
                            ${gitignoreExists ? '' : '<span style="color:var(--vscode-descriptionForeground);font-size:0.9em;margin-left:8px;">(.gitignore not found)</span>'}
                        </div>
                        
                        <div class="toggle-container">
                            <span class="status-indicator ${configExists ? 'exists' : 'missing'}"></span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="honorConfigToggle" ${configExists ? '' : 'disabled'}>
                                <span class="toggle-slider"></span>
                            </label>
                            <span class="toggle-label">Honor cartographer.config.json</span>
                            ${configExists ? '' : '<span style="color:var(--vscode-descriptionForeground);font-size:0.9em;margin-left:8px;">(config not found)</span>'}
                        </div>
                    </div>
                </div>
                
                <div class="footer-right">
                    <button id="generateBtn">Generate Documentation</button>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // State
                    const state = {
                        selectedItems: new Set(),
                        directoryTree: null,
                        expandedNodes: new Set(),
                        honorGitignore: ${gitignoreExists},
                        honorConfigFile: ${configExists}
                    };
                    
                    // Elements
                    const treeContainer = document.getElementById('treeContainer');
                    const loadingIndicator = document.getElementById('loadingIndicator');
                    const selectedItemsEl = document.getElementById('selectedItems');
                    const outputPathEl = document.getElementById('outputPath');
                    const generateBtn = document.getElementById('generateBtn');
                    const refreshBtn = document.getElementById('refreshBtn');
                    const searchInput = document.getElementById('searchInput');
                    const expandAllBtn = document.getElementById('expandAllBtn');
                    const collapseAllBtn = document.getElementById('collapseAllBtn');
                    const honorGitignoreToggle = document.getElementById('honorGitignoreToggle');
                    const honorConfigToggle = document.getElementById('honorConfigToggle');
                    
                    // Set initial toggle states
                    if (${gitignoreExists}) {
                        honorGitignoreToggle.checked = true;
                        state.honorGitignore = true;
                    }
                    
                    if (${configExists}) {
                        honorConfigToggle.checked = true;
                        state.honorConfigFile = true;
                    }
                    
                    // Initialize by requesting the directory tree
                    vscode.postMessage({ command: 'getDirectoryTree' });
                    
                    // Set up event listeners
                    refreshBtn.addEventListener('click', () => {
                        showLoading();
                        vscode.postMessage({ command: 'refresh' });
                    });
                    
                    expandAllBtn.addEventListener('click', expandAll);
                    collapseAllBtn.addEventListener('click', collapseAll);
                    
                    // Toggle listeners
                    honorGitignoreToggle.addEventListener('change', () => {
                        state.honorGitignore = honorGitignoreToggle.checked;
                    });
                    
                    honorConfigToggle.addEventListener('change', () => {
                        state.honorConfigFile = honorConfigToggle.checked;
                    });
                    
                    generateBtn.addEventListener('click', () => {
                        if (state.selectedItems.size === 0) {
                            alert('Please select at least one file or directory');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'generateDocumentation',
                            selectedItems: Array.from(state.selectedItems),
                            outputPath: outputPathEl.value || './documentation.json',
                            honorGitignore: state.honorGitignore,
                            honorConfigFile: state.honorConfigFile
                        });
                    });
                    
                    searchInput.addEventListener('input', () => {
                        filterTree(searchInput.value.toLowerCase());
                    });
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'setDirectoryTree':
                                state.directoryTree = message.tree;
                                renderTree();
                                hideLoading();
                                break;
                        }
                    });
                    
                    // Show loading indicator
                    function showLoading() {
                        loadingIndicator.style.display = 'flex';
                        treeContainer.innerHTML = '';
                        treeContainer.appendChild(loadingIndicator);
                    }
                    
                    // Hide loading indicator
                    function hideLoading() {
                        loadingIndicator.style.display = 'none';
                    }
                    
                    // Render the tree from state
                    function renderTree() {
                        treeContainer.innerHTML = '';
                        
                        if (!state.directoryTree) {
                            treeContainer.innerHTML = '<div class="no-files">No directory structure loaded.</div>';
                            return;
                        }
                        
                        const rootNode = createTreeNode(state.directoryTree);
                        treeContainer.appendChild(rootNode);
                        
                        // Expand root node by default
                        toggleNode(rootNode, true);
                    }
                    
                    // Create a tree node element
                    function createTreeNode(nodeData) {
                        const node = document.createElement('div');
                        node.className = 'tree-node';
                        node.dataset.path = nodeData.path;
                        
                        const nodeContent = document.createElement('div');
                        nodeContent.className = 'tree-content';
                        
                        // Checkbox for selection
                        const checkbox = document.createElement('span');
                        checkbox.className = 'checkbox';
                        checkbox.onclick = (e) => {
                            e.stopPropagation();
                            toggleSelection(node, nodeData.path);
                        };
                        nodeContent.appendChild(checkbox);
                        
                        // Expand/collapse caret for directories
                        const caret = document.createElement('span');
                        caret.className = 'tree-caret';
                        
                        if (nodeData.isDirectory && nodeData.children && nodeData.children.length > 0) {
                            caret.textContent = '▶';
                            caret.onclick = (e) => {
                                e.stopPropagation();
                                toggleNode(node);
                            };
                        } else {
                            caret.textContent = ' ';
                        }
                        nodeContent.appendChild(caret);
                        
                        // Icon for file/directory
                        const icon = document.createElement('span');
                        icon.className = nodeData.isDirectory ? 'tree-icon dir-icon' : 'tree-icon file-icon';
                        nodeContent.appendChild(icon);
                        
                        // Label for the node
                        const label = document.createElement('span');
                        label.className = 'tree-label';
                        label.textContent = nodeData.name;
                        label.onclick = () => toggleNode(node);
                        nodeContent.appendChild(label);
                        
                        // Size for files
                        if (!nodeData.isDirectory && nodeData.size !== undefined) {
                            const size = document.createElement('span');
                            size.className = 'tree-size';
                            size.textContent = formatBytes(nodeData.size);
                            nodeContent.appendChild(size);
                        }
                        
                        node.appendChild(nodeContent);
                        
                        // Add children container for directories
                        if (nodeData.isDirectory && nodeData.children) {
                            const childrenContainer = document.createElement('div');
                            childrenContainer.className = 'tree-children';
                            
                            nodeData.children.forEach(childData => {
                                const childNode = createTreeNode(childData);
                                childrenContainer.appendChild(childNode);
                            });
                            
                            node.appendChild(childrenContainer);
                        }
                        
                        // Initialize selection state if already in selected items
                        if (state.selectedItems.has(nodeData.path)) {
                            checkbox.classList.add('checked');
                        }
                        
                        return node;
                    }
                    
                    // Toggle a node expanded/collapsed
                    function toggleNode(node, forceExpand) {
                        const caret = node.querySelector('.tree-caret');
                        if (!caret || caret.textContent === ' ') return; // Not expandable
                        
                        const path = node.dataset.path;
                        const isExpanded = forceExpand !== undefined ? forceExpand : !node.classList.contains('expanded');
                        
                        if (isExpanded) {
                            node.classList.add('expanded');
                            caret.textContent = '▼';
                            state.expandedNodes.add(path);
                        } else {
                            node.classList.remove('expanded');
                            caret.textContent = '▶';
                            state.expandedNodes.delete(path);
                        }
                    }
                    
                    // Expand all nodes
                    function expandAll() {
                        const allNodes = document.querySelectorAll('.tree-node');
                        allNodes.forEach(node => toggleNode(node, true));
                    }
                    
                    // Collapse all nodes except root
                    function collapseAll() {
                        const allNodes = document.querySelectorAll('.tree-node');
                        // Skip first node (root)
                        for (let i = 1; i < allNodes.length; i++) {
                            toggleNode(allNodes[i], false);
                        }
                    }
                    
                    // Toggle selection of a file/directory
                    function toggleSelection(node, path) {
                        const checkbox = node.querySelector('.checkbox');
                        const isSelected = checkbox.classList.contains('checked');
                        
                        if (isSelected) {
                            // Deselect this node
                            checkbox.classList.remove('checked');
                            checkbox.classList.remove('partial');
                            state.selectedItems.delete(path);
                            
                            // Deselect all children
                            const children = node.querySelectorAll('.tree-node');
                            children.forEach(child => {
                                const childPath = child.dataset.path;
                                const childCheckbox = child.querySelector('.checkbox');
                                childCheckbox.classList.remove('checked');
                                childCheckbox.classList.remove('partial');
                                state.selectedItems.delete(childPath);
                            });
                            
                            // Update parent status
                            updateParentSelectionStatus(node.parentElement.closest('.tree-node'));
                        } else {
                            // Select this node
                            checkbox.classList.add('checked');
                            checkbox.classList.remove('partial');
                            state.selectedItems.add(path);
                            
                            // Select all children
                            const children = node.querySelectorAll('.tree-node');
                            children.forEach(child => {
                                const childPath = child.dataset.path;
                                const childCheckbox = child.querySelector('.checkbox');
                                childCheckbox.classList.add('checked');
                                childCheckbox.classList.remove('partial');
                                state.selectedItems.add(childPath);
                            });
                            
                            // Update parent status
                            updateParentSelectionStatus(node.parentElement.closest('.tree-node'));
                        }
                        
                        updateSelectedItemsPanel();
                    }
                    
                    // Update a parent node's selection status based on its children
                    function updateParentSelectionStatus(parentNode) {
                        if (!parentNode) return;
                        
                        const children = parentNode.querySelector('.tree-children').children;
                        if (children.length === 0) return;
                        
                        let allSelected = true;
                        let noneSelected = true;
                        
                        for (let i = 0; i < children.length; i++) {
                            const childCheckbox = children[i].querySelector('.checkbox');
                            if (childCheckbox.classList.contains('checked') || childCheckbox.classList.contains('partial')) {
                                noneSelected = false;
                            } else {
                                allSelected = false;
                            }
                            
                            if (!allSelected && !noneSelected) break;
                        }
                        
                        const parentCheckbox = parentNode.querySelector('.checkbox');
                        const parentPath = parentNode.dataset.path;
                        
                        if (allSelected) {
                            parentCheckbox.classList.add('checked');
                            parentCheckbox.classList.remove('partial');
                            state.selectedItems.add(parentPath);
                        } else if (noneSelected) {
                            parentCheckbox.classList.remove('checked');
                            parentCheckbox.classList.remove('partial');
                            state.selectedItems.delete(parentPath);
                        } else {
                            parentCheckbox.classList.remove('checked');
                            parentCheckbox.classList.add('partial');
                            state.selectedItems.delete(parentPath);
                        }
                        
                        // Continue up the tree
                        updateParentSelectionStatus(parentNode.parentElement.closest('.tree-node'));
                    }
                    
                    // Update the selected items panel
                    function updateSelectedItemsPanel() {
                        selectedItemsEl.innerHTML = '';
                        
                        if (state.selectedItems.size === 0) {
                            selectedItemsEl.innerHTML = '<div class="no-selection">No items selected yet. Use the checkboxes to select files and directories.</div>';
                            return;
                        }
                        
                        // Sort selected items for display
                        const sortedItems = Array.from(state.selectedItems).sort();
                        
                        sortedItems.forEach(item => {
                            const itemEl = document.createElement('div');
                            itemEl.className = 'selected-item';
                            
                            const itemName = document.createElement('div');
                            itemName.textContent = item;
                            
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'remove-btn';
                            removeBtn.textContent = '✕';
                            removeBtn.onclick = () => {
                                state.selectedItems.delete(item);
                                
                                // Also update the tree view checkbox
                                const treeNode = document.querySelector(\`.tree-node[data-path="\${item}"]\`);
                                if (treeNode) {
                                    const checkbox = treeNode.querySelector('.checkbox');
                                    checkbox.classList.remove('checked');
                                    
                                    // Update parent status
                                    updateParentSelectionStatus(treeNode.parentElement.closest('.tree-node'));
                                }
                                
                                updateSelectedItemsPanel();
                            };
                            
                            itemEl.appendChild(itemName);
                            itemEl.appendChild(removeBtn);
                            selectedItemsEl.appendChild(itemEl);
                        });
                    }
                    
                    // Filter the tree based on search text
                    function filterTree(searchText) {
                        if (!searchText) {
                            // Reset the tree
                            const allNodes = document.querySelectorAll('.tree-node');
                            allNodes.forEach(node => {
                                node.style.display = '';
                            });
                            return;
                        }
                        
                        const allNodes = document.querySelectorAll('.tree-node');
                        
                        // First hide all nodes
                        allNodes.forEach(node => {
                            node.style.display = 'none';
                        });
                        
                        // Then show matching nodes and their parents
                        allNodes.forEach(node => {
                            const nodeName = node.querySelector('.tree-label').textContent.toLowerCase();
                            const nodePath = node.dataset.path.toLowerCase();
                            
                            if (nodeName.includes(searchText) || nodePath.includes(searchText)) {
                                // Show this node
                                node.style.display = '';
                                
                                // Show all parent nodes
                                let parent = node.parentElement.closest('.tree-node');
                                while (parent) {
                                    parent.style.display = '';
                                    toggleNode(parent, true); // Expand parent
                                    parent = parent.parentElement.closest('.tree-node');
                                }
                            }
                        });
                    }
                    
                    // Format bytes to human-readable size
                    function formatBytes(bytes) {
                        if (bytes === 0) return '0 Bytes';
                        
                        const k = 1024;
                        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}