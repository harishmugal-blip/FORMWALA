// CSC Smart Seva - n8n Workflow Builder (Phase 1)
// Builds 4 workflow JSONs ready for `n8n import:workflow`
import { writeFileSync } from "node:fs";

const CRED_ID = "f480f6ea-d1b8-420c-980c-f0b6ad8ba865"; // Google Gemini API (CSC)
const WF_C = "3c5c0001-0000-4000-8000-000000000003"; // Service Catalog Engine
const WF_D = "3c5c0002-0000-4000-8000-000000000004"; // Customer Profile Engine
const WF_B = "3c5c0003-0000-4000-8000-000000000002"; // AI Intent Engine
const WF_A = "3c5c0004-0000-4000-8000-000000000001"; // WhatsApp Main Router

const conn = (node, type = "main", index = 0) => ({ node, type, index });
const wrap = (from, to, type = "main") => ({ [from]: { [type]: [[conn(to, type)]] } });
const mergeConn = (obj, add) => {
  for (const [k, v] of Object.entries(add)) {
    if (!obj[k]) obj[k] = v;
    else for (const t of Object.keys(v)) obj[k][t] = [...(obj[k][t] || []), ...v[t]];
  }
  return obj;
};

// ============================================================
// WF C: SERVICE CATALOG ENGINE
// ============================================================
const catalogCode = `// CSC SERVICE ENGINE - Central Service Catalog (spec section 3)
// Admin/add-new-service: yahan naya entry add karein (ya Admin Panel - Phase 10 se)
const gst = (charge, pct = 18) => Math.round(charge * pct / 100);
const mk = (o) => ({ status_tracking: true, receipt_required: true, active: true, ...o, gst: o.gst ?? gst(o.service_charge), total_fee: o.government_fee + o.service_charge + (o.gst ?? gst(o.service_charge)) });

const catalog = {
  PAN_CARD: mk({ service_id: 'PAN_CARD', service_name: 'PAN Card', category: 'Identity', description: 'Naya PAN card ya correction (e-PAN + Physical)', government_fee: 107, service_charge: 50, portal_url: 'https://www.onlineservices.nsdl.com', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Form 49A fill', 'Document verification', 'Portal submission', 'Acknowledgement receipt'], required_fields: ['full_name', 'father_name', 'dob', 'mobile', 'email', 'address', 'aadhaar_number'], required_documents: ['aadhaar_card', 'photograph', 'signature'] }),
  ITR_FILING: mk({ service_id: 'ITR_FILING', service_name: 'ITR Filing', category: 'Tax', description: 'Income Tax Return filing (Salaried / Business)', government_fee: 0, service_charge: 500, portal_url: 'https://www.incometax.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Document collection', 'Income computation', 'Return preparation', 'E-verification'], required_fields: ['pan_number', 'aadhaar_number', 'bank_account', 'ifsc', 'income_details', 'form16'], required_documents: ['form16', 'bank_statement', 'pan_card', 'aadhaar_card'] }),
  GST_REG: mk({ service_id: 'GST_REG', service_name: 'GST Registration', category: 'Tax', description: 'Naya GST registration (Individual/Business)', government_fee: 0, service_charge: 500, portal_url: 'https://www.gst.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['TRN generation', 'Part-B filing', 'ARN receipt'], required_fields: ['business_name', 'pan_number', 'address', 'bank_account', 'mobile', 'email'], required_documents: ['pan_card', 'aadhaar_card', 'bank_statement', 'photograph'] }),
  GST_RETURN: mk({ service_id: 'GST_RETURN', service_name: 'GST Return Filing', category: 'Tax', description: 'Monthly/Quarterly GST return (GSTR-1/3B)', government_fee: 0, service_charge: 300, portal_url: 'https://www.gst.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Sales data collection', 'Return preparation', 'Portal filing'], required_fields: ['gstin', 'sales_data', 'purchase_data'], required_documents: ['sales_register', 'purchase_register'] }),
  INCOME_CERT: mk({ service_id: 'INCOME_CERT', service_name: 'Income Certificate', category: 'Certificate', description: 'State income certificate (scholarship/scheme ke liye)', government_fee: 30, service_charge: 50, portal_url: 'STATE_PORTAL', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Application fill', 'Revenue dept verification', 'Certificate issue'], required_fields: ['full_name', 'father_name', 'dob', 'mobile', 'address', 'annual_income'], required_documents: ['aadhaar_card', 'income_proof', 'photograph'] }),
  CASTE_CERT: mk({ service_id: 'CASTE_CERT', service_name: 'Caste Certificate', category: 'Certificate', description: 'SC/ST/OBC caste certificate', government_fee: 30, service_charge: 50, portal_url: 'STATE_PORTAL', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Application fill', 'SDM verification', 'Certificate issue'], required_fields: ['full_name', 'father_name', 'dob', 'mobile', 'address', 'caste'], required_documents: ['aadhaar_card', 'caste_proof_of_family', 'photograph'] }),
  DOMICILE: mk({ service_id: 'DOMICILE', service_name: 'Mool Niwas / Domicile', category: 'Certificate', description: 'State domicile / mool niwas praman patra', government_fee: 30, service_charge: 50, portal_url: 'STATE_PORTAL', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Application fill', 'Verification', 'Certificate issue'], required_fields: ['full_name', 'father_name', 'dob', 'mobile', 'address', 'years_of_residence'], required_documents: ['aadhaar_card', 'residence_proof', 'photograph'] }),
  BIRTH_CERT: mk({ service_id: 'BIRTH_CERT', service_name: 'Birth Certificate', category: 'Certificate', description: 'Janm praman patra (new/correction)', government_fee: 20, service_charge: 50, portal_url: 'STATE_PORTAL', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: false, captcha_required: true, processing_steps: ['Application fill', 'Registrar verification', 'Certificate issue'], required_fields: ['child_name', 'father_name', 'mother_name', 'dob', 'place_of_birth', 'mobile'], required_documents: ['hospital_receipt', 'aadhaar_card'] }),
  DEATH_CERT: mk({ service_id: 'DEATH_CERT', service_name: 'Death Certificate', category: 'Certificate', description: 'Mrityu praman patra', government_fee: 20, service_charge: 50, portal_url: 'STATE_PORTAL', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: false, captcha_required: true, processing_steps: ['Application fill', 'Registrar verification', 'Certificate issue'], required_fields: ['deceased_name', 'date_of_death', 'place_of_death', 'applicant_name', 'mobile'], required_documents: ['cremation_certificate', 'applicant_aadhaar'] }),
  VOTER_ID: mk({ service_id: 'VOTER_ID', service_name: 'Voter ID (New/Correction)', category: 'Identity', description: 'Form 6 (new) / Form 8 (correction)', government_fee: 0, service_charge: 50, portal_url: 'https://www.nvsp.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Form 6/8 fill', 'BLO verification', 'EPIC issue'], required_fields: ['full_name', 'dob', 'relative_name', 'mobile', 'address', 'constituency'], required_documents: ['aadhaar_card', 'photograph', 'age_proof'] }),
  AYUSHMAN: mk({ service_id: 'AYUSHMAN', service_name: 'Ayushman Card', category: 'Health', description: 'PM-JAY Ayushman card banwana', government_fee: 0, service_charge: 30, gst: 0, portal_url: 'https://beneficiary.nha.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Eligibility check', 'e-KYC', 'Card generation'], required_fields: ['full_name', 'mobile', 'aadhaar_number', 'ration_card', 'state_district'], required_documents: ['aadhaar_card', 'ration_card'] }),
  E_SHRAM: mk({ service_id: 'E_SHRAM', service_name: 'E-Shram Card', category: 'Labour', description: 'Unorganized worker registration (UAN)', government_fee: 0, service_charge: 30, gst: 0, portal_url: 'https://register.eshram.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Aadhaar e-KYC', 'Occupation details', 'UAN generation'], required_fields: ['full_name', 'dob', 'mobile', 'aadhaar_number', 'occupation', 'address'], required_documents: ['aadhaar_card', 'bank_passbook', 'photograph'] }),
  GOV_JOB_FORM: mk({ service_id: 'GOV_JOB_FORM', service_name: 'Government Job Form', category: 'Employment', description: 'Sarkari naukri online form filling', government_fee: 0, service_charge: 100, portal_url: 'SERVICE_SPECIFIC', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Vacancy selection', 'Form filling', 'Fee payment at portal', 'Final submission'], required_fields: ['full_name', 'dob', 'mobile', 'email', 'education_details', 'category'], required_documents: ['photograph', 'signature', 'education_certificates', 'caste_certificate_if_any'] }),
  SCHOLARSHIP: mk({ service_id: 'SCHOLARSHIP', service_name: 'Scholarship', category: 'Education', description: 'National/State scholarship schemes (NSP etc.)', government_fee: 0, service_charge: 30, gst: 0, portal_url: 'https://scholarships.gov.in', portal_type: 'PORTAL_OPERATOR', operator_required: true, otp_required: true, captcha_required: true, processing_steps: ['Scheme selection', 'Form fill', 'Institute verification'], required_fields: ['student_name', 'dob', 'mobile', 'email', 'institute_name', 'bank_account', 'ifsc'], required_documents: ['aadhaar_card', 'marksheet', 'income_certificate', 'caste_certificate_if_any', 'bank_passbook'] }),
};

return [{ json: { catalog } }];`;

