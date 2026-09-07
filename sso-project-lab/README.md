# SSO Project Lab (FreeRADIUS + Central Authentication Service + Nginx)

ระบบจำลอง **Single Sign-On (SSO)** ด้วย **FreeRADIUS Server**, **Central Authentication Service (Node.js)**, **Web Application (ระบบจองห้องแล็บ)** และ **Nginx Reverse Proxy** ตามเอกสารคู่มือปฏิบัติการ

---

## 📁 โครงสร้างโปรเจกต์ (Project Directory Structure)

```text
sso-project-lab/
│
├── docker-compose.yml       # ไฟล์จัดการ Container ทั้งหมด (4 Services)
├── nginx/
│   └── nginx.conf           # ไฟล์ตั้งค่า Reverse Proxy & Path Routing (/auth, /lab)
│
├── central-auth/            # โฟลเดอร์ของ Central Auth Service (Node.js)
│   ├── Dockerfile
│   ├── package.json
│   └── server.js            # โค้ดเชื่อมต่อ FreeRADIUS ผ่าน UDP พร้อม Timeout & สร้าง JWT
│
└── web-app-1/               # โฟลเดอร์ของระบบที่ 1 เช่น ระบบจองห้องแล็บ (Node.js)
    ├── Dockerfile
    ├── package.json
    └── app.js               # โค้ดตรวจสอบ Signature ของ JWT (Stateless)
```

---

## 🚀 วิธีการรันโปรเจกต์ (How to Run)

### 1. เปิดโปรแกรม Docker Desktop
ตรวจสอบให้แน่ใจว่าได้เปิดใช้งาน **Docker Desktop** บนเครื่องแล้ว

### 2. รันคำสั่งด้วย Docker Compose
เปิด PowerShell หรือ Terminal แล้วไปที่โฟลเดอร์ `sso-project-lab`:

```bash
cd sso-project-lab
docker compose up -d --build
```

เมื่อสั่งคำสั่งนี้ Docker จะดาวน์โหลดและคอมไพล์ container ทั้ง 4 ตัว:
- `sso_radius`: FreeRADIUS Server บน UDP พอร์ต 1812
- `sso_central_auth`: Central Auth Service บนพอร์ต 3000
- `sso_web_app_1`: ระบบจองห้องแล็บ บนพอร์ต 4000
- `sso_nginx_proxy`: Nginx Reverse Proxy รับ Request พอร์ต 80 ของ localhost

---

## 🧪 ขั้นตอนการทดสอบระบบ (Testing Steps)

1. **เปิดเบราว์เซอร์** ไปที่:  
   👉 **`http://localhost/lab`** หรือ **`http://localhost`**

2. **ระบบจะตรวจพบว่ายังไม่มี Token** และจะทำการ **Redirect อัตโนมัติ** ไปที่:  
   👉 `http://localhost/auth/login?redirect_url=/lab/`

3. **กรอกข้อมูลบัญชีทดสอบ** (ที่กำหนดไว้ใน RADIUS Server):
   - **Username**: `student66000001`
   - **Password**: `password1234`

4. **ผลลัพธ์**:
   - Central Auth Service จะส่งแพ็กเกจ `Access-Request` ไปยัง FreeRADIUS ผ่าน UDP 1812
   - เมื่อ RADIUS ตอบ `Access-Accept` ระบบจะออก **JWT** และบันทึกลงใน **HTTPOnly Cookie** (`sso_token`)
   - เบราว์เซอร์จะถูก Redirect กลับมายัง `http://localhost/lab/` โดยอัตโนมัติ
   - หน้าจอจะแสดงระบบจองห้องแล็บ พร้อมข้อมูลนักศึกษาและข้อมูล JWT Token Inspector ที่ถูกถอดรหัสแบบ Stateless

5. **ทดสอบฟังก์ชันใน Web App**:
   - สามารถเลือกห้องแล็บ วันที่ และเครื่องคอมพิวเตอร์ เพื่อกด **"ยืนยันการจองที่นั่ง"**
   - รายการจองจะแสดงในตารางและสามารถกดยกเลิกได้
   - กดปุ่ม **"ออกจากระบบ"** ระบบจะลบ Cookie `sso_token` และพากลับไปยังหน้า Login กลาง

---

## 💡 จุดเด่นและการปฏิบัติตามข้อควรระวัง (Key Highlights)

1. **UDP Stateless & Timeout**: ใน `central-auth/server.js` มีการดักจับ Timeout 3 วินาทีตามข้อควรระวัง เพื่อป้องกันไม่ให้ Node.js รอการตอบกลับจาก RADIUS Server จน Hang หากเซิร์ฟเวอร์เกิดขัดข้อง
2. **Stateless JWT Verification**: ใน `web-app-1/app.js` ทำการตรวจ Signature ของ JWT ด้วย Shared Secret โดยตรงในเครื่อง ทำให้ลดภาระ ไม่ต้อง Query กลับไปที่ RADIUS ซ้ำอีก
3. **HTTPOnly Cookie**: ตั้งค่าคุกกี้ระดับโดเมน เพื่อความปลอดภัยจาก XSS และแชร์สถานะการล็อกอินข้าม Web App ได้อย่างราบรื่น

---

## 🛑 คำสั่งสำหรับหยุดการทำงาน

```bash
docker compose down
```
