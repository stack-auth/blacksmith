const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { algo } = require('./algo');
const logger = require('./logger');

const app = express();

// Enable CORS for all cross-origin requests
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    credentials: true
}));

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

// Helper function to initialize git repo if needed
async function ensureGitRepo(repoPath, description) {
    if (!await fs.pathExists(path.join(repoPath, '.git'))) {
        logger.info(`Initializing git repository for ${description}...`);
        await execPromise('git init', { cwd: repoPath });
        await execPromise('git config user.email "bot@example.com"', { cwd: repoPath });
        await execPromise('git config user.name "Bot"', { cwd: repoPath });

        // Make initial commit if there are files
        try {
            const files = await fs.readdir(repoPath);
            if (files.length > 0) {
                await execPromise('git add -A', { cwd: repoPath });
                await execPromise(`git commit -m "Initial commit for ${description}"`, { cwd: repoPath });
            }
        } catch (e) {
            // Ignore if no files to commit
        }

        logger.success(`Git repository initialized for ${description}`);
    }
}

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
    } else {
        logger.success('Files folder exists');
    }

    // Ensure english folder and its git repo
    const englishPath = path.join(filesPath, 'english');
    await fs.ensureDir(englishPath);
    await ensureGitRepo(englishPath, 'English');

    // Ensure languages folder
    const languagesPath = path.join(filesPath, 'languages');
    await fs.ensureDir(languagesPath);

    // Ensure each language has its own git repo
    for (const language of LANGUAGES) {
        const langPath = path.join(languagesPath, language);
        await fs.ensureDir(langPath);
        await ensureGitRepo(langPath, language);
    }

    return filesPath;
}

async function readFilesFromDirectory(dirPath) {
    const result = {};

    if (await fs.pathExists(dirPath)) {
        logger.debug(`Reading files from ${logger.dim(dirPath)}`);
        const files = await fs.readdir(dirPath);

        for (const file of files) {
            // Skip .git directory
            if (file === '.git') continue;

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
    const processedLanguages = [];

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

        // Prepare all language repos (but NOT english)
        logger.subheader('Preparing Git Repositories');
        const languagesPath = path.join(filesPath, 'languages');

        for (const language of LANGUAGES) {
            const langPath = path.join(languagesPath, language);
            try {
                const resetSpinner = logger.startSpinner(`git-reset-${language}`, `Discarding unstaged changes in ${language}...`);
                await execPromise('git checkout -- .', { cwd: langPath });
                await execPromise('git clean -fd', { cwd: langPath });
                logger.succeedSpinner(`git-reset-${language}`, `${language} repository cleaned`);
            } catch (error) {
                logger.warning(`Could not reset ${language} repository:`, error.message);
            }
        }

        // Check if cancelled after git operations
        if (signal.aborted) {
            logger.warning('Request cancelled after git reset');
            return res.status(499).json({ success: false, message: 'Request cancelled' });
        }

        const englishPath = path.join(filesPath, 'english');

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
                // Revert any processed languages
                await revertProcessedLanguages(processedLanguages, languagesPath);
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
                // Revert any processed languages
                await revertProcessedLanguages(processedLanguages, languagesPath);
                return res.status(499).json({
                    success: false,
                    message: 'Request cancelled',
                    processed: i,
                    total: LANGUAGES.length
                });
            }

            // Write result files to language folder
            if (result && typeof result === 'object') {
                logger.updateSpinner(`lang-${language}`, `Writing ${Object.keys(result).length} files for ${language}...`);

                for (const [filename, content] of Object.entries(result)) {
                    const filePath = path.join(languagePath, filename);
                    await fs.writeFile(filePath, content, 'utf-8');
                    logger.fileOperation('write', filename, `to ${language}`);
                }

                processedLanguages.push(language);
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

        // Stage all changes unless cancelled (including English)
        if (!signal.aborted) {
            logger.subheader('Staging Changes');

            // Stage English changes
            try {
                const englishSpinner = logger.startSpinner('git-stage-english', 'Staging English changes...');
                await execPromise('git add -A', { cwd: englishPath });
                logger.succeedSpinner('git-stage-english', 'English changes staged');
            } catch (error) {
                logger.error('Failed to stage English changes:', error.message);
            }

            // Stage all language changes
            for (const language of LANGUAGES) {
                const langPath = path.join(languagesPath, language);
                try {
                    const stageSpinner = logger.startSpinner(`git-stage-${language}`, `Staging ${language} changes...`);
                    await execPromise('git add -A', { cwd: langPath });
                    logger.succeedSpinner(`git-stage-${language}`, `${language} changes staged`);
                } catch (error) {
                    logger.error(`Failed to stage ${language} changes:`, error.message);
                }
            }

            // Commit English changes automatically
            try {
                logger.subheader('Committing English Changes');
                const commitSpinner = logger.startSpinner('git-commit-english', 'Committing English changes...');
                const statusResult = await execPromise('git diff --cached --name-only', { cwd: englishPath });

                if (statusResult.stdout.trim().length > 0) {
                    await execPromise(`git commit -m "Update English specification"`, { cwd: englishPath });
                    logger.succeedSpinner('git-commit-english', 'English changes committed');
                } else {
                    logger.warnSpinner('git-commit-english', 'No English changes to commit');
                }
            } catch (error) {
                logger.error('Failed to commit English changes:', error.message);
            }

            logger.success('All changes staged successfully');
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
            processedLanguages.includes(lang) ? '✅ Processed' : '⏭️ Skipped',
            `${totalTime}ms`
        ]);
        logger.table(summaryData, ['Language', 'Status', 'Time']);

        res.json({
            success: true,
            message: 'Language files updated successfully',
            languages: LANGUAGES,
            processedLanguages,
            processingTime: `${totalTime}ms`
        });

    } catch (error) {
        // Check if it's a cancellation
        if (error.name === 'AbortError' || (signal && signal.aborted)) {
            logger.warning('Update request was cancelled');
            // Revert any processed languages
            const languagesPath = path.join(__dirname, '..', 'files', 'languages');
            await revertProcessedLanguages(processedLanguages, languagesPath);

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
            logger.stopSpinner(`git-reset-${language}`);
            logger.stopSpinner(`git-stage-${language}`);
        }
        logger.stopSpinner('git-stage-english');
        logger.stopSpinner('git-commit-english');
    }
}

