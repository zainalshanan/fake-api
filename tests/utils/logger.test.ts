import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "../../src/utils/logger.js"; // Adjust path as necessary
import chalk from "chalk";

// Mock chalk directly
vi.mock("chalk", () => ({
  default: {
    blue: vi.fn((text) => `chalk.blue(${text})`),
    green: vi.fn((text) => `chalk.green(${text})`),
    yellow: vi.fn((text) => `chalk.yellow(${text})`),
    red: vi.fn((text) => `chalk.red(${text})`),
    gray: vi.fn((text) => `chalk.gray(${text})`),
    bold: vi.fn((text) => `chalk.bold(${text})`),
  },
}));

describe("Logger", () => {
  let consoleLogSpy: any;
  let consoleTableSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
    vi.clearAllMocks(); // Clear mocks including chalk if they were set up differently
  });

  it("Logger.info should call console.log with chalk.blue", () => {
    Logger.info("Test info message");
    expect(chalk.blue).toHaveBeenCalledWith("Info: Test info message");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "chalk.blue(Info: Test info message)"
    );
  });

  it("Logger.success should call console.log with chalk.green", () => {
    Logger.success("Test success message");
    expect(chalk.green).toHaveBeenCalledWith("Success: Test success message");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "chalk.green(Success: Test success message)"
    );
  });

  it("Logger.warn should call console.log with chalk.yellow", () => {
    Logger.warn("Test warning message");
    expect(chalk.yellow).toHaveBeenCalledWith("Warning: Test warning message");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "chalk.yellow(Warning: Test warning message)"
    );
  });

  describe("Logger.error", () => {
    it("should call console.log with chalk.red (no metadata)", () => {
      Logger.error("Test error message");
      expect(chalk.red).toHaveBeenCalledWith("Error: Test error message");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "chalk.red(Error: Test error message)"
      );
    });

    it("should call console.log with chalk.red and metadata", () => {
      const metadata = { detail: "some detail" };
      Logger.error("Test error message with meta", metadata);
      expect(chalk.red).toHaveBeenCalledWith(
        "Error: Test error message with meta"
      );
      expect(chalk.red).toHaveBeenCalledWith(JSON.stringify(metadata, null, 2));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "chalk.red(Error: Test error message with meta)",
        `chalk.red(${JSON.stringify(metadata, null, 2)})`
      );
    });
  });

  describe("Logger.debug", () => {
    it("should call console.log with chalk.gray (no metadata)", () => {
      Logger.debug("Test debug message");
      expect(chalk.gray).toHaveBeenCalledWith("Debug: Test debug message");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "chalk.gray(Debug: Test debug message)"
      );
    });

    it("should call console.log with chalk.gray and metadata", () => {
      const metadata = { detail: "debug detail" };
      Logger.debug("Test debug message with meta", metadata);
      expect(chalk.gray).toHaveBeenCalledWith(
        "Debug: Test debug message with meta"
      );
      expect(chalk.gray).toHaveBeenCalledWith(
        JSON.stringify(metadata, null, 2)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "chalk.gray(Debug: Test debug message with meta)",
        `chalk.gray(${JSON.stringify(metadata, null, 2)})`
      );
    });
  });

  it("Logger.table should call console.table", () => {
    const data = [{ id: 1, name: "Test" }];
    Logger.table(data);
    expect(consoleTableSpy).toHaveBeenCalledWith(data);
  });

  it("Logger.divider should call console.log with chalk.gray", () => {
    Logger.divider();
    expect(chalk.gray).toHaveBeenCalledWith("--------------------------------");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "chalk.gray(--------------------------------)"
    );
  });

  it("Logger.title should call console.log with chalk.bold and dividers", () => {
    Logger.title("Test Title");
    expect(chalk.gray).toHaveBeenCalledWith("--------------------------------");
    expect(chalk.bold).toHaveBeenCalledWith("Test Title");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "chalk.gray(--------------------------------)"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("chalk.bold(Test Title)");
    // Logger.title calls divider twice
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
  });
});
