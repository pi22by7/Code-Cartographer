import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ConfigProcessor } from './configProcessor';
import { FileProcessor, FileProcessingOptions } from './fileProcessor';
import { getLogger, LogLevel } from './logger';

const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const existsAsync = promisify(fs.exists);
const mkdirAsync = promisify(fs.mkdir);

export interface DocumentationStats {
    totalFiles: number;
    totalDocumentedFiles: number;
    totalSize: number;
    documentedSize: number;
    largestFile: { path: string; size: number };
    averageFileSize: number;
    fileTypes: Record<string, number>;
    startTime: Date;
    endTime?: Date;
    duration?: number;
}

export interface DocumentOptions {
    outputPath: string;
    outputFormat?: string;
    documentationType?: string;
    includeItems?: string[];
    onProgress?: (message: string, percent: number) => void;
    debugMode?: boolean;
}

export class CodeCartographer {
    private rootDir: string;
    private configProcessor: ConfigProcessor;
    private fileProcessor: FileProcessor;
    private logger = getLogger();
    private stats: DocumentationStats;
    private processedFiles: Set<string> = new Set();
    private progressCallback?: (message: string, percent: number) => void;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.configProcessor = new ConfigProcessor(rootDir);
        this.fileProcessor = new FileProcessor();

        // Initialize stats
        this.stats = {
            totalFiles: 0,
            totalDocumentedFiles: 0,
            totalSize: 0,
            documentedSize: 0,
            largestFile: { path: '', size: 0 },
            averageFileSize: 0,
            fileTypes: {},
            startTime: new Date()
        };

