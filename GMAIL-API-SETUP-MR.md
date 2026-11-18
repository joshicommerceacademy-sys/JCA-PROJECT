# Gmail API Setup – Joshi's Commerce Academy (मराठी)

या आवृत्तीत SMTP/Nodemailer ऐवजी Google Gmail API वापरले आहे. Gmail API HTTPS (443) वर काम करते; त्यामुळे Render Free वरील SMTP port 465/587 अडथळा टाळला जातो. Neon Database schema किंवा विद्यमान Hall Ticket/Result routes बदललेले नाहीत.

## 1. Google Cloud सेटअप

1. https://console.cloud.google.com/ येथे Academy Gmail ने लॉगिन करा आणि नवीन Project तयार करा.
2. APIs & Services → Library मध्ये Gmail API Enable करा.
3. Google Auth Platform → Branding मध्ये App name `Joshi's Commerce Academy` आणि support email भरा.
4. Audience मध्ये वैयक्तिक Gmail साठी External निवडा. Testing mode असल्यास Audience → Test users मध्ये Academy Gmail जोडा.
5. Google Auth Platform → Clients → Create Client → Web application निवडा.
6. Authorized redirect URI मध्ये अगदी हा URL द्या (तुमच्या Render service चे नाव वेगळे असल्यास ते बदला):
   `https://jca-project1.onrender.com/api/email/google/callback`
7. तयार झालेला Client ID आणि Client Secret सुरक्षित ठेवा.

## 2. Render Environment Variables

Render Dashboard → Web Service → Environment येथे खालील variables जोडा:

- `GOOGLE_CLIENT_ID` = Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` = Google OAuth Client Secret
- `GOOGLE_REDIRECT_URI` = `https://jca-project1.onrender.com/api/email/google/callback`
- `GMAIL_USER` = पाठवणारा Academy Gmail address
- `EMAIL_FROM_NAME` = `Joshi's Commerce Academy`
- `GOOGLE_REFRESH_TOKEN` = OAuth callback मधून मिळालेला Refresh Token (पहिल्या authorization नंतर भरा)

Save Changes करा आणि Render deploy पूर्ण होऊ द्या. `JWT_SECRET` आधीपासून योग्यरीत्या सेट असणे आवश्यक आहे.

## 3. Google OAuth परवानगी / Refresh Token मिळवा

1. Academy Admin म्हणून Portal मध्ये लॉगिन करा.
2. Browser मध्ये F12 → Console उघडा. खालील command paste करा:

```javascript
fetch('/api/email/google/auth-url', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('jca_admin_token') }
}).then(r => r.json()).then(d => {
  if (d.authorizationUrl) window.open(d.authorizationUrl, '_blank');
  else console.error(d);
});
```

3. Google authorization page वर Academy Gmail खाते निवडा आणि Gmail send permission Allow करा.
4. Callback page वर Refresh Token दिसेल. तो Copy करा. तो कोणालाही पाठवू नका किंवा screenshot मध्ये दाखवू नका.
5. Render → Environment मध्ये `GOOGLE_REFRESH_TOKEN` म्हणून paste करा आणि Save Changes करा. Deploy पूर्ण होण्याची वाट पाहा.

**महत्त्वाचे:** Google OAuth app Testing mode मध्ये असल्यास refresh token साधारण 7 दिवसांनी expire होऊ शकतो. दीर्घकाळ वापरासाठी OAuth consent screen Production मध्ये publish करणे आणि लागू असल्यास Google verification पूर्ण करणे आवश्यक असू शकते. `gmail.send` हा restricted/sensitive scope बाबत Google च्या सध्याच्या धोरणांचे पालन करा.

## 4. Gmail API configuration तपासा

Admin login असताना Browser Console मध्ये:

```javascript
fetch('/api/email/google/status', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('jca_admin_token') }
}).then(r => r.json()).then(console.log);
```

`configured: true` दिसणे अपेक्षित आहे आणि `missing` रिकामी असावी.

त्यानंतर Admin Token वापरून स्वतःच्या Academy Gmail वर test email पाठवण्यासाठी Console मध्ये:

```javascript
fetch('/api/email/google/test', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + localStorage.getItem('jca_admin_token') }
}).then(r => r.json()).then(console.log);
```

Test email Inbox/Spam मध्ये मिळाल्यावरच Hall Ticket email तपासा.

## 5. Hall Ticket Email चाचणी

1. Reports → Hall Tickets उघडा.
2. एखाद्या चाचणी विद्यार्थ्याचा Send पर्याय निवडा.
3. Confirmation Password टाका आणि Confirm & Send करा.
4. विद्यार्थी Email Inbox तसेच Spam तपासा.
5. अयशस्वी झाल्यास Render Logs मध्ये `Gmail API email error` शोधा.

Gmail API `messageId` परत देते; ते Google ने request स्वीकारल्याचे निदर्शक आहे, Inbox delivery ची हमी नाही.

## 6. सुरक्षा

- `GOOGLE_CLIENT_SECRET` आणि `GOOGLE_REFRESH_TOKEN` फक्त Render Environment मध्ये ठेवा.
- `.env` GitHub/ZIP मध्ये commit किंवा share करू नका. या updated ZIP मधून actual `.env` वगळले आहे; `.env.example` नमुना म्हणून दिली आहे.
- पूर्वी शेअर/अपलोड झालेल्या `.env` मध्ये खरी credentials असल्यास त्या revoke/rotate करा. विशेषतः Gmail App Password, Database password आणि JWT secret.
- Callback page Refresh Token එකම वेळेस दाखवते; Render Environment मध्ये सेव्ह केल्यानंतर तो browser tab बंद करा.
- Hall Ticket send route मधील admin confirmation password आणि विद्यमान email log जसेच्या तसे ठेवले आहेत.

## तांत्रिक नोंद

- OAuth routes: `/api/email/google/auth-url`, `/api/email/google/callback`, `/api/email/google/status`, `/api/email/google/test`
- Email delivery: `src/utils/mailer.js` मधून Gmail API `users/me/messages/send`
- Callback route public असला तरी signed JWT state आणि 10-minute expiry ने validate होतो. Auth URL आणि status endpoints admin-authenticated आहेत.
- Node.js 18+ आवश्यक (built-in `fetch` वापरले आहे).
