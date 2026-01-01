/*
 * Firebase Configuration and Helper Functions for KickLab
 * 
 * This file contains:
 * - Firebase initialization
 * - Authentication functions (passwordless email login)
 * - Firestore helper functions for saving/loading data
 * - Admin bypass logic
 * - Live score real-time sync functions
 */

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAdIXZlfNjwuodBZzvFp7_YhERFaiYPsJE",
  authDomain: "kicklab-73cbb.firebaseapp.com",
  projectId: "kicklab-73cbb",
  storageBucket: "kicklab-73cbb.firebasestorage.app",
  messagingSenderId: "742225602856",
  appId: "1:742225602856:web:7d0ec6fa28901f76a2081d",
  measurementId: "G-BNFXHW557P"
};

// Admin configuration
const ADMIN_EMAILS = ["fkrait@hotmail.com"];
const ADMIN_SECRET = "kicklab5522";

// Global Firebase instances
let auth = null;
let db = null;
let currentUser = null;

// Initialize Firebase
function initializeFirebase() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
    return false;
  }
  
  try {
    // Initialize Firebase app
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    
    // Get Auth and Firestore instances
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Configure auth persistence
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    
    console.log('Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return false;
  }
}

/* ==================== AUTHENTICATION ==================== */

/**
 * Check if user is admin
 */
function isAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

/**
 * Check for admin bypass via URL parameter
 */
function checkAdminBypass() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('admin') === ADMIN_SECRET;
}

/**
 * Send passwordless login email link
 */
async function sendLoginEmail(email) {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  const actionCodeSettings = {
    // URL you want to redirect back to after email link is clicked
    url: window.location.origin + window.location.pathname + '?emailSignIn=true',
    handleCodeInApp: true,
  };
  
  try {
    await auth.sendSignInLinkToEmail(email, actionCodeSettings);
    // Save email to localStorage for confirmation
    window.localStorage.setItem('emailForSignIn', email);
    return true;
  } catch (error) {
    console.error('Error sending login email:', error);
    throw error;
  }
}

/**
 * Complete email link sign-in
 */
async function completeEmailSignIn(url) {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  if (!auth.isSignInWithEmailLink(url)) {
    return false;
  }
  
  // Get email from localStorage
  let email = window.localStorage.getItem('emailForSignIn');
  
  if (!email) {
    // User opened the link on a different device, ask for email
    email = window.prompt('Vänligen bekräfta din e-postadress för inloggning');
  }
  
  if (!email) {
    throw new Error('Email required for sign in');
  }
  
  try {
    const result = await auth.signInWithEmailLink(email, url);
    window.localStorage.removeItem('emailForSignIn');
    
    // Create user profile if first time
    await createUserProfileIfNeeded(result.user);
    
    return result.user;
  } catch (error) {
    console.error('Error completing email sign in:', error);
    throw error;
  }
}

/**
 * Create user profile in Firestore if it doesn't exist
 */
