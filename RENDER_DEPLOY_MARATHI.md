# Joshi's Commerce Academy — Render Deployment (मराठी)

हा project **React + Vite + Express + PostgreSQL (Neon)** वापरतो. या package मध्ये Render साठी single Web Service setup तयार केले आहे.

## 1) GitHub

1. हा project GitHub repository मध्ये upload करा.
2. `server/.env` GitHub वर upload करू नका. Production secrets Render Environment Variables मध्ये द्या.
3. Repository च्या root मध्ये `render.yaml` आहे.

## 2) Render

Render → New → Blueprint निवडून GitHub repository connect करा. `render.yaml` वापरून service तयार होईल.

जर Manual Web Service वापरत असाल:

- Runtime: Node
- Root Directory: `/`
- Build Command: `npm run build`
- Pre-deploy Command: Free plan वर उपलब्ध नसल्यामुळे migration build command मध्ये चालते.
- Start Command: `npm start`
- Health Check Path: `/api/health`

## 3) Required Environment Variables

Render → Service → Environment मध्ये खालील values भरा:

- `DATABASE_URL` = Neon PostgreSQL connection string
- `JWT_SECRET` = strong random secret
- `NODE_ENV` = `production`
- `CLIENT_ORIGIN` = तुमचा Render URL, उदा. `https://joshi-commerce-academy.onrender.com`
- `PUBLIC_APP_URL` = त्याच public URL
- `SMTP_HOST` = Gmail वापरत असल्यास `smtp.gmail.com`
- `SMTP_PORT` = `465` किंवा तुमच्या mail provider नुसार
- `SMTP_USER` = sending email
- `SMTP_PASS` = Gmail App Password / provider password
- `SMTP_FROM_NAME` = `Joshi's Commerce Academy`
- `SMTP_FROM_EMAIL` = sending email
- `MAIL_SEND_DELAY_MS` = `1500`
- `REMINDER_CRON` = `0 8 * * *`

## 4) Database

Neon मध्ये database तयार करून त्याची `DATABASE_URL` Render मध्ये द्या. Deploy वेळी build command मधील `npm run migrate` schema तयार करेल.

`seed` automatic deploy command मध्ये ठेवलेले नाही. Initial sample/admin data हवे असल्यास Render Shell मध्ये एकदाच:

```bash
npm run seed
```

चालवा. Production database वर seed करण्यापूर्वी त्याचा परिणाम तपासा.

## 5) Deploy झाल्यावर test

Browser मध्ये:

`https://YOUR-RENDER-DOMAIN/api/health`

उघडा. API response मिळाला तर backend चालू आहे.

नंतर root URL उघडा. React application दिसली पाहिजे.

## 6) Student photos / uploads — महत्त्वाचे

सध्याचा code `server/uploads` मध्ये files ठेवतो. Render सारख्या hosted environment मध्ये local filesystem permanent file storage म्हणून वापरणे योग्य नाही. Production मध्ये student photos, hall tickets आणि result PDFs साठी Cloudinary, S3, Cloudflare R2 किंवा दुसरे persistent object storage जोडणे recommended आहे.

## 7) Render Free plan

Free Web Service मध्ये inactivity नंतर service sleep होऊ शकते, त्यामुळे exam सुरू करताना cold-start delay येऊ शकतो. नियमित/महत्त्वाच्या live exams साठी always-on paid service किंवा योग्य hosting plan विचारात घ्या.

## 8) Local development

Backend:

```bash
cd server
npm install
npm run migrate
npm run dev
```

Frontend दुसऱ्या terminal मध्ये:

```bash
cd client
npm install
npm run dev
```

Production build test:

```bash
npm run build
npm start
```
