import * as fs from "fs";
export function ensureDirs(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
export function writeJsonFile(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}
//# sourceMappingURL=file.js.map