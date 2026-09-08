const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 4002;
const JWT_SECRET = process.env.JWT_SECRET || 'kmitl_chumphon_sso_secret_key';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost/auth';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sso_user:sso_password@postgres:5432/sso_db';

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.warn('[Web App 2] PostgreSQL connection warning:', err.message);
  } else {
    console.log('[Web App 2] Connected to PostgreSQL (sso_db) successfully');
  }
});

// ข้อมูลจำลองสำรองกรณีฐานข้อมูลขัดข้องชั่วคราว
const fallbackEquipments = [
  { id: 'EQ-101', name: 'ชุดบอร์ด Raspberry Pi 4 (4GB) + เซนเซอร์ IoT Kit', category: 'Hardware / IoT', total: 10, available: 6 },
  { id: 'EQ-202', name: 'สาย Cisco Console Cable (USB to RJ45)', category: 'Networking', total: 15, available: 11 },
  { id: 'EQ-303', name: 'แว่น VR Headset Meta Quest 3 สำหรับพัฒนา 3D', category: 'VR / AR', total: 4, available: 2 },
  { id: 'EQ-404', name: 'Google Coral Edge TPU (USB Accelerator) สำหรับ AI', category: 'AI Accelerators', total: 8, available: 5 }
];

async function getEquipments() {
  try {
    const res = await pool.query('SELECT id, name, category, total, available FROM equipments ORDER BY id ASC');
    if (res.rows.length > 0) return res.rows;
  } catch (err) {
    console.error('[Web App 2] Error querying equipments:', err.message);
  }
  return fallbackEquipments;
}

