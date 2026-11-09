import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import employeeRoutes from "./routes/employeeRoutes.js";
import podRoutes from "./routes/podRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import processRoutes from "./routes/processRoutes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/pods", podRoutes);
app.use("/api/v1/brands", brandRoutes);
app.use("/api/v1/processes", processRoutes);

// System Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "smart-roster-backend",
    version: "1.0.0",
  });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`🚀 Smart Roster API running at http://localhost:${port}`);
  });
}
