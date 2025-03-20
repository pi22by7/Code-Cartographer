import * as vscode from 'vscode';
import * as path from 'path';
import { CodeCartographer } from './codeCartographer';
import { DocumentationTreeProvider } from './treeView';
import { DocumentationViewer } from './documentationViewer';
import { ConfigUiProvider } from './configUi';
import { getLogger, LogLevel } from './logger';

export function activate(context: vscode.ExtensionContext) {
	// Initialize logger
	const logger = getLogger();

	// Check if in debug mode
	const isDebugMode = process.env.VSCODE_DEBUG_MODE === 'true';
	if (isDebugMode) {
		logger.setLogLevel(LogLevel.DEBUG);
		logger.enableFileLogging();
	} else {
		logger.setLogLevel(LogLevel.INFO);
	}

	logger.info('Activating Code Cartographer extension');

	// Register tree view
	const treeDataProvider = new DocumentationTreeProvider();
	vscode.window.registerTreeDataProvider('codeCartographerExplorer', treeDataProvider);

	// Create documentation viewer
	const documentationViewer = new DocumentationViewer(context);

	// Store the tree provider instance in context for access from other parts
	context.subscriptions.push({ dispose: () => { } });

	// Register the configuration command
	let configCommand = vscode.commands.registerCommand(
		'code-cartographer.configure',
		async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

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
					{ placeHolder: 'Select workspace folder to configure' }
				);
				if (!selected) { return; }
				folderUri = selected.folderUri;
			}

			// Open configuration UI
			const configUi = new ConfigUiProvider(context, folderUri.fsPath);
			configUi.show();
		}
	);

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

			// Initialize enhanced cartographer
			const cartographer = new CodeCartographer(folderUri.fsPath);

			// Determine if cartographer.config.json exists
			const configFileOptions = [
				path.join(folderUri.fsPath, 'cartographer.config.json'),
				path.join(folderUri.fsPath, '.cartographer.json'),
				path.join(folderUri.fsPath, '.vscode', 'cartographer.json')
			];

			let configExists = false;
			for (const configPath of configFileOptions) {
				try {
					const fileExists = await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
					if (fileExists) {
						configExists = true;
						break;
					}
				} catch (error) {
					// File doesn't exist, continue checking
				}
			}

			// If no config exists, offer to create one
			if (!configExists) {
				const createConfig = await vscode.window.showInformationMessage(
					'No Code Cartographer configuration found. Would you like to create one?',
					'Create Config',
					'Continue Without Config'
				);

				if (createConfig === 'Create Config') {
					const configUi = new ConfigUiProvider(context, folderUri.fsPath);
					configUi.show();
					return;
				}
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
				progress.report({ message: 'Scanning files...' });

				try {
					// Generate documentation with enhanced features
					await cartographer.document({
						outputPath: outputUri.fsPath,
						outputFormat,
						documentationType: docType,
						onProgress: (message: string, percent: number) => {
							progress.report({ message, increment: percent });
						},
						debugMode: isDebugMode
					});

					// Refresh the tree view
					treeDataProvider.refresh(outputUri.fsPath);

					// Show success message
					vscode.window.showInformationMessage(
						`Documentation generated at ${path.basename(outputUri.fsPath)}`,
						'View Documentation',
						'Show Logs'
					).then(selection => {
						if (selection === 'View Documentation') {
							// Use the custom viewer instead of just opening the file
							documentationViewer.showDocumentation(outputUri.fsPath);
						} else if (selection === 'Show Logs') {
							logger.show();
						}
					});
				} catch (err) {
					logger.error(`Error generating documentation: ${err}`);
					vscode.window.showErrorMessage(
						`Error generating documentation: ${err}`,
						'Show Logs'
					).then(selection => {
						if (selection === 'Show Logs') {
							logger.show();
						}
					});
				}
			});
		}
	);

	// Register quick analysis command
	let analyzeCommand = vscode.commands.registerCommand(
		'code-cartographer.analyze',
		async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

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
					{ placeHolder: 'Select workspace folder to analyze' }
				);
				if (!selected) { return; }
				folderUri = selected.folderUri;
			}

			// Run quick analysis
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Analyzing project structure',
				cancellable: false
			}, async (progress) => {
				try {
					progress.report({ message: 'Scanning files...' });
					const stats = await CodeCartographer.quickAnalyze(folderUri.fsPath);

					// Show results
					const outputChannel = vscode.window.createOutputChannel('Code Cartographer Analysis');
					outputChannel.clear();
					outputChannel.appendLine('# Code Cartographer - Project Analysis');
					outputChannel.appendLine('');
					outputChannel.appendLine(`Project: ${folderUri.fsPath}`);
					outputChannel.appendLine(`Total Files: ${stats.total_files}`);
					outputChannel.appendLine('');

					outputChannel.appendLine('## File Types:');
					for (const [ext, count] of Object.entries(stats.file_types)) {
						outputChannel.appendLine(`${ext || 'No extension'}: ${count} files`);
					}

					outputChannel.appendLine('');
					outputChannel.appendLine('## Directories:');
					for (const [dir, count] of Object.entries(stats.directories)) {
						outputChannel.appendLine(`${dir}: ${count} files`);
					}

					outputChannel.show();

					vscode.window.showInformationMessage(
						'Project analysis complete',
						'Generate Full Documentation'
					).then(selection => {
						if (selection === 'Generate Full Documentation') {
							vscode.commands.executeCommand('code-cartographer.generate');
						}
					});
				} catch (err) {
					logger.error(`Error analyzing project: ${err}`);
					vscode.window.showErrorMessage(`Error analyzing project: ${err}`);
				}
			});
		}
	);

	// Register view command
	let viewCommand = vscode.commands.registerCommand(
		'code-cartographer.view',
		async (docPath) => {
			logger.debug('View command called with path:', docPath);

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
				logger.error('Error opening documentation viewer:', error);
				vscode.window.showErrorMessage(`Failed to open documentation: ${error}`);

				// Fallback to opening in editor if webview fails
				try {
					const uri = vscode.Uri.file(docPath);
					await vscode.commands.executeCommand('vscode.open', uri);
				} catch (fallbackError) {
					logger.error('Error in fallback file opening:', fallbackError);
				}
			}
		}
	);

	// Register show logs command
	let showLogsCommand = vscode.commands.registerCommand(
		'code-cartographer.showLogs',
		() => {
			logger.show();
		}
	);

	context.subscriptions.push(
		generateCommand,
		viewCommand,
		configCommand,
		analyzeCommand,
		showLogsCommand
	);

	// Register command to create config file
	let createConfigCommand = vscode.commands.registerCommand(
		'code-cartographer.createConfig',
		async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

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

			try {
				// Generate config file
				const configPath = await CodeCartographer.createInitialConfig(folderUri.fsPath);
				vscode.window.showInformationMessage(
					`Created configuration file at ${path.basename(configPath)}`,
					'Open File'
				).then(selection => {
					if (selection === 'Open File') {
						vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
					}
				});
			} catch (error) {
				logger.error('Error creating config file:', error);
				vscode.window.showErrorMessage(`Failed to create config file: ${error}`);
			}
		}
	);

	context.subscriptions.push(createConfigCommand);

	logger.info('Code Cartographer extension activated successfully');
}

export function deactivate() {
	getLogger().info('Code Cartographer extension deactivated');
}