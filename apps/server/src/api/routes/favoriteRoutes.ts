import { Router } from "express";
import { createFavoritesController } from "../controllers/FavoritesController";
import { requireDeviceId } from "../middleware/requireDeviceId";
import { BusDataRepository, FavoritesRecentsRepository } from "../repositories";
import { createFavoritesService } from "../services/FavoritesService";

const favoritesRepository = FavoritesRecentsRepository.getInstance();
const busDataRepository = BusDataRepository.getInstance();
const service = createFavoritesService(favoritesRepository, busDataRepository);
const controller = createFavoritesController(service);

const router = Router();

router.use(requireDeviceId);

router.post("/", controller.favorite);
router.delete("/:entityType/:entityId", controller.unfavorite);
router.get("/", controller.listFavorites);

export default router;
