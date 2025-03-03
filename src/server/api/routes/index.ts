import { Router } from 'express';
import busRoutes from './busRoutes';

const router = Router();

router.use('/routes', busRoutes);
// Add other domain routes here
// router.use('/stops', busStopRoutes);
// router.use('/vehicles', vehicleRoutes);

export default router;
