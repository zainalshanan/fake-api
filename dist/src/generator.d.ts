export declare class Generator {
    private specDir;
    private outDir;
    constructor(specDir: string, outDir: string);
    generate(): Promise<void>;
    private generateApiFiles;
    private generateOperationId;
    private generateRouteFile;
    private generateControllers;
    private generateControllerFunction;
}
