const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'kmitl_chumphon_sso_secret_key';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ข้อมูลจำลองห้องแล็บและการจอง
const labRooms = [
  { id: 'LAB-101', name: 'ห้องปฏิบัติการ AI & Data Science', location: 'อาคารเรียนรวม 4 ชั้น 2', capacity: 35, available: 18 },
  { id: 'LAB-202', name: 'ห้องปฏิบัติการ Network & Cybersecurity', location: 'อาคารวิศวกรรมคอมพิวเตอร์ ชั้น 3', capacity: 30, available: 12 },
  { id: 'LAB-303', name: 'ห้องปฏิบัติการ Software & Cloud Computing', location: 'อาคารวิจัยและนวัตกรรม ชั้น 1', capacity: 40, available: 25 }
];

let reservations = [
  { id: 'RES-001', room: 'LAB-202', roomName: 'Network & Cybersecurity', studentId: 'student66000001', slot: '13:00 - 16:00', seat: 'PC-09', date: '2026-09-08' }
];

/**
 * Middleware: ขั้นตอนที่ 3 การตรวจสอบบัตรผ่านที่แอปปลายทาง (Token Verification)
 * แกะและตรวจ Signature ของ JWT โดยใช้ Shared Secret โดยไม่ต้องวิ่งกลับไปถาม RADIUS หรือ Central Auth ซ้ำ
 */
function ssoAuthMiddleware(req, res, next) {
  const token = req.cookies.sso_token;

  if (!token) {
    console.log('[Web App 1] No SSO token found. Redirecting to Central Auth Service...');
    return res.redirect('/auth/login?redirect_url=/lab/');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.warn('[Web App 1] Invalid or expired SSO token:', err.message);
    res.clearCookie('sso_token', { path: '/' });
    return res.redirect('/auth/login?redirect_url=/lab/');
  }
}

// ทุก Route ใต้ /lab จะถูกป้องกันด้วย SSO Middleware
app.use(ssoAuthMiddleware);

/**
 * หน้าแดชบอร์ดระบบจองห้องแล็บ
 */
