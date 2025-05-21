import * as fs from "fs";
export function getSwaggerFiles(specDir) {
    if (!fs.existsSync(specDir))
        return [];
    return fs.readdirSync(specDir).filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
}
//# sourceMappingURL=swagger.js.map