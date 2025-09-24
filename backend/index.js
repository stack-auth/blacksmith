const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { algo } = require('./algo');

const app = express();
app.use(express.json());

const PORT = 3003;

// Hardcoded list of 10 programming languages
const LANGUAGES = [
    'javascript',
    'python',
    'java',
    'csharp',
    'cpp',
    'ruby',
    'go',
    'rust',
    'swift',
    'kotlin'
];

async function ensureFilesFolder() {
    const filesPath = path.join(__dirname, '..', 'files');
    const defaultFilesPath = path.join(__dirname, '..', 'default-files');

    if (!await fs.pathExists(filesPath)) {
        // Copy default-files to files if files doesn't exist
        if (await fs.pathExists(defaultFilesPath)) {
            await fs.copy(defaultFilesPath, filesPath);
        } else {
            // Create empty files folder if default-files doesn't exist
            await fs.ensureDir(filesPath);
        }

        // Initialize git repository in files folder
        await execPromise('git init', { cwd: filesPath });
        await execPromise('git config user.email "bot@example.com"', { cwd: filesPath });
        await execPromise('git config user.name "Bot"', { cwd: filesPath });
    }

    return filesPath;
}

async function readFilesFromDirectory(dirPath) {
    const result = {};

    if (await fs.pathExists(dirPath)) {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);

            if (stat.isFile()) {
                const content = await fs.readFile(filePath, 'utf-8');
                result[file] = content;
            }
        }
    }

    return result;
}

function concatenateFiles(filesObj) {
    let result = '';

    for (const [filename, content] of Object.entries(filesObj)) {
        result += `=== ${filename} ===\n${content}\n\n`;
    }

    return result;
}

app.post('/update', async (req, res) => {
    try {
        // Ensure files folder exists
        const filesPath = await ensureFilesFolder();

        const englishPath = path.join(filesPath, 'english');
        const languagesPath = path.join(filesPath, 'languages');

        // Read english files once
        const englishFiles = await readFilesFromDirectory(englishPath);
        const englishString = concatenateFiles(englishFiles);

        // Process each language
        for (const language of LANGUAGES) {
            const languagePath = path.join(languagesPath, language);

            // Read existing language files
            const languageFiles = await readFilesFromDirectory(languagePath);
            const oldLanguageString = concatenateFiles(languageFiles);

            // Call algo function
            const result = algo(language, englishString, oldLanguageString);

            // Write result files to language folder
            if (result && typeof result === 'object') {
                // Ensure language directory exists
                await fs.ensureDir(languagePath);

                for (const [filename, content] of Object.entries(result)) {
                    const filePath = path.join(languagePath, filename);
                    await fs.writeFile(filePath, content, 'utf-8');
                }
            }
        }

        // Git commit inside files folder
        try {
            await execPromise('git add -A', { cwd: filesPath });
            await execPromise('git commit -m "Update language files"', { cwd: filesPath });
        } catch (error) {
            // Ignore if nothing to commit
            if (!error.message.includes('nothing to commit')) {
                throw error;
            }
        }

        res.json({
            success: true,
            message: 'Language files updated and committed successfully',
            languages: LANGUAGES
        });

    } catch (error) {
        console.error('Error processing update:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});