import type { CLIOptions } from './types.js';
export declare class MockGenerator {
    private specDir;
    private outDir;
    constructor(specDir: string, outDir: string);
    generate(): Promise<void>;
    private generateMockData;
    private getResourcePath;
    private getRequestBodySchema;
    private generateMockItem;
    private generateMockValue;
}
export declare function populate(opts: CLIOptions): Promise<void>;
