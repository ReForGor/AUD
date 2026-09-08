-- =====================================================
-- KMITL SSO Project Lab - PostgreSQL Database Initialization
-- Database: sso_db
-- =====================================================

-- 1. Central Auth Audit Logs (บันทึกประวัติการยืนยันตัวตน SSO)
CREATE TABLE IF NOT EXISTS login_audit_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'REJECTED', 'ERROR'
    ip_address VARCHAR(50),
    user_agent TEXT,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Web App 1: ห้องปฏิบัติการคอมพิวเตอร์ (Lab Rooms)
CREATE TABLE IF NOT EXISTS lab_rooms (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(200) NOT NULL,
    capacity INT NOT NULL DEFAULT 30,
    available INT NOT NULL DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Web App 1: ประวัติการจองที่นั่งปฏิบัติการ (Lab Reservations)
CREATE TABLE IF NOT EXISTS lab_reservations (
    id VARCHAR(30) PRIMARY KEY,
    room_id VARCHAR(20) REFERENCES lab_rooms(id) ON DELETE CASCADE,
    room_name VARCHAR(150) NOT NULL,
    student_id VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    slot VARCHAR(50) NOT NULL,
    seat VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Web App 2: รายการอุปกรณ์ห้องแล็บ (Equipments)
CREATE TABLE IF NOT EXISTS equipments (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    total INT NOT NULL DEFAULT 1,
    available INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Web App 2: รายการบันทึกการยืม-คืนอุปกรณ์ (Equipment Loans)
CREATE TABLE IF NOT EXISTS equipment_loans (
    id VARCHAR(30) PRIMARY KEY,
    equip_id VARCHAR(20) REFERENCES equipments(id) ON DELETE CASCADE,
    equip_name VARCHAR(200) NOT NULL,
    student_id VARCHAR(100) NOT NULL,
    borrow_date DATE NOT NULL,
    return_date DATE NOT NULL,
    purpose TEXT,
    status VARCHAR(20) DEFAULT 'BORROWED', -- 'BORROWED', 'RETURNED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Seed Initial Data (ข้อมูลจำลองเริ่มต้น)
-- =====================================================

-- Seed Lab Rooms
INSERT INTO lab_rooms (id, name, location, capacity, available) VALUES
('LAB-101', 'ห้องปฏิบัติการ AI & Data Science', 'อาคารเรียนรวม 4 ชั้น 2', 35, 18),
('LAB-202', 'ห้องปฏิบัติการ Network & Cybersecurity', 'อาคารวิศวกรรมคอมพิวเตอร์ ชั้น 3', 30, 12),
('LAB-303', 'ห้องปฏิบัติการ Software & Cloud Computing', 'อาคารวิจัยและนวัตกรรม ชั้น 1', 40, 25)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Reservation
INSERT INTO lab_reservations (id, room_id, room_name, student_id, date, slot, seat) VALUES
('RES-001', 'LAB-202', 'ห้องปฏิบัติการ Network & Cybersecurity', 'student66000001', '2026-09-08', '13:00 - 16:00', 'PC-09')
ON CONFLICT (id) DO NOTHING;

-- Seed Equipments
INSERT INTO equipments (id, name, category, total, available) VALUES
('EQ-101', 'ชุดบอร์ด Raspberry Pi 4 (4GB) + เซนเซอร์ IoT Kit', 'Hardware / IoT', 10, 6),
('EQ-202', 'สาย Cisco Console Cable (USB to RJ45)', 'Networking', 15, 11),
('EQ-303', 'แว่น VR Headset Meta Quest 3 สำหรับพัฒนา 3D', 'VR / AR', 4, 2),
('EQ-404', 'Google Coral Edge TPU (USB Accelerator) สำหรับ AI', 'AI Accelerators', 8, 5)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Equipment Loan
INSERT INTO equipment_loans (id, equip_id, equip_name, student_id, borrow_date, return_date, purpose, status) VALUES
('LOAN-001', 'EQ-101', 'ชุดบอร์ด Raspberry Pi 4 (4GB) + เซนเซอร์ IoT Kit', 'student66000001', '2026-09-07', '2026-09-14', 'ทำโครงงานวิชา Embedded Systems', 'BORROWED')
ON CONFLICT (id) DO NOTHING;
