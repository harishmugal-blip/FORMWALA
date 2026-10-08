/**
 * CSC Smart Seva - Portal Seed Script
 * Reads datatables-backup.json (n8n Data Tables export) and seeds portal DB.
 * Also generates realistic demo applications so dashboard looks live.
 *
 * Run: node scripts/seed-portal.mjs
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const db = new PrismaClient()
const backup = JSON.parse(
  readFileSync(new URL('../download/supabase-migration/datatables-backup.json', import.meta.url), 'utf-8')
)
const get = (name) => backup.find((t) => t.name === name)?.rows || []

const dt = (v) => (v ? new Date(v) : null)
const rnd = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rnd(arr.length)]

const FIRST = ['Ramesh', 'Suresh', 'Priya', 'Anita', 'Vijay', 'Pooja', 'Amit', 'Sunita', 'Rahul', 'Kavita', 'Deepak', 'Manish', 'Rekha', 'Sanjay', 'Neha', 'Arjun']
const LAST = ['Kumar', 'Sharma', 'Yadav', 'Verma', 'Singh', 'Devi', 'Gupta', 'Mishra', 'Patel', 'Chauhan']

function appNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[rnd(chars.length)]
  return `CSC-2026-${s}`
}
function appId() {
  return 'APP' + createHash('md5').update(Math.random().toString()).digest('hex').substring(0, 12).toUpperCase()
}

async function main() {
  console.log('📦 Seeding CSC Admin Portal DB...\n')

  // 1. Service catalog
  const catalog = get('service_catalog')
  for (const s of catalog) {
    await db.serviceCatalog.upsert({
      where: { serviceId: s.service_id },
      update: {
        serviceName: s.service_name, category: s.category, description: s.description || '',
        governmentFee: Number(s.government_fee) || 0, serviceCharge: Number(s.service_charge) || 0,
        gstPercent: Number(s.gst_percent) || 18, totalFee: Number(s.total_fee) || 0,
        portalUrl: s.portal_url || '', portalType: s.portal_type || '',
        operatorRequired: s.operator_required || 'FALSE', otpRequired: s.otp_required || 'FALSE',
        captchaRequired: s.captcha_required || 'FALSE', statusTracking: s.status_tracking || 'TRUE',
        receiptRequired: s.receipt_required || 'TRUE', processingSteps: s.processing_steps || '',
        active: s.active || 'TRUE',
      },
      create: { ...mapCatalog(s) },
    })
  }
  console.log(`✅ service_catalog: ${catalog.length}`)

  // 2. Fields / docs / pricing (replace per-service)
  const fields = get('service_fields')
  const docs = get('service_documents')
  const pricing = get('service_pricing')
  await db.serviceField.deleteMany()
  await db.serviceDocument.deleteMany()
  await db.servicePricing.deleteMany()
  await db.serviceField.createMany({ data: fields.map((f) => ({
    serviceId: f.service_id, fieldKey: f.field_key, fieldOrder: Number(f.field_order) || 0,
    label: f.label, fieldType: f.field_type || 'TEXT', question: f.question || '',
    required: f.required || 'TRUE', options: f.options || '', errorHint: f.error_hint || '',
    createdAt: dt(f.createdAt) || new Date(), updatedAt: dt(f.updatedAt) || new Date(),
  })) })
  await db.serviceDocument.createMany({ data: docs.map((d) => ({
    serviceId: d.service_id, docKey: d.doc_key, docOrder: Number(d.doc_order) || 0,
    label: d.label, acceptedTypes: d.accepted_types || 'image,pdf', question: d.question || '',
    required: d.required || 'TRUE', createdAt: dt(d.createdAt) || new Date(), updatedAt: dt(d.updatedAt) || new Date(),
  })) })
  await db.servicePricing.createMany({ data: pricing.map((p) => ({
    serviceId: p.service_id, govFee: Number(p.gov_fee) || 0, serviceCharge: Number(p.service_charge) || 0,
    gstPercent: Number(p.gst_percent) || 18, gstAmount: Number(p.gst_amount) || 0,
    totalFee: Number(p.total_fee) || 0, currency: p.currency || 'INR', active: p.active || 'TRUE',
    createdAt: dt(p.createdAt) || new Date(), updatedAt: dt(p.updatedAt) || new Date(),
  })) })
  console.log(`✅ service_fields: ${fields.length}, service_documents: ${docs.length}, service_pricing: ${pricing.length}`)

  // 3. System config
  for (const c of get('system_config')) {
    await db.systemConfig.upsert({
      where: { configKey: c.config_key },
      update: { configValue: c.config_value || '', description: c.description || '' },
      create: { configKey: c.config_key, configValue: c.config_value || '', description: c.description || '' },
    })
  }
  console.log(`✅ system_config: ${get('system_config').length}`)

  // 4. Keep existing real applications from backup (skip demo duplicates by app number)
  const realApps = get('applications')
  for (const a of realApps) {
    await db.application.upsert({
      where: { applicationId: a.application_id },
      update: { status: a.status, applicationNumber: a.application_number || '' },
      create: {
        applicationId: a.application_id, customerPhone: a.customer_phone, serviceId: a.service_id,
        status: a.status, applicationNumber: a.application_number || '',
        createdAt: dt(a.created_at) || new Date(), updatedAt: dt(a.updated_at) || new Date(),
      },
    })
  }
  console.log(`✅ applications (real demo): ${realApps.length}`)

  // 5. Field values + documents from backup
  for (const fv of get('application_field_values')) {
    const exists = await db.applicationFieldValue.findFirst({ where: { applicationId: fv.application_id, fieldKey: fv.field_key } })
    if (!exists) await db.applicationFieldValue.create({ data: {
      applicationId: fv.application_id, phone: fv.phone, fieldKey: fv.field_key,
      fieldValue: fv.field_value || '', validated: fv.validated || 'FALSE', createdAt: dt(fv.created_at) || new Date(),
    } })
  }
  for (const ad of get('application_documents')) {
    const exists = await db.applicationDocument.findFirst({ where: { applicationId: ad.application_id, docKey: ad.doc_key } })
    if (!exists) await db.applicationDocument.create({ data: {
      applicationId: ad.application_id, phone: ad.phone, docKey: ad.doc_key, mediaId: ad.media_id || '',
      mimeType: ad.mime_type || '', status: ad.status || 'RECEIVED', verifiedBy: ad.verified_by || '',
      createdAt: dt(ad.created_at) || new Date(),
    } })
  }
  for (const p of get('payments')) {
    const exists = await db.payment.findFirst({ where: { paymentId: p.payment_id } })
    if (!exists) await db.payment.create({ data: {
      paymentId: p.payment_id, applicationId: p.application_id, customerPhone: p.customer_phone,
      amount: Number(p.amount) || 0, gateway: p.gateway || 'MOCK', transactionId: p.transaction_id || '',
      status: p.status || 'PAID', createdAt: dt(p.created_at) || new Date(), paidAt: dt(p.paid_at) || new Date(),
    } })
  }
  for (const t of get('operator_tasks')) {
    const exists = await db.operatorTask.findFirst({ where: { taskId: t.task_id } })
    if (!exists) await db.operatorTask.create({ data: {
      taskId: t.task_id, applicationId: t.application_id, applicationNumber: t.application_number || '',
      operatorPhone: t.operator_phone || '', status: t.status || 'PENDING', note: t.note || '',
      createdAt: dt(t.created_at) || new Date(), updatedAt: dt(t.updated_at) || new Date(),
    } })
  }
  for (const cs of get('conversation_state')) {
    const exists = await db.conversationState.findFirst({ where: { phone: cs.phone } })
    if (!exists) await db.conversationState.create({ data: {
      phone: cs.phone, state: cs.state || 'NEW', serviceId: cs.service_id || '',
      contextData: cs.context_data || '{}', handoffActive: cs.handoff_active || 'FALSE',
      createdAt: dt(cs.createdAt) || new Date(), updatedAt: dt(cs.updated_at) || new Date(),
    } })
  }
  console.log('✅ backup rows migrated (fields/docs/payments/tasks/conversations)')

  // 6. Generate demo applications across all services & statuses
  const services = catalog.filter((s) => s.active === 'TRUE')
  const STATUSES = ['SUBMITTED', 'PAID', 'IN_PROGRESS', 'APPROVED', 'DELIVERED', 'REJECTED', 'DRAFT']
  const WEIGHTS = [4, 3, 4, 3, 2, 1, 2]
  const statusPool = STATUSES.flatMap((s, i) => Array(WEIGHTS[i]).fill(s))
  let demoCount = 0

  for (let i = 0; i < 38; i++) {
    const svc = pick(services)
    const pricingRow = pricing.find((p) => p.service_id === svc.service_id)
    const status = pick(statusPool)
    const phone = `9199${String(10000000 + rnd(89999999)).substring(0, 8)}`
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const now = new Date()
    const created = new Date(now.getTime() - rnd(28) * 86400000 - rnd(20) * 3600000)
    const isPaid = ['SUBMITTED', 'IN_PROGRESS', 'APPROVED', 'DELIVERED'].includes(status)
    const aid = appId()

    const app = await db.application.create({ data: {
      applicationId: aid, customerPhone: phone, serviceId: svc.service_id, status,
      govFee: pricingRow ? Number(pricingRow.gov_fee) : Number(svc.government_fee) || 0,
      serviceCharge: pricingRow ? Number(pricingRow.service_charge) : Number(svc.service_charge) || 0,
      gst: pricingRow ? Number(pricingRow.gst_amount) : 0,
      totalFee: pricingRow ? Number(pricingRow.total_fee) : Number(svc.total_fee) || 0,
      applicationNumber: isPaid || status === 'REJECTED' ? appNumber() : '',
      createdAt: created, updatedAt: new Date(created.getTime() + 3600000 * rnd(24)),
    } })

    // status history
    const flow = ['DRAFT', 'SUBMITTED', 'PAID', 'IN_PROGRESS', 'APPROVED', 'DELIVERED']
    const upto = status === 'REJECTED' ? 3 : flow.indexOf(status === 'SUBMITTED' ? 'SUBMITTED' : status)
    let prev = ''
    for (let s = 0; s <= Math.max(upto, 1) && s < flow.length; s++) {
      await db.applicationStatusHistory.create({ data: {
        applicationId: aid, applicationNumber: app.applicationNumber, oldStatus: prev,
        newStatus: status === 'REJECTED' && s === 3 ? 'REJECTED' : flow[s],
        note: '', createdAt: new Date(created.getTime() + s * 5400000),
      } })
      prev = flow[s]
      if (status === 'REJECTED' && s === 3) break
    }

    // fields (2-4 filled)
    const svcFields = fields.filter((f) => f.service_id === svc.service_id).sort((a, b) => a.field_order - b.field_order).slice(0, 2 + rnd(3))
    for (const f of svcFields) {
      let val = ''
      if (f.field_type === 'MOBILE') val = `9${String(800000000 + rnd(99999999))}`
      else if (f.field_type === 'DOB') val = `${String(1 + rnd(28))}/${String(1 + rnd(12))}/199${rnd(9)}`
      else if (f.field_type === 'AADHAAR') val = String(100000000000 + rnd(899999999999))
      else if (f.field_type === 'EMAIL') val = `${name.split(' ')[0].toLowerCase()}${rnd(99)}@gmail.com`
      else if (f.options) val = f.options.split(',')[0]
      else val = f.field_type === 'NUMBER' ? String(rnd(500000)) : `${name.split(' ')[0]} Kumar`
      await db.applicationFieldValue.create({ data: {
        applicationId: aid, phone, fieldKey: f.field_key, fieldValue: val, validated: 'TRUE',
        createdAt: created, updatedAt: created,
      } })
    }

    // documents (1-3)
    const svcDocs = docs.filter((d) => d.service_id === svc.service_id).sort((a, b) => a.doc_order - b.doc_order).slice(0, 1 + rnd(3))
    for (const d of svcDocs) {
      await db.applicationDocument.create({ data: {
        applicationId: aid, phone, docKey: d.doc_key, mediaId: `MEDIA_${createHash('md5').update(aid + d.doc_key).digest('hex').substring(0, 10).toUpperCase()}`,
        mimeType: rnd(4) === 0 ? 'application/pdf' : 'image/jpeg', status: 'RECEIVED',
        verifiedBy: 'CUSTOMER', createdAt: new Date(created.getTime() + 1800000),
      } })
    }

    // payment if paid
    if (isPaid) {
      const paidAt = new Date(created.getTime() + 7200000)
      await db.payment.create({ data: {
        paymentId: 'PAY' + createHash('md5').update(aid).digest('hex').substring(0, 12).toUpperCase(),
        applicationId: aid, customerPhone: phone,
        amount: pricingRow ? Number(pricingRow.total_fee) : Number(svc.total_fee) || 0,
        gateway: 'MOCK', transactionId: `pay_DEMO${rnd(99999999)}`, status: 'PAID',
        createdAt: paidAt, paidAt,
      } })
    }

    // operator task for submitted/in_progress
    if (status === 'SUBMITTED' || status === 'IN_PROGRESS') {
      await db.operatorTask.create({ data: {
        taskId: 'TASK' + createHash('md5').update(aid + 't').digest('hex').substring(0, 10).toUpperCase(),
        applicationId: aid, applicationNumber: app.applicationNumber, operatorPhone: '919876500099',
        status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING', note: '',
        createdAt: new Date(created.getTime() + 9000000), updatedAt: new Date(created.getTime() + 9000000),
      } })
    }

    demoCount++
  }
  console.log(`✅ demo applications generated: ${demoCount}`)

  // 7. Sample messages/notifications for activity feed
  const phones = [...new Set((await db.application.findMany({ select: { customerPhone: true } })).map((a) => a.customerPhone))]
  const TEMPLATES = ['welcome', 'field_question', 'doc_request', 'payment_link', 'receipt', 'status_update', 'reminder']
  for (let i = 0; i < 60; i++) {
    const phone = pick(phones)
    const tpl = pick(TEMPLATES)
    await db.messageLog.create({ data: {
      phone, direction: i % 3 === 0 ? 'IN' : 'OUT', messageType: 'text',
      body: tpl === 'payment_link' ? 'Payment link: ₹166 - PAN Card' : tpl === 'receipt' ? 'Payment confirm ho gaya! Receipt download karein.' : `Demo message (${tpl})`,
      waMessageId: `wamid.DEMO${rnd(99999999)}`, status: 'SENT',
      createdAt: new Date(Date.now() - rnd(30) * 86400000 - rnd(86400000)),
    } })
  }
  console.log(`✅ message_log sample: 60`)

  const total = await db.application.count()
  console.log(`\n🎉 Seed complete! Total applications in DB: ${total}`)
}

function mapCatalog(s) {
  return {
    serviceId: s.service_id, serviceName: s.service_name, category: s.category,
    description: s.description || '', governmentFee: Number(s.government_fee) || 0,
    serviceCharge: Number(s.service_charge) || 0, gstPercent: Number(s.gst_percent) || 18,
    totalFee: Number(s.total_fee) || 0, portalUrl: s.portal_url || '', portalType: s.portal_type || '',
    operatorRequired: s.operator_required || 'FALSE', otpRequired: s.otp_required || 'FALSE',
    captchaRequired: s.captcha_required || 'FALSE', statusTracking: s.status_tracking || 'TRUE',
    receiptRequired: s.receipt_required || 'TRUE', processingSteps: s.processing_steps || '',
    active: s.active || 'TRUE', createdAt: dt(s.createdAt) || new Date(), updatedAt: dt(s.updatedAt) || new Date(),
  }
}

main().catch(console.error).finally(() => db.$disconnect())
