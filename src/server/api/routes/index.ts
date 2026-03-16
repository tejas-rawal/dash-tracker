import { Router } from "express";
import busRoutes from "./busRoutes";
import predictionRoutes from "./predictionRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
// Add other domain routes here
// router.use('/stops', busStopRoutes);
// router.use('/vehicles', vehicleRoutes);

export default router;
