const express = require('express');
const cors = require('cors');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json());

const adapter = new JSONFile('db.json');
const db = new Low(adapter);

const SECRET = 'replace-this-with-a-secure-secret';

async function initDB(){
  await db.read();
  db.data = db.data || { users: [], courses: [], enrollments: [], assignments: [], submissions: [], materials: [], forums: [], notifications: [] };
  await db.write();
}

initDB();

// Auth helpers
function generateToken(user){
  return jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.split(' ')[1];
  try{
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  }catch(e){
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  await db.read();
  const exists = db.data.users.find(u => u.email === email);
  if(exists) return res.status(400).json({ error: 'Email already exists' });
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
  if(!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.password);
  if(!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

// Create course (teacher)
app.post('/api/courses', authMiddleware, async (req, res) => {
  const { title, description, duration } = req.body;
  if(req.user.role !== 'Teacher') return res.status(403).json({ error: 'Only teachers can create courses' });
  await db.read();
  const course = { id: nanoid(), title, description, duration, teacherId: req.user.id };
  db.data.courses.push(course);
  await db.write();
  res.json(course);
});

// List courses (public)
app.get('/api/courses', async (req, res) => {
  await db.read();
  res.json(db.data.courses || []);
});

// Enroll (student)
app.post('/api/enroll', authMiddleware, async (req, res) => {
  const { courseId } = req.body;
  if(req.user.role !== 'Student') return res.status(403).json({ error: 'Only students can enroll' });
  await db.read();
  const exists = db.data.enrollments.find(e => e.courseId === courseId && e.studentId === req.user.id);
  if(exists) return res.status(400).json({ error: 'Already enrolled' });
  const e = { id: nanoid(), courseId, studentId: req.user.id };
  db.data.enrollments.push(e);
  await db.write();
  res.json(e);
});

// Get enrolled courses for student
app.get('/api/my-courses', authMiddleware, async (req, res) => {
  await db.read();
  if(req.user.role === 'Student'){
    const enrolled = db.data.enrollments.filter(e => e.studentId === req.user.id).map(e => {
      const course = db.data.courses.find(c => c.id === e.courseId);
      return { enrollmentId: e.id, course };
    });
    return res.json(enrolled);
  } else if(req.user.role === 'Teacher'){
    const myCourses = db.data.courses.filter(c => c.teacherId === req.user.id);
    return res.json(myCourses);
  } else {
    res.json([]);
  }
});

// Get students in a course (teacher)
app.get('/api/courses/:id/students', authMiddleware, async (req, res) => {
  const courseId = req.params.id;
  await db.read();
  const course = db.data.courses.find(c => c.id === courseId);
  if(!course) return res.status(404).json({ error: 'Course not found' });
  if(course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  const students = db.data.enrollments.filter(e => e.courseId === courseId).map(e => {
    const u = db.data.users.find(x => x.id === e.studentId);
    return { id: u.id, name: u.name, email: u.email };
  });
  res.json(students);
});

// Create assignment (teacher)
app.post('/api/courses/:id/assignments', authMiddleware, async (req, res) => {
  const courseId = req.params.id;
  const { title, description, dueDate } = req.body;
  await db.read();
  const course = db.data.courses.find(c => c.id === courseId);
  if(!course) return res.status(404).json({ error: 'Course not found' });
  if(course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  const a = { id: nanoid(), courseId, title, description, dueDate };
  db.data.assignments.push(a);
  await db.write();
  // create notifications for enrolled students
  const enrolled = db.data.enrollments.filter(e => e.courseId === courseId);
  enrolled.forEach(e => {
    db.data.notifications.push({ id: nanoid(), userId: e.studentId, message: `New assignment '${title}' for course ${course.title}`, date: new Date().toISOString(), read: false });
  });
  await db.write();
  res.json(a);
});

// Submit assignment (student) - supports file upload
app.post('/api/assignments/:id/submit', authMiddleware, upload.single('file'), async (req, res) => {
  const assignmentId = req.params.id;
  await db.read();
  const assignment = db.data.assignments.find(a => a.id === assignmentId);
  if(!assignment) return res.status(404).json({ error: 'Assignment not found' });
  // Check enrollment
  const enrolled = db.data.enrollments.find(e => e.courseId === assignment.courseId && e.studentId === req.user.id);
  if(!enrolled) return res.status(403).json({ error: 'Not enrolled' });
  const submission = { id: nanoid(), assignmentId, studentId: req.user.id, file: req.file ? req.file.path : null, submittedAt: new Date().toISOString(), grade: null, feedback: null };
  db.data.submissions.push(submission);
  await db.write();
  // notify teacher
  const course = db.data.courses.find(c => c.id === assignment.courseId);
  db.data.notifications.push({ id: nanoid(), userId: course.teacherId, message: `New submission for '${assignment.title}' by ${req.user.name}`, date: new Date().toISOString(), read: false });
  await db.write();
  res.json(submission);
});

// Get submissions for assignment (teacher)
app.get('/api/assignments/:id/submissions', authMiddleware, async (req, res) => {
  const assignmentId = req.params.id;
  await db.read();
  const assignment = db.data.assignments.find(a => a.id === assignmentId);
  if(!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const course = db.data.courses.find(c => c.id === assignment.courseId);
  if(course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  const subs = db.data.submissions.filter(s => s.assignmentId === assignmentId).map(s => {
    const student = db.data.users.find(u => u.id === s.studentId);
    return { ...s, student: { id: student.id, name: student.name, email: student.email } };
  });
  res.json(subs);
});

// Grade a submission (teacher)
app.post('/api/submissions/:id/grade', authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  const { grade, feedback } = req.body;
  await db.read();
  const submission = db.data.submissions.find(s => s.id === submissionId);
  if(!submission) return res.status(404).json({ error: 'Submission not found' });
  const assignment = db.data.assignments.find(a => a.id === submission.assignmentId);
  const course = db.data.courses.find(c => c.id === assignment.courseId);
  if(course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  submission.grade = grade;
  submission.feedback = feedback;
  submission.gradedAt = new Date().toISOString();
  await db.write();
  // notify student
  db.data.notifications.push({ id: nanoid(), userId: submission.studentId, message: `Your submission for '${assignment.title}' was graded: ${grade}`, date: new Date().toISOString(), read: false });
  await db.write();
  res.json(submission);
});

// Upload course material (teacher)
app.post('/api/courses/:id/materials', authMiddleware, upload.single('file'), async (req, res) => {
  const courseId = req.params.id;
  await db.read();
  const course = db.data.courses.find(c => c.id === courseId);
  if(!course) return res.status(404).json({ error: 'Course not found' });
  if(course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  const m = { id: nanoid(), courseId, filename: req.file ? req.file.originalname : req.body.filename, path: req.file ? req.file.path : null, uploadedAt: new Date().toISOString() };
  db.data.materials.push(m);
  await db.write();
  res.json(m);
});

// Forum post
app.post('/api/courses/:id/forum', authMiddleware, async (req, res) => {
  const courseId = req.params.id;
  const { message } = req.body;
  await db.read();
  const f = { id: nanoid(), courseId, userId: req.user.id, name: req.user.name, message, date: new Date().toISOString() };
  db.data.forums.push(f);
  await db.write();
  res.json(f);
});

// Get forum posts
app.get('/api/courses/:id/forum', async (req, res) => {
  const courseId = req.params.id;
  await db.read();
  const posts = db.data.forums.filter(f => f.courseId === courseId);
  res.json(posts);
});

// Notifications for user
app.get('/api/notifications', authMiddleware, async (req, res) => {
  await db.read();
  const notes = db.data.notifications.filter(n => n.userId === req.user.id);
  res.json(notes);
});

// Simple search for grades overall for a student
app.get('/api/my-grades', authMiddleware, async (req, res) => {
  await db.read();
  if(req.user.role !== 'Student') return res.status(403).json({ error: 'Only students' });
  const subs = db.data.submissions.filter(s => s.studentId === req.user.id);
  // calculate overall average
  const graded = subs.filter(s => s.grade !== null && s.grade !== undefined);
  const avg = graded.length ? (graded.reduce((a,b)=>a+Number(b.grade),0)/graded.length).toFixed(2) : null;
  res.json({ submissions: subs, average: avg });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server started on port', PORT));
