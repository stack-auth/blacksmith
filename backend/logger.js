const chalk = require('chalk');
const ora = require('ora');

class Logger {
    constructor() {
        this.spinners = new Map();
    }

    // Basic logging methods with fancy styling
    info(message, ...args) {
        console.log(chalk.cyan('ℹ'), chalk.cyan(message), ...args);
    }

    success(message, ...args) {
        console.log(chalk.green('✓'), chalk.green(message), ...args);
    }

    warning(message, ...args) {
        console.log(chalk.yellow('⚠'), chalk.yellow(message), ...args);
    }

    error(message, ...args) {
        console.log(chalk.red('✗'), chalk.red(message), ...args);
    }

    debug(message, ...args) {
        console.log(chalk.gray('▸'), chalk.gray(message), ...args);
    }

    // Fancy section headers
    header(title) {
        const line = '═'.repeat(50);
        console.log('\n' + chalk.magenta.bold(`${line}`));
        console.log(chalk.magenta.bold(`  ${title}`));
        console.log(chalk.magenta.bold(`${line}`) + '\n');
    }

    subheader(title) {
        console.log('\n' + chalk.blueBright.bold(`▶ ${title}`) + '\n');
    }

    // Progress tracking with spinners
    startSpinner(id, text) {
        const spinner = ora({
            text: chalk.cyan(text),
            spinner: 'dots12',
            color: 'cyan'
        }).start();
        this.spinners.set(id, spinner);
        return spinner;
    }

    updateSpinner(id, text, color = 'cyan') {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.text = chalk[color](text);
            spinner.color = color;
        }
    }

    succeedSpinner(id, text) {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.succeed(chalk.green(text));
            this.spinners.delete(id);
        }
    }

    failSpinner(id, text) {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.fail(chalk.red(text));
            this.spinners.delete(id);
        }
    }

    warnSpinner(id, text) {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.warn(chalk.yellow(text));
            this.spinners.delete(id);
        }
    }

    stopSpinner(id) {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.stop();
            this.spinners.delete(id);
        }
    }

    // Special formatting methods
    highlight(text) {
        return chalk.yellowBright(text);
    }

    dim(text) {
        return chalk.gray(text);
    }

    bold(text) {
        return chalk.bold(text);
    }

    // HTTP request/response logging
    request(method, path, ip) {
        const methodColors = {
            GET: 'green',
            POST: 'yellow',
            PUT: 'blue',
            DELETE: 'red',
            PATCH: 'magenta'
        };

        const color = methodColors[method] || 'white';
        const timestamp = new Date().toISOString();

        console.log(
            chalk.gray(`[${timestamp}]`),
            chalk[color].bold(method.padEnd(7)),
            chalk.white(path),
            chalk.gray(`from ${ip}`)
        );
    }

    response(statusCode, duration) {
        const statusColor = statusCode < 400 ? 'green' : 'red';
        console.log(
            chalk.gray('  └─'),
            chalk[statusColor](`${statusCode}`),
            chalk.gray(`(${duration}ms)`)
        );
    }

    // File operation logging
    fileOperation(operation, filepath, details = '') {
        const icons = {
            read: '📖',
            write: '✏️',
            create: '📝',
            delete: '🗑️',
            copy: '📋'
        };

        const icon = icons[operation] || '📄';
        console.log(
            chalk.blue(`  ${icon}`),
            chalk.blue(operation.toUpperCase()),
            chalk.white(filepath),
            chalk.gray(details)
        );
    }

    // Language processing logging
    language(lang, status) {
        const statusColors = {
            processing: 'yellow',
            completed: 'green',
            failed: 'red',
            skipped: 'gray'
        };

        const color = statusColors[status] || 'white';
        const statusIcon = {
            processing: '⚙️',
            completed: '✅',
            failed: '❌',
            skipped: '⏭️'
        }[status] || '📦';

        console.log(
            chalk[color](`    ${statusIcon} ${lang.padEnd(15)}`),
            chalk[color](status)
        );
    }

    // Progress bar for batch operations
    progressBar(current, total, label = '') {
        const percent = Math.round((current / total) * 100);
        const barLength = 30;
        const filledLength = Math.round((barLength * current) / total);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

        process.stdout.write('\r');
        process.stdout.write(
            chalk.cyan(`  [${bar}] ${percent}% `) +
            chalk.white(`(${current}/${total}) `) +
            chalk.gray(label)
        );

        if (current === total) {
            process.stdout.write('\n');
        }
    }

    // Git operation logging
    gitOperation(command, result) {
        console.log(
            chalk.magenta('  🔀 GIT:'),
            chalk.white(command),
            result ? chalk.green('✓') : chalk.red('✗')
        );
    }

    // Separator lines
    separator() {
        console.log('\n' + chalk.gray('─'.repeat(50)) + '\n');
    }

    // Table display for structured data
    table(data, headers) {
        if (!data || data.length === 0) return;

        // Calculate column widths
        const widths = headers.map((h, i) => {
            const maxDataWidth = Math.max(...data.map(row => String(row[i] || '').length));
            return Math.max(h.length, maxDataWidth) + 2;
        });

        // Print headers
        console.log(chalk.cyan(
            headers.map((h, i) => h.padEnd(widths[i])).join('')
        ));
        console.log(chalk.cyan(
            widths.map(w => '─'.repeat(w - 1)).join(' ')
        ));

        // Print data
        data.forEach(row => {
            console.log(
                row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('')
            );
        });
    }
}

// Export singleton instance
module.exports = new Logger();