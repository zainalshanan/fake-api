export declare class Logger {
    static info(message: string): void;
    static success(message: string): void;
    static warn(message: string): void;
    static error(message: string): void;
    static debug(message: string): void;
    static table(data: any[]): void;
    static divider(): void;
    static title(title: string): void;
}
