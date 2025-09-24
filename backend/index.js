const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { algo } = require('./algo');
const logger = require('./logger');

const app = express();
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    logger.request(req.method, req.path, req.ip || 'unknown');

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.response(res.statusCode, duration);
    });

    next();
});

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

    logger.subheader('Checking files folder...');

    if (!await fs.pathExists(filesPath)) {
        logger.warning('Files folder not found, creating...');

        // Copy default-files to files if files doesn't exist
        if (await fs.pathExists(defaultFilesPath)) {
            const spinner = logger.startSpinner('copy', 'Copying default-files to files folder...');
            await fs.copy(defaultFilesPath, filesPath);
            logger.succeedSpinner('copy', 'Default files copied successfully');
        } else {
            logger.info('Creating empty files folder...');
            await fs.ensureDir(filesPath);
            logger.success('Empty files folder created');
        }

        // Initialize git repository in files folder
        const gitSpinner = logger.startSpinner('git', 'Initializing git repository...');
        try {
            await execPromise('git init', { cwd: filesPath });
            await execPromise('git config user.email "bot@example.com"', { cwd: filesPath });
            await execPromise('git config user.name "Bot"', { cwd: filesPath });
            logger.succeedSpinner('git', 'Git repository initialized');
        } catch (error) {
            logger.failSpinner('git', 'Failed to initialize git repository');
            throw error;
        }
    } else {
        logger.success('Files folder exists');
    }

    return filesPath;
}

async function readFilesFromDirectory(dirPath) {
    const result = {};

    if (await fs.pathExists(dirPath)) {
        logger.debug(`Reading files from ${logger.dim(dirPath)}`);
        const files = await fs.readdir(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);

            if (stat.isFile()) {
                logger.fileOperation('read', file, `from ${path.basename(dirPath)}`);
                const content = await fs.readFile(filePath, 'utf-8');
                result[file] = content;
            }
        }
        logger.debug(`Found ${logger.highlight(Object.keys(result).length)} files`);
    } else {
        logger.debug(`Directory ${logger.dim(dirPath)} does not exist`);
    }

    return result;
}

function concatenateFiles(filesObj) {
    let result = '';
    const fileCount = Object.keys(filesObj).length;

    if (fileCount > 0) {
        logger.debug(`Concatenating ${logger.highlight(fileCount)} files...`);
    }

    for (const [filename, content] of Object.entries(filesObj)) {
        result += `=== ${filename} ===\n${content}\n\n`;
    }

    return result;
}