app.get('/', (req, res) => {
  const user = req.user;
  const userReservations = reservations.filter(r => r.studentId === user.username);
  const rawToken = req.cookies.sso_token;

  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ระบบจองห้องแล็บคอมพิวเตอร์ (Web App 1)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --accent: #f97316;
      --bg: #0b1329;
      --card-bg: rgba(23, 37, 84, 0.45);
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
      background: radial-gradient(circle at 10% 10%, #1e1b4b 0%, #0b1329 70%, #020617 100%);
      color: var(--text);
      min-height: 100vh;
      padding-bottom: 40px;
    }

    .navbar {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 18px;
    }

    .brand-text h2 {
      font-size: 17px;
      font-weight: 700;
    }

    .brand-text span {
      font-size: 11px;
      color: var(--muted);
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
      background: #f97316;
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
      margin: 32px auto;
      padding: 0 20px;
    }

    .hero-banner {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.2) 0%, rgba(14, 165, 233, 0.1) 100%);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 16px;
      padding: 24px 30px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .hero-title h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .hero-title p {
      color: #bae6fd;
      font-size: 13px;
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
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .card-header h3 {
      font-size: 16px;
      font-weight: 600;
    }

    .room-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s;
    }

    .room-card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-2px);
    }

    .room-info h4 {
      font-size: 15px;
      margin-bottom: 4px;
    }

    .room-info p {
      font-size: 12px;
      color: var(--muted);
    }

    .booking-form {
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
      font-size: 14px;
      outline: none;
    }

    select:focus, input:focus {
      border-color: #38bdf8;
    }

    .btn-book {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
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

    .btn-book:hover {
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
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
      padding: 16px;
      font-family: monospace;
      font-size: 11px;
      overflow-x: auto;
      color: #7dd3fc;
      margin-top: 14px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="brand">
      <div class="brand-icon">LAB</div>
      <div class="brand-text">
        <h2>ระบบจองห้องแล็บคอมพิวเตอร์</h2>
        <span>KMITL Computer Lab Reservation (Web App 1)</span>
      </div>
    </div>
    <div class="user-info">
      <div class="user-pill">
        <div class="user-avatar">${user.username ? user.username.charAt(0).toUpperCase() : 'U'}</div>
        <div>
          <div><strong>${user.name || user.username}</strong></div>
          <div style="font-size: 11px; color: #94a3b8;">${user.username} (${user.role})</div>
        </div>
      </div>
      <a href="/auth/logout?redirect_url=/lab/" class="btn-logout">ออกจากระบบ</a>
    </div>
  </header>

  <main class="main-container">
    <div class="hero-banner">
      <div class="hero-title">
        <h1>ยินดีต้อนรับสู่ระบบจองห้องปฏิบัติการคอมพิวเตอร์</h1>
        <p>ยืนยันตัวตนสำเร็จผ่าน Central Authentication Service (FreeRADIUS + JWT)</p>
      </div>
      <div class="sso-tag">
        <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
        SSO Verified (Stateless)
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="card">
          <div class="card-header">
            <h3>ห้องปฏิบัติการที่เปิดให้บริการ</h3>
            <span style="font-size: 12px; color: var(--muted);">ภาคการศึกษาปัจจุบัน</span>
          </div>

          ${labRooms.map(room => `
            <div class="room-card">
              <div class="room-info">
                <h4>${room.id}: ${room.name}</h4>
                <p>📍 ${room.location}</p>
                <p style="margin-top: 4px; color: #38bdf8;">ความจุทั้งหมด ${room.capacity} ที่นั่ง (ว่าง ${room.available} เครื่อง)</p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <div class="card-header">
            <h3>รายการจองของคุณ (${user.username})</h3>
          </div>

          ${userReservations.length === 0 ? `
            <p style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
              ยังไม่มีประวัติการจองในขณะนี้
            </p>
          ` : `
            <table class="table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ห้องแล็บ</th>
                  <th>วันที่</th>
                  <th>ช่วงเวลา</th>
                  <th>เครื่อง</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${userReservations.map(resv => `
                  <tr>
                    <td><code>${resv.id}</code></td>
                    <td>${resv.roomName}</td>
                    <td>${resv.date}</td>
                    <td>${resv.slot}</td>
                    <td><strong>${resv.seat}</strong></td>
                    <td><span class="badge-status">จองสำเร็จ</span></td>
                    <td>
                      <form action="/lab/cancel" method="POST" style="display:inline;">
                        <input type="hidden" name="bookingId" value="${resv.id}">
                        <button type="submit" class="btn-cancel" onclick="return confirm('ยืนยันการยกเลิกการจอง?')">ยกเลิก</button>
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
            <h3>แบบฟอร์มจองห้องแล็บ</h3>
          </div>

          <form action="/lab/book" method="POST" class="booking-form">
            <div class="form-group">
              <label for="roomSelect">เลือกห้องปฏิบัติการ</label>
              <select name="roomId" id="roomSelect" required>
                ${labRooms.map(r => `<option value="${r.id}">${r.id} - ${r.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="bookDate">วันที่เข้าใช้งาน</label>
              <input type="date" id="bookDate" name="bookDate" value="2026-09-08" required>
            </div>

            <div class="form-group">
              <label for="timeSlot">ช่วงเวลา</label>
              <select name="slot" id="timeSlot" required>
                <option value="09:00 - 12:00">เช้า (09:00 - 12:00 น.)</option>
                <option value="13:00 - 16:00">บ่าย (13:00 - 16:00 น.)</option>
                <option value="17:00 - 20:00">เย็น (17:00 - 20:00 น.)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="seatNumber">หมายเลขเครื่องที่ต้องการ</label>
              <input type="text" id="seatNumber" name="seatNumber" placeholder="เช่น PC-15" value="PC-01" required>
            </div>

            <button type="submit" class="btn-book">ยืนยันการจองที่นั่ง</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>สถาปัตยกรรม SSO (JWT Token Inspector)</h3>
          </div>
          <p style="font-size: 12px; color: var(--muted); line-height: 1.5;">
            Web App นี้ถอดรหัสและตรวจ Signature ของ JWT ด้วย <code>JWT_SECRET</code> โดยไม่จำเป็นต้องส่ง Request ไปถาม RADIUS ซ้ำ (Stateless SSO):
          </p>
          <div class="token-box">
<strong>Decoded Payload:</strong><br>
${JSON.stringify(user, null, 2)}
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`);
});

// บันทึกการจอง
app.post('/book', (req, res) => {
  const { roomId, bookDate, slot, seatNumber } = req.body;
  const user = req.user;

  const room = labRooms.find(r => r.id === roomId) || labRooms[0];
  const newBooking = {
    id: 'RES-' + Math.floor(100 + Math.random() * 900),
    room: roomId,
    roomName: room.name,
    studentId: user.username,
    slot: slot,
    seat: seatNumber || 'PC-Auto',
    date: bookDate || '2026-09-08'
  };

  reservations.push(newBooking);
  console.log(`[Web App 1] Reservation created: ${newBooking.id} by ${user.username}`);
  res.redirect('/lab/');
});

// ยกเลิกการจอง
app.post('/cancel', (req, res) => {
  const { bookingId } = req.body;
  const user = req.user;

  reservations = reservations.filter(r => !(r.id === bookingId && r.studentId === user.username));
  console.log(`[Web App 1] Reservation cancelled: ${bookingId} by ${user.username}`);
  res.redirect('/lab/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Web App 1] Lab Booking Service is running on port ${PORT}`);
});
