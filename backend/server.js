const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "smart_campus_connect",
  ssl: process.env.DB_HOST && process.env.DB_HOST !== "localhost"
    ? { minVersion: "TLSv1.2" }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10
});

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const signToken = (user) =>
  jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in first." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token."
    });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied." });
    }
    next();
  };
}

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    message: "Smart Campus Connect backend is running."
  });
});

// REGISTER
app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { full_name, email, password, department } = req.body;

  if (
    typeof full_name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    !full_name.trim() ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Name, email and password are required."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must contain at least 8 characters."
    });
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  const normalizedName = full_name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const [idRows] = await pool.query(
    "SELECT NEXTVAL(user_id_seq) AS user_id"
  );

  const userId = Number(idRows[0].user_id);

  await pool.execute(
    `INSERT INTO users
     (user_id, full_name, email, password_hash, role, department)
     VALUES (?, ?, ?, ?, 'student', ?)`,
    [
      userId,
      normalizedName,
      normalizedEmail,
      passwordHash,
      department || null
    ]
  );

  res.status(201).json({
    message: "Registration successful.",
    user_id: userId
  });
}));

// LOGIN
app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Email and password are required."
    });
  }

  const [rows] = await pool.execute(
    `SELECT user_id, full_name, email, password_hash, role, department
     FROM users WHERE email = ?`,
    [email.trim().toLowerCase()]
  );

  if (
    !rows.length ||
    !(await bcrypt.compare(password, rows[0].password_hash))
  ) {
    return res.status(401).json({
      message: "Invalid email or password."
    });
  }

  const user = rows[0];
  delete user.password_hash;

  res.json({
    message: "Login successful.",
    token: signToken(user),
    user
  });
}));

// CURRENT USER
app.get("/api/auth/me", authenticate, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT user_id, full_name, email, role, department
     FROM users WHERE user_id = ?`,
    [req.user.user_id]
  );

  if (!rows.length) {
    return res.status(404).json({ message: "User not found." });
  }

  res.json(rows[0]);
}));

// USERS
app.get(
  "/api/users",
  authenticate,
  allowRoles("admin"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT user_id, full_name, email, role, department, created_at
       FROM users ORDER BY user_id DESC`
    );

    res.json(rows);
  })
);

// GET SUBJECTS
app.get("/api/subjects", authenticate, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.*, u.full_name AS faculty_name
     FROM subjects s
     LEFT JOIN users u ON s.faculty_id = u.user_id
     ORDER BY s.subject_name`
  );

  res.json(rows);
}));

// ADD SUBJECT
app.post(
  "/api/subjects",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const { subject_name, subject_code, faculty_id } = req.body;

    if (
      typeof subject_name !== "string" ||
      typeof subject_code !== "string" ||
      !subject_name.trim() ||
      !subject_code.trim()
    ) {
      return res.status(400).json({
        message: "Subject name and code are required."
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO subjects
       (subject_name, subject_code, faculty_id)
       VALUES (?, ?, ?)`,
      [
        subject_name.trim(),
        subject_code.trim(),
        faculty_id || null
      ]
    );

    res.status(201).json({
      message: "Subject added.",
      subject_id: result.insertId
    });
  })
);

// GET ATTENDANCE
app.get(
  "/api/attendance",
  authenticate,
  asyncHandler(async (req, res) => {
    const isStaff = ["admin", "faculty"].includes(req.user.role);
    const requestedStudent = req.query.student_id;

    let sql = `
      SELECT a.*, u.full_name AS student_name,
             s.subject_name, s.subject_code
      FROM attendance a
      JOIN users u ON a.student_id = u.user_id
      JOIN subjects s ON a.subject_id = s.subject_id`;

    const params = [];

    if (isStaff && requestedStudent) {
      sql += " WHERE a.student_id = ?";
      params.push(requestedStudent);
    } else if (!isStaff) {
      sql += " WHERE a.student_id = ?";
      params.push(req.user.user_id);
    }

    sql += " ORDER BY a.attendance_date DESC";

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  })
);

