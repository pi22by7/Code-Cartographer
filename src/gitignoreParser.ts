import * as fs from 'fs';
import * as path from 'path';
import * as micromatch from 'micromatch';

export function parseGitignore(gitignorePath: string): (filePath: string) => boolean {
    if (!fs.existsSync(gitignorePath)) {
        return () => false;
    }

    try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const rules = content
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => line.trim());

        const basePath = path.dirname(gitignorePath);

        return (filePath: string) => {
            // Make path relative to gitignore directory
            const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');

            // Check if path matches any gitignore pattern
            return micromatch.isMatch(relativePath, rules, { dot: true });
        };
    } catch (err) {
        console.error(`Error parsing gitignore: ${err}`);
        return () => false;
    }
}