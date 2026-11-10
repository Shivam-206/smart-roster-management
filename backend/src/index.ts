import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import employeeRoutes from "./routes/employeeRoutes.js";
import podRoutes from "./routes/podRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import processRoutes from "./routes/processRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import holidayRoutes from "./routes/holidayRoutes.js";
import rosterRoutes from "./routes/rosterRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { authenticate, requireCsrf } from "./auth.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain the deployed frontend origin in production");
}

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "100kb" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", authenticate, requireCsrf);

app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/pods", podRoutes);
app.use("/api/v1/brands", brandRoutes);
app.use("/api/v1/processes", processRoutes);
app.use("/api/v1/assignments", assignmentRoutes);
app.use("/api/v1/availability", availabilityRoutes);
app.use("/api/v1/holidays", holidayRoutes);
app.use("/api/v1/rosters", rosterRoutes);

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