// Helper to revert processed languages on cancellation
async function revertProcessedLanguages(processedLanguages, languagesPath) {
    for (const language of processedLanguages) {
        const langPath = path.join(languagesPath, language);
        try {
            await execPromise('git checkout -- .', { cwd: langPath });
            await execPromise('git clean -fd', { cwd: langPath });
            logger.info(`Reverted changes in ${language} due to cancellation`);
        } catch (e) {
            logger.error(`Failed to revert ${language}:`, e.message);
        }
    }
}

// POST /approve endpoint - approves and commits changes for a specific language
app.post('/approve', async (req, res) => {
    try {
        const { language } = req.body;

        if (!language) {
            return res.status(400).json({
                success: false,
                error: 'Language parameter is required'
            });
        }

        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({
                success: false,
                error: `Invalid language. Must be one of: ${LANGUAGES.join(', ')}`
            });
        }

        logger.header(`Approving ${language} Changes`);
        const startTime = Date.now();

        const langPath = path.join(__dirname, '..', 'files', 'languages', language);

        // Check if language folder exists
        if (!await fs.pathExists(langPath)) {
            logger.error(`Language folder does not exist for ${language}`);
            return res.status(400).json({
                success: false,
                error: `Language folder does not exist for ${language}. Run /update first.`
            });
        }

        // Discard unstaged changes first
        try {
            const cleanSpinner = logger.startSpinner('git-clean', `Discarding unstaged changes in ${language}...`);
            await execPromise('git checkout -- .', { cwd: langPath });
            logger.succeedSpinner('git-clean', 'Unstaged changes discarded');
        } catch (error) {
            logger.warning('Could not discard unstaged changes:', error.message);
        }

        logger.subheader('Committing Changes');
        const gitSpinner = logger.startSpinner('commit', `Checking for staged changes in ${language}...`);

        try {
            // Check for staged changes
            const statusResult = await execPromise('git diff --cached --name-only', { cwd: langPath });
            const hasStagedChanges = statusResult.stdout.trim().length > 0;

            if (hasStagedChanges) {
                logger.updateSpinner('commit', `Committing staged changes for ${language}...`);
                const commitMessage = req.body.message || `Approve ${language} implementation`;
                await execPromise(`git commit -m "${commitMessage}"`, { cwd: langPath });
                logger.gitOperation(`git commit -m "${commitMessage}"`, true);
                logger.succeedSpinner('commit', `${language} changes approved and committed`);

                // Get commit info
                const lastCommit = await execPromise('git log -1 --oneline', { cwd: langPath });
                const totalTime = Date.now() - startTime;

                logger.separator();
                logger.success(`✨ ${language} approved in ${logger.highlight(totalTime + 'ms')}`);
                logger.info(`Last commit: ${lastCommit.stdout.trim()}`);
                logger.separator();

                res.json({
                    success: true,
                    message: `${language} changes approved and committed`,
                    language,
                    lastCommit: lastCommit.stdout.trim(),
                    processingTime: `${totalTime}ms`
                });
            } else {
                logger.warnSpinner('commit', `No staged changes to approve for ${language}`);
                const totalTime = Date.now() - startTime;

                res.json({
                    success: true,
                    message: `No staged changes to approve for ${language}`,
                    language,
                    hasChanges: false,
                    processingTime: `${totalTime}ms`
                });
            }
        } catch (error) {
            logger.failSpinner('commit', `Failed to approve ${language} changes`);
            logger.gitOperation('git commit', false);
            throw error;
        }

    } catch (error) {
        logger.error('❌ Error processing approval:', error.message);
        logger.debug('Stack trace:', error.stack);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /reject endpoint - rejects and reverts staged changes for a specific language
app.post('/reject', async (req, res) => {
    try {
        const { language } = req.body;

        if (!language) {
            return res.status(400).json({
                success: false,
                error: 'Language parameter is required'
            });
        }

        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({
                success: false,
                error: `Invalid language. Must be one of: ${LANGUAGES.join(', ')}`
            });
        }

        logger.header(`Rejecting ${language} Changes`);
        const startTime = Date.now();

        const langPath = path.join(__dirname, '..', 'files', 'languages', language);

        // Check if language folder exists
        if (!await fs.pathExists(langPath)) {
            logger.error(`Language folder does not exist for ${language}`);
            return res.status(400).json({
                success: false,
                error: `Language folder does not exist for ${language}. Run /update first.`
            });
        }

        logger.subheader('Reverting Changes');

        try {
            // Check for staged changes
            const statusResult = await execPromise('git diff --cached --name-only', { cwd: langPath });
            const hasStagedChanges = statusResult.stdout.trim().length > 0;

            if (hasStagedChanges) {
                const revertSpinner = logger.startSpinner('revert', `Reverting staged changes for ${language}...`);

                // Reset staged changes
                await execPromise('git reset HEAD', { cwd: langPath });
                logger.gitOperation('git reset HEAD', true);

                // Discard the changes
                await execPromise('git checkout -- .', { cwd: langPath });
                logger.gitOperation('git checkout -- .', true);

                // Clean untracked files
                await execPromise('git clean -fd', { cwd: langPath });
                logger.gitOperation('git clean -fd', true);

                logger.succeedSpinner('revert', `${language} changes rejected and reverted`);

                const totalTime = Date.now() - startTime;

                logger.separator();
                logger.success(`✨ ${language} changes rejected in ${logger.highlight(totalTime + 'ms')}`);
                logger.separator();

                res.json({
                    success: true,
                    message: `${language} changes rejected and reverted`,
                    language,
                    processingTime: `${totalTime}ms`
                });
            } else {
                logger.info(`No staged changes to reject for ${language}`);
                const totalTime = Date.now() - startTime;

                res.json({
                    success: true,
                    message: `No staged changes to reject for ${language}`,
                    language,
                    hasChanges: false,
                    processingTime: `${totalTime}ms`
                });
            }
        } catch (error) {
            logger.error(`Failed to reject ${language} changes:`, error.message);
            throw error;
        }

    } catch (error) {
        logger.error('❌ Error processing rejection:', error.message);
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
    logger.info(`   - POST http://localhost:${PORT}/approve`);
    logger.info(`   - POST http://localhost:${PORT}/reject`);
    console.log('');
    logger.info(`📂 Working directory: ${logger.dim(process.cwd())}`);
    logger.separator();
    logger.info('Waiting for requests...');
    console.log('');
});