import type { Request, Response } from 'express';
export declare const getusers: (req: Request, res: Response) => Promise<void>;
export declare const errorusers: (req: Request, res: Response) => Promise<void>;
export declare const postusers: (req: Request, res: Response) => Promise<void>;
export declare const getusersById: (req: Request, res: Response) => Promise<void>;
export declare const putusersById: (req: Request, res: Response) => Promise<void>;
export declare const patchusersById: (req: Request, res: Response) => Promise<void>;
export declare const deleteusersById: (req: Request, res: Response) => Promise<void>;
