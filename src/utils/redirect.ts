import { Response } from "express";

export function redirectWithNotice(
  res: Response,
  path: string,
  params: Record<string, string | number | undefined | null> = {}
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  res.redirect(query.size > 0 ? `${path}?${query.toString()}` : path);
}