async function createUserProfileIfNeeded(user) {
  if (!db || !user) return;
  
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  
  if (!doc.exists) {
    await userRef.set({
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    // Update last login
    await userRef.update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * Sign out user
 */
async function signOut() {
  if (!auth) return;
  
  try {
    await auth.signOut();
    currentUser = null;
    return true;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Get current user
 */
function getCurrentUser() {
  return currentUser || (auth ? auth.currentUser : null);
}

/**
 * Setup auth state observer
 */
function setupAuthObserver(onAuthChange) {
  if (!auth) return;
  
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (onAuthChange) {
      onAuthChange(user);
    }
  });
}

/* ==================== FIRESTORE DATA STORAGE ==================== */

/**
 * Save reaction test result to Firestore
 */
async function saveReactionResult(time, bestTime, avgTime, attempts) {
  const user = getCurrentUser();
  if (!db || !user) {
    console.log('Saving to localStorage only (not authenticated)');
    return false;
  }
  
  try {
    const userRef = db.collection('users').doc(user.uid);
    await userRef.set({
      results: {
        reaction: {
          bestTime: bestTime,
          avgTime: avgTime,
          attempts: attempts,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          recentResults: firebase.firestore.FieldValue.arrayUnion(time)
        }
      }
    }, { merge: true });
    
    return true;
  } catch (error) {
    console.error('Error saving reaction result:', error);
    return false;
  }
}

/**
 * Load reaction test results from Firestore
 */
async function loadReactionResults() {
  const user = getCurrentUser();
  if (!db || !user) return null;
  
  try {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    
    if (doc.exists && doc.data().results && doc.data().results.reaction) {
      return doc.data().results.reaction;
    }
    return null;
  } catch (error) {
    console.error('Error loading reaction results:', error);
    return null;
  }
}

/**
 * Save kick counter result to Firestore
 */
async function saveKickResult(count, duration, bestCount, avgCount, sessions) {
  const user = getCurrentUser();
  if (!db || !user) {
    console.log('Saving to localStorage only (not authenticated)');
    return false;
  }
  
  try {
    const userRef = db.collection('users').doc(user.uid);
    await userRef.set({
      results: {
        kicks: {
          bestCount: bestCount,
          avgCount: avgCount,
          sessions: sessions,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          recentResults: firebase.firestore.FieldValue.arrayUnion({
            count: count,
            duration: duration,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
        }
      }
    }, { merge: true });
    
    return true;
  } catch (error) {
    console.error('Error saving kick result:', error);
    return false;
  }
}

/**
 * Load kick counter results from Firestore
 */
async function loadKickResults() {
  const user = getCurrentUser();
  if (!db || !user) return null;
  
  try {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    
    if (doc.exists && doc.data().results && doc.data().results.kicks) {
      return doc.data().results.kicks;
    }
    return null;
  } catch (error) {
    console.error('Error loading kick results:', error);
    return null;
  }
}

/**
 * Save competition/match result to Firestore
 */
async function saveMatchResult(matchData) {
  const user = getCurrentUser();
  if (!db || !user) {
    console.log('Saving to localStorage only (not authenticated)');
    return false;
  }
  
  try {
    const userRef = db.collection('users').doc(user.uid);
    await userRef.update({
      'results.matches': firebase.firestore.FieldValue.arrayUnion({
        ...matchData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      })
    });
    
    return true;
  } catch (error) {
    console.error('Error saving match result:', error);
    return false;
  }
}

/* ==================== LIVE SCORE REAL-TIME SYNC ==================== */

/**
 * Generate random session code (6 characters)
 */
function generateSessionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create live score session
 */
async function createLiveSession(sessionCode, sessionData) {
  if (!db) {
    console.log('Firestore not available, using BroadcastChannel only');
    return false;
  }
  
  try {
    await db.collection('liveSessions').doc(sessionCode).set({
      ...sessionData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      active: true
    });
    
    return true;
  } catch (error) {
    console.error('Error creating live session:', error);
    return false;
  }
}

/**
 * Update live score session
 */
async function updateLiveSession(sessionCode, updates) {
  if (!db) return false;
  
  try {
    await db.collection('liveSessions').doc(sessionCode).update({
      ...updates,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error updating live session:', error);
    return false;
  }
}

/**
 * Subscribe to live score session updates
 */
function subscribeLiveSession(sessionCode, callback) {
  if (!db) {
    console.log('Firestore not available, using BroadcastChannel only');
    return null;
  }
  
  try {
    const unsubscribe = db.collection('liveSessions')
      .doc(sessionCode)
      .onSnapshot((doc) => {
        if (doc.exists) {
          callback(doc.data());
        }
      }, (error) => {
        console.error('Error subscribing to live session:', error);
      });
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up live session subscription:', error);
    return null;
  }
}

/**
 * End live score session
 */
async function endLiveSession(sessionCode) {
  if (!db) return false;
  
  try {
    await db.collection('liveSessions').doc(sessionCode).update({
      active: false,
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error ending live session:', error);
    return false;
  }
}

/**
 * Check if session code exists and is active
 */
async function validateSessionCode(sessionCode) {
  if (!db) return false;
  
  try {
    const doc = await db.collection('liveSessions').doc(sessionCode).get();
    return doc.exists && doc.data().active;
  } catch (error) {
    console.error('Error validating session code:', error);
    return false;
  }
}

// Export functions for use in main.js
if (typeof window !== 'undefined') {
  window.FirebaseHelper = {
    // Initialization
    initializeFirebase,
    
    // Auth
    isAdmin,
    checkAdminBypass,
    sendLoginEmail,
    completeEmailSignIn,
    signOut,
    getCurrentUser,
    setupAuthObserver,
    
    // Data storage
    saveReactionResult,
    loadReactionResults,
    saveKickResult,
    loadKickResults,
    saveMatchResult,
    
    // Live score sync
    generateSessionCode,
    createLiveSession,
    updateLiveSession,
    subscribeLiveSession,
    endLiveSession,
    validateSessionCode
  };
}
