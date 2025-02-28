import * as vscode from 'vscode';
import * as path from 'path';
import { CodeCartographer } from './codeCartographer';
import { DocumentationTreeProvider } from './treeView';
import { DocumentationViewer } from './documentationViewer';

export function activate(context: vscode.ExtensionContext) {
	// Register tree view
	const treeDataProvider = new DocumentationTreeProvider();
	vscode.window.registerTreeDataProvider('codeCartographerExplorer', treeDataProvider);

	// Create documentation viewer
	const documentationViewer = new DocumentationViewer(context);

	// Store the tree provider instance in context for access from other parts
	context.subscriptions.push({ dispose: () => { } });

	// Register the main command
	let generateCommand = vscode.commands.registerCommand(
		'code-cartographer.generate',
		async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			// Get configuration options
			const config = vscode.workspace.getConfiguration('codeCartographer');
			const outputFormat = config.get('outputFormat', 'json');
			const docType = config.get('documentationType', 'both');

			// Select workspace folder if multiple
			let folderUri: vscode.Uri;
			if (workspaceFolders.length === 1) {
				folderUri = workspaceFolders[0].uri;
			} else {
				const selected = await vscode.window.showQuickPick(
					workspaceFolders.map(folder => ({
						label: folder.name,
						description: folder.uri.fsPath,
						folderUri: folder.uri
					})),
					{ placeHolder: 'Select workspace folder to document' }
				);
				if (!selected) { return; }
				folderUri = selected.folderUri;
			}

			// Select output location
			const defaultFileName = `documentation.${outputFormat}`;
			const defaultUri = vscode.Uri.file(path.join(folderUri.fsPath, defaultFileName));
			const outputUri = await vscode.window.showSaveDialog({
				defaultUri,
				filters: {
					'JSON': ['json'],
					'Text': ['txt'],
					'CSV': ['csv'],
					'All Files': ['*']
				},
				title: 'Save Documentation'
			});

			if (!outputUri) { return; }

			// Create progress indicator
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Generating documentation',
				cancellable: true
			}, async (progress, token) => {
				const cartographer = new CodeCartographer(folderUri.fsPath);

				progress.report({ message: 'Scanning files...' });

				try {
					// Generate documentation
					await cartographer.document({
						outputPath: outputUri.fsPath,
						outputFormat,
						documentationType: docType,
						onProgress: (message: string, percent: number) => {
							progress.report({ message, increment: percent });
						}
					});

					// Refresh the tree view
					treeDataProvider.refresh(outputUri.fsPath);

					// Show success message
					vscode.window.showInformationMessage(
						`Documentation generated at ${path.basename(outputUri.fsPath)}`,
						'View Documentation'
					).then(selection => {
						if (selection === 'View Documentation') {
							// Use the custom viewer instead of just opening the file
							documentationViewer.showDocumentation(outputUri.fsPath);
						}
					});
				} catch (err) {
					vscode.window.showErrorMessage(`Error generating documentation: ${err}`);
				}
			});
		}
	);

	// Register view command
	let viewCommand = vscode.commands.registerCommand(
		'code-cartographer.view',
		async (docPath) => {
			console.log('View command called with path:', docPath);

			// When called from command palette without args
			if (!docPath) {
				// Try to find all documentation files and let user pick one
				// Get the instance that was already created during activation
				const treeProvider = DocumentationTreeProvider.getInstance();
				const docFiles = await treeProvider.getAllDocumentationFiles();

				if (docFiles.length === 0) {
					vscode.window.showInformationMessage('No documentation files found. Generate documentation first.');
					return;
				}

				const selected = await vscode.window.showQuickPick(
					docFiles.map(file => ({
						label: path.basename(file),
						description: path.dirname(file),
						filePath: file
					})),
					{ placeHolder: 'Select documentation file to open' }
				);

				if (!selected) { return; }
				docPath = selected.filePath;
			} else if (typeof docPath !== 'string') {
				// Try to handle the case where we receive a DocumentationItem object instead
				if (docPath && typeof docPath === 'object' && docPath.filePath) {
					docPath = docPath.filePath;
				} else {
					vscode.window.showErrorMessage('Failed to open documentation: Invalid path');
					return;
				}
			}

			try {
				// Open in webview instead of raw editor
				await documentationViewer.showDocumentation(docPath);
			} catch (error) {
				console.error('Error opening documentation viewer:', error);
				vscode.window.showErrorMessage(`Failed to open documentation: ${error}`);

				// Fallback to opening in editor if webview fails
				try {
					const uri = vscode.Uri.file(docPath);
					await vscode.commands.executeCommand('vscode.open', uri);
				} catch (fallbackError) {
					console.error('Error in fallback file opening:', fallbackError);
				}
			}
		}
	);

	context.subscriptions.push(generateCommand, viewCommand);
}

export function deactivate() { }