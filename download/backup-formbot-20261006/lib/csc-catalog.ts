import { db } from "@/lib/db";

// CSC Smart Seva — catalog reader for the WEB chatbot.
// Source of truth = portal Prisma DB (seeded from datatables-backup.json),
// so the chatbot works even when the n8n sandbox is down / being restored.

export type Svc = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  government_fee: number;
  service_charge: number;
  gst_percent: number;
  total_fee: number;
  operator_required: boolean;
  otp_required: boolean;
  processing_steps: string[];
};

export type FieldRow = {
  field_key: string;
  field_order: number;
  label: string;
  field_type: string;
  question: string;
  required: boolean;
  options: string[];
  error_hint: string;
};

export type DocRow = {
  doc_key: string;
  doc_order: number;
  label: string;
  accepted_types: string;
  question: string;
  required: boolean;
};

const truthy = (v: string | null | undefined) =>
  String(v ?? "").toUpperCase().includes("TRUE");

const parseSteps = (v: string | null | undefined): string[] => {
  const s = String(v ?? "").trim();
  if (!s.startsWith("[")) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
};

export async function getServices(): Promise<Svc[]> {
  const rows = await db.serviceCatalog.findMany({
    orderBy: { serviceName: "asc" },
  });
  const seen = new Set<string>();
  const out: Svc[] = [];
  for (const r of rows) {
    if (seen.has(r.serviceId)) continue;
    seen.add(r.serviceId);
    out.push({
      service_id: r.serviceId,
      service_name: r.serviceName,
      category: r.category ?? "",
      description: r.description ?? "",
      government_fee: r.governmentFee ?? 0,
      service_charge: r.serviceCharge ?? 0,
      gst_percent: r.gstPercent ?? 18,
      total_fee: r.totalFee ?? 0,
      operator_required: truthy(r.operatorRequired),
      otp_required: truthy(r.otpRequired),
      processing_steps: parseSteps(r.processingSteps),
    });
  }
  return out;
}

export async function getFields(serviceId: string): Promise<FieldRow[]> {
  const rows = await db.serviceField.findMany({
    where: { serviceId },
    orderBy: { fieldOrder: "asc" },
  });
  return rows.map((r) => ({
    field_key: r.fieldKey,
    field_order: r.fieldOrder,
    label: r.label,
    field_type: r.fieldType || "TEXT",
    question: r.question || `Aapka ${r.label}?`,
    required: truthy(r.required),
    options: (r.options || "")
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    error_hint: r.errorHint || `${r.label} sahi format me likhein.`,
  }));
}

export async function getDocs(serviceId: string): Promise<DocRow[]> {
  const rows = await db.serviceDocument.findMany({
    where: { serviceId },
    orderBy: { docOrder: "asc" },
  });
  return rows.map((r) => ({
    doc_key: r.docKey,
    doc_order: r.docOrder,
    label: r.label,
    accepted_types: r.acceptedTypes || "image,pdf",
    question: r.question || `${r.label} ki photo bhejein?`,
    required: truthy(r.required),
  }));
}

export async function getConfigMap(): Promise<Record<string, string>> {
  const rows = await db.systemConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.configKey] = r.configValue ?? "";
  return map;
}