// MARK ATTENDANCE
app.post(
  "/api/attendance",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const {
      student_id,
      subject_id,
      attendance_date,
      status
    } = req.body;

    if (
      !student_id ||
      !subject_id ||
      !attendance_date ||
      !["present", "absent", "late"].includes(status)
    ) {
      return res.status(400).json({
        message: "Provide student, subject, date and valid status."
      });
    }

    const [idRows] = await pool.query(
      "SELECT NEXTVAL(attendance_id_seq) AS attendance_id"
    );

    const attendanceId = Number(idRows[0].attendance_id);

    await pool.execute(
      `INSERT INTO attendance
       (attendance_id, student_id, subject_id, attendance_date, status, marked_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        attendanceId,
        student_id,
        subject_id,
        attendance_date,
        status,
        req.user.user_id
      ]
    );

    res.status(201).json({
      message: "Attendance saved.",
      attendance_id: attendanceId
    });
  })
);

// ADD RESULT
app.post(
  "/api/results",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const {
      student_id,
      subject_id,
      marks,
      max_marks,
      grade,
      semester,
      published
    } = req.body;

    const maxMarks = Number(max_marks ?? 100);
    const numericMarks = Number(marks);

    if (
      !student_id ||
      !subject_id ||
      marks == null ||
      !semester ||
      !Number.isFinite(numericMarks) ||
      !Number.isFinite(maxMarks) ||
      numericMarks < 0 ||
      maxMarks <= 0 ||
      numericMarks > maxMarks
    ) {
      return res.status(400).json({
        message: "Provide valid student, subject, marks and semester."
      });
    }

    const [idRows] = await pool.query(
      "SELECT NEXTVAL(result_id_seq) AS result_id"
    );

    const resultId = Number(idRows[0].result_id);

    await pool.execute(
      `INSERT INTO results
       (result_id, student_id, subject_id, marks, max_marks, grade,
        semester, published, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resultId,
        student_id,
        subject_id,
        numericMarks,
        maxMarks,
        grade || null,
        semester,
        published ? 1 : 0,
        req.user.user_id
      ]
    );

    res.status(201).json({
      message: "Result saved.",
      result_id: resultId
    });
  })
);

// GET ANNOUNCEMENTS
app.get(
  "/api/announcements",
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT a.*, u.full_name AS creator_name
       FROM announcements a
       JOIN users u ON a.created_by = u.user_id
       WHERE a.expiry_date IS NULL OR a.expiry_date >= NOW()
       ORDER BY a.created_at DESC`
    );

    res.json(rows);
  })
);
// CREATE ANNOUNCEMENT
app.post(
  "/api/announcements",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const {
      title,
      message,
      target_audience,
      expiry_date
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        message: "Title and message are required."
      });
    }

    const audience = target_audience || "all";

    if (!["all", "students", "faculty"].includes(audience)) {
      return res.status(400).json({
        message: "Invalid target audience."
      });
    }

    const [idRows] = await pool.query(
      "SELECT NEXTVAL(announcement_id_seq) AS announcement_id"
    );

    const announcementId = Number(idRows[0].announcement_id);

    await pool.execute(
      `INSERT INTO announcements
       (announcement_id, title, message, target_audience, created_by, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        announcementId,
        title,
        message,
        audience,
        req.user.user_id,
        expiry_date || null
      ]
    );

    res.status(201).json({
      message: "Announcement created.",
      announcement_id: announcementId
    });
  })
);
// GET EVENTS
app.get("/api/events", authenticate, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT e.*, u.full_name AS creator_name
     FROM events e
     JOIN users u ON e.created_by = u.user_id
     ORDER BY e.event_date`
  );

  res.json(rows);
}));

// CREATE EVENT
app.post(
  "/api/events",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const {
      event_name,
      description,
      event_date,
      registration_deadline,
      location,
      capacity
    } = req.body;

    if (!event_name || !event_date) {
      return res.status(400).json({
        message: "Event name and event date are required."
      });
    }

    const [idRows] = await pool.query(
      "SELECT NEXTVAL(event_id_seq) AS event_id"
    );

    const eventId = Number(idRows[0].event_id);

    await pool.execute(
      `INSERT INTO events
       (event_id, event_name, description, event_date,
        registration_deadline, location, capacity, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        event_name,
        description || null,
        event_date,
        registration_deadline || null,
        location || null,
        capacity || null,
        req.user.user_id
      ]
    );

    res.status(201).json({
      message: "Event created.",
      event_id: eventId
    });
  })
);

