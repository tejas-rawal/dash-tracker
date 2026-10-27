import express from "express";
import router from "../api/routes";
import { environment } from "../config";

const app = express();
app.set("trust proxy", environment.server.trustProxyHops);
app.use(express.json());

app.get("/", (_req, res) => {
    res.jsonp({ message: "Hello World" });
});

app.use("/api/v1", router);

export default app;
