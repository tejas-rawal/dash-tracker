import { Router } from 'express';
import { getAllRoutes, getRoute } from '../controllers/BusRouteController';

const router = Router();

router.get('/all', getAllRoutes);
router.get('/:shortName', getRoute);

export default router;
