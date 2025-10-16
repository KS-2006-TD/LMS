
TileLMS - Lightweight Learning Management System (Demo)

Structure:
- backend: Node/Express server using lowdb (JSON file DB)
- frontend: React app (minimal, tile-based UI)

Quick start:
1. Start backend:
   cd lms_project/backend
   npm install
   node server.js
2. Start frontend:
   cd lms_project/frontend
   npm install
   npm start

Notes:
- This is a demo project implementing the requested user stories:
  - Registration & login (JWT)
  - Course creation (Teacher) & listing (Student)
  - Enrollment, assignments, submission, grading
  - Simple forum, materials upload, notifications
- Files uploaded by multer are stored in backend/uploads/