const selectServiceCode = `// Select & validate service from catalog
const { catalog } = $('Service Catalog').first().json;
const serviceId = ($('Trigger').first().json.service_id || '').toString().toUpperCase().trim();
const active = Object.values(catalog).filter(s => s.active);

if (!serviceId) {
  return [{ json: { ok: true, catalog: active } }];
}
const svc = catalog[serviceId];
if (!svc || !svc.active) {
  return [{ json: { ok: false, error: 'SERVICE_NOT_FOUND', message: 'Main aapki request ko clearly samajh nahi paaya. Kripya niche diye gaye services mein se select karein.', available: active.map(s => s.service_id) } }];
}
return [{ json: { ok: true, service: svc } }];`;

const wfC = {
  id: WF_C,
  name: "CSC 03 - Service Catalog Engine",
  settings: { executionOrder: "v1" },
  active: false,
  pinData: {},
  nodes: [
    { id: "c-t", name: "Trigger", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1, position: [240, 300], parameters: {} },
    { id: "c-cat", name: "Service Catalog", type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 300], parameters: { mode: "runOnceForAllItems", jsCode: catalogCode } },
    { id: "c-sel", name: "Select Service", type: "n8n-nodes-base.code", typeVersion: 2, position: [680, 300], parameters: { mode: "runOnceForAllItems", jsCode: selectServiceCode } }
  ],
  connections: mergeConn(wrap("Trigger", "Service Catalog"), wrap("Service Catalog", "Select Service"))
};

