Joshi's Commerce Academy - Reports additions

Added Reports > Live & Centre Reports with:
- Exam-wise scheduled/present/submitted counts based on the existing monitor API.
- Exam status and central API data-response status.
- Candidate attendance CSV download with roll number, venue, IP address and attendance status.
- Observer report form and CSV download.
- Row-wise room seating plan (five seats per row) and CSV download.

Known integration limits:
- True online/offline terminal numbers require a heartbeat endpoint from each exam terminal; this project API currently does not expose terminal heartbeat records.
- Male/female/other counts require gender in the monitor API payload; current MonitorCandidate type does not include gender.
- Observer reports currently export to CSV in the browser and are not persisted to Neon or digitally signed. Attendance signature sheet and red ABSENT marking after 30 minutes need a dedicated sign-in/attendance workflow.
- Validate with the project's normal npm build and a connected Neon database before deploying.