// REGISTER FOR EVENT
app.post(
  "/api/events/:id/register",
  authenticate,
  allowRoles("student"),
  asyncHandler(async (req, res) => {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId) || eventId < 1) {
      return res.status(400).json({ message: "Invalid event ID." });
    }

    const [events] = await pool.execute(
      `SELECT event_date, registration_deadline, capacity
       FROM events WHERE event_id = ?`,
      [eventId]
    );

    if (!events.length) {
      return res.status(404).json({ message: "Event not found." });
    }

    const event = events[0];

    if (new Date(event.event_date) <= new Date()) {
      return res.status(400).json({
        message: "This event has already started."
      });
    }

    if (
      event.registration_deadline &&
      new Date(event.registration_deadline) < new Date()
    ) {
      return res.status(400).json({
        message: "Registration deadline has passed."
      });
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM event_registrations
       WHERE event_id = ? AND status = 'registered'`,
      [eventId]
    );

    if (
      event.capacity != null &&
      Number(countRows[0].total) >= Number(event.capacity)
    ) {
      return res.status(400).json({ message: "This event is full." });
    }

    const [existing] = await pool.execute(
      `SELECT registration_id, status
       FROM event_registrations
       WHERE event_id = ? AND student_id = ?`,
      [eventId, req.user.user_id]
    );

    if (existing.length && existing[0].status === "registered") {
      return res.status(409).json({ message: "Already registered." });
    }

    if (existing.length) {
      await pool.execute(
        `UPDATE event_registrations
         SET status = 'registered',
             registration_date = CURRENT_TIMESTAMP
         WHERE registration_id = ?`,
        [existing[0].registration_id]
      );
    } else {
      await pool.execute(
        `INSERT INTO event_registrations (event_id, student_id)
         VALUES (?, ?)`,
        [eventId, req.user.user_id]
      );
    }

    res.status(201).json({
      message: "Event registration successful."
    });
  })
);

// GET EVENT REGISTRATIONS
app.get(
  "/api/event-registrations",
  authenticate,
  asyncHandler(async (req, res) => {
    const isStaff = ["admin", "faculty"].includes(req.user.role);
    const studentId = isStaff
      ? (req.query.student_id || null)
      : req.user.user_id;

    let sql = `
      SELECT er.*, e.event_name, e.event_date,
             u.full_name AS student_name
      FROM event_registrations er
      JOIN events e ON er.event_id = e.event_id
      JOIN users u ON er.student_id = u.user_id`;

    const params = [];

    if (studentId) {
      sql += " WHERE er.student_id = ?";
      params.push(studentId);
    }

    sql += " ORDER BY er.registration_date DESC";

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  })
);

// GET LOST AND FOUND
app.get(
  "/api/lost-found",
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT l.*, u.full_name AS reporter_name
       FROM lost_found l
       JOIN users u ON l.reported_by = u.user_id
       ORDER BY l.created_at DESC`
    );

    res.json(rows);
  })
);

