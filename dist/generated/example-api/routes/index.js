import express from 'express';
import * as controllers from '../controllers/index.js';
const router = express.Router();
router.get('/users', controllers.getusers);
router.post('/users', controllers.postusers);
router.get('/users/{userId}', controllers.getusersById);
router.put('/users/{userId}', controllers.putusersById);
router.patch('/users/{userId}', controllers.patchusersById);
router.delete('/users/{userId}', controllers.deleteusersById);
router.get('/users/error', controllers.errorusers);
export default router;
//# sourceMappingURL=index.js.map