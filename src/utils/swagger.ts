import fs from "fs";

export function getSwaggerFiles(specDir: string): string[] {
    if (!fs.existsSync(specDir)) return [];
    return fs.readdirSync(specDir).filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
}
