import { NextRequest, NextResponse } from "next/server";
import { q, q1, run, num, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Helper to ensure table exists
function ensureTable() {
  try {
    run(`CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id TEXT UNIQUE NOT NULL,
      shop_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      whatsapp_number TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT DEFAULT 'DUKANDAR',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      status TEXT DEFAULT 'ACTIVE',
      plan TEXT DEFAULT 'PRO',
      plan_price REAL DEFAULT 999,
      valid_till TEXT,
      auto_notify INTEGER DEFAULT 1,
      total_applications INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch {}
}

export async function GET() {
  ensureTable();
  try {
    const rows = q<any>(`SELECT * FROM ${phys("operators")} ORDER BY id DESC`);
    
    // Also attach live application count for each operator based on phone
    const appsCounts = q<any>(`SELECT operator_phone, COUNT(*) as c FROM ${phys("operator_tasks")} GROUP BY operator_phone`);
    const appMap: Record<string, number> = {};
    for (const a of appsCounts) {
      if (a.operator_phone) appMap[String(a.operator_phone)] = Number(a.c || 0);
    }

    const operators = rows.map((r) => {
      const cleanPhone = String(r.phone || "").replace(/\D/g, "").slice(-10);
      const fullPhone = cleanPhone ? "91" + cleanPhone : "";
      const taskCount = (appMap[fullPhone] || 0) + (appMap[cleanPhone] || 0) + (r.total_applications || 0);

      return {
        id: r.id,
        operator_id: r.operator_id || `OP-${r.id}`,
        shop_name: r.shop_name || "CSC Kendra",
        owner_name: r.owner_name || "Sanchalak",
        phone: r.phone || "",
        whatsapp_number: r.whatsapp_number || r.phone || "",
        pin: r.pin || "1234",
        role: r.role || "DUKANDAR",
        city: r.city || "",
        state: r.state || "UP",
        status: String(r.status || "ACTIVE").toUpperCase(),
        plan: r.plan || "PRO",
        plan_price: num(r.plan_price, 999),
        valid_till: r.valid_till || "",
        auto_notify: Boolean(r.auto_notify ?? 1),
        total_applications: taskCount,
        created_at: r.created_at || "",
      };
    });

    return NextResponse.json({ ok: true, operators });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to fetch operators" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  ensureTable();
  try {
    const body = await req.json();
    const {
      shop_name,
      owner_name,
      phone,
      whatsapp_number,
      pin,
      city,
      state,
      plan,
      plan_price,
      duration_days,
    } = body;

    if (!shop_name || !owner_name || !phone) {
      return NextResponse.json(
        { ok: false, error: "दुकान का नाम, संचालक का नाम और मोबाइल नंबर आवश्यक हैं।" },
        { status: 400 }
      );
    }

    const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      return NextResponse.json(
        { ok: false, error: "10-अंकों का वैध मोबाइल नंबर दर्ज करें।" },
        { status: 400 }
      );
    }

    const formattedPhone = "91" + cleanPhone;
    const cleanWa = String(whatsapp_number || phone).replace(/\D/g, "").slice(-10);
    const formattedWa = "91" + cleanWa;

    // Check if phone already registered
    const existing = q1<any>(
      `SELECT * FROM ${phys("operators")} WHERE phone = ? OR phone = ?`,
      formattedPhone,
      cleanPhone
    );
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `यह मोबाइल नंबर पहले से दर्ज है (${existing.shop_name})` },
        { status: 409 }
      );
    }

    // Generate operator ID e.g. OP-1042
    const countRow = q1<any>(`SELECT COUNT(*) as c FROM ${phys("operators")}`);
    const nextNum = 1000 + (Number(countRow?.c || 0) + 1);
    const operatorId = `OP-${nextNum}`;

    // Generate or use PIN (4 digits)
    const operatorPin = String(pin || Math.floor(1000 + Math.random() * 9000)).trim();

    // Validity date calculation
    const days = Number(duration_days || 30);
    const validTillDate = new Date();
    validTillDate.setDate(validTillDate.getDate() + days);
    const validTill = validTillDate.toISOString().split("T")[0];

    const chosenPlan = plan || "PRO";
    const price = plan_price !== undefined ? Number(plan_price) : (chosenPlan === "BASIC" ? 499 : chosenPlan === "ENTERPRISE" ? 1499 : 999);

    run(
      `INSERT INTO ${phys("operators")} (
        operator_id, shop_name, owner_name, phone, whatsapp_number, pin, role, city, state, status, plan, plan_price, valid_till, auto_notify, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'DUKANDAR', ?, ?, 'ACTIVE', ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      operatorId,
      String(shop_name).trim(),
      String(owner_name).trim(),
      formattedPhone,
      formattedWa,
      operatorPin,
      city ? String(city).trim() : "",
      state ? String(state).trim() : "UP",
      chosenPlan,
      price,
      validTill
    );

    const created = q1<any>(`SELECT * FROM ${phys("operators")} WHERE operator_id = ?`, operatorId);

    return NextResponse.json({
      ok: true,
      message: `🎉 ${shop_name} (${owner_name}) को सफलतापूर्वक जोड़ दिया गया है! लॉगिन PIN: ${operatorPin}`,
      operator: created,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "दुकानदार जोड़ने में त्रुटि हुई।" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  ensureTable();
  try {
    const body = await req.json();
    const { operator_id, pin, status, plan, valid_till, shop_name, owner_name, auto_notify } = body;

    if (!operator_id) {
      return NextResponse.json({ ok: false, error: "operator_id आवश्यक है।" }, { status: 400 });
    }

    const existing = q1<any>(`SELECT * FROM ${phys("operators")} WHERE operator_id = ?`, operator_id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "दुकानदार नहीं मिला।" }, { status: 404 });
    }

    const newPin = pin !== undefined ? String(pin).trim() : existing.pin;
    const newStatus = status !== undefined ? String(status).toUpperCase() : existing.status;
    const newPlan = plan !== undefined ? String(plan) : existing.plan;
    const newValidTill = valid_till !== undefined ? String(valid_till) : existing.valid_till;
    const newShopName = shop_name !== undefined ? String(shop_name).trim() : existing.shop_name;
    const newOwnerName = owner_name !== undefined ? String(owner_name).trim() : existing.owner_name;
    const newNotify = auto_notify !== undefined ? (auto_notify ? 1 : 0) : existing.auto_notify;

    run(
      `UPDATE ${phys("operators")} SET 
        pin = ?, 
        status = ?, 
        plan = ?, 
        valid_till = ?, 
        shop_name = ?, 
        owner_name = ?, 
        auto_notify = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE operator_id = ?`,
      newPin,
      newStatus,
      newPlan,
      newValidTill,
      newShopName,
      newOwnerName,
      newNotify,
      operator_id
    );

    return NextResponse.json({
      ok: true,
      message: `${newShopName} का विवरण सफलतापूर्वक अपडेट हो गया।`,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "अपडेट में त्रुटि हुई।" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  ensureTable();
  try {
    const { searchParams } = new URL(req.url);
    const operator_id = searchParams.get("operator_id");

    if (!operator_id) {
      return NextResponse.json({ ok: false, error: "operator_id आवश्यक है।" }, { status: 400 });
    }

    if (operator_id === "OP-1001") {
      return NextResponse.json({ ok: false, error: "मास्टर हेड ऑफिस ऑपरेटर को हटाया नहीं जा सकता।" }, { status: 403 });
    }

    run(`DELETE FROM ${phys("operators")} WHERE operator_id = ?`, operator_id);

    return NextResponse.json({
      ok: true,
      message: "दुकानदार को सफलतापूर्वक हटा दिया गया।",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "हटाने में त्रुटि हुई।" }, { status: 500 });
  }
}