        this.logger.info(`EnhancedCodeCartographer initialized for: ${rootDir}`);
    }

    /**
     * Set the debug mode
     */
    public setDebugMode(enabled: boolean): void {
        if (enabled) {
            this.logger.setLogLevel(LogLevel.DEBUG);
            this.logger.enableFileLogging();
            this.logger.debug('Debug mode enabled');
        } else {
            this.logger.setLogLevel(LogLevel.INFO);
        }
    }

    /**
     * Generate config file in the project root
     */
    public async generateConfigFile(): Promise<string> {
        const configPath = path.join(this.rootDir, 'cartographer.config.json');
        this.configProcessor.saveConfig(configPath);
        this.logger.info(`Generated config file at: ${configPath}`);
        return configPath;
    }

    /**
     * Process a single file
     */
    private async processFile(filePath: string): Promise<any | null> {
        try {
            if (this.processedFiles.has(filePath)) {
                return null;
            }

            this.processedFiles.add(filePath);

            // Skip if file should be excluded based on config
            if (!this.configProcessor.shouldIncludeFile(filePath)) {
                this.logger.debug(`Skipping excluded file: ${filePath}`);
                return null;
            }

            // Get max file size for this path (could be custom)
            const maxFileSize = this.configProcessor.getMaxFileSizeForPath(filePath);

            // Process the file
            const processingOptions: FileProcessingOptions = {
                maxSize: maxFileSize,
                skipBinary: this.configProcessor.shouldSkipBinaryFiles(),
                skipGenerated: this.configProcessor.shouldSkipGeneratedFiles(),
                onProgress: (filePath, fileSize) => {
                    // Update statistics
                    this.stats.totalFiles++;
                    this.stats.totalSize += fileSize;

                    // Update largest file if applicable
                    if (fileSize > this.stats.largestFile.size) {
                        this.stats.largestFile = { path: filePath, size: fileSize };
                    }

                    // Update file type statistics
                    const ext = path.extname(filePath).toLowerCase();
                    this.stats.fileTypes[ext] = (this.stats.fileTypes[ext] || 0) + 1;
                }
            };

            const result = await this.fileProcessor.processFile(filePath, processingOptions);

            if (result) {
                this.stats.totalDocumentedFiles++;
                this.stats.documentedSize += result.size;

                return {
                    path: path.relative(this.rootDir, filePath),
                    content: result.content,
                    size: result.size
                };
            }

            return null;
        } catch (err) {
            this.logger.error(`Error processing ${filePath}:`, err);
            return null;
        }
    }

    /**
     * Build file structure tree
     */
    private async getFileStructure(includeItems: string[] = []): Promise<any> {
        const structure = {
            name: path.basename(this.rootDir),
            type: 'directory',
            path: this.rootDir,
            children: []
        };

        let filesToProcess: string[] = [];
        if (includeItems.length === 0) {
            // Get all files in the directory recursively
            filesToProcess = await this.getAllFiles(this.rootDir);
            this.logger.info(`Found ${filesToProcess.length} total files to process`);
        } else {
            filesToProcess = includeItems;
            this.logger.info(`Using ${filesToProcess.length} provided files to process`);
        }

        // Filter using the config processor
        const filteredFiles = filesToProcess.filter(file =>
            this.configProcessor.shouldIncludeFile(file)
        );
        this.logger.info(`After filtering, ${filteredFiles.length} files remain`);

        // Add all files to the structure
        for (const fullPath of filteredFiles) {
            const relativePath = path.relative(this.rootDir, fullPath);
            this.addPathToStructure(structure, fullPath, relativePath);
        }

        return structure;
    }

    /**
     * Helper method to add a path to the file structure tree
     */
    private addPathToStructure(
        structure: any,
        fullPath: string,
        relativePath: string
    ): void {
        const parts = relativePath.split(path.sep);
        let current = structure;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) { continue; } // Skip empty parts

            const isLast = i === parts.length - 1;
            const isFile = isLast && fs.statSync(fullPath).isFile();
            const currentRelativePath = parts.slice(0, i + 1).join(path.sep);
            const currentFullPath = path.join(this.rootDir, currentRelativePath);

            // Find existing node or create new one
            let node = current.children.find((child: any) => child.name === part);

            if (!node) {
                node = {
                    name: part,
                    type: isFile ? 'file' : 'directory',
                    path: currentFullPath
                };

                if (!isFile) {
                    node.children = [];
                } else {
                    try {
                        const stats = fs.statSync(fullPath);
                        node.size = stats.size;

                        // Add extra metadata for files
                        const ext = path.extname(fullPath).toLowerCase();
                        node.extension = ext;

                        // Detect file type
                        const fileTypeMap: Record<string, string> = {
                            '.js': 'JavaScript',
                            '.ts': 'TypeScript',
                            '.jsx': 'React JSX',
                            '.tsx': 'React TSX',
                            '.html': 'HTML',
                            '.css': 'CSS',
                            '.json': 'JSON',
                            '.md': 'Markdown'
                        };

                        node.fileType = fileTypeMap[ext] || 'Unknown';
                    } catch (error) {
                        this.logger.error(`Error getting stats for ${fullPath}:`, error);
                        node.size = 0;
                    }
                }

                current.children.push(node);
            }

            if (!isFile) {
                current = node;
            }
        }
    }

    /**
     * Get all files recursively from a directory
     */
    private async getAllFiles(dir: string): Promise<string[]> {
        try {
            const entries = await readdirAsync(dir, { withFileTypes: true });

            // Process entries in parallel for performance
            const entriesPromises = entries.map(async entry => {
                const fullPath = path.join(dir, entry.name);

                // Early skip for directories we know we want to exclude
                if (entry.isDirectory()) {
                    // Quick check for common directories to skip
                    const relativePath = path.relative(this.rootDir, fullPath);
                    if (!this.configProcessor.shouldIncludeFile(fullPath)) {
                        this.logger.debug(`Skipping excluded directory: ${relativePath}`);
                        return [];
                    }

                    return this.getAllFiles(fullPath);
                } else if (entry.isFile()) {
                    return [fullPath];
                }

                return [];
            });

            const results = await Promise.all(entriesPromises);
            return results.flat();
        } catch (error) {
            this.logger.error(`Error reading directory ${dir}:`, error);
            return [];
        }
    }

    /**
     * Main method to generate documentation
     */
    private async writeTxtOutput(outputPath: string, data: any): Promise<void> {
        let output = `Project Documentation\n`;
        output += `${'='.repeat(80)}\n`;
        output += `Project Path: ${data.project_info.path}\n`;
        output += `Generated on: ${data.project_info.generated_on}\n`;
        output += `Documentation Type: ${data.project_info.documentation_type}\n`;
        output += `Total Files: ${data.project_info.total_files}\n`;
        output += `Documented Files: ${data.project_info.documented_files}\n`;
        output += `Total Size: ${this.formatBytes(data.project_info.total_size)}\n`;
        output += `Generation Time: ${(data.project_info.generation_time_ms / 1000).toFixed(2)} seconds\n`;
        output += `${'='.repeat(80)}\n\n`;

        if (data.file_structure) {
            output += `\nFile Structure:\n`;
            output += `${'='.repeat(80)}\n`;
            output += this.formatStructureAsTxt(data.file_structure);
            output += `\n${'-'.repeat(80)}\n`;
        }

        if (data.files && data.files.length > 0) {
            output += `\nFile Contents:\n`;
            output += `${'='.repeat(80)}\n`;

            for (const file of data.files) {
                output += `\n## File: ${file.path}\n`;
                output += `Size: ${this.formatBytes(file.size)}\n`;
                output += `${'='.repeat(80)}\n\n`;
                output += file.content;
                output += `\n\n`;
            }
        }

        // Add statistics
        if (data.stats) {
            output += `\nStatistics:\n`;
            output += `${'='.repeat(80)}\n`;
            output += `Largest File: ${data.stats.largest_file.path} (${this.formatBytes(data.stats.largest_file.size)})\n`;
            output += `Average File Size: ${this.formatBytes(data.stats.average_file_size)}\n\n`;

            output += `File Types:\n`;
            for (const [ext, count] of Object.entries(data.stats.file_types)) {
                output += `${ext}: ${count}\n`;
            }
        }

        await writeFileAsync(outputPath, output, 'utf8');
    }

    private formatStructureAsTxt(structure: any, prefix = ''): string {
        let output = `${prefix}${structure.name}\n`;

        if (structure.children) {
            // Sort directories first, then files alphabetically
            const sortedChildren = [...structure.children].sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            for (let i = 0; i < sortedChildren.length; i++) {
                const isLast = i === sortedChildren.length - 1;
                const childPrefix = prefix + (isLast ? '└── ' : '├── ');
                const grandchildPrefix = prefix + (isLast ? '    ' : '│   ');

                output += this.formatStructureAsTxt(sortedChildren[i], childPrefix);
            }
        }

        return output;
    }

    private async writeCsvOutput(outputPath: string, data: any): Promise<void> {
        let output = '';

        // Add project info as metadata
        output += 'metadata_key,metadata_value\n';
        output += `project_path,${data.project_info.path}\n`;
        output += `generated_on,${data.project_info.generated_on}\n`;
        output += `documentation_type,${data.project_info.documentation_type}\n`;
        output += `total_files,${data.project_info.total_files}\n`;
        output += `documented_files,${data.project_info.documented_files}\n`;
        output += `total_size,${data.project_info.total_size}\n`;
        output += `generation_time_ms,${data.project_info.generation_time_ms}\n\n`;

        // Add structure if available
        if (data.file_structure) {
            output += 'type,name,path,size,extension\n';
            output += this.formatStructureAsCsv(data.file_structure);
        }

        // Add CSV statistics
        if (data.stats) {
            output += '\nfile_type,count\n';
            for (const [ext, count] of Object.entries(data.stats.file_types)) {
                output += `${ext || 'no_extension'},${count}\n`;
            }
        }

        await writeFileAsync(outputPath, output, 'utf8');
    }

    private formatStructureAsCsv(structure: any, parentPath = ''): string {
        const currentPath = parentPath ?
            `${parentPath}/${structure.name}` :
            structure.name;

        let output = `${structure.type},${this.escapeCSV(structure.name)},${this.escapeCSV(currentPath)},${structure.size || ''},${structure.extension || ''}\n`;

        if (structure.children) {
            for (const child of structure.children) {
                output += this.formatStructureAsCsv(child, currentPath);
            }
        }

        return output;
    }

    private escapeCSV(value: string): string {
        if (!value) return '';
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private reportProgress(message: string, percent: number): void {
        if (this.progressCallback) {
            this.progressCallback(message, percent);
        }
    }

    /**
     * Create initial config file for a project
     */
    public static async createInitialConfig(rootDir: string): Promise<string> {
        const cartographer = new CodeCartographer(rootDir);
        return cartographer.generateConfigFile();
    }

    /**
     * Static method to run a quick analysis of a workspace
     */
    public static async quickAnalyze(rootDir: string): Promise<any> {
        const cartographer = new CodeCartographer(rootDir);

        // Find all files
        const allFiles = await cartographer.getAllFiles(rootDir);

        const stats = {
            total_files: allFiles.length,
            file_types: {} as Record<string, number>,
            directories: {} as Record<string, number>
        };

        // Analyze files
        for (const file of allFiles) {
            const ext = path.extname(file).toLowerCase();
            stats.file_types[ext] = (stats.file_types[ext] || 0) + 1;

            // Track directory counts
            const relativeDir = path.relative(rootDir, path.dirname(file));
            const topDir = relativeDir.split(path.sep)[0] || '.';
            stats.directories[topDir] = (stats.directories[topDir] || 0) + 1;
        }

        return stats;
    }

    public async document(options: DocumentOptions): Promise<void> {
        const {
            outputPath,
            outputFormat,
            documentationType,
            includeItems = [],
            onProgress,
            debugMode = false
        } = options;

        // Set debug mode if requested
        if (debugMode) {
            this.setDebugMode(true);
        }

        // Store progress callback
        this.progressCallback = onProgress;

        // Reset stats
        this.stats.startTime = new Date();

        this.logger.info('Starting documentation process...');
        this.reportProgress('Starting documentation process...', 0);

        // Determine output format and doc type from config if not explicitly provided
        const docType = documentationType || this.configProcessor.getDocumentationType();
        const format = outputFormat || this.configProcessor.getOutputFormat();

        // Get destination path
        const destination = outputPath || this.configProcessor.getOutputPath();

        let fileStructure = null;
        let fileContents: any[] = [];

        // Generate file structure if needed
        if (docType === 'structure' || docType === 'both') {
            this.reportProgress('Analyzing file structure...', 10);
            this.logger.info('Generating file structure...');

            const items = includeItems.length > 0 ?
                includeItems.map(item => path.resolve(this.rootDir, item)) : [];

            fileStructure = await this.getFileStructure(items);
            this.logger.info(`Structure generated with ${fileStructure.children.length} top-level items`);
        }

        // Generate file documentation if needed
        if (docType === 'documentation' || docType === 'both') {
            this.reportProgress('Processing files...', 30);
            this.logger.info('Generating file documentation...');

            const filesToProcess = includeItems.length > 0 ?
                includeItems.map(item => path.resolve(this.rootDir, item)) :
                await this.getAllFiles(this.rootDir);

            this.logger.info(`Generating documentation for ${filesToProcess.length} files`);

            let processed = 0;
            const totalFiles = filesToProcess.length;

            // Process files in batches to avoid memory issues
            const batchSize = 20;
            for (let i = 0; i < totalFiles; i += batchSize) {
                const batch = filesToProcess.slice(i, i + batchSize);

                // Process batch in parallel
                const batchResults = await Promise.all(
                    batch.map(filePath => this.processFile(filePath))
                );

                // Filter out nulls and add to fileContents
                fileContents.push(...batchResults.filter(result => result !== null));

                // Update progress
                processed += batch.length;
                const percent = Math.floor(30 + (processed / totalFiles) * 50);
                this.reportProgress(`Processed ${processed}/${totalFiles} files...`, percent);
            }

            this.logger.info(`Successfully documented ${fileContents.length} files`);
        }

        // Calculate final statistics
        this.stats.endTime = new Date();
        this.stats.duration = this.stats.endTime.getTime() - this.stats.startTime.getTime();
        this.stats.averageFileSize = this.stats.totalDocumentedFiles > 0 ?
            this.stats.documentedSize / this.stats.totalDocumentedFiles : 0;

        // Generate output
        this.reportProgress('Generating output...', 90);
        this.logger.info('Generating documentation output...');

        // Build output data
        const outputData = {
            project_info: {
                path: this.rootDir,
                generated_on: new Date().toISOString().replace('T', ' ').substr(0, 19),
                documentation_type: docType,
                total_files: this.stats.totalFiles,
                documented_files: this.stats.totalDocumentedFiles,
                total_size: this.stats.totalSize,
                documented_size: this.stats.documentedSize,
                generation_time_ms: this.stats.duration
            },
            file_structure: fileStructure,
            files: fileContents,
            stats: {
                file_types: this.stats.fileTypes,
                largest_file: this.stats.largestFile,
                average_file_size: this.stats.averageFileSize
            }
        };

        // Create the output directory if it doesn't exist
        const outputDir = path.dirname(destination);
        if (!await existsAsync(outputDir)) {
            await mkdirAsync(outputDir, { recursive: true });
        }

        // Write output in specified format
        try {
            switch (format) {
                case 'json':
                    await writeFileAsync(destination, JSON.stringify(outputData, null, 2), 'utf8');
                    break;
                case 'txt':
                    await this.writeTxtOutput(destination, outputData);
                    break;
                case 'csv':
                    await this.writeCsvOutput(destination, outputData);
                    break;
                default:
                    await writeFileAsync(destination, JSON.stringify(outputData, null, 2), 'utf8');
            }
            this.logger.info(`Documentation written to ${destination}`);
        } catch (error) {
            this.logger.error(`Error writing documentation:`, error);
            throw error;
        }

        this.reportProgress('Documentation completed!', 100);
        this.logger.info('Documentation generation completed successfully');
    }
}