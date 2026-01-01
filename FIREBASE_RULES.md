# Firebase Security Rules for KickLab

## Firestore Security Rules

Kopiera och klistra in dessa regler i Firebase Console under Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is admin
    function isAdmin() {
      return isAuthenticated() && 
             request.auth.token.email == "fkrait@hotmail.com";
    }
    
    // Helper function to check if user owns the document
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Users collection - users can read/write their own data
    match /users/{userId} {
      // Allow read if user owns the document or is admin
      allow read: if isOwner(userId) || isAdmin();
      
      // Allow write only to own document or if admin
      allow write: if isOwner(userId) || isAdmin();
      
      // Subcollections under users/{userId}
      match /{document=**} {
        allow read: if isOwner(userId) || isAdmin();
        allow write: if isOwner(userId) || isAdmin();
      }
    }
    
    // Live sessions - authenticated users can read/write
    // This allows operators and audience members to sync
    match /liveSessions/{sessionId} {
      // Anyone authenticated can read live sessions
      allow read: if isAuthenticated();
      
      // Anyone authenticated can create/update live sessions
      // (operator creates, updates during match)
      allow create: if isAuthenticated();
      allow update: if isAuthenticated();
      
      // Only admin or creator can delete
      allow delete: if isAdmin();
    }
    
    // Admin has full access to everything
    match /{document=**} {
      allow read, write: if isAdmin();
    }
  }
}
```

## Storage Rules (Om du använder Firebase Storage i framtiden)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User profile images
    match /users/{userId}/profile/{fileName} {
      allow read: if true; // Public read
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Admin full access
    match /{allPaths=**} {
      allow read, write: if request.auth != null && 
                           request.auth.token.email == "fkrait@hotmail.com";
    }
  }
}
```

## Hur man applicerar reglerna

1. Gå till [Firebase Console](https://console.firebase.google.com/)
2. Välj ditt projekt (kicklab-73cbb)
3. Gå till **Firestore Database** i menyn till vänster
4. Klicka på fliken **Rules**
5. Kopiera och klistra in reglerna ovan
6. Klicka på **Publish** för att aktivera reglerna

## Viktiga säkerhetskoncept

### Autentisering
- Alla skrivoperationer kräver att användaren är inloggad
- Användare kan bara läsa och skriva sin egen data
- Admin (fkrait@hotmail.com) har full åtkomst till allt

### Live Sessions
- Alla inloggade användare kan läsa live sessions (för publikvy)
- Alla inloggade användare kan skapa och uppdatera live sessions (för operatör och synk)
- Detta möjliggör realtidssynk mellan operatör och publikvy

### Dataintegritet
- Endast dokumentets ägare kan modifiera sin egen data
- Admin kan alltid läsa och skriva all data för support och administration

## Testning av regler

Du kan testa reglerna i Firebase Console under **Rules → Rules Playground**:

### Test 1: Användare läser sin egen data
```
Operation: get
Location: /users/USER_ID
Auth: Authenticated user with uid = USER_ID
Result: ✅ Allow
```

### Test 2: Användare försöker läsa någon annans data
```
Operation: get
Location: /users/OTHER_USER_ID
Auth: Authenticated user with uid = USER_ID
Result: ❌ Deny
```

### Test 3: Admin läser någon annans data
```
Operation: get
Location: /users/ANY_USER_ID
Auth: Authenticated user with email = fkrait@hotmail.com
Result: ✅ Allow
```

### Test 4: Inloggad användare läser live session
```
Operation: get
Location: /liveSessions/ABC123
Auth: Any authenticated user
Result: ✅ Allow
```

### Test 5: Ej inloggad användare försöker läsa live session
```
Operation: get
Location: /liveSessions/ABC123
Auth: null (not authenticated)
Result: ❌ Deny
```
