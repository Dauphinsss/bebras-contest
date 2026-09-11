import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "cloudflare:workers";

function jwtSecret() {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  return env.JWT_SECRET;
}
const TOKEN_TTL = "7d";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    jwtSecret(),
    { expiresIn: TOKEN_TTL },
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] }) as jwt.JwtPayload;
    req.user = {
      id: Number(payload.sub),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? ""),
    };
    next();
  } catch {
    res.status(401).json({ message: "Sesión inválida o expirada." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ message: "Acceso solo para administradores." });
      return;
    }

    next();
  });
}
