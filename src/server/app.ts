import express, { Request, Response } from 'express';

const app = express();
const port = 5000;

// Middleware to parse JSON
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.jsonp({ message: 'Hello World' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
