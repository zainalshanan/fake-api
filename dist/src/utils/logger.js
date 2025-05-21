import chalk from "chalk";
export class Logger {
    static info(message) {
        console.log(chalk.blue('Info: ' + message));
    }
    static success(message) {
        console.log(chalk.green('Success: ' + message));
    }
    static warn(message) {
        console.log(chalk.yellow('Warning: ' + message));
    }
    static error(message) {
        console.log(chalk.red('Error: ' + message));
    }
    static debug(message) {
        console.log(chalk.gray('Debug: ' + message));
    }
    // log a table of data
    static table(data) {
        console.table(data);
    }
    // log a divider
    static divider() {
        console.log(chalk.gray('--------------------------------'));
    }
    //log a title with dividers for section headers
    static title(title) {
        this.divider();
        console.log(chalk.bold(title));
        this.divider();
    }
}
//# sourceMappingURL=logger.js.map