import { phys, run, q1 } from "@/lib/csc-db";

// Best-effort writes into the LIVE n8n data tables so the operator dashboard
// (which reads n8n sqlite) sees web-chat orders too. If n8n is down / being
// restored, every write fails silently — the web chat keeps working because
// its own Prisma records are the source of truth.

export type N8nAppInput = {
  applicationId: string;
  appNumber: string;
  phone: string;
  name: string;
  serviceId: string;
  govFee: number;
  serviceCharge: number;
  gst: number;
  totalFee: number;
  formData: Record<string, string>;
  docs: { doc_key: string; mime_type: string; file_name: string }[];
  source: string;
};

const nowStr = () =>
  new Date().toISOString().replace("T", " ").slice(0, 19);

function jstr(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? "");
}

export function upsertCustomerN8n(phone: string, name: string) {
  try {
    const t = phys("customers");
    const existing = q1(`SELECT rowid FROM ${t} WHERE phone = ?`, jstr(phone));
    if (existing) {
      run(
        `UPDATE ${t} SET full_name = ?, updated_at = ? WHERE phone = ?`,
        jstr(name), nowStr(), jstr(phone)
      );
    } else {
      run(
        `INSERT INTO ${t} (phone, full_name, consent_status, created_at, updated_at) VALUES (?,?,?,?,?)`,
        jstr(phone), jstr(name), jstr("GRANTED"), nowStr(), nowStr()
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function insertApplicationN8n(a: N8nAppInput): boolean {
  try {
    const t = phys("applications");
    const fd = {
      ...a.formData,
      _source: a.source,
      _customer_name: a.name,
    };
    run(
      `INSERT INTO ${t} (application_id, customer_phone, service_id, status, gov_fee, service_charge, gst, total_fee, form_data, application_number, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      jstr(a.applicationId),
      jstr(a.phone),
      jstr(a.serviceId),
      jstr("PAYMENT_PENDING"),
      a.govFee,
      a.serviceCharge,
      a.gst,
      a.totalFee,
      jstr(JSON.stringify(fd)),
      jstr(a.appNumber),
      nowStr(),
      nowStr()
    );
  } catch {
    return false;
  }

  // field values
  try {
    const ft = phys("application_field_values");
    for (const [k, v] of Object.entries(a.formData)) {
      run(
        `INSERT INTO ${ft} (application_id, phone, field_key, field_value, validated, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
        jstr(a.applicationId), jstr(a.phone), jstr(k), jstr(v), jstr("TRUE"), nowStr(), nowStr()
      );
    }
  } catch { /* non-fatal */ }

  // documents
  try {
    const dt = phys("application_documents");
    a.docs.forEach((d, i) => {
      run(
        `INSERT INTO ${dt} (application_id, phone, doc_key, media_id, mime_type, ocr_text, status, created_at, verified_by) VALUES (?,?,?,?,?,?,?,?,?)`,
        jstr(a.applicationId), jstr(a.phone), jstr(d.doc_key),
        jstr(`WEB_${a.applicationId}_${i}`), jstr(d.mime_type), jstr(""),
        jstr("RECEIVED"), nowStr(), jstr("CUSTOMER")
      );
    });
  } catch { /* non-fatal */ }

  // status history
  try {
    const ht = phys("application_status_history");
    run(
      `INSERT INTO ${ht} (application_id, application_number, old_status, new_status, note, created_at) VALUES (?,?,?,?,?,?)`,
      jstr(a.applicationId), jstr(a.appNumber), jstr(""), jstr("PAYMENT_PENDING"),
      jstr(`Web chatbot se banaya (${a.source})`), nowStr()
    );
  } catch { /* non-fatal */ }

  // payment record
  try {
    const pt = phys("payments");
    run(
      `INSERT INTO ${pt} (payment_id, application_id, customer_phone, amount, gateway, transaction_id, status, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      jstr(`PAYWEB${a.applicationId.slice(-10)}`), jstr(a.applicationId), jstr(a.phone),
      a.totalFee, jstr("UPI_MANUAL"), jstr(""), jstr("PENDING"), nowStr(), jstr("")
    );
  } catch { /* non-fatal */ }

  // operator task
  try {
    const ot = phys("operator_tasks");
    run(
      `INSERT INTO ${ot} (task_id, application_id, application_number, operator_phone, status, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      jstr(`TASKWEB${a.applicationId.slice(-8)}`), jstr(a.applicationId), jstr(a.appNumber),
      jstr(""), jstr("PENDING"), jstr("Web chatbot se aya — customer ke docs chat me he"), nowStr(), nowStr()
    );
  } catch { /* non-fatal */ }

  return true;
}
