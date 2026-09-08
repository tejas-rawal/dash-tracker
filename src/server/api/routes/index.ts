import { Router } from "express";
import busRoutes from "./busRoutes";
import favoriteRoutes from "./favoriteRoutes";
import predictionRoutes from "./predictionRoutes";
import recentRoutes from "./recentRoutes";
import stopRoutes from "./stopRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
router.use("/stops", stopRoutes);
router.use("/favorites", favoriteRoutes);
router.use("/recents", recentRoutes);
// Add other domain routes here
// router.use('/vehicles', vehicleRoutes);

export default router;
