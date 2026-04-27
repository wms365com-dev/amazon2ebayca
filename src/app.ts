import cookieParser from "cookie-parser";
import express from "express";
import path from "path";

import router from "./routes";
import webhookRouter from "./routes/webhooks";
import { httpLogger } from "./config/logger";
import { getAppSettings } from "./services/settingsService";
import { isDemoModeActive } from "./services/demo/demoMode";
import { csrfTokenMiddleware, verifyCsrfMiddleware } from "./utils/csrf";
import { formatCurrency, formatDateTime, formatPercent } from "./utils/format";

export function createApp() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(process.cwd(), "src", "views"));

  app.use(httpLogger);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(process.cwd(), "src", "public")));
  app.use("/webhooks", webhookRouter);
  app.use(csrfTokenMiddleware);
  app.use(verifyCsrfMiddleware);

  app.use((req, res, next) => {
    void (async () => {
      const settings = await getAppSettings();
      res.locals.appName = "Amazon.ca <-> eBay.ca Arbitrage Analyzer";
      res.locals.currentPath = req.path;
      res.locals.notice = req.query.notice;
      res.locals.error = req.query.error;
      res.locals.settings = settings;
      res.locals.formatCurrency = formatCurrency;
      res.locals.formatPercent = formatPercent;
      res.locals.formatDateTime = formatDateTime;
      res.locals.isDemoMode = isDemoModeActive(settings);
      next();
    })().catch(next);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.use(router);

  app.use((req, res) => {
    res.status(404).render("error", {
      title: "Page not found",
      message: "The requested page could not be found."
    });
  });

  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).render("error", {
      title: "Application error",
      message: error.message || "Unexpected application error"
    });
  });

  return app;
}
