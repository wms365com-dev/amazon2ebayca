import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

function isCsrfExemptPath(path: string) {
  return path.startsWith("/webhooks/");
}

function ensureToken(req: Request, res: Response) {
  const existing = req.cookies?.csrfToken as string | undefined;
  const token = existing || crypto.randomBytes(24).toString("hex");

  if (!existing) {
    res.cookie("csrfToken", token, {
      sameSite: "lax",
      httpOnly: false
    });
  }

  res.locals.csrfToken = token;
  return token;
}

export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isCsrfExemptPath(req.path)) {
    next();
    return;
  }

  ensureToken(req, res);
  next();
}

export function verifyCsrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isCsrfExemptPath(req.path)) {
    next();
    return;
  }

  const token = ensureToken(req, res);

  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  if (req.body?._csrf !== token) {
    res.status(403).render("error", {
      title: "Invalid form token",
      message: "The form token was invalid or expired. Please refresh the page and try again."
    });
    return;
  }

  next();
}
