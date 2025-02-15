import { Router } from 'express';

export const router = Router();

// Define routes for bus routes
router.get('/routes', (_req, res) => {
	res.jsonp({ message: 'Hello World' });
});

// Add more routes as needed for other entities
// e.g., router.post('/routes', RoutesController.create);
