import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
}));
import * as fs from 'fs';
import { getSwaggerFiles } from '../../src/utils/swagger.js';
describe('Swagger Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fs.existsSync.mockReturnValue(false);
        fs.readdirSync.mockReturnValue([]);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe('getSwaggerFiles', () => {
        it('should return empty array if directory does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const result = getSwaggerFiles('/non/existent/dir');
            expect(result).toEqual([]);
            expect(fs.existsSync).toHaveBeenCalledWith('/non/existent/dir');
            expect(fs.readdirSync).not.toHaveBeenCalled();
        });
        it('should filter and return only swagger files', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                'api.yaml',
                'api.json',
                'api.yml',
                'readme.md',
                'config.ts'
            ]);
            const result = getSwaggerFiles('/swagger/dir');
            expect(result).toEqual(['api.yaml', 'api.json', 'api.yml']);
            expect(fs.existsSync).toHaveBeenCalledWith('/swagger/dir');
            expect(fs.readdirSync).toHaveBeenCalledWith('/swagger/dir');
        });
    });
});
//# sourceMappingURL=swagger.test.js.map