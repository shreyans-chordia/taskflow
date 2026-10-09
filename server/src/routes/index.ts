import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as categories from '../controllers/categories.controller.js';
import * as priorities from '../controllers/priorities.controller.js';
import * as tasks from '../controllers/tasks.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

/** Express 5 forwards rejected promises from async handlers to the error handler, so no wrapper is needed. */
export const api = Router();

api.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const a = Router();
a.get('/csrf', auth.csrf);
a.post('/signup', authLimiter, auth.signup);
a.post('/login', authLimiter, auth.login);
a.post('/refresh', auth.refresh);
a.post('/logout', auth.logout);
a.post('/logout-all', requireAuth, auth.logoutAll);
a.get('/me', requireAuth, auth.me);
a.delete('/me', requireAuth, authLimiter, auth.deleteAccount);
api.use('/auth', a);

const t = Router();
t.use(requireAuth);
t.get('/', tasks.list);
t.post('/', tasks.create);
t.get('/:id', tasks.get);
t.patch('/:id', tasks.update);
t.delete('/:id', tasks.remove);
t.post('/:id/subtasks', tasks.addSubtask);
t.patch('/:id/subtasks/:subId', tasks.updateSubtask);
t.delete('/:id/subtasks/:subId', tasks.removeSubtask);
api.use('/tasks', t);

const c = Router();
c.use(requireAuth);
c.get('/', categories.list);
c.post('/', categories.create);
c.put('/order', categories.reorder);
c.patch('/:id', categories.update);
c.delete('/:id', categories.remove);
api.use('/categories', c);

const p = Router();
p.use(requireAuth);
p.get('/', priorities.list);
p.post('/', priorities.create);
p.put('/order', priorities.reorder);
p.patch('/:id', priorities.update);
p.delete('/:id', priorities.remove);
api.use('/priorities', p);
