import express, { Request, Response, NextFunction } from "express";
import path from "path";
import 'express-async-errors';
import dotenv from "dotenv";
dotenv.config();

import apiRouter from "./api";

const app = express();

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

// Catch-all 404 handler for unmatched routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler to catch unexpected errors and prevent crashes
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Dynamic port binding with retry logic
const portEnv = process.env.PORT ? Number(process.env.PORT) : undefined;
function startServer(port: number = portEnv || 3000): void {
  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, retrying on ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer();
// Handle uncaught exceptions and promise rejections to avoid crashes
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled Rejection:', reason));