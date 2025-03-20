import * as fs from 'fs';
import * as path from 'path';
import * as micromatch from 'micromatch';
import { workspace, Uri } from 'vscode';

export interface CartographerConfig {
    version: string;
    include: string[];
    exclude: string[];
    maxFileSize: number;
    skipBinaryFiles: boolean;
    skipGeneratedFiles: boolean;
    customFiles?: {
        [key: string]: {
            include: string[];
            maxSize?: number;
        }
    };
    documentation: {
        type: 'structure' | 'documentation' | 'both';
        format: 'json' | 'txt' | 'csv';
        outputPath: string;
    };
}

export class ConfigProcessor {
    private config: CartographerConfig;
    private rootPath: string;
    private defaultConfig: CartographerConfig = {
        version: "1.0",
        include: ["**/*"],
        exclude: [
            "node_modules/**",
            ".git/**",
            "dist/**",
            "out/**",
            "**/*.min.js",
            "**/*.map"
        ],
        maxFileSize: 500000,
        skipBinaryFiles: true,
        skipGeneratedFiles: true,
        documentation: {
            type: "both",
            format: "json",
            outputPath: "./documentation.json"
        }
    };

    constructor(rootPath: string) {
        this.rootPath = rootPath;
        this.config = this.loadConfig();
    }

    private loadConfig(): CartographerConfig {
        // Look for config in multiple locations with priority:
        const configLocations = [
            path.join(this.rootPath, 'cartographer.config.json'),
            path.join(this.rootPath, '.cartographer.json'),
            path.join(this.rootPath, '.vscode', 'cartographer.json')
        ];

        // Check for workspace settings in VS Code
        const vsCodeConfig = workspace.getConfiguration('codeCartographer');

        // Try to load from file
        for (const configPath of configLocations) {
            if (fs.existsSync(configPath)) {
                try {
                    console.log(`Loading config from ${configPath}`);
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const parsedConfig = JSON.parse(configContent);
                    return this.mergeWithDefaultConfig(parsedConfig);
                } catch (error) {
                    console.error(`Error loading config from ${configPath}:`, error);
                }
            }
        }

        // No config file found, merge VS Code settings with default
        return this.mergeWithVsCodeSettings(this.defaultConfig);
    }

    private mergeWithDefaultConfig(userConfig: Partial<CartographerConfig>): CartographerConfig {
        // Deep merge, preferring user config values but ensuring all required fields exist
        return {
            ...this.defaultConfig,
            ...userConfig,
            documentation: {
                ...this.defaultConfig.documentation,
                ...(userConfig.documentation || {})
            }
        };
    }

    private mergeWithVsCodeSettings(config: CartographerConfig): CartographerConfig {
        const vsCodeConfig = workspace.getConfiguration('codeCartographer');

        // Apply VS Code settings if they exist
        if (vsCodeConfig) {
            if (vsCodeConfig.has('outputFormat')) {
                config.documentation.format = vsCodeConfig.get('outputFormat') as any || config.documentation.format;
            }

            if (vsCodeConfig.has('documentationType')) {
                config.documentation.type = vsCodeConfig.get('documentationType') as any || config.documentation.type;
            }

            if (vsCodeConfig.has('ignorePatterns')) {
                const ignorePatterns = vsCodeConfig.get<string[]>('ignorePatterns') || [];
                config.exclude = [...config.exclude, ...ignorePatterns];
            }
        }

        return config;
    }

    public shouldIncludeFile(filePath: string): boolean {
        // Get path relative to project root
        const relativePath = path.relative(this.rootPath, filePath).replace(/\\/g, '/');

        // Skip excludes first (they have priority)
        if (micromatch.isMatch(relativePath, this.config.exclude, { dot: true })) {
            return false;
        }

        // Check if file is explicitly included
        if (micromatch.isMatch(relativePath, this.config.include, { dot: true })) {
            return true;
        }

        // Check if file is in custom files (special cases)
        if (this.config.customFiles) {
            for (const [_, customConfig] of Object.entries(this.config.customFiles)) {
                if (micromatch.isMatch(relativePath, customConfig.include, { dot: true })) {
                    return true;
                }
            }
        }

        return false;
    }

    public getMaxFileSizeForPath(filePath: string): number {
        // Check if the file has a custom size limit
        if (this.config.customFiles) {
            const relativePath = path.relative(this.rootPath, filePath).replace(/\\/g, '/');

            for (const [_, customConfig] of Object.entries(this.config.customFiles)) {
                if (micromatch.isMatch(relativePath, customConfig.include, { dot: true })) {
                    if (customConfig.maxSize !== undefined) {
                        return customConfig.maxSize;
                    }
                }
            }
        }

        return this.config.maxFileSize;
    }

    public shouldSkipBinaryFiles(): boolean {
        return this.config.skipBinaryFiles;
    }

    public shouldSkipGeneratedFiles(): boolean {
        return this.config.skipGeneratedFiles;
    }

    public getDocumentationType(): string {
        return this.config.documentation.type;
    }

    public getOutputFormat(): string {
        return this.config.documentation.format;
    }

    public getOutputPath(): string {
        // If the path is relative, make it absolute from the project root
        if (!path.isAbsolute(this.config.documentation.outputPath)) {
            return path.join(this.rootPath, this.config.documentation.outputPath);
        }
        return this.config.documentation.outputPath;
    }

    public getConfig(): CartographerConfig {
        return this.config;
    }

    // Method to save current config to a file
    public saveConfig(outputPath?: string): void {
        const configPath = outputPath || path.join(this.rootPath, 'cartographer.config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
    }
}