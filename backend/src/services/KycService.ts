import { prisma } from "../utils/prisma";
import { getKycProvider } from "../kyc/KycProviderFactory";
import { AppError } from "../engine/OrderEngine";

const REQUIRED_DOCUMENT_TYPES = ["PAN_CARD", "ADDRESS_PROOF", "PHOTO"] as const;

/**
 * KYC has two verification legs, matching how a real Indian broker/fintech
 * onboarding flow works:
 *   1. Automated: PAN verification against NSDL/issuer records via a
 *      pluggable provider (Setu/Cashfree/Mock - see kyc/IKycProvider.ts).
 *      This alone doesn't fully verify identity, so:
 *   2. Manual: the user uploads supporting documents (PAN card image,
 *      Aadhaar, address proof, photo), then submits for an admin to review
 *      and approve/reject (see routes/adminKyc.routes.ts) - the same admin
 *      accounts that manage contests (docs/ADMIN.md).
 */
export class KycService {
  async getOrCreateKyc(userId: string) {
    return prisma.kyc.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async verifyPan(userId: string, panNumber: string, fullName: string, dateOfBirth?: string) {
    const provider = getKycProvider();
    const result = await provider.verifyPan(panNumber.toUpperCase(), fullName, dateOfBirth);

    const kyc = await this.getOrCreateKyc(userId);
    const updated = await prisma.kyc.update({
      where: { id: kyc.id },
      data: {
        panNumber: panNumber.toUpperCase(),
        panVerified: result.valid,
        panVerifiedAt: result.valid ? new Date() : null,
        panVerificationProvider: provider.providerName,
        panVerificationRaw: result.raw as any,
        status: kyc.status === "NOT_STARTED" && result.valid ? "DOCUMENTS_PENDING" : kyc.status,
      },
    });

    return { kyc: updated, result };
  }

  async addDocument(userId: string, type: string, filePath: string, originalFileName: string, mimeType: string) {
    const kyc = await this.getOrCreateKyc(userId);
    const doc = await prisma.kycDocument.create({
      data: { kycId: kyc.id, type: type as any, filePath, originalFileName, mimeType },
    });
    if (kyc.status === "NOT_STARTED") {
      await prisma.kyc.update({ where: { id: kyc.id }, data: { status: "DOCUMENTS_PENDING" } });
    }
    return doc;
  }

  async listDocuments(userId: string) {
    const kyc = await this.getOrCreateKyc(userId);
    return prisma.kycDocument.findMany({ where: { kycId: kyc.id }, orderBy: { uploadedAt: "desc" } });
  }

  async getDocumentForOwnerOrAdmin(documentId: string, userId?: string) {
    const doc = await prisma.kycDocument.findUnique({ where: { id: documentId }, include: { kyc: true } });
    if (!doc) throw new AppError(404, "Document not found");
    if (userId && doc.kyc.userId !== userId) throw new AppError(403, "Not your document");
    return doc;
  }

  async submitForReview(userId: string) {
    const kyc = await prisma.kyc.findUnique({ where: { userId }, include: { documents: true } });
    if (!kyc) throw new AppError(404, "Start KYC by verifying your PAN first");
    if (!kyc.panVerified) throw new AppError(400, "Verify your PAN before submitting for review");

    const uploadedTypes = new Set(kyc.documents.map((d) => d.type));
    const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !uploadedTypes.has(t));
    if (missing.length > 0) {
      throw new AppError(400, `Upload these documents before submitting: ${missing.join(", ")}`);
    }

    return prisma.kyc.update({
      where: { id: kyc.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  }

  async listPendingForReview() {
    return prisma.kyc.findMany({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      include: { user: { select: { id: true, name: true, email: true } }, documents: true },
      orderBy: { submittedAt: "asc" },
    });
  }

  async getForAdmin(userId: string) {
    const kyc = await prisma.kyc.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } }, documents: true },
    });
    if (!kyc) throw new AppError(404, "This user hasn't started KYC");
    return kyc;
  }

  async approve(adminId: string, userId: string) {
    const kyc = await prisma.kyc.findUnique({ where: { userId } });
    if (!kyc) throw new AppError(404, "This user hasn't started KYC");
    return prisma.kyc.update({
      where: { id: kyc.id },
      data: { status: "VERIFIED", reviewedAt: new Date(), reviewedByAdminId: adminId, rejectionReason: null },
    });
  }

  async reject(adminId: string, userId: string, reason: string) {
    const kyc = await prisma.kyc.findUnique({ where: { userId } });
    if (!kyc) throw new AppError(404, "This user hasn't started KYC");
    return prisma.kyc.update({
      where: { id: kyc.id },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedByAdminId: adminId, rejectionReason: reason },
    });
  }
}

export const kycService = new KycService();
