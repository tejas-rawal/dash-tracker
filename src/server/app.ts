import express from 'express';
import { router } from './api/routes';
import winston from 'winston';

const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

app.get('/', (_req, res) => {
	res.jsonp({ message: 'Hello World' });
});

// V1 API
app.use('/api/v1', router);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

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
