FOUNDIT – CAMPUS LOST & FOUND PORTAL
===================================

TECH STACK
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: MySQL
- Authentication: bcrypt password hashing + JWT
- Image upload: Multer

PROJECT SETUP (Mac)
-------------------

1. Install Node.js and MySQL. Open this folder in VS Code.

2. Create the database:
   - Open MySQL Workbench and connect to your local MySQL server.
   - Open database/foundit.sql.
   - Execute the complete script (lightning icon).
   This creates database `foundit` and its tables.

3. Configure backend:
   - Open the backend folder in VS Code terminal:
       cd backend
   - Install dependencies:
       npm install
   - Copy .env.example to a new file named .env.
   - Open .env and set DB_PASSWORD to your actual MySQL password.
   - Set JWT_SECRET to a long random secret.

4. Start server:
       npm run dev
   You should see:
       FoundIt running at http://localhost:3000

5. Open in Safari:
       http://localhost:3000

IMPORTANT
- Use the Express server URL above. Do not open index.html directly or use Live Server for the full-stack version.
- Register a student account first.
- To enable the admin dashboard, run this in MySQL Workbench after registering:
       USE foundit;
       UPDATE users SET role='admin' WHERE email='your-email@example.com';
  Then log out and log in again. Admin page:
       http://localhost:3000/admin.html

FEATURES
- Student registration and login
- Password hashing
- Create lost/found reports
- Optional image upload
- Search and category/status filters
- Item details
- Claim requests for found items
- User dashboard
- Admin claim review and approve/reject
- Statistics based on database records

SAFETY / DEMO NOTES
- Use test data for classroom demonstrations.
- Do not upload sensitive identity documents or private information.
- This is a student project starter, not a production security-reviewed service.
- Before public deployment, configure HTTPS, a strong JWT secret, rate limiting,
  stricter file validation, and production database credentials.
