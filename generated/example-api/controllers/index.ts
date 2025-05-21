import type { Request, Response } from 'express';
import db from '../../../src/db.js';

export const getusers = async (req: Request, res: Response) => {
  const data = await db.get(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
  res.json(data || []);
};

export const postusers = async (req: Request, res: Response) => {
  const data = await db.create(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
  res.status(201).json(data);
};

export const getusersById = async (req: Request, res: Response) => {
  const data = await db.get(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};

export const putusersById = async (req: Request, res: Response) => {
  const data = await db.update(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};

export const patchusersById = async (req: Request, res: Response) => {
  const data = await db.patch(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};

export const deleteusersById = async (req: Request, res: Response) => {
  await db.delete(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
  res.status(204).send();
};
