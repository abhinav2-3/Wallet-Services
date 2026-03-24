import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ErrorCode } from "../types/enums";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formatted = formatZodError(result.error);
      res.status(400).json({
        success: false,
        requestId: req.requestId,
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: "Validation failed",
          details: formatted,
        },
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((acc, issue) => {
    const path = issue.path.join(".") || "root";
    if (!acc[path]) acc[path] = [];
    acc[path].push(issue.message);
    return acc;
  }, {});
}
