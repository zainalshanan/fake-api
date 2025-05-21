import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
vi.mock('fs', () => ({
    default: {
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
}));
import * as fs from 'fs';
import path from 'path';
import { ensureDirs, writeJsonFile } from '../../src/utils/file.js';
describe('File Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fs.mkdirSync.mockImplementation(() => undefined);
        fs.writeFileSync.mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe('ensureDirs', () => {
        it('should create directories with recursive option', () => {
            const testDir = '/test/path';
            ensureDirs(testDir);
            expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true });
        });
    });
    describe('writeJsonFile', () => {
        it('should write JSON data to file with proper formatting', () => {
            const testFile = '/test/data.json';
            const testData = { name: 'Test', value: 123 };
            writeJsonFile(testFile, testData);
            expect(fs.writeFileSync).toHaveBeenCalledWith(testFile, JSON.stringify(testData, null, 2));
        });
    });
});
//# sourceMappingURL=file.test.js.map