# Firebase Setup Guide for EcoSched Admin Dashboard

This guide will help you set up Firebase for the EcoSched admin dashboard.

## Prerequisites

1. A Google account
2. Access to Firebase Console
3. Your Firebase project configuration

## Step 1: Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use your existing "ecoshed" project
3. Enable the following services:
   - **Authentication**
   - **Firestore Database**

## Step 2: Authentication Setup

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** authentication
3. Optionally enable **Email link (passwordless sign-in)**

### Authentication Rules (Optional)
You can set up custom authentication rules in **Authentication** > **Settings** > **Authorized domains**.

## Step 3: Firestore Database Setup

1. In Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location for your database

### Firestore Security Rules

Replace the default rules with these:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin users collection
    match /admin_users/{userId} {
      allow read, write: if request.auth != null;
    }
    
    // User activities collection
    match /user_activities/{activityId} {
      allow read, write: if request.auth != null;
    }
    
    // Notifications collection
    match /notifications/{notificationId} {
      allow read, write: if request.auth != null;
    }
    
    // System settings collection
    match /system_settings/{settingId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 4: Firebase Configuration

Your Firebase configuration is already set up in `config/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDI8bu2fmgDgcFjWhG8mqz5Hqtp57yPezc",
  authDomain: "ecoshed.firebaseapp.com",
  projectId: "ecoshed",
  storageBucket: "ecoshed.firebasestorage.app",
  messagingSenderId: "638625245117",
  appId: "1:638625245117:web:7c30ff0401e9d20b9114d4"
};
```

## Step 5: Firestore Collections Structure

The application expects these collections:

### 1. admin_users
```javascript
{
  uid: "firebase_user_id",
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  phone: "+1234567890",
  role: "admin", // admin, supervisor
  status: "active", // active, inactive
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 2. user_activities
```javascript
{
  type: "user_created", // user_created, user_deleted, login, etc.
  message: "New user created: John Doe",
  icon: "fas fa-user-plus",
  userId: "firebase_user_id", // optional
  createdAt: timestamp
}
```

### 3. notifications
```javascript
{
  title: "System Alert",
  message: "Database connection restored",
  type: "info", // info, warning, error, success
  read: false,
  createdAt: timestamp
}
```

### 4. system_settings
```javascript
{
  key: "maintenance_mode",
  value: false,
  description: "Enable maintenance mode",
  updatedAt: timestamp
}
```

## Step 6: Testing the Setup

1. Open `Admin_Dashboard/index.html` in your browser
2. Try registering a new user
3. Check Firebase Console to see if the user appears in:
   - **Authentication** > **Users**
   - **Firestore Database** > **admin_users** collection

## Step 7: Production Considerations

### Security Rules for Production
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can access data
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Environment Variables
For production, consider using environment variables for Firebase configuration:

```javascript
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};
```

## Step 8: Firebase Hosting (Optional)

To deploy your admin dashboard:

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Initialize Firebase in your project:
   ```bash
   firebase init hosting
   ```

3. Deploy:
   ```bash
   firebase deploy
   ```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure your domain is added to authorized domains in Firebase Console
2. **Permission Denied**: Check your Firestore security rules
3. **Authentication Errors**: Verify your Firebase configuration
4. **Module Import Errors**: Make sure you're serving the files from a web server (not file://)

### Development Server
For local development, use a simple HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server

# PHP
php -S localhost:8000
```

Then access: `http://localhost:8000`

## Features Included

✅ **Firebase Authentication**
- Email/password sign up
- Email/password sign in
- Automatic session management
- Secure logout

✅ **Firestore Database**
- Real-time data synchronization
- User management
- Activity logging
- System statistics

✅ **Real-time Updates**
- Live user list updates
- Real-time activity feed
- Dynamic statistics

✅ **Error Handling**
- Firebase error messages
- User-friendly notifications
- Graceful fallbacks

## Support

For Firebase-specific issues, refer to:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)

For this application, check the browser console for detailed error messages.
