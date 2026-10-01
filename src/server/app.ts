import express from "express";
import { BusDataRepository, FavoritesRecentsRepository, ServiceAlertRepository } from "./api/repositories";
import router from "./api/routes";
import { createBusDataRefreshService } from "./api/services/BusDataRefreshService";
import { createServiceAlertPollService } from "./api/services/ServiceAlertPollService";
import { createServiceAlertService } from "./api/services/ServiceAlertService";
import { environment, logger, registerProcessErrorHandlers } from "./config";

// Registered before anything else starts, so rejections during boot are caught too.
registerProcessErrorHandlers();

const app = express();
const port = environment.server.port;

// Middleware to parse JSON
app.use(express.json());

app.get("/", (_req, res) => {
    res.jsonp({ message: "Hello World" });
});

// V1 API
app.use("/api/v1", router);

const SHUTDOWN_GRACE_MS = 10_000;

const favoritesRecentsRepository = FavoritesRecentsRepository.getInstance();

// Both background loops are built here but only started once the server is listening. DASH being
// unreachable must never keep the server down: route/stop data loads in the background and
// data-dependent endpoints answer 503 until it lands.
const refreshService = createBusDataRefreshService(BusDataRepository.getInstance());
const serviceAlertPollService = createServiceAlertPollService(
    createServiceAlertService(),
    ServiceAlertRepository.getInstance(),
);

// SQLite is local and backs favorites/recents, so failing to open it is fatal. DASH is not (D-18).
favoritesRecentsRepository
    .initialize()
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });
        refreshService.start();
        serviceAlertPollService.start();

        // graceful shutdown
        const shutdown = (): void => {
            refreshService.stop();
            server.close(async (): Promise<void> => {
                // Nothing awaits this callback, and the unhandledRejection handler deliberately keeps the
                // process alive, so a failed close must exit here or shutdown hangs until SIGKILL.
                try {
                    await favoritesRecentsRepository.close();
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    logger.error(`Shutdown failed: ${message}`);
                    process.exit(1);
                }
                logger.info("Server is gracefully shutting down");
                process.exit(0);
            });
            // server.close waits for every open connection, and SSE streams never end on their own, so one
            // connected rider would block shutdown until SIGKILL. Past the grace period, in-flight requests
            // have had a full default DASH deadline to finish and the remaining connections are dropped.
            setTimeout((): void => server.closeAllConnections(), SHUTDOWN_GRACE_MS);
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize the favorites/recents database: ${message}`);
        process.exit(1);
    });
