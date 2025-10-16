const express = require('express');
const cors = require('cors');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const app = express();

// -------- CORS --------
// Allow requests from your frontend
const FRONTEND_URL = process.env.FRONTEND_URL || '*'; // Replace * with your Netlify URL in production
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------- LowDB Setup --------
const adapter = new JSONFile('db.json');
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data = db.data || { users: [], courses: [], enrollments: [], assignments: [], submissions: [], materials: [], forums: [], notifications: [] };
  await db.write();
}
initDB();

// -------- JWT Secret --------
const SECRET = process.env.JWT_SECRET || 'replace-this-with-a-secure-secret';

// -------- Multer for file uploads --------
const upload = multer({
  dest: path.join(__dirname, 'uploads/'),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// -------- Auth helpers --------
function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// -------- Routes --------
// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  await db.read();
  if (db.data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });
  const hashed = bcrypt.hashSync(password, 8);
  const user = { id: nanoid(), name, email, password: hashed, role };
  db.data.users.push(user);
  await db.write();
  const token = generateToken(user);
  res.json({ user: { id: user.id, name, email, role }, token });
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  await db.read();
  const user = db.data.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

// Create course
app.post('/api/courses', authMiddleware, async (req, res) => {
  const { title, description, duration } = req.body;
  if (req.user.role !== 'Teacher') return res.status(403).json({ error: 'Only teachers can create courses' });
  await db.read();
  const course = { id: nanoid(), title, description, duration, teacherId: req.user.id };
  db.data.courses.push(course);
  await db.write();
  res.json(course);
});

// List courses
app.get('/api/courses', async (req, res) => {
  await db.read();
  res.json(db.data.courses || []);
});

// Enroll
app.post('/api/enroll', authMiddleware, async (req, res) => {
  const { courseId } = req.body;
  if (req.user.role !== 'Student') return res.status(403).json({ error: 'Only students can enroll' });
  await db.read();
  if (db.data.enrollments.find(e => e.courseId === courseId && e.studentId === req.user.id)) return res.status(400).json({ error: 'Already enrolled' });
  const enrollment = { id: nanoid(), courseId, studentId: req.user.id };
  db.data.enrollments.push(enrollment);
  await db.write();
  res.json(enrollment);
});

// Get enrolled courses
app.get('/api/my-courses', authMiddleware, async (req, res) => {
  await db.read();
  if (req.user.role === 'Student') {
    const enrolled = db.data.enrollments.filter(e => e.studentId === req.user.id).map(e => {
      const course = db.data.courses.find(c => c.id === e.courseId);
      return { enrollmentId: e.id, course };
    });
    return res.json(enrolled);
  } else if (req.user.role === 'Teacher') {
    const myCourses = db.data.courses.filter(c => c.teacherId === req.user.id);
    return res.json(myCourses);
  } else {
    res.json([]);
  }
});

// All other routes (assignments, submissions, forum, notifications) remain the same...

// -------- Start server --------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
