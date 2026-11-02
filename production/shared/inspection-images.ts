import { z } from "zod";
export const inspectionCategories = [
  "Phiếu kiểm hàng",
  "Phiếu giao hàng",
  "Biên bản đối soát",
  "Khác",
] as const;
export const inspectionMetadataSchema = z
  .object({
    inspectionDate: z.iso.date(),
    category: z.enum(inspectionCategories),
    note: z.string().trim().max(1000).default(""),
  })
  .strict();
export const inspectionFilesSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(250),
        data: z.string().min(8).max(11200000),
      })
      .strict(),
  )
  .max(4);
export const inspectionUploadSchema = inspectionMetadataSchema
  .extend({ images: inspectionFilesSchema.min(1) })
  .strict();
export const inspectionEditSchema = inspectionMetadataSchema
  .extend({ expectedVersion: z.number().int().min(0) })
  .strict();
export type InspectionTarget = { kind: "draft" | "receipt"; id: string };
export type InspectionImage = {
  id: string;
  name: string;
  mime: string;
  sha256: string;
  byteCount: number;
  target: InspectionTarget;
  source: "manual" | "json" | "direct";
  state: string;
  code: string;
  receiptDate: string;
  inspectionDate: string;
  dateSource: "classified" | "json" | "receipt" | "created";
  category: (typeof inspectionCategories)[number];
  note: string;
  version: number;
  uploadedAt: string | null;
  uploader: string | null;
  supplier: string;
  products: string[];
  colors: string[];
  orders: { id: string; code: string }[];
  canWrite: boolean;
  canOpenDraft: boolean;
};
export type InspectionBundle = {
  target: InspectionTarget;
  code: string;
  canWrite: boolean;
  images: InspectionImage[];
};
export type InspectionArchiveResult = {
  images: InspectionImage[];
  total: number;
  slips: number;
  bytes: number;
  inferred: number;
  page: number;
  pageSize: number;
  months: { month: string; count: number }[];
};
