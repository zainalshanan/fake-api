import chalk from "chalk";

export class Logger {
  static info(message: string) {
    console.log(chalk.blue("Info: " + message));
  }

  static success(message: string) {
    console.log(chalk.green("Success: " + message));
  }

  static warn(message: string) {
    console.log(chalk.yellow("Warning: " + message));
  }

  static error(message: string, metadata?: Record<string, any>) {
    if (metadata) {
      console.log(
        chalk.red("Error: " + message),
        chalk.red(JSON.stringify(metadata, null, 2))
      );
    } else {
      console.log(chalk.red("Error: " + message));
    }
  }

  static debug(message: string, metadata?: Record<string, any>) {
    if (metadata) {
      console.log(
        chalk.gray("Debug: " + message),
        chalk.gray(JSON.stringify(metadata, null, 2))
      );
    } else {
      console.log(chalk.gray("Debug: " + message));
    }
  }

  // log a table of data
  static table(data: any[]) {
    console.table(data);
  }

  // log a divider
  static divider() {
    console.log(chalk.gray("--------------------------------"));
  }

  //log a title with dividers for section headers
  static title(title: string) {
    this.divider();
    console.log(chalk.bold(title));
    this.divider();
  }
}
