import { Router } from "express";
import busRoutes from "./busRoutes";
import favoriteRoutes from "./favoriteRoutes";
import predictionRoutes from "./predictionRoutes";
import stopRoutes from "./stopRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
router.use("/stops", stopRoutes);
router.use("/favorites", favoriteRoutes);
// Add other domain routes here
// router.use('/vehicles', vehicleRoutes);

export default router;
