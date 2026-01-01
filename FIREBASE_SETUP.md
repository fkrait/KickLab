# Firebase Setup Guide for KickLab

## Översikt (Overview)

Detta dokument beskriver hur man konfigurerar Firebase för KickLab-applikationen.

## Förutsättningar (Prerequisites)

- Firebase-projekt skapat: `kicklab-73cbb`
- Firebase Console-åtkomst
- Admin-email konfigurerad: `fkrait@hotmail.com`

## 1. Aktivera Authentication

### Steg 1: Gå till Firebase Console
1. Öppna [Firebase Console](https://console.firebase.google.com/)
2. Välj projekt: `kicklab-73cbb`
3. Klicka på **Authentication** i vänstermenyn

### Steg 2: Aktivera Email/Password Provider
1. Gå till fliken **Sign-in method**
2. Klicka på **Email/Password**
3. Aktivera **Email/Password** toggle
4. Aktivera **Email link (passwordless sign-in)** toggle
5. Klicka **Save**

### Steg 3: Konfigurera Authorized Domains
1. Gå till **Settings** (kugghjul) → **Authorized domains**
2. Lägg till dina domäner:
   - `localhost` (för utveckling)
   - Din produktionsdomän
3. Klicka **Add domain**

## 2. Konfigurera Firestore Database

### Steg 1: Skapa Firestore Database
1. Gå till **Firestore Database** i vänstermenyn
2. Klicka **Create database**
3. Välj **Start in production mode**
4. Välj region (t.ex. `europe-west1` för Sverige)
5. Klicka **Enable**

### Steg 2: Applicera Security Rules
1. Gå till fliken **Rules**
2. Kopiera reglerna från `FIREBASE_RULES.md`
3. Klistra in i editorn
4. Klicka **Publish**

## 3. Testa Installationen

### Test 1: Passwordless Login
1. Öppna applikationen
2. Ange din e-postadress
3. Klicka "Skicka inloggningslänk"
4. Kolla din e-post (även spam-mappen)
5. Klicka på länken i e-posten
6. Verifiera att du loggas in

### Test 2: Admin Bypass
1. Lägg till `?admin=kicklab5522` i URL:en
2. Verifiera att du kan använda appen utan inloggning
3. Kontrollera att "ADMIN" badge visas

### Test 3: Data Storage
1. Logga in med din e-post
2. Gör ett reaktionstest
3. Gå till Firestore Console
4. Kontrollera att data sparas under `users/{userId}/results/reaction`

### Test 4: Live Score Sync
1. Öppna Live Sparring Score (operatör)
2. Notera session-koden (t.ex. "ABC123")
3. Öppna `public.html` i en annan flik/enhet
4. Ange session-koden
5. Uppdatera poäng i operatörsvyn
6. Verifiera att publikvyn uppdateras i realtid

## 4. Felsökning (Troubleshooting)

### Problem: E-post kommer inte fram
**Lösning:**
- Kolla spam-mappen
- Verifiera att Email Link är aktiverat i Firebase Console
- Kontrollera att din domän är authorized

### Problem: "Firebase not initialized"
**Lösning:**
- Öppna Developer Console (F12)
- Kolla om Firebase SDK laddas korrekt
- Verifiera att firebase-config.js körs före main.js

### Problem: "Permission denied" i Firestore
**Lösning:**
- Verifiera att security rules är publishade
- Kontrollera att användaren är inloggad
- Kolla att userId matchar i requesten

### Problem: Live session hittas inte
**Lösning:**
- Verifiera att session-koden är korrekt (6 tecken)
- Kontrollera att sessionen är aktiv i Firestore
- Kolla att båda enheterna är anslutna till internet

## 5. Säkerhet (Security)

### Viktiga Säkerhetspunkter:
- ✅ Firebase API-nycklar är publika och säkras av security rules
- ✅ Admin-credentials är synliga för demo-syfte
- ⚠️ För produktion: Använd Firebase Custom Claims för admin-roller
- ✅ Firestore security rules validerar all åtkomst server-side
- ✅ Användare kan endast läsa/skriva sin egen data
- ✅ Live sessions kräver autentisering

### Rekommendationer för Produktion:
1. Implementera rate limiting för authentication
2. Använd Firebase Custom Claims för roller
3. Aktivera App Check för extra säkerhet
4. Övervaka usage i Firebase Console
5. Sätt upp budget alerts

## 6. Underhåll (Maintenance)

### Rensa gamla sessions:
```javascript
// Kör en gång per dag via Cloud Function
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
const oldSessions = await db.collection('liveSessions')
  .where('createdAt', '<', cutoff)
  .get();

oldSessions.forEach(doc => doc.ref.delete());
```

### Backup av data:
1. Gå till Firestore Console
2. Klicka **Import/Export**
3. Välj **Export**
4. Spara till Cloud Storage bucket

## Support

För frågor eller problem:
- Kolla Firebase Console logs
- Läs Firebase dokumentation: https://firebase.google.com/docs
- Kontakta admin: fkrait@hotmail.com
