CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('recipient', 'staff', 'admin', 'support', 'manager')),
  kind TEXT NOT NULL DEFAULT 'student' CHECK (kind IN ('student', 'teacher', 'employee')),
  group_name TEXT,
  has_clearance INTEGER NOT NULL DEFAULT 0 CHECK (has_clearance IN (0, 1))
);

CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY,
  inventory_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'issued', 'inspection', 'unavailable')),
  kit TEXT NOT NULL DEFAULT '[]',
  requires_clearance INTEGER NOT NULL DEFAULT 0 CHECK (requires_clearance IN (0, 1)),
  max_days INTEGER NOT NULL DEFAULT 7 CHECK (max_days BETWEEN 1 AND 30),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('new', 'clarification', 'approved', 'rejected', 'cancelled', 'issued', 'returned')),
  staff_comment TEXT,
  cancel_reason TEXT,
  issued_at TEXT,
  issued_kit TEXT,
  returned_at TEXT,
  return_condition TEXT CHECK (return_condition IN ('full', 'shortage', 'damaged')),
  return_comment TEXT,
  damage_photo TEXT,
  created_at TEXT NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS bookings_by_equipment ON bookings (equipment_id, status, start_date);
CREATE INDEX IF NOT EXISTS bookings_by_user ON bookings (user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER REFERENCES bookings(id),
  text TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications (user_id, is_read);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  cause TEXT NOT NULL,
  impact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixing', 'closed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER REFERENCES bookings(id),
  category TEXT NOT NULL CHECK (category IN ('booking', 'equipment_card', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  resolution TEXT,
  problem_id INTEGER REFERENCES problems(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('booking', 'equipment', 'ticket', 'problem', 'user')),
  object_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_by_object ON audit_log (object_type, object_id);
