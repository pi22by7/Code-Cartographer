import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class DocumentationTreeProvider implements vscode.TreeDataProvider<DocumentationItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DocumentationItem | undefined | null | void> = new vscode.EventEmitter<DocumentationItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DocumentationItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private documentationFiles: string[] = [];
    private static instance: DocumentationTreeProvider;

    constructor() {
        // Use singleton pattern to access the instance from commands
        DocumentationTreeProvider.instance = this;
    }

    static getInstance(): DocumentationTreeProvider {
        return DocumentationTreeProvider.instance;
    }

    refresh(docPath?: string): void {
        if (docPath && !this.documentationFiles.includes(docPath)) {
            this.documentationFiles.push(docPath);
        }
        this._onDidChangeTreeData.fire();
    }

    // Method to get all documentation files
    async getAllDocumentationFiles(): Promise<string[]> {
        // First check our stored files
        let files = this.documentationFiles.filter(file => fs.existsSync(file));

        // If no files found, try to find documentation files in current workspace
        if (files.length === 0) {
            files = await this.findDocumentationFilesInWorkspace();
            // Add them to our list
            for (const file of files) {
                if (!this.documentationFiles.includes(file)) {
                    this.documentationFiles.push(file);
                }
            }
        }

        return files;
    }

    // Helper method to find documentation files in workspace
    private async findDocumentationFilesInWorkspace(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const files: string[] = [];

        // Search for files with common documentation names
        const filePatterns = [
            '**/documentation.json',
            '**/documentation.txt',
            '**/documentation.csv',
            '**/docs/*.json',
            '**/docs/*.txt',
            '**/docs/*.csv'
        ];

        // Search for each pattern in the workspace
        for (const pattern of filePatterns) {
            const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
            for (const file of foundFiles) {
                files.push(file.fsPath);
            }
        }

        return files;
    }

    getTreeItem(element: DocumentationItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DocumentationItem): Thenable<DocumentationItem[]> {
        if (!element) {
            // Root: Show all doc files
            return Promise.resolve(
                this.documentationFiles
                    .filter(file => fs.existsSync(file)) // Make sure file exists
                    .map(file => {
                        const basename = path.basename(file);
                        return new DocumentationItem(
                            basename,
                            file,
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'code-cartographer.view',
                                title: 'View Documentation',
                                arguments: [file] // Pass the file path as a string
                            }
                        );
                    })
            );
        }

        // No children for doc files
        return Promise.resolve([]);
    }
}

export class DocumentationItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        const ext = path.extname(filePath).toLowerCase();

        this.tooltip = filePath;
        this.description = path.dirname(filePath);
        this.contextValue = 'documentationItem';

        // Set icon based on file type
        if (ext === '.json') {
            this.iconPath = new vscode.ThemeIcon('json');
        } else if (ext === '.txt') {
            this.iconPath = new vscode.ThemeIcon('file-text');
        } else if (ext === '.csv') {
            this.iconPath = new vscode.ThemeIcon('list-tree');
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }
    }
}