// REPORT LOST OR FOUND ITEM
app.post(
  "/api/lost-found",
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      item_name,
      description,
      item_type,
      location,
      item_date,
      image_path
    } = req.body;

    if (!item_name || !["lost", "found"].includes(item_type)) {
      return res.status(400).json({
        message: "Item name and valid item type (lost/found) are required."
      });
    }

    const [idRows] = await pool.query(
      "SELECT NEXTVAL(lost_found_id_seq) AS item_id"
    );

    const itemId = Number(idRows[0].item_id);

    await pool.execute(
      `INSERT INTO lost_found
       (item_id, reported_by, item_name, description, item_type,
        location, item_date, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        req.user.user_id,
        item_name,
        description || null,
        item_type,
        location || null,
        item_date || null,
        image_path || null
      ]
    );

    res.status(201).json({
      message: "Lost/found item reported.",
      item_id: itemId
    });
  })
);
// UPDATE LOST AND FOUND STATUS
app.patch(
  "/api/lost-found/:id/status",
  authenticate,
  allowRoles("admin", "faculty"),
  asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!["open", "claimed", "returned", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid item status." });
    }

    const [result] = await pool.execute(
      "UPDATE lost_found SET status = ? WHERE item_id = ?",
      [status, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Item not found." });
    }

    res.json({ message: "Item status updated." });
  })
);

// GET SERVICE REQUESTS
app.get(
  "/api/service-requests",
  authenticate,
  asyncHandler(async (req, res) => {
    const isStaff = ["admin", "service_staff"].includes(req.user.role);

    let sql = `
      SELECT sr.*,
             submitter.full_name AS submitted_by_name,
             assignee.full_name AS assigned_to_name
      FROM service_requests sr
      JOIN users submitter ON sr.submitted_by = submitter.user_id
      LEFT JOIN users assignee ON sr.assigned_to = assignee.user_id`;

    const params = [];

    if (!isStaff) {
      sql += " WHERE sr.submitted_by = ?";
      params.push(req.user.user_id);
    }

    sql += " ORDER BY sr.created_at DESC";

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  })
);

// UPDATE SERVICE REQUEST
app.patch(
  "/api/service-requests/:id",
  authenticate,
  allowRoles("admin", "service_staff"),
  asyncHandler(async (req, res) => {
    const { status, assigned_to, feedback } = req.body;

    const allowedStatuses = [
      "submitted",
      "assigned",
      "in_progress",
      "resolved",
      "closed"
    ];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid request status." });
    }

    const fields = [];
    const values = [];

    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }

    if (assigned_to !== undefined) {
      fields.push("assigned_to = ?");
      values.push(assigned_to || null);
    }

    if (feedback !== undefined) {
      fields.push("feedback = ?");
      values.push(feedback);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "No updates provided." });
    }

    values.push(req.params.id);

    const [result] = await pool.execute(
      `UPDATE service_requests
       SET ${fields.join(", ")}
       WHERE request_id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Request not found." });
    }

    res.json({ message: "Service request updated." });
  })
);

// DELETE EVENT
app.delete(
  "/api/events/:id",
  authenticate,
  allowRoles("admin"),
  asyncHandler(async (req, res) => {
    const [result] = await pool.execute(
      "DELETE FROM events WHERE event_id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Event not found." });
    }

    res.json({ message: "Event deleted." });
  })
);

// DELETE ANNOUNCEMENT
app.delete(
  "/api/announcements/:id",
  authenticate,
  allowRoles("admin"),
  asyncHandler(async (req, res) => {
    const [result] = await pool.execute(
      "DELETE FROM announcements WHERE announcement_id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    res.json({ message: "Announcement deleted." });
  })
);

// CENTRAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("API error:", err);

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "This record already exists."
    });
  }

  if (
    err.code === "ER_NO_REFERENCED_ROW_2" ||
    err.code === "ER_NO_REFERENCED_ROW"
  ) {
    return res.status(400).json({
      message: "A referenced user, subject or event does not exist."
    });
  }

  res.status(500).json({
    message: "Server error. Check the backend logs for details."
  });
});

// START SERVER
const PORT = process.env.PORT || 5000;

async function startServer() {
  let connection;

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured.");
    }

    connection = await pool.getConnection();
    await connection.ping();
    console.log("Database connected successfully.");
  } catch (error) {
    console.error("Could not connect to database:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }

  app.listen(PORT, () => {
    console.log(`Smart Campus Connect backend running on port ${PORT}`);
  });
}

startServer();