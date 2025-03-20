import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    NONE = 5
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logFilePath?: string;
    private logLevel: LogLevel = LogLevel.INFO;
    private logToFile: boolean = false;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Code Cartographer');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.info(`Log level set to ${LogLevel[level]}`);
    }

    public enableFileLogging(directory?: string): void {
        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const logDir = directory || path.join(os.tmpdir(), 'code-cartographer-logs');

            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            this.logFilePath = path.join(logDir, `cartographer-${timestamp}.log`);
            this.logToFile = true;

            this.info(`File logging enabled at: ${this.logFilePath}`);
        } catch (error) {
            this.error(`Failed to set up file logging: ${error}`);
            this.logToFile = false;
        }
    }

    public disableFileLogging(): void {
        this.logToFile = false;
        this.info('File logging disabled');
    }

    public trace(message: string, data?: any): void {
        this.log(LogLevel.TRACE, message, data);
    }

    public debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }

    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, data);
    }

    public error(message: string, error?: any): void {
        this.log(LogLevel.ERROR, message, error);

        // For errors, also show notification if it's serious
        if (this.logLevel <= LogLevel.ERROR) {
            vscode.window.showErrorMessage(`Code Cartographer: ${message}`);
        }
    }

    private log(level: LogLevel, message: string, data?: any): void {
        if (level < this.logLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level].padEnd(5);
        let logMessage = `[${timestamp}] [${levelName}] ${message}`;

        // Add formatted data if provided
        if (data !== undefined) {
            if (data instanceof Error) {
                logMessage += `\nError: ${data.message}\nStack: ${data.stack}`;
            } else if (typeof data === 'object') {
                try {
                    logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    logMessage += `\nData: [Object could not be stringified]`;
                }
            } else {
                logMessage += `\nData: ${data}`;
            }
        }

        // Write to VS Code output channel
        this.outputChannel.appendLine(logMessage);

        // Write to file if enabled
        if (this.logToFile && this.logFilePath) {
            try {
                fs.appendFileSync(this.logFilePath, logMessage + '\n');
            } catch (error) {
                // Write to output channel only to avoid infinite recursion
                this.outputChannel.appendLine(`[${timestamp}] [ERROR] Failed to write to log file: ${error}`);
                this.logToFile = false;
            }
        }

        // Also log to console for development
        if (level >= LogLevel.WARN) {
            console.warn(logMessage);
        } else if (level === LogLevel.INFO) {
            console.info(logMessage);
        } else {
            console.log(logMessage);
        }
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// Helper function to get logger instance
export function getLogger(): Logger {
    return Logger.getInstance();
}