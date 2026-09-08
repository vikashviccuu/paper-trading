import { Router } from "express";
import path from "path";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { uploadKycDocument } from "../middleware/upload.middleware";
import { kycService } from "../services/KycService";
import { AppError } from "../engine/OrderEngine";

export const kycRouter = Router();
kycRouter.use(requireAuth);

kycRouter.get("/", async (req: AuthedRequest, res) => {
  const kyc = await kycService.getOrCreateKyc(req.userId!);
  const documents = await kycService.listDocuments(req.userId!);
  res.json({ ...kyc, documents });
});

const panSchema = z.object({
  panNumber: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, "Enter a valid 10-character PAN (e.g. ABCDE1234F)"),
  fullName: z.string().min(1),
  dateOfBirth: z.string().optional(),
});

kycRouter.post("/pan/verify", async (req: AuthedRequest, res) => {
  const parsed = panSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { panNumber, fullName, dateOfBirth } = parsed.data;
  const { kyc, result } = await kycService.verifyPan(req.userId!, panNumber, fullName, dateOfBirth);
  res.json({ kyc, verification: result });
});

const documentTypeSchema = z.enum(["PAN_CARD", "AADHAAR_FRONT", "AADHAAR_BACK", "ADDRESS_PROOF", "BANK_PROOF", "PHOTO"]);

kycRouter.post("/documents", uploadKycDocument.single("document"), async (req: AuthedRequest, res) => {
  const typeParsed = documentTypeSchema.safeParse(req.body.type);
  if (!typeParsed.success) return res.status(400).json({ error: "Invalid or missing document type" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name must be 'document')" });

  const doc = await kycService.addDocument(req.userId!, typeParsed.data, req.file.path, req.file.originalname, req.file.mimetype);
  res.status(201).json(doc);
});

kycRouter.get("/documents", async (req: AuthedRequest, res) => {
  const docs = await kycService.listDocuments(req.userId!);
  res.json(docs);
});

kycRouter.get("/documents/:id/file", async (req: AuthedRequest, res) => {
  try {
    const doc = await kycService.getDocumentForOwnerOrAdmin(req.params.id, req.userId!);
    res.sendFile(path.resolve(doc.filePath));
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

kycRouter.post("/submit", async (req: AuthedRequest, res) => {
  try {
    const kyc = await kycService.submitForReview(req.userId!);
    res.json(kyc);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});
