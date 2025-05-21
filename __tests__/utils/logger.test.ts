import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn().mockImplementation((text) => text),
    green: vi.fn().mockImplementation((text) => text),
    yellow: vi.fn().mockImplementation((text) => text),
    red: vi.fn().mockImplementation((text) => text),
    gray: vi.fn().mockImplementation((text) => text),
    bold: vi.fn().mockImplementation((text) => text)
  }
}));
import chalk from 'chalk';
import { Logger } from '../../src/utils/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info message with blue color', () => {
      Logger.info('Test info message');
      
      expect(chalk.blue).toHaveBeenCalledWith('Info: Test info message');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should log success message with green color', () => {
      Logger.success('Test success message');
      
      expect(chalk.green).toHaveBeenCalledWith('Success: Test success message');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warning message with yellow color', () => {
      Logger.warn('Test warning message');
      
      expect(chalk.yellow).toHaveBeenCalledWith('Warning: Test warning message');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error message with red color', () => {
      Logger.error('Test error message');
      
      expect(chalk.red).toHaveBeenCalledWith('Error: Test error message');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug message with gray color', () => {
      Logger.debug('Test debug message');
      
      expect(chalk.gray).toHaveBeenCalledWith('Debug: Test debug message');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('table', () => {
    it('should log table data', () => {
      const data = [{ id: 1, name: 'Test' }];
      Logger.table(data);
      
      expect(console.table).toHaveBeenCalledWith(data);
    });
  });

  describe('divider', () => {
    it('should log a divider line', () => {
      Logger.divider();
      
      expect(chalk.gray).toHaveBeenCalledWith('--------------------------------');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('title', () => {
    it('should log a title with dividers', () => {
      Logger.title('Test Title');
      
      expect(chalk.bold).toHaveBeenCalledWith('Test Title');
      expect(chalk.gray).toHaveBeenCalledWith('--------------------------------');
      expect(console.log).toHaveBeenCalledTimes(3);
    });
  });
}); 