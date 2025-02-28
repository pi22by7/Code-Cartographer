import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';
import { promisify } from 'util';
import { parseGitignore } from './gitignoreParser';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);

export interface DocumentOptions {
    outputPath: string;
    outputFormat: string;
    documentationType: string;
    includeItems?: string[];
    onProgress?: (message: string, percent: number) => void;
}

export class CodeCartographer {
    private rootDir: string;
    private processedFiles: Set<string> = new Set();
    private totalSize: number = 0;
    private fileCount: number = 0;
    private gitignoreMatcher: (filePath: string) => boolean;
    private progressCallback?: (message: string, percent: number) => void;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.gitignoreMatcher = parseGitignore(path.join(rootDir, '.gitignore'));
    }

    private shouldIgnore(filePath: string): boolean {
        if (this.gitignoreMatcher && this.gitignoreMatcher(filePath)) {
            return true;
        }

        const ignoredExtensions = ['.pyc', '.pyo', '.pyd', '.egg-info', '.o', '.obj', '.exe', '.dll'];
        if (ignoredExtensions.includes(path.extname(filePath))) {
            return true;
        }

        const ignoredDirs = ['__pycache__', '.git', '.vscode', '.idea', 'node_modules', 'dist', 'out', 'build'];
        const parts = filePath.split(path.sep);
        if (parts.some(part => ignoredDirs.includes(part))) {
            return true;
        }

        return false;
    }

    private async readFile(filePath: string): Promise<string | null> {
        try {
            // Check file size
            const stats = await statAsync(filePath);
            if (stats.size > 500000) {
                console.log(`Skipping large file: ${filePath}`);
                return null;
            }

            // Read file as buffer first
            const buffer = await readFileAsync(filePath);

            // Check if likely binary
            if (this.containsNullByte(buffer)) {
                console.log(`Skipping binary file: ${filePath}`);
                return null;
            }

            // Try different encodings
            const encodings = ['utf8', 'latin1', 'utf16le'];
            for (const encoding of encodings) {
                try {
                    const decoder = new TextDecoder(encoding);
                    const content = decoder.decode(buffer);
                    return content;
                } catch (err) {
                    continue;
                }
            }

            return null;
        } catch (err) {
            console.error(`Error reading file ${filePath}:`, err);
            return null;
        }
    }

    private containsNullByte(buffer: Buffer): boolean {
        // Check first 4KB for null bytes (common in binary files)
        const checkSize = Math.min(buffer.length, 4096);
        for (let i = 0; i < checkSize; i++) {
            if (buffer[i] === 0) {
                return true;
            }
        }
        return false;
    }

    private isLikelyGeneratedCode(content: string): boolean {
        const generatedMarkers = [
            "// Generated code",
            "/* Generated code",
            "@generated",
            "// GENERATED CODE - DO NOT MODIFY",
            "# Generated by",
            "// Auto-generated",
            "# This is a generated file",
        ];

        const firstLines = content.split('\n').slice(0, 5).join('\n');
        return generatedMarkers.some(marker =>
            firstLines.toLowerCase().includes(marker.toLowerCase())
        );
    }

    async processFile(filePath: string): Promise<any> {
        try {
            if (this.processedFiles.has(filePath) || this.shouldIgnore(filePath)) {
                return null;
            }

            this.processedFiles.add(filePath);

            const content = await this.readFile(filePath);
            if (!content) {
                return null;
            }

            if (this.isLikelyGeneratedCode(content)) {
                return null;
            }

            const stats = await statAsync(filePath);
            const fileSize = stats.size;
            this.totalSize += content.length;
            this.fileCount += 1;

            return {
                path: path.relative(this.rootDir, filePath),
                content: content,
                size: fileSize
            };
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err);
            return null;
        }
    }

    private async getFileStructure(includeItems: string[] = []): Promise<any> {
        const structure = {
            name: path.basename(this.rootDir),
            type: 'directory',
            children: []
        };

        // If no items specified, return empty structure
        if (includeItems.length === 0) {
            const allFiles = await this.getAllFiles(this.rootDir);
            includeItems = allFiles.filter(file => !this.shouldIgnore(file));
        }

        const addPathToStructure = (
            structure: any,
            fullPath: string,
            relativePath: string
        ) => {
            const parts = relativePath.split(path.sep);
            let current = structure;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                const isFile = isLast && fs.statSync(fullPath).isFile();

                // Find existing node or create new one
                let node = current.children.find((child: any) => child.name === part);

                if (!node) {
                    node = {
                        name: part,
                        type: isFile ? 'file' : 'directory'
                    };

                    if (!isFile) {
                        node.children = [];
                    } else {
                        node.size = fs.statSync(fullPath).size;
                    }

                    current.children.push(node);
                }

                if (!isFile) {
                    current = node;
                }
            }
        };

        // Process all include items
        for (const item of includeItems) {
            const relativePath = path.relative(this.rootDir, item);
            addPathToStructure(structure, item, relativePath);
        }

        return structure;
    }

    private async getAllFiles(dir: string): Promise<string[]> {
        const entries = await readdirAsync(dir, { withFileTypes: true });

        const files = await Promise.all(entries.map(async entry => {
            const fullPath = path.join(dir, entry.name);
            return entry.isDirectory() ?
                this.getAllFiles(fullPath) : [fullPath];
        }));

        return files.flat();
    }

    async document(options: DocumentOptions): Promise<void> {
        const {
            outputPath,
            outputFormat = 'json',
            documentationType = 'both',
            includeItems = [],
            onProgress = undefined
        } = options;

        this.progressCallback = onProgress;
        this.reportProgress('Starting documentation process...', 0);

        let fileStructure = null;
        let fileContents = [];

        // Generate file structure if needed
        if (documentationType === 'structure' || documentationType === 'both') {
            this.reportProgress('Analyzing file structure...', 10);

            const items = includeItems.length > 0 ?
                includeItems :
                [this.rootDir];

            fileStructure = await this.getFileStructure(
                items.map(item => path.resolve(this.rootDir, item))
            );
        }

        // Generate file documentation if needed
        if (documentationType === 'documentation' || documentationType === 'both') {
            this.reportProgress('Processing files...', 30);

            const filesToProcess = includeItems.length > 0 ?
                includeItems.map(item => path.resolve(this.rootDir, item)) :
                await this.getAllFiles(this.rootDir);

            let processed = 0;
            for (const filePath of filesToProcess) {
                const result = await this.processFile(filePath);
                if (result) {
                    fileContents.push(result);
                }

                processed++;
                if (processed % 10 === 0) {
                    const percent = Math.floor(30 + (processed / filesToProcess.length) * 50);
                    this.reportProgress(`Processed ${processed}/${filesToProcess.length} files...`, percent);
                }
            }
        }

        // Generate output
        this.reportProgress('Generating output...', 90);

        const outputData = {
            project_info: {
                path: this.rootDir,
                generated_on: new Date().toISOString(),
                documentation_type: documentationType,
                total_files: this.fileCount,
                total_size: this.totalSize
            },
            file_structure: fileStructure,
            files: fileContents
        };

        // Write output in specified format
        switch (outputFormat) {
            case 'json':
                await writeFileAsync(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
                break;
            case 'txt':
                await this.writeTxtOutput(outputPath, outputData);
                break;
            case 'csv':
                await this.writeCsvOutput(outputPath, outputData);
                break;
            default:
                await writeFileAsync(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
        }

        this.reportProgress('Documentation completed!', 100);
    }

    private async writeTxtOutput(outputPath: string, data: any): Promise<void> {
        let output = `Project Documentation\n`;
        output += `${'='.repeat(80)}\n`;
        output += `Project Path: ${data.project_info.path}\n`;
        output += `Generated on: ${data.project_info.generated_on}\n`;
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
                output += `Size: ${Math.round(file.size / 1024 * 100) / 100} KB\n`;
                output += `${'='.repeat(80)}\n\n`;
                output += file.content;
                output += `\n\n`;
            }
        }

        await writeFileAsync(outputPath, output, 'utf8');
    }

    private formatStructureAsTxt(structure: any, prefix = ''): string {
        let output = `${prefix}${structure.name}\n`;

        if (structure.children) {
            for (let i = 0; i < structure.children.length; i++) {
                const isLast = i === structure.children.length - 1;
                const childPrefix = prefix + (isLast ? '└── ' : '├── ');
                const grandchildPrefix = prefix + (isLast ? '    ' : '│   ');

                output += this.formatStructureAsTxt(structure.children[i], childPrefix);
            }
        }

        return output;
    }

    private async writeCsvOutput(outputPath: string, data: any): Promise<void> {
        let output = '';

        // Add structure if available
        if (data.file_structure) {
            output += 'type,name,path,size\n';
            output += this.formatStructureAsCsv(data.file_structure);
        }

        // Add content if available
        if (data.files && data.files.length > 0) {
            if (output) {
                output += '\n\n';
            }

            output += 'path,size\n';

            for (const file of data.files) {
                output += `"${file.path}",${file.size}\n`;
            }
        }

        await writeFileAsync(outputPath, output, 'utf8');
    }

    private formatStructureAsCsv(structure: any, parentPath = ''): string {
        const currentPath = parentPath ?
            `${parentPath}/${structure.name}` :
            structure.name;

        let output = `${structure.type},${structure.name},${currentPath},${structure.size || ''}\n`;

        if (structure.children) {
            for (const child of structure.children) {
                output += this.formatStructureAsCsv(child, currentPath);
            }
        }

        return output;
    }

    private reportProgress(message: string, percent: number): void {
        if (this.progressCallback) {
            this.progressCallback(message, percent);
        }
    }
}