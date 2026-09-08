const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const dgram = require('dgram');
const radius = require('radius');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const RADIUS_HOST = process.env.RADIUS_HOST || 'freeradius';
const RADIUS_SECRET = process.env.RADIUS_SECRET || 'testing123';
const JWT_SECRET = process.env.JWT_SECRET || 'kmitl_chumphon_sso_secret_key';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sso_user:sso_password@postgres:5432/sso_db';

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.warn('[Central Auth] PostgreSQL connection warning:', err.message);
  } else {
    console.log('[Central Auth] Connected to PostgreSQL (sso_db) successfully');
  }
});

/**
 * บันทึก Audit Log การเข้าสู่ระบบลงฐานข้อมูล PostgreSQL
 */
async function logAuditEvent(username, status, ip, userAgent, failureReason = null) {
  try {
    await pool.query(
      `INSERT INTO login_audit_logs (username, status, ip_address, user_agent, failure_reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, status, ip || '127.0.0.1', userAgent || 'Unknown', failureReason]
    );
  } catch (err) {
    console.error('[Central Auth] Error saving audit log to PostgreSQL:', err.message);
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

/**
 * ส่งคำขอตรวจสอบสิทธิ์ไปยัง RADIUS Server ผ่าน UDP พอร์ต 1812
 * ตามคำแนะนำ Tip 1: มีการตั้งค่า Timeout 3 วินาทีเพื่อป้องกันระบบ Hang
 */
function authenticateRadius(username, password) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    let responded = false;

    // เข้ารหัสข้อมูลตามโปรโตคอล RADIUS (RFC 2865)
    let packet;
    try {
      packet = radius.encode({
        code: 'Access-Request',
        secret: RADIUS_SECRET,
        attributes: [
          ['User-Name', username],
          ['User-Password', password]
        ]
      });
    } catch (err) {
      client.close();
      return reject(new Error('Failed to encode RADIUS packet: ' + err.message));
    }

    // Timeout 3 วินาที (ป้องกัน UDP Hang)
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        try { client.close(); } catch (e) {}
        reject(new Error('RADIUS Server connection timed out (3s). FreeRADIUS might be offline.'));
      }
    }, 3000);

    // รับผลลัพธ์จาก RADIUS Server
    client.on('message', (msg) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);

      try {
        const response = radius.decode({ packet: msg, secret: RADIUS_SECRET });
        client.close();

        if (response.code === 'Access-Accept') {
          resolve({ success: true, response });
        } else {
          resolve({ success: false, code: response.code });
        }
      } catch (err) {
        client.close();
        reject(new Error('Failed to decode RADIUS response: ' + err.message));
      }
    });

    client.on('error', (err) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      try { client.close(); } catch (e) {}
      reject(err);
    });

    // ส่ง Packet ไปยัง RADIUS Host:1812
    client.send(packet, 0, packet.length, 1812, RADIUS_HOST, (err) => {
      if (err && !responded) {
        responded = true;
        clearTimeout(timeout);
        try { client.close(); } catch (e) {}
        reject(err);
      }
    });
  });
}

/**
 * ตรวจสอบ Token ที่มีอยู่แล้ว
 */
function checkExistingAuth(req) {
  const token = req.cookies.sso_token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * เทมเพลต HTML หน้าเข้าสู่ระบบ (Central Authentication Service)
 */
function renderLoginPage({ error = null, successMsg = null, redirectUrl = '/lab/', username = '' }) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Central Authentication Service (SSO)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #f97316;
      --primary-hover: #ea580c;
      --primary-glow: rgba(249, 115, 22, 0.25);
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --danger: #ef4444;
      --success: #10b981;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      background: radial-gradient(circle at 20% 20%, #1e1b4b 0%, #0f172a 60%, #020617 100%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .container {
      width: 100%;
      max-width: 440px;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 40px 32px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #f97316, #fb923c, #f43f5e);
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .badge {
      display: inline-block;
      padding: 5px 12px;
      background: rgba(249, 115, 22, 0.15);
      color: #fb923c;
      border: 1px solid rgba(249, 115, 22, 0.3);
      border-radius: 50px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      text-transform: uppercase;
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
    }

    p.subtitle {
      font-size: 13px;
      color: var(--text-muted);
    }

    .alert {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .alert-danger {
      background: rgba(239, 68, 68, 0.22);
      border: 1px solid #ef4444;
      color: #fca5a5;
      font-weight: 500;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.2);
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #cbd5e1;
      margin-bottom: 8px;
    }

    .input-wrapper {
      position: relative;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 14px;
      color: #fff;
      outline: none;
      transition: all 0.2s ease;
    }

    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }

    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 15px var(--primary-glow);
      margin-top: 10px;
    }

    .btn-submit:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4);
    }

    .btn-submit:active {
      transform: translateY(0);
    }

    .demo-box {
      margin-top: 24px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 14px;
      font-size: 12px;
    }

    .demo-box strong {
      color: #fb923c;
      display: block;
      margin-bottom: 6px;
    }

    .demo-box code {
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      color: #38bdf8;
      font-family: monospace;
    }

    .system-status {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      margin-right: 4px;
      box-shadow: 0 0 8px #10b981;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="badge">KMITL SSO System</div>
        <h1>เข้าสู่ระบบส่วนกลาง</h1>
        <p class="subtitle">Central Authentication Service (CAS / FreeRADIUS)</p>
      </div>

      ${error ? `<div class="alert alert-danger">⚠️ ${error}</div>` : ''}
      ${successMsg ? `<div class="alert alert-success">✓ ${successMsg}</div>` : ''}

      <form action="/auth/login" method="POST">
        <input type="hidden" name="redirect_url" value="${redirectUrl}">

        <div class="form-group">
          <label for="username">ชื่อผู้ใช้ / รหัสนักศึกษา (Username)</label>
          <input type="text" id="username" name="username" value="${username}" placeholder="เช่น student66000001" required autofocus>
        </div>

        <div class="form-group">
          <label for="password">รหัสผ่าน (Password)</label>
          <input type="password" id="password" name="password" placeholder="รหัสผ่านสำหรับ FreeRADIUS" required>
        </div>

        <button type="submit" class="btn-submit">ยืนยันตัวตน (Single Sign-On)</button>
      </form>

      <div class="demo-box">
        <strong>ข้อมูลสำหรับทดสอบระบบ (ตามเอกสาร Lab):</strong>
        <div>• ผู้ใช้: <code>student66000001</code></div>
        <div>• รหัสผ่าน: <code>password1234</code></div>
      </div>

      <div class="system-status">
        <span><span class="status-dot"></span>RADIUS: ${RADIUS_HOST}:1812 (UDP)</span>
        <span><span class="status-dot" style="background:#38bdf8;box-shadow:0 0 8px #38bdf8;"></span>PostgreSQL: 5432 (Audit Logs)</span>
        <span>Token: JWT (Stateless)</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------

// เข้าหน้าแรก หรือ /login (รองรับทั้ง /login และ /auth/login)
app.get(['/', '/login', '/auth', '/auth/login'], (req, res) => {
  const redirectUrl = req.query.redirect_url || '/lab/';
  const loggedOut = req.query.logged_out === '1';
  const errorCode = req.query.error;

  // ตรวจสอบว่าผู้ใช้มี Token อยู่แล้วหรือไม่ (ยกเว้นกรณีมีแจ้งเตือน error หรือกด logout)
  const existingUser = checkExistingAuth(req);
  if (existingUser && !loggedOut && !errorCode) {
    return res.redirect(redirectUrl);
  }

  let errorMsg = null;
  if (errorCode === 'not_logged_in' || errorCode === 'unauthorized') {
    errorMsg = 'กรุณาเข้าสู่ระบบก่อนเข้าใช้งาน (คุณยังไม่ได้ล็อกอิน)';
  } else if (errorCode) {
    errorMsg = decodeURIComponent(errorCode);
  }

  const successMsg = loggedOut ? 'ออกจากระบบเรียบร้อยแล้ว' : null;
  res.send(renderLoginPage({ error: errorMsg, redirectUrl, successMsg }));
});

// ตรวจสอบ Username/Password กับ FreeRADIUS และออก JWT
app.post(['/login', '/auth/login'], async (req, res) => {
  const { username, password } = req.body;
  const redirectUrl = req.body.redirect_url || '/lab/';
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!username || !password) {
    return res.status(400).send(renderLoginPage({
      error: 'กรุณากรอก Username และ Password',
      redirectUrl,
      username
    }));
  }

  try {
    // 1. ส่งคำขอ Access-Request ไปยัง FreeRADIUS Server
    const radiusResult = await authenticateRadius(username.trim(), password);

    if (radiusResult.success) {
      // บันทึก Audit Log ลง PostgreSQL ว่า Login สำเร็จ
      await logAuditEvent(username.trim(), 'SUCCESS', clientIp, userAgent);

      // 2. ออก JWT Token (ตามขั้นตอนที่ 1 ในเอกสาร)
      const payload = {
        sub: username.trim(),
        username: username.trim(),
        studentId: username.startsWith('student') ? username.replace('student', '') : username.trim(),
        name: username === 'student66000001' ? 'สมชาย ใจดี (นักศึกษาทดสอบ)' : username.trim(),
        role: username === 'admin' ? 'admin' : 'student',
        iss: 'central-auth-service',
        campus: 'KMITL Chumphon'
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

      // 3. ตั้งค่า HTTPOnly Cookie (ตามขั้นตอนที่ 2 ในเอกสาร)
      res.cookie('sso_token', token, {
        httpOnly: true,
        secure: false, // สามารถเปิด true ได้หากรัน HTTPS
        sameSite: 'lax',
        path: '/', // Domain-wide Cookie ให้แชร์ข้ามทุก Web App
        maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
      });

      console.log(`[Central Auth] Authentication successful for: ${username}`);
      return res.redirect(redirectUrl);
    } else {
      // บันทึก Audit Log ลง PostgreSQL ว่า Login ไม่ผ่าน
      await logAuditEvent(username.trim(), 'REJECTED', clientIp, userAgent, 'Invalid credentials');

      console.warn(`[Central Auth] Authentication rejected for: ${username}`);
      return res.status(401).send(renderLoginPage({
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (Access-Reject จาก RADIUS)',
        redirectUrl,
        username
      }));
    }
  } catch (err) {
    // บันทึก Audit Log ลง PostgreSQL ว่าเกิด Error
    await logAuditEvent(username.trim(), 'ERROR', clientIp, userAgent, err.message);

    console.error(`[Central Auth] RADIUS Error: ${err.message}`);
    return res.status(500).send(renderLoginPage({
      error: `ไม่สามารถเชื่อมต่อ RADIUS Server ได้: ${err.message}`,
      redirectUrl,
      username
    }));
  }
});

// ออกจากระบบ (ลบคุกกี้ SSO)
app.get(['/logout', '/auth/logout'], (req, res) => {
  res.clearCookie('sso_token', { path: '/' });
  const redirectUrl = req.query.redirect_url || '/lab/';
  const host = req.headers.host || '';
  const isDirectPort = host.includes(':3000');
  const loginPath = isDirectPort ? '/login' : '/auth/login';
  res.redirect(`${loginPath}?logged_out=1&redirect_url=${encodeURIComponent(redirectUrl)}`);
});

// API สำหรับตรวจสอบ Token (สำหรับ Application อื่นที่ต้องการ Query ผ่าน API)
app.get('/api/verify', (req, res) => {
  const token = req.cookies.sso_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ valid: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ valid: false, message: 'Invalid or expired token', error: err.message });
  }
});

// API สำหรับดึงประวัติการเข้าสู่ระบบ (Audit Logs) จาก PostgreSQL
app.get('/api/audit-logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, status, ip_address, failure_reason, created_at FROM login_audit_logs ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ success: true, count: result.rows.length, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check endpoint (พร้อมตรวจสอบสถานะ PostgreSQL)
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const dbRes = await pool.query('SELECT NOW()');
    if (dbRes.rows.length) dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }
  res.json({
    status: 'healthy',
    service: 'central-auth',
    database: dbStatus,
    time: new Date()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Central Auth] Service is running on port ${PORT}`);
  console.log(`[Central Auth] RADIUS Host: ${RADIUS_HOST}:1812`);
  console.log(`[Central Auth] PostgreSQL DB: ${DATABASE_URL}`);
});
