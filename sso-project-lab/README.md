# SSO Project Lab (FreeRADIUS + Central Authentication Service + Nginx)

ระบบจำลอง **Single Sign-On (SSO)** ด้วย **FreeRADIUS Server**, **Central Authentication Service (Node.js)**, **Web Applications แยกโฟลเดอร์และแยกพอร์ต** และ **Nginx Reverse Proxy** ตามเอกสารคู่มือปฏิบัติการ

---

## 📁 โครงสร้างโปรเจกต์ (Project Directory Structure)

```text
sso-project-lab/
│
├── docker-compose.yml       # ไฟล์จัดการ Container ทั้งหมด (6 Services อิสระ)
├── presentation.html        # สไลด์นำเสนอ Interactive Slides (เปิดผ่าน /presentation หรือไฟล์ตรง)
├── start.bat                # สคริปต์คลิกเดียวสำหรับเปิดระบบทั้งหมด
├── stop.bat                 # สคริปต์หยุดการทำงาน
│
├── postgres/                # ฐานข้อมูล PostgreSQL (Port 5432)
│   └── init.sql             # สคริปต์สร้างตาราง & Seed ข้อมูลอัตโนมัติ
│
├── nginx/
│   └── nginx.conf           # ตั้งค่า Reverse Proxy (/auth, /lab, /equipment)
│
├── freeradius/              # เซิร์ฟเวอร์ RADIUS (UDP 1812)
│   ├── Dockerfile
│   ├── clients.conf
│   └── authorize
│
├── central-auth/            # Central Auth Service (Port 3000)
│   ├── Dockerfile
│   ├── package.json
│   └── server.js            # เชื่อมต่อ FreeRADIUS (UDP 1812), ออก JWT, บันทึก Login Audit Logs ลง PostgreSQL
│
├── web-app-1/               # Web App 1 (Page 1): ระบบจองห้องแล็บคอมพิวเตอร์ (Port 4001)
│   ├── Dockerfile
│   ├── package.json
│   └── app.js               # Stateless JWT Verification + อ่าน/บันทึกการจองลง PostgreSQL
│
└── web-app-2/               # Web App 2 (Page 2): ระบบยืม-คืนอุปกรณ์ห้องแล็บ (Port 4002)
    ├── Dockerfile
    ├── package.json
    └── app.js               # Stateless JWT Verification + ระบบยืม-คืนอุปกรณ์ด้วย SQL Transaction บน PostgreSQL
```

---

## 🚀 วิธีการรันโปรเจกต์ (How to Run)

### 1. เปิดโปรแกรม Docker Desktop
ตรวจสอบให้แน่ใจว่าได้เปิดใช้งาน **Docker Desktop** บนเครื่องแล้ว

### 2. รันคำสั่งด้วย Docker Compose หรือดับเบิลคลิก `start.bat`
เปิด PowerShell หรือ Terminal แล้วไปที่โฟลเดอร์ `sso-project-lab`:

```bash
cd sso-project-lab
docker compose up -d --build
```

เมื่อสั่งคำสั่งนี้ Docker จะดาวน์โหลดและคอมไพล์ container ทั้ง 6 ตัว:
- `sso_radius`: FreeRADIUS Server บน UDP พอร์ต 1812
- `sso_postgres`: PostgreSQL Database บนพอร์ต 5432 (ฐานข้อมูล `sso_db`)
- `sso_central_auth`: Central Auth Service บนพอร์ต 3000
- `sso_web_app_1`: Web App 1 (ระบบจองห้องแล็บ) บนพอร์ต 4001
- `sso_web_app_2`: Web App 2 (ระบบยืมอุปกรณ์) บนพอร์ต 4002
- `sso_nginx_proxy`: Nginx Reverse Proxy รับ Request พอร์ต 80 ของ localhost

---

## 🧪 ขั้นตอนการทดสอบระบบ (Testing Steps)

### วิธีที่ 1: เข้าใช้งานผ่าน Nginx Reverse Proxy (พอร์ต 80)
1. **เปิดเบราว์เซอร์** ไปที่:  
   👉 **`http://localhost/lab`**
2. **ระบบตรวจพบว่ายังไม่มี Token** ➔ Redirect ไปที่:  
   👉 `http://localhost/auth/login?redirect_url=/lab/`
3. **กรอกข้อมูลบัญชีทดสอบ**:
   - **Username**: `student66000001`
   - **Password**: `password1234`
4. **ผลลัพธ์**: ล็อกอินผ่าน FreeRADIUS ได้รับ HTTPOnly Cookie และกลับมายัง Web App 1 (พอร์ต 4001)
5. **ทดสอบ SSO ข้ามพอร์ตไปยัง Web App 2**:
   - คลิกที่แถบเมนูด้านบน **"📦 Web App 2: ยืมอุปกรณ์ (:4002)"** หรือเข้าตรงที่ `http://localhost/equipment/`
   - เข้าใช้งานได้ทันที **โดยไม่ต้องล็อกอินใหม่** เพราะคุกกี้ SSO ถูกแชร์ข้ามระบบ!

### วิธีที่ 2: ทดสอบเข้าตรงผ่านพอร์ตแยก (Direct Port Access)
- **Web App 1 (จองห้องแล็บ):** `http://localhost:4001/`
- **Web App 2 (ยืมอุปกรณ์):** `http://localhost:4002/`
- **Central Auth Service:** `http://localhost:3000/auth/login`

หากเปิด Browser ใน Incognito แล้วเข้า `http://localhost:4002/` ตรงๆ ระบบจะดีดไปหน้า Login พร้อม `redirect_url=http://localhost:4002/` ทันที!

---

## 💡 จุดเด่นทางเทคนิค (Technical Highlights)

1. **Modular Architecture (แยกโฟลเดอร์ & แยกพอร์ต):** `web-app-1/` (พอร์ต 4001) และ `web-app-2/` (พอร์ต 4002) เป็น 2 Microservices อิสระที่มี codebase ของตัวเอง
2. **UDP Stateless & Timeout:** ใน `central-auth/server.js` มีการดักจับ Timeout 3 วินาทีตามข้อควรระวัง เพื่อป้องกันไม่ให้ Node.js รอการตอบกลับจาก RADIUS Server จน Hang
3. **Stateless JWT Verification:** Web App ปลายทางทั้งสองใช้ Shared Secret ตรวจ Signature โดยตรง ไม่ต้องเชื่อมต่อ FreeRADIUS ซ้ำ
4. **HTTPOnly Cookie Domain-Wide:** บัตรผ่านถูกเก็บใน cookie ป้องกัน XSS และส่งไปกับทุกพอร์ตของ `localhost`
5. **PostgreSQL Relational Storage & Audit Trail:** 
   - จัดเก็บข้อมูลจริงลงฐานข้อมูล `sso_db` (พอร์ต 5432) ข้อมูลไม่สูญหายเมื่อรีสตาร์ท Container
   - ตาราง `login_audit_logs`: บันทึกประวัติการยืนยันตัวตน SSO จาก Central Auth (เรียกดูได้ที่ `GET /api/audit-logs`)
   - ตาราง `lab_rooms` & `lab_reservations`: ระบบจองห้องแล็บใน Web App 1
   - ตาราง `equipments` & `equipment_loans`: ระบบยืมอุปกรณ์ใน Web App 2 พร้อม SQL Transaction ป้องกัน Race Condition

---

## 🛑 คำสั่งสำหรับหยุดการทำงาน

```bash
docker compose down
```
หรือดับเบิลคลิก `stop.bat`
