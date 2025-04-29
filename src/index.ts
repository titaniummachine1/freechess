import express from "express";
import path from "path";
import dotenv from "dotenv";
// Use require for dev dependencies that might have module resolution issues
const livereload = require("livereload");
const connectLiveReload = require("connect-livereload");
dotenv.config();

import apiRouter from "./api";

// Setup livereload server
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(path.join(__dirname, "../dist/public")); // Watch the output public dir
liveReloadServer.watch(path.join(__dirname, "public"));      // Watch the source public dir

// Refresh browser on server restart
liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100); // Delay slightly to ensure server is ready
});

const app = express();

// Inject livereload script
app.use(connectLiveReload());

app.use(express.json());

app.use("/static",
    express.static("dist/public"),
    express.static("src/public")
);

app.use("/api", apiRouter);

app.get("/", async (req, res) => {
    res.sendFile(path.resolve("src/public/pages/report/index.html"));
});

app.get("/privacy", async (req, res) => {
    res.sendFile(path.resolve("src/public/pages/privacy/index.html"));
});

const server = app.listen(process.env.PORT || 3000, () => {
    const address = server.address();
    const port = typeof address === 'string' ? address : address?.port;
    console.log(`Server running on http://localhost:${port}`);
});