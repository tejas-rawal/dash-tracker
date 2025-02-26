import express from 'express';
import router from './api/routes';
import { environment, logger } from './config'

const app = express();
const port = environment.server.port;

// Middleware to parse JSON
app.use(express.json());

app.get('/', (_req, res) => {
    res.jsonp({ message: 'Hello World' });
});

// V1 API
app.use('/api/v1', router);

const server = app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});

// graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        logger.info('Server is gracefully shutting down');
        process.exit(0);
    });
});
