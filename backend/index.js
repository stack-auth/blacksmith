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

// Global state for managing concurrent /update requests
let currentUpdateController = null;
let currentUpdatePromise = null;

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
        logger.debug(`  Found ${logger.highlight(Object.keys(result).length)} files`);
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
    // Cancel any existing update request
    if (currentUpdateController) {
        logger.warning('⚠️  Cancelling previous update request...');
        currentUpdateController.abort();

        // Wait for the previous request to finish cancelling
        if (currentUpdatePromise) {
            try {
                await currentUpdatePromise;
            } catch (e) {
                // Ignore cancellation errors
            }
        }
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    currentUpdateController = abortController;

    // Store the promise for this update
    currentUpdatePromise = processUpdate(req, res, abortController.signal);

    try {
        await currentUpdatePromise;
    } finally {
        // Clean up if this is still the current update
        if (currentUpdateController === abortController) {
            currentUpdateController = null;
            currentUpdatePromise = null;
        }
    }
});

async function processUpdate(req, res, signal) {
    try {
        logger.header('Processing Language Update Request');
        const startTime = Date.now();

        // Check if cancelled
        if (signal.aborted) {
            logger.warning('Request cancelled before starting');
            return res.status(499).json({ success: false, message: 'Request cancelled' });
        }

        // Ensure files folder exists
        const filesPath = await ensureFilesFolder();

        // Discard all unstaged changes at the beginning
        logger.subheader('Preparing Git Repository');
        try {
            const resetSpinner = logger.startSpinner('git-reset', 'Discarding unstaged changes...');
            await execPromise('git checkout -- .', { cwd: filesPath });
            await execPromise('git clean -fd', { cwd: filesPath });
            logger.succeedSpinner('git-reset', 'Repository cleaned - unstaged changes discarded');
        } catch (error) {
            logger.warning('Could not reset repository:', error.message);
        }

        // Check if cancelled after git operations
        if (signal.aborted) {
            logger.warning('Request cancelled after git reset');
            return res.status(499).json({ success: false, message: 'Request cancelled' });
        }

        const englishPath = path.join(filesPath, 'english');
        const languagesPath = path.join(filesPath, 'languages');

        // Read english files once
        logger.subheader('Reading English source files');
        const englishFiles = await readFilesFromDirectory(englishPath);
        const englishString = concatenateFiles(englishFiles);
        logger.success(`Loaded ${Object.keys(englishFiles).length} English files`);

        // Process each language
        logger.subheader('Processing Languages');
        logger.info(`Processing ${logger.highlight(LANGUAGES.length)} languages...`);

        for (let i = 0; i < LANGUAGES.length; i++) {
            // Check if cancelled before processing each language
            if (signal.aborted) {
                logger.warning('Request cancelled during language processing');
                return res.status(499).json({
                    success: false,
                    message: 'Request cancelled',
                    processed: i,
                    total: LANGUAGES.length
                });
            }

            const language = LANGUAGES[i];
            logger.progressBar(i, LANGUAGES.length, `Processing ${language}...`);
            const languagePath = path.join(languagesPath, language);

            const langSpinner = logger.startSpinner(`lang-${language}`, `Processing ${language}...`);

            // Read existing language files
            const languageFiles = await readFilesFromDirectory(languagePath);
            const oldLanguageString = concatenateFiles(languageFiles);

            // Call algo function (now async) - this cannot be cancelled mid-execution
            logger.updateSpinner(`lang-${language}`, `Running algorithm for ${language}...`);
            const result = await algo(language, englishString, oldLanguageString);

            // Check if cancelled after algo execution
            if (signal.aborted) {
                logger.stopSpinner(`lang-${language}`);
                logger.warning('Request cancelled after algorithm execution');
                return res.status(499).json({
                    success: false,
                    message: 'Request cancelled',
                    processed: i,
                    total: LANGUAGES.length
                });
            }

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
                console.log('');
                logger.language(language, 'completed');
            } else {
                logger.warnSpinner(`lang-${language}`, `${language} skipped - no output from algorithm`);
                logger.language(language, 'skipped');
            }
        }

        console.log('');
        logger.progressBar(LANGUAGES.length, LANGUAGES.length, 'All languages processed!');

        // Stage all changes unless cancelled
        if (!signal.aborted) {
            logger.subheader('Staging Changes');
            const stageSpinner = logger.startSpinner('git-stage', 'Staging all changes...');
            try {
                await execPromise('git add -A', { cwd: filesPath });
                logger.gitOperation('git add -A', true);
                logger.succeedSpinner('git-stage', 'All changes staged successfully');
            } catch (error) {
                logger.failSpinner('git-stage', 'Failed to stage changes');
                logger.error('Staging error:', error.message);
            }
        } else {
            logger.warning('Skipping staging due to cancellation');
        }

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
        // Check if it's a cancellation
        if (error.name === 'AbortError' || (signal && signal.aborted)) {
            logger.warning('Update request was cancelled');
            if (!res.headersSent) {
                res.status(499).json({
                    success: false,
                    message: 'Request cancelled'
                });
            }
        } else {
            logger.error('❌ Error processing update:', error.message);
            logger.debug('Stack trace:', error.stack);

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        }
    } finally {
        // Cleanup any remaining spinners
        for (const language of LANGUAGES) {
            logger.stopSpinner(`lang-${language}`);
        }
        logger.stopSpinner('git-reset');
        logger.stopSpinner('git-stage');
    }
}

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
    console.log('');
    logger.info(`📍 Endpoints:`);
    logger.info(`   - POST http://localhost:${PORT}/update`);
    logger.info(`   - POST http://localhost:${PORT}/commit`);
    console.log('');
    logger.info(`📂 Working directory: ${logger.dim(process.cwd())}`);
    logger.separator();
    logger.info('Waiting for requests...');
    console.log('');
});