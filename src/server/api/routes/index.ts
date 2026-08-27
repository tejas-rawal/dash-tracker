import { Router } from "express";
import busRoutes from "./busRoutes";
import predictionRoutes from "./predictionRoutes";
import stopRoutes from "./stopRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
router.use("/stops", stopRoutes);
// Add other domain routes here
// router.use('/vehicles', vehicleRoutes);

export default router;
