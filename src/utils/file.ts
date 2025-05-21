import fs from "fs";

export function ensureDirs(dir: string) {
    fs.mkdirSync(dir, { recursive: true }) }

export function writeJsonFile(filepath: string, data: any)
{
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

