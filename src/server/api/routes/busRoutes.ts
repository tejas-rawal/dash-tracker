import { Router } from 'express';
import { createBusRouteController } from '../controllers/BusRouteController';
import { createBusRouteService } from '../services/BusRouteService';
import { BusDataRepository } from '../repositories';

const service = createBusRouteService(BusDataRepository.getInstance());
const controller = createBusRouteController(service);

const router = Router();

router.get('/all', controller.getAllRoutes);
router.get('/:shortName', controller.getRoute);

export default router;
