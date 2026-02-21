import type { Request, Response, NextFunction } from 'express';
/** Require authenticated session */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
/** Require user to have the given role */
export declare function requireRole(role: string): (req: Request, res: Response, next: NextFunction) => void;
/** Require admin role */
export declare const requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
/** Require professor or admin role */
export declare const requireProfOrAdmin: (req: Request, res: Response, next: NextFunction) => void;
/** Require user to be an instructor of the given course (param: courseId) */
export declare function requireInstructor(req: Request, res: Response, next: NextFunction): Promise<void>;