// ============================================================
// WF D: CUSTOMER PROFILE ENGINE
// ============================================================
const wfD = {
  id: WF_D,
  name: "CSC 04 - Customer Profile Engine",
  settings: { executionOrder: "v1" },
  active: false,
  pinData: {},
  nodes: [
    { id: "d-t", name: "Trigger", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1, position: [240, 300], parameters: {} },
    {
      id: "d-lookup", name: "Lookup Customer", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [460, 300],
      alwaysOutputData: true,
      parameters: {
        resource: "row", operation: "get",
        dataTableId: { __rl: true, mode: "name", value: "customers" },
        matchType: "allConditions",
        filters: { conditions: [{ keyName: "phone", condition: "eq", keyValue: "={{ $('Trigger').first().json.phone }}" }] },
        returnAll: false, limit: 1
      }
    },
    {
      id: "d-if", name: "Customer Exists?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [680, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
          conditions: [{ id: "c-exists", leftValue: "={{ $json.phone }}", rightValue: "", operator: { type: "string", operation: "isEmpty", singleValue: true } }],
          combinator: "and"
        },
        options: {}
      }
    },
    {
      id: "d-insert", name: "Create Customer", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [900, 400],
      parameters: {
        resource: "row", operation: "insert",
        dataTableId: { __rl: true, mode: "name", value: "customers" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            phone: "={{ $('Trigger').first().json.phone }}",
            full_name: "={{ $('Trigger').first().json.name || 'Customer' }}",
            email: "", state: "", district: "", address: "",
            consent_status: "={{ $('Trigger').first().json.consent_given ? 'GRANTED' : 'PENDING' }}",
            created_at: "={{ $now.toISO() }}", updated_at: "={{ $now.toISO() }}"
          },
          matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false
        }
      }
    },
    { id: "d-res", name: "Profile Result", type: "n8n-nodes-base.code", typeVersion: 2, position: [1120, 300], parameters: { mode: "runOnceForAllItems", jsCode: "const t = $('Trigger').first().json;\nconst exists = $json.phone ? true : false;\nconst customer = exists ? $json : { phone: t.phone, full_name: t.name || 'Customer' };\nconst isNew = !exists;\nconst msg = isNew ? `Aapka profile ban gaya hai! 🙏` : `Welcome back, ${customer.full_name}! 🙏`;\nreturn [{ json: { customer, is_new: isNew, profile_msg: msg } }];" } }
  ],
  connections: mergeConn(
    wrap("Trigger", "Lookup Customer"),
    wrap("Lookup Customer", "Customer Exists?"),
    { "Customer Exists?": { main: [[conn("Profile Result")], [conn("Create Customer")]] } },
    wrap("Create Customer", "Profile Result")
  )
};

writeFileSync("/home/z/my-project/scripts/csc-wf-C-catalog.json", JSON.stringify(wfC, null, 1));
writeFileSync("/home/z/my-project/scripts/csc-wf-D-customer.json", JSON.stringify(wfD, null, 1));
console.log("✅ WF C & D built");
