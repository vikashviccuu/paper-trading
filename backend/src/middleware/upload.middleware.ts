import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import { env } from "../config/env";
import { AuthedRequest } from "./auth.middleware";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/**
 * Writes KYC document uploads under KYC_UPLOAD_DIR/<userId>/, one file per
 * upload, filenames randomized to avoid collisions/guessing. This is local
 * disk storage for demo purposes - see docs/KYC_AND_BANKING.md#security-notes
 * for what a production deployment needs instead (private S3/GCS bucket,
 * virus scanning, encryption at rest).
 */
const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const userId = (req as AuthedRequest).userId!;
    const dir = path.join(env.KYC_UPLOAD_DIR, userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const random = Math.random().toString(36).slice(2, 10);
    cb(null, `${Date.now()}-${random}${ext}`);
  },
});

export const uploadKycDocument = multer({
  storage,
  limits: { fileSize: env.KYC_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WebP or PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});