app.post('/update', async (req, res) => {
    try {
        logger.header('Processing Language Update Request');
        const startTime = Date.now();

        // Ensure files folder exists
        const filesPath = await ensureFilesFolder();

        const englishPath = path.join(filesPath, 'english');
        const languagesPath = path.join(filesPath, 'languages');

        // Read english files once
        logger.subheader('Reading English source files');
        const englishFiles = await readFilesFromDirectory(englishPath);
        const englishString = concatenateFiles(englishFiles);
        logger.success(`Loaded ${Object.keys(englishFiles).length} English files`);

        // Process each language
        logger.subheader('Processing Languages');
        logger.info(`Processing ${logger.highlight(LANGUAGES.length)} languages...\n`);

        for (let i = 0; i < LANGUAGES.length; i++) {
            const language = LANGUAGES[i];
            logger.progressBar(i, LANGUAGES.length, `Processing ${language}...`);
            const languagePath = path.join(languagesPath, language);

            const langSpinner = logger.startSpinner(`lang-${language}`, `Processing ${language}...`);

            // Read existing language files
            const languageFiles = await readFilesFromDirectory(languagePath);
            const oldLanguageString = concatenateFiles(languageFiles);

            // Call algo function (now async)
            logger.updateSpinner(`lang-${language}`, `Running algorithm for ${language}...`);
            const result = await algo(language, englishString, oldLanguageString);

            // Write result files to language folder
            if (result && typeof result === 'object') {
                // Ensure language directory exists
                await fs.ensureDir(languagePath);

                logger.updateSpinner(`lang-${language}`, `Writing ${Object.keys(result).length} files for ${language}...`);

                for (const [filename, content] of Object.entries(result)) {
                    const filePath = path.join(languagePath, filename);
                    await fs.writeFile(filePath, content, 'utf-8');
                    logger.fileOperation('write', filename, `to ${language}`);
                }

                logger.succeedSpinner(`lang-${language}`, `${language} completed - ${Object.keys(result).length} files written`);
                logger.language(language, 'completed');
            } else {
                logger.warnSpinner(`lang-${language}`, `${language} skipped - no output from algorithm`);
                logger.language(language, 'skipped');
            }
        }

        logger.progressBar(LANGUAGES.length, LANGUAGES.length, 'All languages processed!');
        logger.separator();

        const totalTime = Date.now() - startTime;
        logger.separator();
        logger.success(`✨ Update completed in ${logger.highlight(totalTime + 'ms')}`);
        logger.separator();

        // Show summary table
        logger.subheader('Summary');
        const summaryData = LANGUAGES.map(lang => [
            lang,
            '✅ Processed',
            `${totalTime}ms`
        ]);
        logger.table(summaryData, ['Language', 'Status', 'Time']);

        res.json({
            success: true,
            message: 'Language files updated successfully',
            languages: LANGUAGES,
            processingTime: `${totalTime}ms`
        });

    } catch (error) {
        logger.error('❌ Error processing update:', error.message);
        logger.debug('Stack trace:', error.stack);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /commit endpoint - commits changes to git
app.post('/commit', async (req, res) => {
    try {
        logger.header('Processing Git Commit Request');
        const startTime = Date.now();

        // Get the files path
        const filesPath = path.join(__dirname, '..', 'files');

        // Check if files folder exists
        if (!await fs.pathExists(filesPath)) {
            logger.error('Files folder does not exist');
            return res.status(400).json({
                success: false,
                error: 'Files folder does not exist. Run /update first.'
            });
        }

        // Check if it's a git repository
        try {
            await execPromise('git status', { cwd: filesPath });
        } catch (error) {
            logger.error('Files folder is not a git repository');
            return res.status(400).json({
                success: false,
                error: 'Files folder is not a git repository'
            });
        }

        // Git commit inside files folder
        logger.subheader('Committing Changes');
        const gitSpinner = logger.startSpinner('commit', 'Checking for changes...');

        try {
            // Check for changes
            const statusResult = await execPromise('git status --porcelain', { cwd: filesPath });
            const hasChanges = statusResult.stdout.trim().length > 0;

            if (hasChanges) {
                logger.updateSpinner('commit', 'Staging changes...');
                await execPromise('git add -A', { cwd: filesPath });
                logger.gitOperation('git add -A', true);

                logger.updateSpinner('commit', 'Committing changes...');
                const commitMessage = req.body.message || 'Update language files';
                await execPromise(`git commit -m "${commitMessage}"`, { cwd: filesPath });
                logger.gitOperation(`git commit -m "${commitMessage}"`, true);
                logger.succeedSpinner('commit', 'Changes committed successfully');
            } else {
                // Create empty commit if requested
                if (req.body.allowEmpty) {
                    logger.updateSpinner('commit', 'No changes detected, creating empty commit...');
                    const commitMessage = req.body.message || 'Update language files (no changes)';
                    await execPromise(`git commit --allow-empty -m "${commitMessage}"`, { cwd: filesPath });
                    logger.gitOperation(`git commit --allow-empty -m "${commitMessage}"`, true);
                    logger.succeedSpinner('commit', 'Empty commit created successfully');
                } else {
                    logger.warnSpinner('commit', 'No changes to commit');
                    const totalTime = Date.now() - startTime;

                    return res.json({
                        success: true,
                        message: 'No changes to commit',
                        hasChanges: false,
                        processingTime: `${totalTime}ms`
                    });
                }
            }

            // Get commit info
            const lastCommit = await execPromise('git log -1 --oneline', { cwd: filesPath });
            const totalTime = Date.now() - startTime;

            logger.separator();
            logger.success(`✨ Commit completed in ${logger.highlight(totalTime + 'ms')}`);
            logger.info(`Last commit: ${lastCommit.stdout.trim()}`);
            logger.separator();

            res.json({
                success: true,
                message: 'Changes committed successfully',
                hasChanges: hasChanges,
                lastCommit: lastCommit.stdout.trim(),
                processingTime: `${totalTime}ms`
            });

        } catch (error) {
            logger.failSpinner('commit', 'Failed to commit changes');
            logger.gitOperation('git commit', false);
            throw error;
        }

    } catch (error) {
        logger.error('❌ Error processing commit:', error.message);
        logger.debug('Stack trace:', error.stack);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    logger.header('Blacksmith Backend Server');
    logger.success(`🚀 Server running on port ${logger.highlight(PORT)}`);
    logger.info(`📍 Endpoints:`);
    logger.info(`   - POST http://localhost:${PORT}/update`);
    logger.info(`   - POST http://localhost:${PORT}/commit`);
    logger.info(`📂 Working directory: ${logger.dim(process.cwd())}`);
    logger.separator();
    logger.info('Waiting for requests...');
});