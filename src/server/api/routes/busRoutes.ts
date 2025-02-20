import { Router } from 'express';
import { getAllRoutes } from '../controllers/BusRouteController';

const router = Router();

router.get('/all', getAllRoutes);

export default router;
