import db from '../../../src/db.js';
// GET /users with pagination and censor email
export const getusers = async (req, res) => {
    let data = await db.get(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
    data = data || [];
    // Censor email
    data = data.map((user) => ({ ...user, email: user.email ? '***' : undefined }));
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);
    res.json(paginated);
};
// Forced error endpoint
export const errorusers = async (req, res) => {
    res.status(500).json({ error: 'Forced error for testing' });
};
export const postusers = async (req, res) => {
    const data = await db.create(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
    res.status(201).json(data);
};
export const getusersById = async (req, res) => {
    const data = await db.get(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
    if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(data);
};
export const putusersById = async (req, res) => {
    const data = await db.update(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
    if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(data);
};
export const patchusersById = async (req, res) => {
    const data = await db.patch(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]), req.body);
    if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(data);
};
export const deleteusersById = async (req, res) => {
    await db.delete(req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p]));
    res.status(204).send();
};
//# sourceMappingURL=index.js.map