async function getUserLoans(studentId) {
  try {
    const res = await pool.query(
      `SELECT id, equip_id AS "equipId", equip_name AS "equipName", student_id AS "studentId", 
              TO_CHAR(borrow_date, 'YYYY-MM-DD') AS "borrowDate", 
              TO_CHAR(return_date, 'YYYY-MM-DD') AS "returnDate", 
              purpose, status 
       FROM equipment_loans 
       WHERE student_id = $1 AND status = 'BORROWED'
       ORDER BY created_at DESC`,
      [studentId]
    );
    return res.rows;
  } catch (err) {
    console.error('[Web App 2] Error querying loans:', err.message);
    return [];
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

/**
 * Middleware: บังคับตรวจสอบบัตรผ่าน SSO (Stateless JWT Verification)
 * หากยังไม่ล็อกอิน จะ Redirect ไปที่ Central Auth พร้อมส่ง redirect_url กลับมาที่หน้านี้
 */
function ssoAuthMiddleware(req, res, next) {
  const token = req.cookies ? req.cookies.sso_token : null;
  const host = req.headers.host || '';
  const isDirectPort = host.includes(':4002');
  
  // กำหนด Return URL ให้ถูกต้องตามการเข้าถึง (ผ่าน Nginx หรือเข้าตรงพอร์ต 4002)
  const currentReturnUrl = isDirectPort ? `http://${host}/` : '/equipment/';
  const loginUrl = isDirectPort 
    ? `${AUTH_URL}/login?redirect_url=${encodeURIComponent(currentReturnUrl)}&error=not_logged_in`
    : `/auth/login?redirect_url=${encodeURIComponent(currentReturnUrl)}&error=not_logged_in`;

  if (!token) {
    console.log(`[Web App 2 (Port ${PORT})] No SSO token found. Redirecting to Central Auth...`);
    return res.redirect(loginUrl);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.isDirectPort = isDirectPort;
    next();
  } catch (err) {
    console.warn(`[Web App 2 (Port ${PORT})] Invalid or expired SSO token:`, err.message);
    res.clearCookie('sso_token', { path: '/' });
    return res.redirect(loginUrl);
  }
}

// Route สำหรับออกจากระบบ (Logout) - ทำงานได้ทั้งกรณีเข้าตรงและผ่าน Proxy
app.get(['/logout', '/auth/logout', '/equipment/logout'], (req, res) => {
  res.clearCookie('sso_token', { path: '/' });
  const host = req.headers.host || '';
  const isDirectPort = host.includes(':4002');
  const returnTarget = isDirectPort ? 'http://localhost:4002/' : '/equipment/';
  const loginUrl = isDirectPort ? 'http://localhost:3000/login' : '/auth/login';
  console.log(`[Web App 2 (Port ${PORT})] User logged out successfully`);
  return res.redirect(`${loginUrl}?logged_out=1&redirect_url=${encodeURIComponent(returnTarget)}`);
});

// ทุก Route ใน Web App 2 จะต้องผ่านการตรวจ SSO Token เสมอ
app.use(ssoAuthMiddleware);

/**
 * Header และ Navbar สลับหน้าระหว่าง Web App 1 (Port 4001) และ Web App 2 (Port 4002)
 */
function renderNavbar(user, isDirectPort = false) {
  const page1Link = isDirectPort ? 'http://localhost:4001/' : '/lab/';
  const page2Link = isDirectPort ? 'http://localhost:4002/' : '/equipment/';
  const logoutUrl = isDirectPort ? '/logout' : '/auth/logout?redirect_url=/equipment/';
  const slidesLink = isDirectPort ? 'http://localhost/presentation' : '/presentation';

  return `
  <header class="navbar">
    <div class="brand">
      <div class="brand-icon">📦</div>
      <div class="brand-text">
        <h2>ระบบยืม-คืนอุปกรณ์ห้องปฏิบัติการ (Web App 2)</h2>
        <span>KMITL Computer Engineering • Folder: <code>web-app-2</code> • Port: <code>${PORT}</code></span>
      </div>
    </div>

    <!-- เมนูเชื่อมโยงระหว่าง 2 Web Apps แยกพอร์ต -->
    <nav class="nav-links">
      <a href="${page1Link}" class="nav-item">
        🖥️ Web App 1: จองห้องแล็บ (:4001)
      </a>
      <a href="${page2Link}" class="nav-item active">
        📦 Web App 2: ยืมอุปกรณ์ (:4002)
      </a>
      <a href="${slidesLink}" target="_blank" class="nav-item">
        📊 สไลด์นำเสนอ ↗
      </a>
    </nav>

    <div class="user-info">
      <div class="user-pill">
        <div class="user-avatar">${user.username ? user.username.charAt(0).toUpperCase() : 'U'}</div>
        <div>
          <div><strong>${user.name || user.username}</strong></div>
          <div style="font-size: 11px; color: #94a3b8;">${user.username} (${user.role})</div>
        </div>
      </div>
      <a href="${logoutUrl}" class="btn-logout">ออกจากระบบ</a>
    </div>
  </header>`;
}

const sharedStyles = `
  :root {
    --primary: #0284c7;
    --primary-hover: #0369a1;
    --accent: #f97316;
    --bg: #070d19;
    --card-bg: rgba(15, 23, 42, 0.7);
    --card-border: rgba(255, 255, 255, 0.1);
    --text: #f8fafc;
    --muted: #94a3b8;
    --success: #10b981;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  body {
    background: radial-gradient(circle at 80% 20%, #0f2b48 0%, #070d19 70%, #020617 100%);
    color: var(--text);
    min-height: 100vh;
    padding-bottom: 40px;
  }

  .navbar {
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--card-border);
    padding: 14px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 50;
    gap: 20px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #0284c7, #38bdf8);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }

  .brand-text h2 {
    font-size: 16px;
    font-weight: 700;
  }

  .brand-text span {
    font-size: 11px;
    color: var(--muted);
  }

  .brand-text code {
    background: rgba(255,255,255,0.1);
    padding: 1px 4px;
    border-radius: 4px;
    color: #38bdf8;
  }

  .nav-links {
    display: flex;
    gap: 8px;
    background: rgba(15, 23, 42, 0.6);
    padding: 4px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nav-item {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #cbd5e1;
    text-decoration: none;
    transition: all 0.2s;
  }

  .nav-item:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-item.active {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #fff;
    box-shadow: 0 2px 10px rgba(2, 132, 199, 0.3);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .user-pill {
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 14px;
    border-radius: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .user-avatar {
    width: 26px;
    height: 26px;
    background: #0284c7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }

  .btn-logout {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-logout:hover {
    background: rgba(239, 68, 68, 0.3);
    color: #fff;
  }

  .main-container {
    max-width: 1100px;
    margin: 28px auto;
    padding: 0 20px;
  }

  .hero-banner {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.2) 0%, rgba(14, 165, 233, 0.1) 100%);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 16px;
    padding: 22px 28px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .hero-title h1 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .hero-title p {
    color: #bae6fd;
    font-size: 13px;
  }

  .badge-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(2, 132, 199, 0.25);
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #7dd3fc;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    margin-top: 6px;
  }

  .sso-tag {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #6ee7b7;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 24px;
  }

  @media (max-width: 860px) {
    .grid-2 {
      grid-template-columns: 1fr;
    }
    .navbar {
      flex-direction: column;
      align-items: stretch;
    }
    .nav-links {
      justify-content: center;
    }
  }

  .card {
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .card-header h3 {
    font-size: 16px;
    font-weight: 600;
  }

  .item-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.2s;
  }

  .item-card:hover {
    border-color: rgba(56, 189, 248, 0.4);
    transform: translateY(-2px);
  }

  .item-info h4 {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .item-info p {
    font-size: 12px;
    color: var(--muted);
  }

  .form-styled {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 13px;
    color: #cbd5e1;
  }

  select, input[type="date"], input[type="text"] {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 10px 12px;
    color: white;
    font-size: 13px;
    outline: none;
  }

  select:focus, input:focus {
    border-color: #38bdf8;
  }

  .btn-primary {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: white;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 8px;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
    transform: translateY(-1px);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .table th, .table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .table th {
    color: var(--muted);
    font-weight: 500;
  }

  .badge-status {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
  }

  .btn-cancel {
    background: none;
    border: none;
    color: #f87171;
    cursor: pointer;
    font-size: 12px;
    text-decoration: underline;
  }

  .token-box {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 14px;
    font-family: monospace;
    font-size: 11px;
    overflow-x: auto;
    color: #7dd3fc;
    margin-top: 14px;
    white-space: pre-wrap;
    word-break: break-all;
  }
`;

// -------------------------------------------------------------
// Route หน้าที่ 2: ระบบยืม-คืนอุปกรณ์ห้องแล็บ (Root route ของ Web App 2)
// -------------------------------------------------------------
app.get(['/', '/equipment'], async (req, res) => {
  const user = req.user;
  const equipments = await getEquipments();
  const userLoans = await getUserLoans(user.username);
  const isDirectPort = req.isDirectPort;
  const actionPrefix = isDirectPort ? '' : '/equipment';

  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ระบบยืม-คืนอุปกรณ์ห้องปฏิบัติการ (Web App 2 - Port ${PORT})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>${sharedStyles}</style>
</head>
<body>
  ${renderNavbar(user, isDirectPort)}

  <main class="main-container">
    <div class="hero-banner">
      <div class="hero-title">
        <h1>📦 ระบบยืม-คืนอุปกรณ์ฮาร์ดแวร์ & IoT ห้องปฏิบัติการ</h1>
        <p>รันแยกอิสระในโฟลเดอร์ <strong>web-app-2/</strong> บนพอร์ต <strong>${PORT}</strong> ด้วย Stateless SSO JWT Verification</p>
        <div class="badge-meta">
          <span>🚀 Service: Web App 2</span>
          <span>•</span>
          <span>⚡ Port: ${PORT}</span>
          <span>•</span>
          <span>📁 Folder: web-app-2</span>
          <span>•</span>
          <span>🐘 Database: PostgreSQL (:5432)</span>
        </div>
      </div>
      <div class="sso-tag">
        <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
        Single Sign-On Verified
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="card">
          <div class="card-header">
            <h3>รายการอุปกรณ์ที่เปิดให้ยืม</h3>
            <span style="font-size: 12px; color: var(--muted);">สำหรับทำโครงงานและการเรียน</span>
          </div>

          ${equipments.map(item => `
            <div class="item-card">
              <div class="item-info">
                <h4>${item.id}: ${item.name}</h4>
                <p>หมวดหมู่: <span style="color: #38bdf8;">${item.category}</span></p>
                <p style="margin-top: 4px; color: ${item.available > 0 ? '#6ee7b7' : '#f87171'};">
                  สถานะ: ${item.available > 0 ? `พร้อมให้ยืม (${item.available}/${item.total} รายการ)` : 'ของหมดชั่วคราว'}
                </p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <div class="card-header">
            <h3>รายการอุปกรณ์ที่คุณกำลังยืม (${user.username})</h3>
          </div>

          ${userLoans.length === 0 ? `
            <p style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
              ไม่มีประวัติการยืมอุปกรณ์ที่ค้างส่งในขณะนี้
            </p>
          ` : `
            <table class="table">
              <thead>
                <tr>
                  <th>รหัสยืม</th>
                  <th>อุปกรณ์</th>
                  <th>วันที่ยืม</th>
                  <th>กำหนดคืน</th>
                  <th>เหตุผล</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${userLoans.map(loan => `
                  <tr>
                    <td><code>${loan.id}</code></td>
                    <td><strong>${loan.equipName}</strong></td>
                    <td>${loan.borrowDate}</td>
                    <td><span style="color: #fb923c;">${loan.returnDate}</span></td>
                    <td>${loan.purpose}</td>
                    <td><span class="badge-status">กำลังยืม</span></td>
                    <td>
                      <form action="${actionPrefix}/return" method="POST" style="display:inline;">
                        <input type="hidden" name="loanId" value="${loan.id}">
                        <button type="submit" class="btn-cancel" onclick="return confirm('ยืนยันการคืนอุปกรณ์นี้?')">ส่งคืนอุปกรณ์</button>
                      </form>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header">
            <h3>แบบฟอร์มขอยืมอุปกรณ์</h3>
          </div>

          <form action="${actionPrefix}/borrow" method="POST" class="form-styled">
            <div class="form-group">
              <label for="equipSelect">เลือกอุปกรณ์ที่ต้องการยืม</label>
              <select name="equipId" id="equipSelect" required>
                ${equipments.map(e => `
                  <option value="${e.id}" ${e.available <= 0 ? 'disabled' : ''}>
                    ${e.id} - ${e.name} (คงเหลือ ${e.available})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="borrowDate">วันที่เริ่มต้นยืม</label>
              <input type="date" id="borrowDate" name="borrowDate" value="2026-09-08" required>
            </div>

            <div class="form-group">
              <label for="returnDate">กำหนดวันส่งคืน</label>
              <input type="date" id="returnDate" name="returnDate" value="2026-09-15" required>
            </div>

            <div class="form-group">
              <label for="purpose">วัตถุประสงค์ / ชื่อวิชาโครงงาน</label>
              <input type="text" id="purpose" name="purpose" placeholder="เช่น ทำโครงงานวิชา Network Security" required>
            </div>

            <button type="submit" class="btn-primary">ยืนยันการขอยืมอุปกรณ์</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>SSO Token Verification (Web App 2)</h3>
          </div>
          <p style="font-size: 12px; color: var(--muted); line-height: 1.5;">
            แอปตัวที่ 2 ตรวจสอบลายเซ็นด้วย Shared Secret บนพอร์ต <strong>${PORT}</strong> โดยอ่านคุกกี้ <code>sso_token</code> จากโดเมนเดียวกัน:
          </p>
          <div class="token-box">
<strong>Decoded JWT Payload:</strong><br>
${JSON.stringify(user, null, 2)}
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`);
});

// บันทึกการยืมอุปกรณ์ใน PostgreSQL (SQL Transaction)
app.post(['/borrow', '/equipment/borrow'], async (req, res) => {
  const { equipId, borrowDate, returnDate, purpose } = req.body;
  const user = req.user;
  const newId = 'LOAN-' + Math.floor(100 + Math.random() * 900);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const equipRes = await client.query(
      'SELECT name, available FROM equipments WHERE id = $1 FOR UPDATE',
      [equipId]
    );

    if (equipRes.rows.length > 0 && equipRes.rows[0].available > 0) {
      const equip = equipRes.rows[0];
      await client.query('UPDATE equipments SET available = available - 1 WHERE id = $1', [equipId]);
      await client.query(
        `INSERT INTO equipment_loans (id, equip_id, equip_name, student_id, borrow_date, return_date, purpose, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'BORROWED')`,
        [newId, equipId, equip.name, user.username, borrowDate || '2026-09-08', returnDate || '2026-09-15', purpose || 'การศึกษาและทดลองในรายวิชา']
      );
      await client.query('COMMIT');
      console.log(`[Web App 2 (Port ${PORT})] Equipment loan created in PostgreSQL: ${newId} for ${user.username}`);
    } else {
      await client.query('ROLLBACK');
      console.warn(`[Web App 2 (Port ${PORT})] Equipment ${equipId} is out of stock.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Web App 2 (Port ${PORT})] Equipment loan transaction error:`, err.message);
  } finally {
    client.release();
  }

  const returnPath = req.isDirectPort ? '/' : '/equipment/';
  res.redirect(returnPath);
});

// ส่งคืนอุปกรณ์ใน PostgreSQL (SQL Transaction)
app.post(['/return', '/equipment/return'], async (req, res) => {
  const { loanId } = req.body;
  const user = req.user;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const loanRes = await client.query(
      'SELECT equip_id FROM equipment_loans WHERE id = $1 AND student_id = $2 AND status = $3 FOR UPDATE',
      [loanId, user.username, 'BORROWED']
    );

    if (loanRes.rows.length > 0) {
      const equipId = loanRes.rows[0].equip_id;
      await client.query('UPDATE equipments SET available = available + 1 WHERE id = $1', [equipId]);
      await client.query('DELETE FROM equipment_loans WHERE id = $1', [loanId]);
      await client.query('COMMIT');
      console.log(`[Web App 2 (Port ${PORT})] Equipment loan returned in PostgreSQL: ${loanId} by ${user.username}`);
    } else {
      await client.query('ROLLBACK');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Web App 2 (Port ${PORT})] Return transaction error:`, err.message);
  } finally {
    client.release();
  }

  const returnPath = req.isDirectPort ? '/' : '/equipment/';
  res.redirect(returnPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Web App 2] Equipment Loan Service running on port ${PORT}`);
  console.log(`[Web App 2] PostgreSQL DB: ${DATABASE_URL}`);
});
