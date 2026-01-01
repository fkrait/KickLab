/*
 * Uppdaterad version av KickLabs huvudskript. Den här filen innehåller
 * fixar för att kunna avbryta alla tester via stop‑knappar och dämpa
 * ljud när sparringträningen stoppas. Funktionen stopKickTest() är
 * ny, och stopSparringTraining() uppdaterar nu användargränssnittet när
 * träningen avbryts.
 */

// Variabler för reaktionstestet - now handled by new implementation below
// Old variables kept for compatibility with other parts of the code

// Variabler för tävlingsläget
let competitionActive = false;
let competitionParticipants = [];
let currentParticipantIndex = 0;
let currentKickIndex = 0;
let competitionStartTime;
let competitionAudioCtx, competitionMediaStream, competitionMediaStreamSource,
  competitionAnalyser, competitionDataArray;
// Live score-läge
const liveScore = { red: 0, blue: 0 };
const liveScoreNames = { red: "Röd", blue: "Blå" };
const livePenalties = { red: 0, blue: 0 };
let matchDurationSeconds = 120;
let liveTimeLeft = matchDurationSeconds;
let liveTimerId = null;
let liveTimerRunning = false;
let totalRounds = 3;
let currentRound = 1;
let lastAction = null; // { type: 'score'|'penalty', side, value }
let audienceMode = false;
let broadcastChannel = null;
let roundWins = { red: 0, blue: 0 };
let matchEnded = false;
let restTimeLeft = 0;
let restTimerId = null;
let currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
let lastRoundHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
let totalScore = { red: 0, blue: 0 }; // Cumulative score across all rounds
let totalHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } }; // Cumulative hits across all rounds
let totalPenalties = { red: 0, blue: 0 }; // Cumulative penalties across all rounds
let roundEndReason = "";
let centerMessage = "";

/* ---------- Centraliserad cleanup-funktion ---------- */
// Stoppa ALLT - används vid alla sidbyten
function stopAllTests() {
  // Stoppa reaktionstest
  stopReactionTest();
  
  // Stoppa reaktionstest kalibrering
  stopReactionCalibration();
  
  // Stoppa sparkräknare
  stopKickTest();
  
  // Stoppa spark träning
  stopKickTraining();
  
  // Stoppa tävlingsläge
  stopCompetitionInternal();
  
  // Stoppa sparring träning
  stopSparringTraining();
  
  // Stoppa live score timer
  pauseLiveTimer();
  toggleAudienceView(false);
  
  // Stoppa talsyntes
  if (speechSynthesis && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  
  // Stäng alla mikrofoner
  closeAllMicrophones();
}

function closeAllMicrophones() {
  // Reaktionstest
  if (reactionMediaStream) {
    reactionMediaStream.getTracks().forEach(track => track.stop());
    reactionMediaStream = null;
  }
  
  // Reaktionstest kalibrering
  if (reactionCalibrationMediaStream) {
    reactionCalibrationMediaStream.getTracks().forEach(track => track.stop());
    reactionCalibrationMediaStream = null;
  }
  
  // Sparkräknare
  if (kickMediaStream) {
    kickMediaStream.getTracks().forEach(track => track.stop());
    kickMediaStream = null;
  }
  
  // Tävling
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach(track => track.stop());
    competitionMediaStream = null;
  }
  
  // Kalibrering
  if (calibrationMediaStream) {
    calibrationMediaStream.getTracks().forEach(track => track.stop());
    calibrationMediaStream = null;
  }
}

/* ---------- Generella sidväxlingar ---------- */
function showStartPage() {
  // Stoppa ALLT först
  stopAllTests();
  
  // Dölj alla sidor
  hideAllPages();
  
  // Visa huvudmenyn
  document.getElementById("startPage").style.display = "block";
}

/* ---------- Sparringträning ---------- */
function stopSparringTraining() {
  if (typeof sparringInterval !== 'undefined' && sparringInterval) {
    clearInterval(sparringInterval);
    sparringInterval = null;
  }
  if (typeof sparringTimeout !== 'undefined' && sparringTimeout) {
    clearTimeout(sparringTimeout);
    sparringTimeout = null;
  }
  if (speechSynthesis && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  // Uppdatera UI när träningen stoppas
  const statusEl = document.getElementById("sparringStatus");
  const commandEl = document.getElementById("sparringCommand");
  if (statusEl) statusEl.textContent = "Träning stoppad.";
  if (commandEl) commandEl.textContent = "";
}

/* ---------- Reaktionstest ---------- */
// New Web Audio API-based reaction test variables
let reactionAudioContext, reactionAnalyser, reactionMicrophone, reactionDataArray;
let reactionMediaStream = null; // Store stream for proper cleanup
let reactionTestActive = false;
let reactionStartTime = null;
let reactionCanRegisterHit = true;
let reactionAnimationId = null;
let reactionCooldownTimer = null; // Store cooldown timeout for cleanup
const REACTION_THRESHOLD = 50; // Adjustable threshold for kick detection
const REACTION_COOLDOWN = 300; // ms between hits
const VOLUME_SCALE_FACTOR = 50; // Scale factor for VU meter display
const VOLUME_MAX_PERCENTAGE = 100; // Maximum percentage for VU meter
const WAIT_TIME_MIN = 2000; // Minimum wait time before "GO!" signal (ms)
const WAIT_TIME_MAX = 5000; // Maximum wait time before "GO!" signal (ms)
// Countdown beep sound constants
const COUNTDOWN_FREQUENCY = 400; // Hz - Low tone for countdown numbers
const GO_FREQUENCY = 800; // Hz - High tone for GO signal
const COUNTDOWN_DURATION = 150; // ms - Duration of countdown beeps
const GO_DURATION = 300; // ms - Duration of GO beep
let reactionResults = JSON.parse(localStorage.getItem("reactionResults")) || [];
let reactionBestTime = parseFloat(localStorage.getItem("reactionBestTime")) || null;
// Shared AudioContext for beep sounds to avoid creating too many contexts
let beepAudioContext = null;

// Reaktionstest kalibrering variables
let reactionCalibrationAudioCtx = null;
let reactionCalibrationMediaStream = null;
let reactionCalibrationAnalyser = null;
let reactionCalibrationDataArray = null;
let reactionBackgroundNoiseLevel = 0;
let reactionSoundThreshold = 40;
let isReactionCalibrating = false;
let reactionCalibrationAnimationId = null;

function showTestIntroPage() {
  const startPage = document.getElementById("startPage");
  const testIntroPage = document.getElementById("testIntroPage");
  const testPage = document.getElementById("testPage");
  const kickCounterPage = document.getElementById("kickCounterPage");
  
  if (startPage) startPage.style.display = "none";
  if (testIntroPage) testIntroPage.style.display = "block";
  if (testPage) testPage.style.display = "none";
  if (kickCounterPage) kickCounterPage.style.display = "none";
  
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";
  pauseLiveTimer();
}

// Alias for compatibility with HTML onclick
function showTestPage() {
  showTestIntroPage();
}

function showReactionTestPage() {
  startReactionCalibration();
}

// Starta kalibrering för reaktionstest
async function startReactionCalibration() {
  hideAllPages();
  document.getElementById('reactionCalibrationPage').style.display = 'block';
  
  document.getElementById('reactionCalibrationTitle').textContent = '🎤 KALIBRERAR...';
  document.getElementById('reactionCalibrationStatus').textContent = 'Mäter bakgrundsljud... Var tyst!';
  document.getElementById('reactionManualCalibration').style.display = 'none';
  document.getElementById('reactionCalibrationCountdown').style.display = 'block';
  
  try {
    // Starta mikrofon
    reactionCalibrationAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    reactionCalibrationMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = reactionCalibrationAudioCtx.createMediaStreamSource(reactionCalibrationMediaStream);
    reactionCalibrationAnalyser = reactionCalibrationAudioCtx.createAnalyser();
    reactionCalibrationAnalyser.fftSize = 2048;
    reactionCalibrationDataArray = new Uint8Array(reactionCalibrationAnalyser.frequencyBinCount);
    source.connect(reactionCalibrationAnalyser);
    
    isReactionCalibrating = true;
    let maxLevel = 0;
    let countdown = 3;
    
    // Visa ljudnivå i realtid
    function updateReactionCalibrationMeter() {
      if (!isReactionCalibrating) return;
      
      reactionCalibrationAnalyser.getByteTimeDomainData(reactionCalibrationDataArray);
      let max = 0;
      for (let i = 0; i < reactionCalibrationDataArray.length; i++) {
        const value = Math.abs(reactionCalibrationDataArray[i] - 128);
        if (value > max) max = value;
      }
      
      // Uppdatera max-nivå
      if (max > maxLevel) maxLevel = max;
      
      // Uppdatera ljudmätare (0-100%)
      const percentage = Math.min(100, (max / 128) * 100);
      document.getElementById('reactionCalibrationSoundLevel').style.width = percentage + '%';
      
      reactionCalibrationAnimationId = requestAnimationFrame(updateReactionCalibrationMeter);
    }
    updateReactionCalibrationMeter();
    
    // Countdown
    document.getElementById('reactionCalibrationCountdown').textContent = countdown;
    const countdownInterval = setInterval(() => {
      countdown--;
      document.getElementById('reactionCalibrationCountdown').textContent = countdown;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        finishReactionCalibration(maxLevel);
      }
    }, 1000);
    
  } catch (err) {
    document.getElementById('reactionCalibrationStatus').textContent = 'Mikrofon krävs för reaktionstestet.';
  }
}

function finishReactionCalibration(maxLevel) {
  reactionBackgroundNoiseLevel = maxLevel;
  
  // Sätt tröskel till bakgrund + marginal
  reactionSoundThreshold = Math.max(40, reactionBackgroundNoiseLevel + 25);
  
  document.getElementById('reactionCalibrationTitle').textContent = '✅ KALIBRERING KLAR';
  document.getElementById('reactionCalibrationStatus').textContent = '';
  document.getElementById('reactionCalibrationCountdown').style.display = 'none';
  document.getElementById('reactionBackgroundLevel').textContent = reactionBackgroundNoiseLevel;
  document.getElementById('reactionSensitivitySlider').value = reactionSoundThreshold;
  document.getElementById('reactionThresholdDisplay').textContent = reactionSoundThreshold;
  document.getElementById('reactionManualCalibration').style.display = 'block';
  
  // Fortsätt visa ljudmätare för test
  function updateTestMeter() {
    if (!isReactionCalibrating) return;
    
    reactionCalibrationAnalyser.getByteTimeDomainData(reactionCalibrationDataArray);
    let max = 0;
    for (let i = 0; i < reactionCalibrationDataArray.length; i++) {
      const value = Math.abs(reactionCalibrationDataArray[i] - 128);
      if (value > max) max = value;
    }
    
    const percentage = Math.min(100, (max / 128) * 100);
    document.getElementById('reactionCalibrationSoundLevel').style.width = percentage + '%';
    
    // Flash om över tröskel
    const soundLevel = document.getElementById('reactionCalibrationSoundLevel');
    if (soundLevel && max > reactionSoundThreshold) {
      soundLevel.parentElement.classList.add('hit');
      setTimeout(() => soundLevel.parentElement.classList.remove('hit'), 300);
    }
    
    reactionCalibrationAnimationId = requestAnimationFrame(updateTestMeter);
  }
  updateTestMeter();
}

// Stoppa kalibrering
function stopReactionCalibration() {
  isReactionCalibrating = false;
  if (reactionCalibrationAnimationId) cancelAnimationFrame(reactionCalibrationAnimationId);
  if (reactionCalibrationMediaStream) {
    reactionCalibrationMediaStream.getTracks().forEach(track => track.stop());
    reactionCalibrationMediaStream = null;
  }
}

// Navigate back from calibration
function cancelReactionCalibration() {
  stopReactionCalibration();
  showTestIntroPage();
}

// Starta reaktionstest efter kalibrering
function startReactionTestAfterCalibration() {
  isReactionCalibrating = false;
  if (reactionCalibrationAnimationId) cancelAnimationFrame(reactionCalibrationAnimationId);
  
  // Stäng kalibrerings-mikrofon (vi öppnar en ny i testet)
  if (reactionCalibrationMediaStream) {
    reactionCalibrationMediaStream.getTracks().forEach(track => track.stop());
    reactionCalibrationMediaStream = null;
  }
  
  // Gå till testsidan
  hideAllPages();
  document.getElementById('testPage').style.display = 'block';
  loadReactionStats();
}

// Helper function for async delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Play beep sound using Web Audio API
function playBeep(frequency = 800, duration = 200, type = 'sine') {
  try {
    // Reuse existing AudioContext or create new one if needed
    if (!beepAudioContext || beepAudioContext.state === 'closed') {
      beepAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const oscillator = beepAudioContext.createOscillator();
    const gainNode = beepAudioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(beepAudioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.5, beepAudioContext.currentTime);
    // Use 0.001 instead of 0.01 to avoid audio artifacts (exponentialRampToValueAtTime cannot ramp to zero)
    gainNode.gain.exponentialRampToValueAtTime(0.001, beepAudioContext.currentTime + duration / 1000);
    
    oscillator.start(beepAudioContext.currentTime);
    oscillator.stop(beepAudioContext.currentTime + duration / 1000);
  } catch (error) {
    // Silently fail if audio context creation fails - countdown will continue without sound
    console.warn('Failed to play beep sound:', error);
  }
}

// Update status and time display with countdown styling
function updateStatus(text, color = "#00dddd") {
  const statusText = document.getElementById("statusText");
  const timeValue = document.getElementById("timeValue");
  const timeDisplay = document.getElementById("timeDisplay");
  
  if (statusText) {
    statusText.textContent = text;
    statusText.style.color = color;
  }
  
  // Show countdown in the time display circle
  if (timeValue) {
    timeValue.textContent = text;
  }
  
  // Apply special styling for countdown
  if (timeDisplay) {
    if (text === "3" || text === "2" || text === "1") {
      timeDisplay.style.color = "#00dddd";
      timeDisplay.style.fontSize = "5rem";
    } else if (text === "GÅ!") {
      timeDisplay.style.color = "#ff8008";
      timeDisplay.style.fontSize = "3rem";
    } else {
      timeDisplay.style.color = "#fff";
      timeDisplay.style.fontSize = "3rem";
    }
  }
}

// Countdown function with sound
async function startCountdown() {
  // Visa "3"
  updateStatus("3", "#00dddd");
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION); // Låg ton
  await sleep(1000);
  
  if (!reactionTestActive) return;
  
  // Visa "2"
  updateStatus("2", "#00dddd");
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION); // Låg ton
  await sleep(1000);
  
  if (!reactionTestActive) return;
  
  // Visa "1"
  updateStatus("1", "#00dddd");
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION); // Låg ton
  await sleep(1000);
  
  if (!reactionTestActive) return;
  
  // Visa "GÅ!" + hög beep
  updateStatus("GÅ!", "#ff8008");
  playBeep(GO_FREQUENCY, GO_DURATION); // Hög ton - signalen att sparka!
  
  // Starta tidtagning
  reactionStartTime = performance.now();
  checkReactionVolume();
}

async function startReactionTest() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById("statusText").textContent = "Mikrofon krävs för testet.";
    return;
  }
  
  try {
    // Initialize audio
    await initReactionAudio();
    
    reactionTestActive = true;
    reactionCanRegisterHit = true;
    
    // Update UI
    document.getElementById("timeValue").textContent = "0.000";
    document.getElementById("timeDisplay").classList.remove("hit");
    document.getElementById("startBtn").style.opacity = "0.5";
    document.getElementById("stopBtn").style.opacity = "1";
    
    // Start countdown with sound
    await startCountdown();
    
  } catch (error) {
    document.getElementById("statusText").textContent = "Mikrofon behövs för testet.";
    reactionTestActive = false;
  }
}

async function initReactionAudio() {
  // Clean up existing audio context if it exists
  if (reactionAudioContext && reactionAudioContext.state !== 'closed') {
    await reactionAudioContext.close();
  }
  
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  reactionMediaStream = stream; // Store for cleanup
  reactionAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  reactionAnalyser = reactionAudioContext.createAnalyser();
  reactionMicrophone = reactionAudioContext.createMediaStreamSource(stream);
  reactionMicrophone.connect(reactionAnalyser);
  reactionAnalyser.fftSize = 256;
  const bufferLength = reactionAnalyser.frequencyBinCount;
  reactionDataArray = new Uint8Array(bufferLength);
}

function checkReactionVolume() {
  if (!reactionTestActive) return;
  
  reactionAnalyser.getByteTimeDomainData(reactionDataArray);
  
  let sum = 0;
  for (let i = 0; i < reactionDataArray.length; i++) {
    sum += Math.abs(reactionDataArray[i] - 128);
  }
  const volume = sum / reactionDataArray.length;
  
  // Update VU-meter visually
  updateReactionVolumeMeter(volume);
  
  // Check if sound is above calibrated threshold and cooldown has passed
  if (volume > reactionSoundThreshold && reactionCanRegisterHit && reactionStartTime) {
    registerReactionHit();
    reactionCanRegisterHit = false;
    reactionCooldownTimer = setTimeout(() => {
      reactionCanRegisterHit = true;
    }, REACTION_COOLDOWN);
  }
  
  if (reactionTestActive) {
    reactionAnimationId = requestAnimationFrame(checkReactionVolume);
  }
}

function updateReactionVolumeMeter(volume) {
  const fillElement = document.getElementById("volumeMeterFill");
  if (fillElement) {
    // Scale volume to percentage (0-100) using calibrated threshold
    const percentage = Math.min((volume / reactionSoundThreshold) * VOLUME_SCALE_FACTOR, VOLUME_MAX_PERCENTAGE);
    fillElement.style.width = percentage + "%";
  }
}

function registerReactionHit() {
  if (!reactionStartTime) return;
  
  const reactionTime = performance.now() - reactionStartTime;
  
  // Update UI
  const timeValue = document.getElementById("timeValue");
  const timeDisplay = document.getElementById("timeDisplay");
  const statusText = document.getElementById("statusText");
  
  if (timeValue) timeValue.textContent = (reactionTime / 1000).toFixed(3);
  if (timeDisplay) timeDisplay.classList.add("hit");
  if (statusText) {
    statusText.textContent = "TRÄFF!";
    statusText.style.color = "#ff8008";
  }
  
  // Save result
  saveReactionResult(reactionTime);
  
  // Stop test (async but don't await to allow UI updates to happen)
  stopReactionTest();
}

async function stopReactionTest() {
  reactionTestActive = false;
  
  if (reactionAnimationId) {
    cancelAnimationFrame(reactionAnimationId);
    reactionAnimationId = null;
  }
  
  // Cancel cooldown timer if active
  if (reactionCooldownTimer) {
    clearTimeout(reactionCooldownTimer);
    reactionCooldownTimer = null;
  }
  
  // Properly clean up media stream
  if (reactionMediaStream) {
    reactionMediaStream.getTracks().forEach(track => track.stop());
    reactionMediaStream = null;
  }
  
  // Close audio context to free resources (await to prevent timing issues)
  if (reactionAudioContext && reactionAudioContext.state !== 'closed') {
    try {
      await reactionAudioContext.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
    reactionAudioContext = null;
  }
  
  // Update UI
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  if (startBtn) startBtn.style.opacity = "1";
  if (stopBtn) stopBtn.style.opacity = "0.5";
  
  if (!reactionStartTime) {
    const statusText = document.getElementById("statusText");
    if (statusText) {
      statusText.textContent = "Test stoppad.";
      statusText.style.color = "#00dddd";
    }
  }
  
  reactionStartTime = null;
}

function saveReactionResult(time) {
  reactionResults.unshift(time);
  if (reactionResults.length > 5) reactionResults.pop();
  localStorage.setItem("reactionResults", JSON.stringify(reactionResults));
  
  if (!reactionBestTime || time < reactionBestTime) {
    reactionBestTime = time;
    localStorage.setItem("reactionBestTime", reactionBestTime);
  }
  
  loadReactionStats();
}

function loadReactionStats() {
  // Update best time
  const bestTimeEl = document.getElementById("bestTimeDisplay");
  if (bestTimeEl) {
    bestTimeEl.textContent = reactionBestTime ? (reactionBestTime / 1000).toFixed(3) + "s" : "-";
  }
  
  // Update average time
  const avgTimeEl = document.getElementById("avgTimeDisplay");
  if (avgTimeEl && reactionResults.length > 0) {
    const avg = reactionResults.reduce((a, b) => a + b, 0) / reactionResults.length;
    avgTimeEl.textContent = (avg / 1000).toFixed(3) + "s";
  } else if (avgTimeEl) {
    avgTimeEl.textContent = "-";
  }
}

function resetReactionStats() {
  localStorage.removeItem("reactionResults");
  localStorage.removeItem("reactionBestTime");
  reactionResults = [];
  reactionBestTime = null;
  loadReactionStats();
  
  // Update UI with null checks
  const timeValue = document.getElementById("timeValue");
  const statusText = document.getElementById("statusText");
  
  if (timeValue) timeValue.textContent = "0.000";
  if (statusText) {
    statusText.textContent = "Statistik nollställd.";
    statusText.style.color = "#00dddd";
  }
}

// Keep old functions for compatibility but make them call new ones
function startTest() {
  startReactionTest();
}

function stopTest() {
  stopReactionTest();
}

function resetStats() {
  resetReactionStats();
}

/* ---------- Sparkräknare (Improved with Calibration) ---------- */
// Audio detection constants
const KICK_COOLDOWN = 250; // ms between kicks
const THRESHOLD_PERCENTAGE = 0.7; // 70% of calibration kick
const MIN_THRESHOLD = 30; // Minimum threshold value
const CALIBRATION_DURATION = 3000; // 3 seconds calibration period
const VOLUME_METER_SCALE = 50; // Scale factor for VU meter display
const MAX_VOLUME_PERCENTAGE = 100; // Maximum percentage for VU meter

let kickAudioContext, kickAnalyser, kickMicrophone, kickDataArray;
let kickMediaStream = null; // Store stream for proper cleanup
let kickCalibrationThreshold = 50;
let kickCount = 0;
let kickCanRegisterKick = true;
let kickTestActive = false;
let kickTestDuration = 15;
let kickTimeRemaining = kickTestDuration;
let kickTestInterval = null;
let kickAnimationId = null;
let kickCooldownTimer = null;
let kickRecentResults = JSON.parse(localStorage.getItem("kickRecentResults")) || [];
let bestKickCount = parseInt(localStorage.getItem("bestKickCount")) || 0;
let kickSelectedTime = 15;
let kickCalibrating = false;

// Show intro page
function showKickCounterPage() {
  hideAllPages();
  document.getElementById("kickCounterIntroPage").style.display = "block";
  stopReactionTest();
  pauseLiveTimer();
}

// Show calibration page
function showKickCalibrationPage() {
  hideAllPages();
  document.getElementById("kickCalibrationPage").style.display = "block";
  // Reset calibration status
  const statusEl = document.getElementById("calibrationStatus");
  const thresholdEl = document.getElementById("calibrationThreshold");
  const calibrateBtn = document.getElementById("calibrateBtn");
  if (statusEl) statusEl.textContent = "VÄNTAR...";
  if (thresholdEl) thresholdEl.textContent = "";
  if (calibrateBtn) {
    calibrateBtn.disabled = false;
    calibrateBtn.style.opacity = "1";
  }
}

// Show time selection page
function showKickTimeSelectionPage() {
  hideAllPages();
  document.getElementById("kickTimeSelectionPage").style.display = "block";
  // Display threshold
  const displayThreshold = document.getElementById("displayThreshold");
  if (displayThreshold) {
    displayThreshold.textContent = kickCalibrationThreshold.toFixed(1);
  }
  // Select default time (15s)
  selectKickTime(kickSelectedTime);
}

// Show test page
function showKickTestPage() {
  hideAllPages();
  document.getElementById("kickTestPage").style.display = "block";
  // Load stats
  loadKickStats();
}

// Show intro page from other pages
function showKickCounterIntroPage() {
  hideAllPages();
  document.getElementById("kickCounterIntroPage").style.display = "block";
}

// Hide all kick counter pages
function hideAllPages() {
  const allPages = [
    // Huvudmeny
    "startPage",
    
    // Reaktionstest
    "testIntroPage",
    "reactionCalibrationPage",
    "testPage",
    
    // Sparkräknare
    "kickCounterIntroPage",
    "kickCalibrationPage",
    "kickTimeSelectionPage",
    "kickTestPage",
    "kickCounterPage", // Gammal, för kompatibilitet
    
    // Spark träning
    "kickTrainingIntroPage",
    "kickSelectionPage",
    "trainingModeSelectionPage",
    "trainingSettingsPage",
    "kickTrainingPage",
    
    // Tävlingsläge
    "competitionIntroPage",
    "competitionParticipantsPage",
    "competitionTypePage",
    "competitionKickSelectionPage",
    "competitionSingleKickPage",
    "competitionCalibrationPage",
    "competitionRoundPage",
    "competitionActivePage",
    "competitionLeaderboardPage",
    "competitionResultsPage",
    
    // Live score
    "liveScorePage",
    
    // Sparring (gammal)
    "sparringPage",
    
    // Overlays
    "countdownOverlay"
  ];
  
  allPages.forEach(pageId => {
    const page = document.getElementById(pageId);
    if (page) page.style.display = "none";
  });
}

// Initialize audio for kick detection
async function initKickAudio() {
  // Clean up existing audio context if it exists
  if (kickAudioContext && kickAudioContext.state !== 'closed') {
    await kickAudioContext.close();
  }
  
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  kickMediaStream = stream; // Store for cleanup
  kickAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  kickAnalyser = kickAudioContext.createAnalyser();
  kickMicrophone = kickAudioContext.createMediaStreamSource(stream);
  kickMicrophone.connect(kickAnalyser);
  kickAnalyser.fftSize = 256;
  const bufferLength = kickAnalyser.frequencyBinCount;
  kickDataArray = new Uint8Array(bufferLength);
}

// Get current audio volume
function getCurrentKickVolume() {
  if (!kickAnalyser || !kickDataArray) return 0;
  
  kickAnalyser.getByteTimeDomainData(kickDataArray);
  
  let sum = 0;
  for (let i = 0; i < kickDataArray.length; i++) {
    sum += Math.abs(kickDataArray[i] - 128);
  }
  return sum / kickDataArray.length;
}

// Update volume meter
function updateKickVolumeMeter(volume, elementId) {
  const fillElement = document.getElementById(elementId);
  if (fillElement) {
    // Scale volume to percentage (0-MAX_VOLUME_PERCENTAGE) using VOLUME_METER_SCALE
    const percentage = Math.min((volume / kickCalibrationThreshold) * VOLUME_METER_SCALE, MAX_VOLUME_PERCENTAGE);
    fillElement.style.width = percentage + "%";
  }
}

// Start calibration
async function startCalibration() {
  const statusEl = document.getElementById("calibrationStatus");
  const thresholdEl = document.getElementById("calibrationThreshold");
  const calibrateBtn = document.getElementById("calibrateBtn");
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl) statusEl.textContent = "Mikrofon krävs för testet.";
    return;
  }
  
  try {
    kickCalibrating = true;
    if (calibrateBtn) {
      calibrateBtn.disabled = true;
      calibrateBtn.style.opacity = "0.5";
    }
    
    if (statusEl) statusEl.textContent = "Sparka EN gång...";
    if (thresholdEl) thresholdEl.textContent = "";
    
    // Initialize audio
    await initKickAudio();
    
    let maxVolume = 0;
    const startTime = Date.now();
    let calibrationFrameId = null;
    
    // Listen for CALIBRATION_DURATION to find max volume using requestAnimationFrame
    const calibrateVolume = () => {
      if (Date.now() - startTime < CALIBRATION_DURATION) {
        const volume = getCurrentKickVolume();
        updateKickVolumeMeter(volume, "calibrationVolumeMeter");
        if (volume > maxVolume) {
          maxVolume = volume;
        }
        calibrationFrameId = requestAnimationFrame(calibrateVolume);
      } else {
        // Calibration complete
        finishCalibration(maxVolume, statusEl, thresholdEl);
      }
    };
    
    calibrateVolume();
    
  } catch (error) {
    if (statusEl) statusEl.textContent = "Mikrofon behövs för kalibrering.";
    kickCalibrating = false;
    if (calibrateBtn) {
      calibrateBtn.disabled = false;
      calibrateBtn.style.opacity = "1";
    }
  }
}

// Finish calibration and set threshold
async function finishCalibration(maxVolume, statusEl, thresholdEl) {
  // Set threshold to THRESHOLD_PERCENTAGE of calibration kick
  kickCalibrationThreshold = Math.max(maxVolume * THRESHOLD_PERCENTAGE, MIN_THRESHOLD);
  
  // Show completion
  if (statusEl) statusEl.textContent = "✓ Kalibrerad!";
  if (thresholdEl) {
    thresholdEl.textContent = `Tröskel: ${kickCalibrationThreshold.toFixed(1)}`;
  }
  
  // Clean up audio
  await cleanupKickAudio();
  
  kickCalibrating = false;
  
  // Auto-advance to time selection after 1 second
  setTimeout(() => {
    showKickTimeSelectionPage();
  }, 1000);
}

// Select time for kick test
function selectKickTime(seconds) {
  kickSelectedTime = seconds;
  kickTestDuration = seconds;
  
  // Update button states
  const buttons = ['time15', 'time30', 'time60'];
  buttons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.remove('selected');
    }
  });
  
  const selectedBtn = document.getElementById(`time${seconds}`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
  }
}

// Start countdown before kick test
async function startKickCountdown() {
  showKickTestPage();
  
  // Reset display
  kickCount = 0;
  kickTimeRemaining = kickTestDuration;
  const countDisplay = document.getElementById("kickCountDisplay");
  const timerDisplay = document.getElementById("kickTimerDisplay");
  
  if (countDisplay) countDisplay.textContent = "0";
  if (timerDisplay) timerDisplay.textContent = kickTestDuration.toString();
  
  try {
    // Initialize audio
    await initKickAudio();
    
    // Countdown: 3... 2... 1... GÅ!
    if (countDisplay) countDisplay.textContent = "3";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    if (countDisplay) countDisplay.textContent = "2";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    if (countDisplay) countDisplay.textContent = "1";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    if (countDisplay) countDisplay.textContent = "GÅ!";
    playBeep(GO_FREQUENCY, GO_DURATION);
    await sleep(500);
    
    // Reset count and start test
    kickCount = 0;
    if (countDisplay) countDisplay.textContent = "0";
    
    startActualKickTest();
    
  } catch (error) {
    if (countDisplay) countDisplay.textContent = "Mikrofon krävs";
  }
}

// Start the actual kick test
function startActualKickTest() {
  kickTestActive = true;
  kickCanRegisterKick = true;
  kickTimeRemaining = kickTestDuration;
  
  // Start kick detection
  checkForKick();
  
  // Start timer countdown
  kickTestInterval = setInterval(() => {
    kickTimeRemaining--;
    const timerDisplay = document.getElementById("kickTimerDisplay");
    if (timerDisplay) {
      timerDisplay.textContent = kickTimeRemaining.toString();
    }
    
    if (kickTimeRemaining <= 0) {
      endKickTest();
    }
  }, 1000);
}

// Check for kicks
function checkForKick() {
  if (!kickTestActive) return;
  
  const volume = getCurrentKickVolume();
  updateKickVolumeMeter(volume, "kickTestVolumeMeter");
  
  if (volume > kickCalibrationThreshold && kickCanRegisterKick) {
    kickCount++;
    const countDisplay = document.getElementById("kickCountDisplay");
    if (countDisplay) countDisplay.textContent = kickCount.toString();
    
    kickCanRegisterKick = false;
    kickCooldownTimer = setTimeout(() => {
      kickCanRegisterKick = true;
    }, KICK_COOLDOWN);
  }
  
  if (kickTestActive) {
    kickAnimationId = requestAnimationFrame(checkForKick);
  }
}

// End kick test
async function endKickTest() {
  kickTestActive = false;
  clearInterval(kickTestInterval);
  if (kickAnimationId) {
    cancelAnimationFrame(kickAnimationId);
    kickAnimationId = null;
  }
  if (kickCooldownTimer) {
    clearTimeout(kickCooldownTimer);
    kickCooldownTimer = null;
  }
  
  // Clean up audio
  await cleanupKickAudio();
  
  // Play end beep
  playEndBeep();
  
  // Save result
  saveKickResult(kickCount);
  
  // Show final count for a moment
  const countDisplay = document.getElementById("kickCountDisplay");
  if (countDisplay) {
    countDisplay.textContent = kickCount.toString();
  }
}

// Stop kick test manually
async function stopKickTest() {
  if (!kickTestActive) return;
  
  kickTestActive = false;
  clearInterval(kickTestInterval);
  if (kickAnimationId) {
    cancelAnimationFrame(kickAnimationId);
    kickAnimationId = null;
  }
  if (kickCooldownTimer) {
    clearTimeout(kickCooldownTimer);
    kickCooldownTimer = null;
  }
  
  // Clean up audio
  await cleanupKickAudio();
  
  // Save result
  saveKickResult(kickCount);
}

// Clean up audio resources
async function cleanupKickAudio() {
  // Stop media stream
  if (kickMediaStream) {
    kickMediaStream.getTracks().forEach(track => track.stop());
    kickMediaStream = null;
  }
  
  // Close audio context
  if (kickAudioContext && kickAudioContext.state !== 'closed') {
    try {
      await kickAudioContext.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
    kickAudioContext = null;
  }
}

// Save kick result
function saveKickResult(count) {
  kickRecentResults.unshift(count);
  if (kickRecentResults.length > 5) kickRecentResults.pop();
  localStorage.setItem("kickRecentResults", JSON.stringify(kickRecentResults));
  
  if (count > bestKickCount) {
    bestKickCount = count;
    localStorage.setItem("bestKickCount", bestKickCount);
    const cheerSound = document.getElementById("cheerSound");
    if (cheerSound) cheerSound.play().catch(() => {});
  }
  
  loadKickStats();
}

// Load kick statistics
function loadKickStats() {
  const bestDisplay = document.getElementById("kickBestDisplay");
  const avgDisplay = document.getElementById("kickAvgDisplay");
  
  if (bestDisplay) {
    bestDisplay.textContent = bestKickCount > 0 ? bestKickCount.toString() : "-";
  }
  
  if (avgDisplay && kickRecentResults.length > 0) {
    const avg = kickRecentResults.reduce((a, b) => a + b, 0) / kickRecentResults.length;
    avgDisplay.textContent = avg.toFixed(1);
  } else if (avgDisplay) {
    avgDisplay.textContent = "-";
  }
}

// Reset kick statistics
function resetKickStats() {
  localStorage.removeItem("kickRecentResults");
  localStorage.removeItem("bestKickCount");
  kickRecentResults = [];
  bestKickCount = 0;
  
  loadKickStats();
  
  // Reset displays
  const countDisplay = document.getElementById("kickCountDisplay");
  if (countDisplay) countDisplay.textContent = "0";
}

/* ---------- Tävlingsläge (New Competition Mode) ---------- */
// Competition variables
let competitionType = 'random'; // 'random' or 'selected'
let selectedCompetitionKicks = []; // For random type
let selectedCompetitionKick = null; // For selected kick type
let currentRoundKick = null;
let competitionRound = 1;
const TOTAL_COMPETITION_ROUNDS = 3;

// Kalibrerings-variabler
let calibrationAudioCtx = null;
let calibrationMediaStream = null;
let calibrationAnalyser = null;
let calibrationDataArray = null;
let backgroundNoiseLevel = 0;
let soundThreshold = 40;
let isCalibrating = false;
let calibrationAnimationId = null;

// Timer-variabler
let competitionTimerInterval = null;

// Competition kicks data
const competitionKicks = [
  { name: "Framspark" },
  { name: "Sidospark" },
  { name: "Rundspark" },
  { name: "Bakspark" },
  { name: "Snurrspark" },
  { name: "Yxspark" },
  { name: "Krokspark" },
  { name: "Hoppspark" },
  { name: "Flygande sidospark" },
  { name: "An Chagi" },
  { name: "Saxspark" },
  { name: "Snurrande bakspark" },
  { name: "Slag" }
];

// Navigation functions
function showCompetitionIntroPage() {
  hideAllCompetitionPages();
  document.getElementById("competitionIntroPage").style.display = "block";
  document.getElementById("startPage").style.display = "none";
}

function showCompetitionParticipantsPage() {
  hideAllCompetitionPages();
  document.getElementById("competitionParticipantsPage").style.display = "block";
  updateCompetitionNameInputs();
}

function showCompetitionTypePage() {
  hideAllCompetitionPages();
  // Validate participants
  const count = parseInt(document.getElementById("competitionCount").value, 10) || 0;
  if (count < 1 || count > 10) {
    alert("Välj mellan 1 och 10 deltagare.");
    showCompetitionParticipantsPage();
    return;
  }
  
  // Collect participant names
  competitionParticipants = [];
  for (let i = 0; i < count; i++) {
    const nameInput = document.getElementById(`participant-${i}`);
    const name = nameInput ? nameInput.value.trim() || `Deltagare ${i + 1}` : `Deltagare ${i + 1}`;
    competitionParticipants.push({ 
      name, 
      times: [], 
      total: 0, 
      previousRank: i,
      roundTimes: [[],[],[]] // Track times per round
    });
  }
  
  document.getElementById("competitionTypePage").style.display = "block";
  // Select default type
  selectCompetitionType('random');
}

function showCompetitionKickSelectionPage() {
  if (competitionType === 'random') {
    hideAllCompetitionPages();
    document.getElementById("competitionKickSelectionPage").style.display = "block";
    // Ensure all kicks are checked by default
    for (let i = 0; i < competitionKicks.length; i++) {
      const checkbox = document.getElementById(`compKick${i}`);
      if (checkbox) checkbox.checked = true;
    }
  } else if (competitionType === 'selected') {
    hideAllCompetitionPages();
    document.getElementById("competitionSingleKickPage").style.display = "block";
  }
}

function hideAllCompetitionPages() {
  const pages = [
    'competitionIntroPage', 'competitionParticipantsPage', 'competitionTypePage',
    'competitionKickSelectionPage', 'competitionSingleKickPage', 'competitionCalibrationPage',
    'competitionRoundPage', 'competitionActivePage', 'competitionLeaderboardPage', 'competitionResultsPage'
  ];
  pages.forEach(pageId => {
    const page = document.getElementById(pageId);
    if (page) page.style.display = "none";
  });
}

function selectCompetitionType(type) {
  competitionType = type;
  
  // Update button states
  const randomBtn = document.getElementById('type-random');
  const selectedBtn = document.getElementById('type-selected');
  
  if (randomBtn && selectedBtn) {
    if (type === 'random') {
      randomBtn.classList.add('selected');
      selectedBtn.classList.remove('selected');
    } else {
      selectedBtn.classList.add('selected');
      randomBtn.classList.remove('selected');
    }
  }
}

function updateCompetitionNameInputs() {
  const count = parseInt(document.getElementById("competitionCount").value, 10) || 2;
  const container = document.getElementById("competitionNames");
  container.innerHTML = "";
  
  for (let i = 0; i < count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Deltagare ${i + 1}`;
    input.id = `participant-${i}`;
    input.style.width = "100%";
    input.style.padding = "0.8rem";
    input.style.borderRadius = "10px";
    input.style.border = "1px solid rgba(0,220,220,0.4)";
    input.style.background = "rgba(0,0,0,0.5)";
    input.style.color = "#fff";
    input.style.fontSize = "1rem";
    input.style.textAlign = "center";
    container.appendChild(input);
  }
}

function startCompetitionFromKickSelection() {
  // Collect selected kicks
  if (competitionType === 'random') {
    selectedCompetitionKicks = [];
    for (let i = 0; i < competitionKicks.length; i++) {
      const checkbox = document.getElementById(`compKick${i}`);
      if (checkbox && checkbox.checked) {
        selectedCompetitionKicks.push(competitionKicks[i]);
      }
    }
    
    if (selectedCompetitionKicks.length === 0) {
      alert("Välj minst en spark!");
      return;
    }
  } else {
    // Get selected kick for 'selected' type
    for (let i = 0; i < competitionKicks.length; i++) {
      const radio = document.getElementById(`singleKick${i}`);
      if (radio && radio.checked) {
        selectedCompetitionKick = competitionKicks[i];
        break;
      }
    }
  }
  
  // Reset competition state
  competitionRound = 1;
  currentParticipantIndex = 0;
  competitionActive = true;
  
  // Start calibration before first round
  startCalibration();
}

// Starta kalibrering
async function startCalibration() {
  hideAllCompetitionPages();
  document.getElementById('competitionCalibrationPage').style.display = 'block';
  
  document.getElementById('calibrationTitle').textContent = '🎤 KALIBRERAR...';
  document.getElementById('calibrationStatus').textContent = 'Mäter bakgrundsljud... Var tyst!';
  document.getElementById('manualCalibration').style.display = 'none';
  
  try {
    // Starta mikrofon
    calibrationAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    calibrationMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = calibrationAudioCtx.createMediaStreamSource(calibrationMediaStream);
    calibrationAnalyser = calibrationAudioCtx.createAnalyser();
    calibrationAnalyser.fftSize = 2048;
    calibrationDataArray = new Uint8Array(calibrationAnalyser.frequencyBinCount);
    source.connect(calibrationAnalyser);
    
    isCalibrating = true;
    let maxLevel = 0;
    let countdown = 3;
    
    // Visa ljudnivå i realtid
    function updateCalibrationMeter() {
      if (!isCalibrating) return;
      
      calibrationAnalyser.getByteTimeDomainData(calibrationDataArray);
      let max = 0;
      for (let i = 0; i < calibrationDataArray.length; i++) {
        const value = Math.abs(calibrationDataArray[i] - 128);
        if (value > max) max = value;
      }
      
      // Uppdatera max-nivå
      if (max > maxLevel) maxLevel = max;
      
      // Uppdatera ljudmätare (0-100%)
      const percentage = Math.min(100, (max / 128) * 100);
      document.getElementById('calibrationSoundLevel').style.width = percentage + '%';
      
      calibrationAnimationId = requestAnimationFrame(updateCalibrationMeter);
    }
    updateCalibrationMeter();
    
    // Countdown
    document.getElementById('calibrationCountdown').textContent = countdown;
    const countdownInterval = setInterval(() => {
      countdown--;
      document.getElementById('calibrationCountdown').textContent = countdown;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        finishCalibration(maxLevel);
      }
    }, 1000);
    
  } catch (err) {
    document.getElementById('calibrationStatus').textContent = 'Mikrofon krävs för tävlingsläget.';
    competitionActive = false;
  }
}

function finishCalibration(maxLevel) {
  isCalibrating = false;
  backgroundNoiseLevel = maxLevel;
  
  // Sätt tröskel till bakgrund + marginal
  soundThreshold = Math.max(40, backgroundNoiseLevel + 25);
  
  document.getElementById('calibrationTitle').textContent = '✅ KALIBRERING KLAR';
  document.getElementById('calibrationStatus').textContent = '';
  document.getElementById('calibrationCountdown').textContent = '';
  document.getElementById('backgroundLevel').textContent = backgroundNoiseLevel.toFixed(1);
  document.getElementById('sensitivitySlider').value = soundThreshold;
  document.getElementById('thresholdDisplay').textContent = soundThreshold.toFixed(1);
  document.getElementById('manualCalibration').style.display = 'block';
  
  // Fortsätt visa ljudmätare för test
  isCalibrating = true;
  function updateTestMeter() {
    if (!isCalibrating) return;
    
    calibrationAnalyser.getByteTimeDomainData(calibrationDataArray);
    let max = 0;
    for (let i = 0; i < calibrationDataArray.length; i++) {
      const value = Math.abs(calibrationDataArray[i] - 128);
      if (value > max) max = value;
    }
    
    const percentage = Math.min(100, (max / 128) * 100);
    document.getElementById('calibrationSoundLevel').style.width = percentage + '%';
    
    // Flash om över tröskel
    const meter = document.querySelector('#competitionCalibrationPage .sound-meter');
    if (max > soundThreshold) {
      meter.classList.add('hit');
      setTimeout(() => meter.classList.remove('hit'), 300);
    }
    
    calibrationAnimationId = requestAnimationFrame(updateTestMeter);
  }
  updateTestMeter();
}

// Uppdatera tröskel från slider
document.addEventListener('DOMContentLoaded', () => {
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  if (sensitivitySlider) {
    sensitivitySlider.addEventListener('input', (e) => {
      soundThreshold = parseInt(e.target.value);
      document.getElementById('thresholdDisplay').textContent = soundThreshold.toFixed(1);
    });
  }
  
  // Reaction test sensitivity slider
  const reactionSensitivitySlider = document.getElementById('reactionSensitivitySlider');
  if (reactionSensitivitySlider) {
    reactionSensitivitySlider.addEventListener('input', (e) => {
      reactionSoundThreshold = parseInt(e.target.value);
      document.getElementById('reactionThresholdDisplay').textContent = reactionSoundThreshold;
    });
  }
});

// Starta tävling efter kalibrering
function startCompetitionAfterCalibration() {
  isCalibrating = false;
  if (calibrationAnimationId) cancelAnimationFrame(calibrationAnimationId);
  
  // Använd samma mikrofon för tävlingen
  competitionAudioCtx = calibrationAudioCtx;
  competitionMediaStream = calibrationMediaStream;
  competitionAnalyser = calibrationAnalyser;
  competitionDataArray = calibrationDataArray;
  
  // Starta första omgången
  competitionRound = 1;
  currentParticipantIndex = 0;
  startCompetitionRound();
}

function startCompetitionRound() {
  if (!competitionActive) return;
  
  // Select kick ONCE per round (only when starting the round with first participant)
  if (currentParticipantIndex === 0) {
    if (competitionType === 'random') {
      currentRoundKick = selectedCompetitionKicks[
        Math.floor(Math.random() * selectedCompetitionKicks.length)
      ];
    } else {
      currentRoundKick = selectedCompetitionKick;
    }
  }
  
  // Show round page for current participant
  showParticipantRoundPage();
}

function showParticipantRoundPage() {
  if (currentParticipantIndex >= competitionParticipants.length) {
    // Round complete - show leaderboard
    showCompetitionLeaderboard();
    return;
  }
  
  hideAllCompetitionPages();
  document.getElementById("competitionRoundPage").style.display = "block";
  
  const participant = competitionParticipants[currentParticipantIndex];
  const nameEl = document.getElementById("roundParticipantName");
  const roundInfoEl = document.getElementById("roundInfo");
  const kickEl = document.getElementById("kickToPerform");
  
  if (nameEl) nameEl.textContent = participant.name;
  if (roundInfoEl) roundInfoEl.textContent = `Omgång ${competitionRound} av ${TOTAL_COMPETITION_ROUNDS}`;
  if (kickEl) kickEl.textContent = currentRoundKick.name;
}

async function beginCompetitionRound() {
  hideAllCompetitionPages();
  
  // Show countdown overlay
  const overlay = document.getElementById("countdownOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    
    // Countdown with voice
    await performCountdownWithVoice(currentRoundKick.name);
    
    overlay.style.display = "none";
  }
  
  // Show active competition page with timer and sound meter
  showActiveCompetitionPage();
  
  // Measure reaction time
  await measureCompetitionReactionTime();
}

function showActiveCompetitionPage() {
  hideAllCompetitionPages();
  document.getElementById('competitionActivePage').style.display = 'block';
  
  const participant = competitionParticipants[currentParticipantIndex];
  const nameEl = document.getElementById('activeParticipantName');
  const roundInfoEl = document.getElementById('activeRoundInfo');
  const kickNameEl = document.getElementById('activeKickName');
  
  if (nameEl) nameEl.textContent = participant.name.toUpperCase() + ' - OMGÅNG ' + competitionRound;
  if (roundInfoEl) roundInfoEl.textContent = `Omgång ${competitionRound} av ${TOTAL_COMPETITION_ROUNDS}`;
  if (kickNameEl) kickNameEl.textContent = currentRoundKick.name;
  
  // Reset timer display
  const timerEl = document.getElementById('competitionTimer');
  if (timerEl) timerEl.textContent = '0.000 s';
  
  // Reset sound meter
  const soundLevelEl = document.getElementById('competitionSoundLevel');
  if (soundLevelEl) soundLevelEl.style.width = '0%';
  
  // Remove hit class if present
  const soundMeterEl = document.getElementById('competitionSoundMeter');
  if (soundMeterEl) soundMeterEl.classList.remove('hit');
}

async function performCountdownWithVoice(kickName) {
  const overlay = document.getElementById("countdownOverlay");
  
  // Voice announcement
  speakCompetition(kickName);
  await sleep(1000);
  
  // 3... 2... 1... GÅ!
  if (overlay) overlay.textContent = "3";
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
  await sleep(1000);
  
  if (overlay) overlay.textContent = "2";
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
  await sleep(1000);
  
  if (overlay) overlay.textContent = "1";
  playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
  await sleep(1000);
  
  if (overlay) overlay.textContent = "GÅ!";
  playBeep(GO_FREQUENCY, GO_DURATION);
  await sleep(500);
}

function speakCompetition(text) {
  if (!('speechSynthesis' in window)) return;
  
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'sv-SE';
  utterance.rate = 1.0;
  speechSynthesis.speak(utterance);
}

async function measureCompetitionReactionTime() {
  try {
    // Audio should already be initialized from calibration
    // If not (shouldn't happen), initialize it
    if (!competitionAudioCtx || !competitionAnalyser) {
      await prepareCompetitionMicrophone();
    }
    
    // Start timing
    competitionStartTime = performance.now();
    
    // Start timer display
    competitionTimerInterval = setInterval(() => {
      const elapsed = (performance.now() - competitionStartTime) / 1000;
      const timerEl = document.getElementById('competitionTimer');
      if (timerEl) timerEl.textContent = elapsed.toFixed(3) + ' s';
    }, 10);
    
    // Listen for kick
    await listenForCompetitionKick();
    
  } catch (err) {
    alert("Mikrofon krävs för tävlingsläget.");
    competitionActive = false;
  }
}

async function prepareCompetitionMicrophone() {
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach((track) => track.stop());
  }
  
  competitionAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  competitionMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  competitionMediaStreamSource = competitionAudioCtx.createMediaStreamSource(competitionMediaStream);
  competitionAnalyser = competitionAudioCtx.createAnalyser();
  competitionAnalyser.fftSize = 2048;
  const bufferLength = competitionAnalyser.frequencyBinCount;
  competitionDataArray = new Uint8Array(bufferLength);
  competitionMediaStreamSource.connect(competitionAnalyser);
}

function listenForCompetitionKick() {
  return new Promise((resolve) => {
    function checkVolume() {
      if (!competitionActive) {
        resolve();
        return;
      }
      
      competitionAnalyser.getByteTimeDomainData(competitionDataArray);
      let max = 0;
      for (let i = 0; i < competitionDataArray.length; i++) {
        const value = Math.abs(competitionDataArray[i] - 128);
        if (value > max) max = value;
      }
      
      // Uppdatera ljudmätare (0-100%)
      const percentage = Math.min(100, (max / 128) * 100);
      const soundLevelEl = document.getElementById('competitionSoundLevel');
      if (soundLevelEl) soundLevelEl.style.width = percentage + '%';
      
      // Kolla om över tröskel (använd kalibrerad tröskel)
      if (max > soundThreshold) {
        const reactionTime = performance.now() - competitionStartTime;
        
        // Flash ljudmätare
        const soundMeterEl = document.getElementById('competitionSoundMeter');
        if (soundMeterEl) {
          soundMeterEl.classList.add('hit');
          setTimeout(() => soundMeterEl.classList.remove('hit'), 300);
        }
        
        // Stoppa timer
        if (competitionTimerInterval) {
          clearInterval(competitionTimerInterval);
          competitionTimerInterval = null;
        }
        
        // Spara resultat
        saveCompetitionTime(reactionTime);
        resolve();
      } else {
        requestAnimationFrame(checkVolume);
      }
    }
    checkVolume();
  });
}

function saveCompetitionTime(time) {
  // Stop microphone
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach((track) => track.stop());
    competitionMediaStream = null;
  }
  
  const participant = competitionParticipants[currentParticipantIndex];
  participant.times.push(time);
  participant.roundTimes[competitionRound - 1].push(time);
  participant.total += time;
  
  // Move to next participant
  currentParticipantIndex++;
  
  // Brief pause before next participant
  setTimeout(() => {
    startCompetitionRound();
  }, 500);
}

function showCompetitionLeaderboard() {
  hideAllCompetitionPages();
  document.getElementById("competitionLeaderboardPage").style.display = "block";
  
  // Sort by total time
  competitionParticipants.sort((a, b) => a.total - b.total);
  
  // Update title
  const titleEl = document.getElementById("leaderboardTitle");
  if (titleEl) {
    titleEl.textContent = `📊 STÄLLNING EFTER OMGÅNG ${competitionRound}`;
  }
  
  // Build leaderboard
  const container = document.getElementById("leaderboardContainer");
  if (container) {
    let html = '';
    
    competitionParticipants.forEach((p, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      const lastTime = p.times[p.times.length - 1];
      const arrow = getRankChangeArrow(p, index);
      const rowClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
      
      html += `
        <div class="leaderboard-row ${rowClass}">
          <span>${medal} ${p.name}</span>
          <span>${p.total.toFixed(0)} ms <span style="color: rgba(255,255,255,0.7);">(+${lastTime.toFixed(0)})</span> ${arrow}</span>
        </div>
      `;
      
      p.previousRank = index;
    });
    
    container.innerHTML = html;
  }
  
  // Update continue button
  const continueBtn = document.getElementById("continueBtn");
  if (continueBtn) {
    if (competitionRound < TOTAL_COMPETITION_ROUNDS) {
      continueBtn.textContent = `OMGÅNG ${competitionRound + 1} →`;
      continueBtn.onclick = continueCompetition;
    } else {
      continueBtn.textContent = 'SE RESULTAT →';
      continueBtn.onclick = showFinalResults;
    }
  }
}

function getRankChangeArrow(participant, currentIndex) {
  if (competitionRound === 1) return ''; // No change in first round
  
  if (participant.previousRank > currentIndex) {
    return '<span class="rank-change rank-up">↑</span>';
  } else if (participant.previousRank < currentIndex) {
    return '<span class="rank-change rank-down">↓</span>';
  }
  return '';
}

function continueCompetition() {
  competitionRound++;
  currentParticipantIndex = 0;
  startCompetitionRound();
}

function showFinalResults() {
  hideAllCompetitionPages();
  document.getElementById("competitionResultsPage").style.display = "block";
  
  // Sort by total time (already sorted from leaderboard)
  competitionParticipants.sort((a, b) => a.total - b.total);
  
  // Show confetti
  showConfetti();
  
  // Winner announcement
  const winner = competitionParticipants[0];
  const winnerEl = document.getElementById("winnerAnnouncement");
  if (winnerEl) {
    winnerEl.textContent = `🎉🎉🎉 GRATTIS ${winner.name}! 🎉🎉🎉`;
  }
  
  // Build podium
  buildPodium();
  
  // Detailed statistics
  buildDetailedStats();
}

function buildPodium() {
  const container = document.getElementById("podiumContainer");
  if (!container) return;
  
  let html = '';
  
  // Top 3
  const top3 = competitionParticipants.slice(0, 3);
  
  if (top3.length >= 2) {
    // Second place
    html += `
      <div class="podium-place podium-second">
        <div class="podium-medal">🥈</div>
        <div class="podium-name">${top3[1].name}</div>
        <div class="podium-time">${top3[1].total.toFixed(0)} ms</div>
      </div>
    `;
  }
  
  if (top3.length >= 1) {
    // First place
    html += `
      <div class="podium-place podium-first">
        <div class="podium-medal">🥇</div>
        <div class="podium-name">${top3[0].name}</div>
        <div class="podium-time">${top3[0].total.toFixed(0)} ms</div>
      </div>
    `;
  }
  
  if (top3.length >= 3) {
    // Third place
    html += `
      <div class="podium-place podium-third">
        <div class="podium-medal">🥉</div>
        <div class="podium-name">${top3[2].name}</div>
        <div class="podium-time">${top3[2].total.toFixed(0)} ms</div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function buildDetailedStats() {
  const container = document.getElementById("detailedStats");
  if (!container) return;
  
  let html = '';
  
  competitionParticipants.forEach(p => {
    const timesStr = p.times.map(t => t.toFixed(0)).join(' + ');
    html += `${p.name}: ${timesStr} = ${p.total.toFixed(0)} ms<br/>`;
  });
  
  container.innerHTML = html;
}

function showConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti';
  document.body.appendChild(container);
  
  const colors = ['#ff8008', '#ffc837', '#00dddd', '#ff4444', '#44ff44'];
  
  for (let i = 0; i < 100; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 2 + 's';
    container.appendChild(piece);
  }
  
  setTimeout(() => container.remove(), 5000);
}

// Stop competition
function stopCompetition() {
  competitionActive = false;
  isCalibrating = false;
  
  // Stoppa timer
  if (competitionTimerInterval) {
    clearInterval(competitionTimerInterval);
    competitionTimerInterval = null;
  }
  
  // Stoppa animationer
  if (calibrationAnimationId) {
    cancelAnimationFrame(calibrationAnimationId);
    calibrationAnimationId = null;
  }
  
  // Stoppa mikrofon
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach(track => track.stop());
    competitionMediaStream = null;
  }
  if (calibrationMediaStream) {
    calibrationMediaStream.getTracks().forEach(track => track.stop());
    calibrationMediaStream = null;
  }
  
  // Stoppa talsyntes
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
  
  // Show message
  alert('Tävlingen avbruten');
  
  // Visa setup-sidan igen
  showCompetitionParticipantsPage();
}

// Exit competition to main menu
function exitCompetitionToMenu() {
  // Stop everything
  stopCompetitionInternal();
  
  // Go to main menu
  showStartPage();
}

// Internal stop function (without alert and navigation)
function stopCompetitionInternal() {
  competitionActive = false;
  isCalibrating = false;
  
  // Stoppa timer
  if (competitionTimerInterval) {
    clearInterval(competitionTimerInterval);
    competitionTimerInterval = null;
  }
  
  // Stoppa animationer
  if (calibrationAnimationId) {
    cancelAnimationFrame(calibrationAnimationId);
    calibrationAnimationId = null;
  }
  
  // Stoppa mikrofon
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach(track => track.stop());
    competitionMediaStream = null;
  }
  if (calibrationMediaStream) {
    calibrationMediaStream.getTracks().forEach(track => track.stop());
    calibrationMediaStream = null;
  }
  
  // Stoppa talsyntes
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
}

/* ---------- Live sparring score ---------- */
function showLiveScorePage() {
  hideAllPages();
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "block";
  
  stopAllTests();
  
  matchEnded = false;
  restTimeLeft = 0;
  setMatchDuration();
  updateLiveMeta();
  updateLiveScoreDisplay();
}

function updateLiveScoreDisplay() {
  const redNameInput = document.getElementById("redNameInput");
  const blueNameInput = document.getElementById("blueNameInput");
  if (redNameInput) liveScoreNames.red = redNameInput.value.trim() || "Röd";
  if (blueNameInput) liveScoreNames.blue = blueNameInput.value.trim() || "Blå";
  const redLabel = document.getElementById("redNameLabel");
  const blueLabel = document.getElementById("blueNameLabel");
  if (redLabel) redLabel.textContent = liveScoreNames.red;
  if (blueLabel) blueLabel.textContent = liveScoreNames.blue;
  const redScore = document.getElementById("redScore");
  const blueScore = document.getElementById("blueScore");
  if (redScore) redScore.textContent = liveScore.red;
  if (blueScore) blueScore.textContent = liveScore.blue;
  const redPenalty = document.getElementById("redPenalty");
  const bluePenalty = document.getElementById("bluePenalty");
  if (redPenalty) redPenalty.textContent = livePenalties.red;
  if (bluePenalty) bluePenalty.textContent = livePenalties.blue;
  const timerEl = document.getElementById("liveTimer");
  if (timerEl) timerEl.textContent = formatLiveTime(liveTimeLeft);
  const operatorTimerEl = document.getElementById("operatorTimer");
  if (operatorTimerEl) operatorTimerEl.textContent = formatLiveTime(liveTimeLeft);
  const status = document.getElementById("liveScoreStatus");
  if (status) {
    status.textContent = `${liveScoreNames.red}: ${liveScore.red} – ${liveScoreNames.blue}: ${liveScore.blue}`;
  }
  const roundScore = document.getElementById("roundScore");
  if (roundScore) {
    roundScore.textContent = `Ronder: ${roundWins.blue} – ${roundWins.red}`;
  }
  const restStatus = document.getElementById("restStatus");
  if (restStatus) {
    restStatus.textContent = restTimeLeft > 0 ? `Paus: ${formatLiveTime(restTimeLeft)}` : "";
  }
  const totalRoundsEl = document.getElementById("liveTotalRounds");
  if (totalRoundsEl) totalRoundsEl.textContent = totalRounds;
  // Publikvy
  const audRedName = document.getElementById("audienceRedName");
  const audBlueName = document.getElementById("audienceBlueName");
  const audRedBadge = document.getElementById("audienceRedBadge");
  const audBlueBadge = document.getElementById("audienceBlueBadge");
  const audRedScore = document.getElementById("audienceRedScore");
  const audBlueScore = document.getElementById("audienceBlueScore");
  const audTimer = document.getElementById("audienceTimer");
  const audRound = document.getElementById("audienceRound");
  const audInfo = document.getElementById("audienceInfo");
  const audMatchTitle = document.getElementById("audienceMatchTitle");
  const audRedPen = document.getElementById("audienceRedPenalty");
  const audBluePen = document.getElementById("audienceBluePenalty");
  const audRoundScore = document.getElementById("audienceRoundScore");
  const audWinner = document.getElementById("audienceWinner");
  const audRest = document.getElementById("audienceRest");
  
  // Update icon counters in audience view
  const audRedPunch = document.getElementById("audienceRedPunchCount");
  const audRedHead = document.getElementById("audienceRedHeadCount");
  const audRedBody = document.getElementById("audienceRedBodyCount");
  const audBluePunch = document.getElementById("audienceBluePunchCount");
  const audBlueHead = document.getElementById("audienceBlueHeadCount");
  const audBlueBody = document.getElementById("audienceBlueBodyCount");
  
  if (audRedName) audRedName.textContent = liveScoreNames.red;
  if (audBlueName) audBlueName.textContent = liveScoreNames.blue;
  if (audRedBadge) audRedBadge.textContent = "🇸🇪";
  if (audBlueBadge) audBlueBadge.textContent = "🇸🇪";
  if (audRedScore) audRedScore.textContent = liveScore.red;
  if (audBlueScore) audBlueScore.textContent = liveScore.blue;
  if (audTimer) audTimer.textContent = formatLiveTime(liveTimeLeft);
  if (audRound) audRound.textContent = currentRound;
  if (audMatchTitle) audMatchTitle.textContent = getMatchTitle();
  if (audRedPen) audRedPen.textContent = livePenalties.red;
  if (audBluePen) audBluePen.textContent = livePenalties.blue;
  if (audRoundScore) audRoundScore.textContent = `Ronder: ${roundWins.blue} – ${roundWins.red}`;
  
  // Only update winner and PTG messages if in audience mode
  if (isAudienceViewActive()) {
    if (audWinner) {
      if (centerMessage) {
        audWinner.textContent = centerMessage;
      } else if (matchEnded) {
        audWinner.textContent = `Vinnare: ${roundWins.red > roundWins.blue ? liveScoreNames.red : liveScoreNames.blue}`;
      } else {
        audWinner.textContent = "";
      }
    }
  }
  
  if (audRest) audRest.textContent = restTimeLeft > 0 ? `Paus: ${formatLiveTime(restTimeLeft)}` : "";
  
  // Update hit counters with icons
  if (audRedPunch) audRedPunch.textContent = currentHits.red.punch;
  if (audRedHead) audRedHead.textContent = currentHits.red.head;
  if (audRedBody) audRedBody.textContent = currentHits.red.body;
  if (audBluePunch) audBluePunch.textContent = currentHits.blue.punch;
  if (audBlueHead) audBlueHead.textContent = currentHits.blue.head;
  if (audBlueBody) audBlueBody.textContent = currentHits.blue.body;
  
  // Update new operator view elements
  const blueRoundWinsEl = document.getElementById("blueRoundWins");
  const redRoundWinsEl = document.getElementById("redRoundWins");
  if (blueRoundWinsEl) blueRoundWinsEl.textContent = roundWins.blue;
  if (redRoundWinsEl) redRoundWinsEl.textContent = roundWins.red;
  
  const bluePunchCountEl = document.getElementById("bluePunchCount");
  const blueBodyCountEl = document.getElementById("blueBodyCount");
  const blueHeadCountEl = document.getElementById("blueHeadCount");
  const redPunchCountEl = document.getElementById("redPunchCount");
  const redBodyCountEl = document.getElementById("redBodyCount");
  const redHeadCountEl = document.getElementById("redHeadCount");
  
  if (bluePunchCountEl) bluePunchCountEl.textContent = currentHits.blue.punch;
  if (blueBodyCountEl) blueBodyCountEl.textContent = currentHits.blue.body;
  if (blueHeadCountEl) blueHeadCountEl.textContent = currentHits.blue.head;
  if (redPunchCountEl) redPunchCountEl.textContent = currentHits.red.punch;
  if (redBodyCountEl) redBodyCountEl.textContent = currentHits.red.body;
  if (redHeadCountEl) redHeadCountEl.textContent = currentHits.red.head;
  
  // Update round number display
  const liveRoundNumberEl = document.getElementById("liveRoundNumber");
  if (liveRoundNumberEl) liveRoundNumberEl.textContent = currentRound;
  
  // Update status message
  const operatorStatus = document.getElementById("operatorStatus");
  if (operatorStatus && centerMessage) {
    operatorStatus.textContent = centerMessage;
    operatorStatus.classList.add("visible");
  } else if (operatorStatus) {
    operatorStatus.classList.remove("visible");
  }
}

// Toggle operator menu
function toggleOperatorMenu() {
  const menu = document.getElementById("operatorMenu");
  if (menu) {
    if (menu.style.display === "none" || !menu.classList.contains("open")) {
      menu.style.display = "block";
      menu.classList.add("open");
    } else {
      menu.classList.remove("open");
      setTimeout(() => {
        menu.style.display = "none";
      }, 300);
    }
  }
}

function addScore(side, value) {
  if (matchEnded) return;
  liveScore[side] += value;
  totalScore[side] += value;
  lastAction = { type: "score", side, value };
  
  // Map score values to hit types based on Taekwondo scoring rules
  // 1 point = punch
  // 2 points = body kick (vest)
  // 3 points = head kick
  // 4 points = spinning body kick
  // 5+ points = spinning head techniques
  if (value === 1) {
    currentHits[side].punch += 1;
    totalHits[side].punch += 1;
  } else if (value === 2) {
    currentHits[side].body += 1;
    totalHits[side].body += 1;
  } else if (value === 3) {
    currentHits[side].head += 1;
    totalHits[side].head += 1;
  } else if (value === 4) {
    currentHits[side].body += 1;
    totalHits[side].body += 1;
  } else if (value >= 5) {
    currentHits[side].head += 1;
    totalHits[side].head += 1;
  }
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
  
  // Check for 12-point gap (PTG - Point Gap)
  checkPointGap();
}

function addPenalty(side) {
  if (matchEnded) return;
  livePenalties[side] += 1;
  totalPenalties[side] += 1;
  // Gam-jeom ger poäng till motståndaren
  const other = side === "red" ? "blue" : "red";
  liveScore[other] += 1;
  totalScore[other] += 1;
  lastAction = { type: "penalty", side, value: 1 };
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
  
  // Check for 5 gam-jeom rule
  if (livePenalties[side] >= 5) {
    endRoundByGamJeom(side);
  }
}

function checkPointGap() {
  if (matchEnded) return;
  const gap = Math.abs(liveScore.red - liveScore.blue);
  if (gap >= 12) {
    const leader = liveScore.red > liveScore.blue ? "red" : "blue";
    endRoundByPointGap(leader);
  }
}

function endRoundByGamJeom(loserSide) {
  pauseLiveTimer();
  const other = loserSide === "red" ? "blue" : "red";
  const loserName = liveScoreNames[loserSide];
  const winnerName = liveScoreNames[other];
  
  roundWins[other] += 1;
  roundEndReason = `${loserName} fick 5 gam-jeom. ${winnerName} vinner ronden`;
  
  // Display center message
  displayCenterMessage(`${loserName} fick 5 gam-jeom. ${winnerName} vinner ronden`);
  
  // Save hit statistics per round
  lastRoundHits = JSON.parse(JSON.stringify(currentHits));
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  
  // Check if match should end (best of 3)
  if (shouldEndMatch()) {
    matchEnded = true;
    setTimeout(() => {
      showWinner();
    }, 3000);
  } else {
    currentRound++;
    setTimeout(() => {
      startRoundPause();
    }, 3000);
  }
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function endRoundByPointGap(leader) {
  pauseLiveTimer();
  const leaderName = liveScoreNames[leader];
  
  roundWins[leader] += 1;
  roundEndReason = `PTG - ${leaderName} vinner ronden`;
  
  // Display center message
  displayCenterMessage(`PTG - ${leaderName} vinner ronden`);
  
  // Save hit statistics per round
  lastRoundHits = JSON.parse(JSON.stringify(currentHits));
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  
  // Check if match should end (best of 3)
  if (shouldEndMatch()) {
    matchEnded = true;
    setTimeout(() => {
      showWinner();
    }, 3000);
  } else {
    currentRound++;
    setTimeout(() => {
      startRoundPause();
    }, 3000);
  }
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function shouldEndMatch() {
  // Best of 3: match ends if someone wins 2 rounds
  return roundWins.red >= 2 || roundWins.blue >= 2;
}

function isAudienceViewActive() {
  // Helper function to check if we're in audience mode (embedded or standalone)
  return audienceMode || isStandaloneAudienceView;
}

function displayCenterMessage(message) {
  centerMessage = message || "";
  
  // DO NOT display overlay in operator view - only show in status text
  // This prevents PTG (Point Gap)/Winner popups from appearing in operator view
  
  // Update status text in operator view
  const status = document.getElementById("liveScoreStatus");
  if (status && message) status.textContent = message;
  
  // Only update audience view elements if we're in audience mode
  // This prevents popups from appearing in the operator view
  if (isAudienceViewActive()) {
    // Check if this is a PTG message
    const isPTG = message && (message.includes("PTG") || message.includes());
    
    // Display PTG message in yellow box in audience view (both embedded and standalone)
    const audPTGMessage = document.getElementById("audiencePTGMessage") || document.getElementById("ptgMessage");
    if (audPTGMessage) {
      if (isPTG) {
        audPTGMessage.textContent = message;
        audPTGMessage.classList.add("visible");
      } else {
        audPTGMessage.classList.remove("visible");
      }
    }
    
    // Display regular messages in winner area (audience view only)
    const audWinner = document.getElementById("audienceWinner");
    if (audWinner && !isPTG) {
      audWinner.textContent = message;
    }
  }
  
  // Broadcast the message
  broadcastLiveData();
}

function startRoundPause() {
  // Display round statistics during pause
  displayRoundStatistics();
  
  // Start rest timer
  restTimeLeft = parseInt(document.getElementById("restSeconds")?.value, 10) || 30;
  startRest();
}

function displayRoundStatistics() {
  const roundNum = currentRound - 1;
  
  // Only display statistics in audience view (not in operator view)
  if (isAudienceViewActive()) {
    // Display statistics in respective panels (handle both embedded and standalone views)
    const blueStatsBox = document.getElementById("audienceBlueStats") || document.getElementById("blueStats");
    const redStatsBox = document.getElementById("audienceRedStats") || document.getElementById("redStats");
    const blueStatsContent = document.getElementById("audienceBlueStatsContent") || document.getElementById("blueStatsContent");
    const redStatsContent = document.getElementById("audienceRedStatsContent") || document.getElementById("redStatsContent");
    
    if (blueStatsContent) {
      blueStatsContent.innerHTML = `
        <div class="stat-line"><span>Rond ${roundNum} poäng:</span><span>${liveScore.blue}</span></div>
        <div class="stat-line"><span>Slag:</span><span>${lastRoundHits.blue.punch}</span></div>
        <div class="stat-line"><span>Huvud:</span><span>${lastRoundHits.blue.head}</span></div>
        <div class="stat-line"><span>Kropp:</span><span>${lastRoundHits.blue.body}</span></div>
        <div class="stat-line"><span>Gam-jeom:</span><span>${livePenalties.blue}</span></div>
      `;
    }
    
    if (redStatsContent) {
      redStatsContent.innerHTML = `
        <div class="stat-line"><span>Rond ${roundNum} poäng:</span><span>${liveScore.red}</span></div>
        <div class="stat-line"><span>Slag:</span><span>${lastRoundHits.red.punch}</span></div>
        <div class="stat-line"><span>Huvud:</span><span>${lastRoundHits.red.head}</span></div>
        <div class="stat-line"><span>Kropp:</span><span>${lastRoundHits.red.body}</span></div>
        <div class="stat-line"><span>Gam-jeom:</span><span>${livePenalties.red}</span></div>
      `;
    }
    
    if (blueStatsBox) blueStatsBox.classList.add("visible");
    if (redStatsBox) redStatsBox.classList.add("visible");
  } else {
    // Update operator view status text (only when NOT in audience mode)
    const status = document.getElementById("liveScoreStatus");
    if (status) {
      status.textContent = `Rond ${roundNum} statistik visas i publikvy`;
    }
  }
}

function removePenalty(side) {
  if (livePenalties[side] <= 0 || matchEnded) return;
  livePenalties[side] -= 1;
  totalPenalties[side] = Math.max(0, totalPenalties[side] - 1);
  const other = side === "red" ? "blue" : "red";
  liveScore[other] = Math.max(0, liveScore[other] - 1);
  totalScore[other] = Math.max(0, totalScore[other] - 1);
  lastAction = { type: "penalty", side, value: -1 };
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function undoLastAction() {
  if (!lastAction || matchEnded) return;
  const { type, side, value } = lastAction;
  if (type === "score") {
    liveScore[side] = Math.max(0, liveScore[side] - value);
    totalScore[side] = Math.max(0, totalScore[side] - value);
    
    // Also undo the hit counter
    if (value === 1) {
      currentHits[side].punch = Math.max(0, currentHits[side].punch - 1);
      totalHits[side].punch = Math.max(0, totalHits[side].punch - 1);
    } else if (value === 2) {
      currentHits[side].body = Math.max(0, currentHits[side].body - 1);
      totalHits[side].body = Math.max(0, totalHits[side].body - 1);
    } else if (value === 3) {
      currentHits[side].head = Math.max(0, currentHits[side].head - 1);
      totalHits[side].head = Math.max(0, totalHits[side].head - 1);
    } else if (value === 4) {
      currentHits[side].body = Math.max(0, currentHits[side].body - 1);
      totalHits[side].body = Math.max(0, totalHits[side].body - 1);
    } else if (value >= 5) {
      currentHits[side].head = Math.max(0, currentHits[side].head - 1);
      totalHits[side].head = Math.max(0, totalHits[side].head - 1);
    }
  } else if (type === "penalty") {
    // Om senaste var +1 penalty: ta bort penalty och dra av poäng från motståndaren
    const other = side === "red" ? "blue" : "red";
    if (value === 1) {
      livePenalties[side] = Math.max(0, livePenalties[side] - 1);
      totalPenalties[side] = Math.max(0, totalPenalties[side] - 1);
      liveScore[other] = Math.max(0, liveScore[other] - 1);
      totalScore[other] = Math.max(0, totalScore[other] - 1);
    } else if (value === -1) {
      livePenalties[side] += 1;
      totalPenalties[side] += 1;
      liveScore[other] += 1;
      totalScore[other] += 1;
    }
  }
  lastAction = null;
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function resetLiveScore() {
  liveScore.red = 0; liveScore.blue = 0;
  livePenalties.red = 0; livePenalties.blue = 0;
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  totalScore = { red: 0, blue: 0 };
  totalHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  totalPenalties = { red: 0, blue: 0 };
  roundWins = { red: 0, blue: 0 };
  currentRound = 1;
  liveTimeLeft = matchDurationSeconds;
  matchEnded = false;
  restTimeLeft = 0;
  clearInterval(restTimerId);
  lastAction = null;
  
  // Clear all messages and statistics
  centerMessage = "";
  roundEndReason = "";
  lastRoundHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  
  // Clear winner message in audience view (both embedded and standalone views)
  const audWinner = document.getElementById("audienceWinner");
  if (audWinner) audWinner.textContent = "";
  
  // Clear PTG message (handle both embedded and standalone views)
  const audPTGMessage = document.getElementById("audiencePTGMessage") || document.getElementById("ptgMessage");
  if (audPTGMessage) audPTGMessage.classList.remove("visible");
  
  // Hide statistics boxes (handle both embedded and standalone views)
  const blueStatsBox = document.getElementById("audienceBlueStats") || document.getElementById("blueStats");
  const redStatsBox = document.getElementById("audienceRedStats") || document.getElementById("redStats");
  if (blueStatsBox) blueStatsBox.classList.remove("visible");
  if (redStatsBox) redStatsBox.classList.remove("visible");
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function setMatchDuration() {
  const val = parseInt(document.getElementById("matchDurationInput")?.value, 10);
  if (!isNaN(val) && val > 0) {
    matchDurationSeconds = val;
    liveTimeLeft = val;
    updateLiveScoreDisplay();
    broadcastLiveData();
  }
}

function setTotalRounds() {
  const val = parseInt(document.getElementById("totalRoundsInput")?.value, 10);
  if (!isNaN(val) && val > 0 && val <= 3) {
    totalRounds = val;
    document.getElementById("liveTotalRounds").textContent = totalRounds;
    broadcastLiveData();
  } else if (val > 3) {
    // Enforce max of 3 rounds
    totalRounds = 3;
    document.getElementById("totalRoundsInput").value = 3;
    document.getElementById("liveTotalRounds").textContent = totalRounds;
    broadcastLiveData();
  }
}

function setRestTime() {
  const val = parseInt(document.getElementById("restSeconds")?.value, 10);
  if (!isNaN(val) && val > 0) {
    restTimeLeft = val;
  }
}

function toggleLiveTimer() {
  if (matchEnded) return;
  if (liveTimerRunning) {
    pauseLiveTimer();
  } else {
    startLiveTimer();
  }
  broadcastLiveData();
}

function startLiveTimer() {
  if (liveTimerRunning) return;
  liveTimerRunning = true;
  liveTimerId = setInterval(() => {
    liveTimeLeft--;
    if (liveTimeLeft <= 0) {
      liveTimeLeft = 0;
      checkRoundEnd();
    }
    updateLiveScoreDisplay();
    broadcastLiveData();
  }, 1000);
}

function pauseLiveTimer() {
  liveTimerRunning = false;
  clearInterval(liveTimerId);
}

function resetLiveTimer() {
  pauseLiveTimer();
  liveTimeLeft = matchDurationSeconds;
  currentRound = 1;
  matchEnded = false;
  restTimeLeft = 0;
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function startRest() {
  if (matchEnded) return;
  const val = parseInt(document.getElementById("restSeconds")?.value, 10) || 30;
  restTimeLeft = val;
  pauseLiveTimer();
  updateLiveScoreDisplay();
  clearInterval(restTimerId);
  restTimerId = setInterval(() => {
    restTimeLeft--;
    if (restTimeLeft <= 0) {
      restTimeLeft = 0;
      clearInterval(restTimerId);
      // Do NOT auto-start timer - operator must explicitly click "Starta klockan"
    }
    updateLiveScoreDisplay();
    broadcastLiveData();
  }, 1000);
}

function checkRoundEnd() {
  pauseLiveTimer();
  if (liveScore.red === liveScore.blue) {
    // Oavgjort: sudden death? Här markerar vi bara att ronden är slut.
    roundEndReason = "Rond slut: oavgjort";
  } else if (liveScore.red > liveScore.blue) {
    roundWins.red += 1;
    roundEndReason = `${liveScoreNames.red} vinner ronden`;
  } else {
    roundWins.blue += 1;
    roundEndReason = `${liveScoreNames.blue} vinner ronden`;
  }
  
  // Display round result in center
  displayCenterMessage(roundEndReason);
  
  // Spara träffstatistik per rond
  lastRoundHits = JSON.parse(JSON.stringify(currentHits));
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };

  // Check if match should end (best of 3)
  if (shouldEndMatch()) {
    matchEnded = true;
    setTimeout(() => {
      showWinner();
    }, 3000);
  } else {
    currentRound++;
    setTimeout(() => {
      startRoundPause();
    }, 3000);
  }
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function showWinner() {
  pauseLiveTimer();
  const winner = roundWins.red > roundWins.blue ? liveScoreNames.red : liveScoreNames.blue;
  const winnerMessage = `Matchen slut! Vinnare: ${winner}`;
  
  // Display winner message (will only update audience elements if in audience mode)
  displayCenterMessage(winnerMessage);
  
  // Update operator view status text
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = winnerMessage;
  
  // Winner announcement is already handled by displayCenterMessage
  // No need to directly update audWinner here as it would bypass the audience mode check
  
  matchEnded = true;
}

function updateLiveMeta() {
  const status = document.getElementById("liveScoreStatus");
  if (!status) return;
  const redScore = `${liveScoreNames.red}: ${liveScore.red} (GJ: ${livePenalties.red})`;
  const blueScore = `${liveScoreNames.blue}: ${liveScore.blue} (GJ: ${livePenalties.blue})`;
  status.textContent = `${redScore} – ${blueScore} | Rond ${currentRound}/${totalRounds}`;
  const audInfo = document.getElementById("audienceInfo");
  if (audInfo) audInfo.textContent = status.textContent;
  const audMetaScore = document.getElementById("audienceMetaScore");
  if (audMetaScore) audMetaScore.textContent = `${liveScoreNames.red} ${liveScore.red} – ${liveScore.blue} ${liveScoreNames.blue}`;
  const audRound = document.getElementById("audienceRound");
  if (audRound) audRound.textContent = currentRound;
}

function toggleAudienceView(open) {
  const view = document.getElementById("audienceView");
  if (!view) return;
  audienceMode = open;
  view.style.display = open ? "flex" : "none";
  if (open) {
    updateLiveScoreDisplay();
  }
}

function updateMatchTitle() {
  const title = getMatchTitle();
  const audTitle = document.getElementById("audienceMatchTitle");
  if (audTitle) audTitle.textContent = title;
  broadcastLiveData();
}

/* ---------- Sparring träningslogik ---------- */
// Old sparring training logic - kept for compatibility
// TODO: Consider deprecating this old implementation in favor of the new Spark träning feature
let sparringInterval = null;
let sparringTimeout = null;
const sparringCommands = ["Höger rak", "Vänster krok", "Front kick", "Roundhouse", "Blockera", "Kontring", "Låg spark", "Hög spark", "Sidosteg höger", "Sidosteg vänster"];

function startSparring() {
  stopSparringTraining();
  const statusEl = document.getElementById("sparringStatus");
  if (statusEl) statusEl.textContent = "Träning pågår...";
  scheduleNextSparringCommand();
}

function scheduleNextSparringCommand() {
  const interval = Math.floor(Math.random() * 3000) + 2000; // 2-5 sekunder
  sparringTimeout = setTimeout(() => {
    const cmd = sparringCommands[Math.floor(Math.random() * sparringCommands.length)];
    const cmdEl = document.getElementById("sparringCommand");
    if (cmdEl) cmdEl.textContent = cmd;
    speak(cmd);
    scheduleNextSparringCommand();
  }, interval);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = "sv-SE";
  window.speechSynthesis.speak(msg);
}

/* ---------- Kick Training (Spark träning) ---------- */
// Technique definitions - Swedish only
const kicks = [
  { name: "Framspark" },
  { name: "Sidospark" },
  { name: "Rundspark" },
  { name: "Bakspark" },
  { name: "Snurrspark" },
  { name: "Yxspark" },
  { name: "Krokspark" },
  { name: "Hoppspark" },
  { name: "Flygande sidospark" },
  { name: "An Chagi" },
  { name: "Saxspark" },
  { name: "Snurrande bakspark" },
  { name: "Slag" }
];

// Training state
let selectedKicks = [];
let trainingMode = 'free'; // 'free', 'interval', 'challenge'
let tempo = 2000; // ms between kicks
let trainingDuration = 180; // seconds (3 minutes default)
let intervalWork = 20; // seconds active
let intervalRest = 10; // seconds rest
let trainingActive = false;
let trainingTimer = null;
let trainingTimeRemaining = 0;
let trainingInterval = null;
let isRestPeriod = false;

// Challenge mode variables
let challengeTempo = 3000; // Starts at 3 seconds
const MIN_TEMPO = 800; // Fastest tempo
const TEMPO_DECREASE = 100; // Decreases by 100ms per kick

// Navigation functions
function showKickTrainingIntroPage() {
  hideAllTrainingPages();
  document.getElementById("kickTrainingIntroPage").style.display = "block";
  document.getElementById("startPage").style.display = "none";
}

function showKickSelectionPage() {
  hideAllTrainingPages();
  document.getElementById("kickSelectionPage").style.display = "block";
  // Ensure all kicks are checked by default
  for (let i = 0; i < kicks.length; i++) {
    const checkbox = document.getElementById(`kick${i}`);
    if (checkbox && !checkbox.checked) checkbox.checked = true;
  }
}

function showTrainingModeSelectionPage() {
  hideAllTrainingPages();
  // Get selected kicks
  selectedKicks = [];
  for (let i = 0; i < kicks.length; i++) {
    const checkbox = document.getElementById(`kick${i}`);
    if (checkbox && checkbox.checked) {
      selectedKicks.push(kicks[i]);
    }
  }
  
  if (selectedKicks.length === 0) {
    alert("Välj minst en spark!");
    showKickSelectionPage();
    return;
  }
  
  document.getElementById("trainingModeSelectionPage").style.display = "block";
  // Highlight default mode (free)
  selectTrainingMode('free');
}

function showTrainingSettingsPage() {
  hideAllTrainingPages();
  document.getElementById("trainingSettingsPage").style.display = "block";
  
  // Show/hide interval settings based on selected mode
  const intervalSettings = document.getElementById("intervalSettings");
  if (intervalSettings) {
    intervalSettings.style.display = trainingMode === 'interval' ? 'block' : 'none';
  }
  
  // Update tempo display
  updateTempoDisplay();
}

function showKickTrainingPage() {
  hideAllTrainingPages();
  document.getElementById("kickTrainingPage").style.display = "block";
}

function hideAllTrainingPages() {
  const pages = [
    'kickTrainingIntroPage', 'kickSelectionPage', 'trainingModeSelectionPage',
    'trainingSettingsPage', 'kickTrainingPage'
  ];
  pages.forEach(pageId => {
    const page = document.getElementById(pageId);
    if (page) page.style.display = "none";
  });
}

// Mode selection
function selectTrainingMode(mode) {
  trainingMode = mode;
  
  // Update button states
  const modes = ['free', 'interval', 'challenge'];
  modes.forEach(m => {
    const btn = document.getElementById(`mode-${m}`);
    if (btn) {
      if (m === mode) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    }
  });
}

// Speech synthesis
function speakKick(kick) {
  if (!('speechSynthesis' in window)) return;
  
  // Cancel any ongoing speech
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(kick.name);
  utterance.lang = 'sv-SE';
  utterance.rate = 1.0;
  speechSynthesis.speak(utterance);
}

// Tempo slider
function updateTempoDisplay() {
  const slider = document.getElementById("tempoSlider");
  const display = document.getElementById("tempoDisplay");
  if (slider && display) {
    tempo = parseInt(slider.value);
    const seconds = (tempo / 1000).toFixed(1);
    display.textContent = `${seconds} sekunder mellan sparkar`;
  }
}

// Time selection
function selectTrainingTime(seconds) {
  trainingDuration = seconds;
  
  // Update button states
  const times = [60, 180, 300, 600];
  times.forEach(t => {
    const btn = document.getElementById(`time-${t}`);
    if (btn) {
      if (t === seconds) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    }
  });
}

// Countdown before training starts
async function startKickTrainingCountdown() {
  // Get interval settings if in interval mode
  if (trainingMode === 'interval') {
    const workInput = document.getElementById("intervalWork");
    const restInput = document.getElementById("intervalRest");
    if (workInput) intervalWork = parseInt(workInput.value) || 20;
    if (restInput) intervalRest = parseInt(restInput.value) || 10;
  }
  
  showKickTrainingPage();
  
  const displayBox = document.getElementById("kickDisplayBox");
  const kickDisplay = document.getElementById("currentKickDisplay");
  const statusDisplay = document.getElementById("trainingStatus");
  
  if (!kickDisplay || !statusDisplay) return;
  
  // Reset display
  if (displayBox) {
    displayBox.classList.remove('active', 'rest');
  }
  
  try {
    // Countdown: 3... 2... 1... GÅ!
    kickDisplay.textContent = "3";
    statusDisplay.textContent = "Gör dig redo...";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    kickDisplay.textContent = "2";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    kickDisplay.textContent = "1";
    playBeep(COUNTDOWN_FREQUENCY, COUNTDOWN_DURATION);
    await sleep(1000);
    
    kickDisplay.textContent = "GÅ!";
    statusDisplay.textContent = "Träning pågår!";
    playBeep(GO_FREQUENCY, GO_DURATION);
    await sleep(500);
    
    // Start training
    startKickTrainingSession();
    
  } catch (error) {
    kickDisplay.textContent = "Fel vid start";
    statusDisplay.textContent = "Kunde inte starta träningen";
  }
}

// Start the actual training session
function startKickTrainingSession() {
  trainingActive = true;
  trainingTimeRemaining = trainingDuration;
  isRestPeriod = false;
  challengeTempo = 3000; // Reset challenge tempo
  
  // Update timer display
  updateTrainingTimer();
  
  // Start countdown timer
  trainingTimer = setInterval(() => {
    trainingTimeRemaining--;
    updateTrainingTimer();
    
    if (trainingTimeRemaining <= 0) {
      stopKickTraining();
    }
  }, 1000);
  
  // Start training mode
  switch (trainingMode) {
    case 'free':
      startFreeMode();
      break;
    case 'interval':
      startIntervalMode();
      break;
    case 'challenge':
      startChallengeMode();
      break;
  }
}

// Training modes
function startFreeMode() {
  if (!trainingActive) return;
  
  const randomKick = selectedKicks[Math.floor(Math.random() * selectedKicks.length)];
  showKickOnScreen(randomKick);
  speakKick(randomKick);
  
  trainingInterval = setTimeout(() => {
    if (trainingActive) startFreeMode();
  }, tempo);
}

function startChallengeMode() {
  if (!trainingActive) return;
  
  const randomKick = selectedKicks[Math.floor(Math.random() * selectedKicks.length)];
  showKickOnScreen(randomKick);
  speakKick(randomKick);
  
  // Decrease tempo (make it faster)
  if (challengeTempo > MIN_TEMPO) {
    challengeTempo -= TEMPO_DECREASE;
  }
  
  trainingInterval = setTimeout(() => {
    if (trainingActive) startChallengeMode();
  }, challengeTempo);
}

function startIntervalMode() {
  if (!trainingActive) return;
  
  if (isRestPeriod) {
    // Rest period
    showRestOnScreen();
    trainingInterval = setTimeout(() => {
      isRestPeriod = false;
      if (trainingActive) startIntervalMode();
    }, intervalRest * 1000);
  } else {
    // Work period - show kicks
    startIntervalWorkPeriod();
  }
}

function startIntervalWorkPeriod() {
  const workEndTime = Date.now() + (intervalWork * 1000);
  
  function showNextKickInWorkPeriod() {
    if (!trainingActive) return;
    
    if (Date.now() >= workEndTime) {
      // Work period ended, switch to rest
      isRestPeriod = true;
      startIntervalMode();
      return;
    }
    
    const randomKick = selectedKicks[Math.floor(Math.random() * selectedKicks.length)];
    showKickOnScreen(randomKick);
    speakKick(randomKick);
    
    trainingInterval = setTimeout(showNextKickInWorkPeriod, tempo);
  }
  
  showNextKickInWorkPeriod();
}

// Display functions
function showKickOnScreen(kick) {
  const kickDisplay = document.getElementById("currentKickDisplay");
  const displayBox = document.getElementById("kickDisplayBox");
  const statusDisplay = document.getElementById("trainingStatus");
  
  if (kickDisplay) {
    kickDisplay.textContent = kick.name;
  }
  
  if (displayBox) {
    displayBox.classList.remove('rest');
    displayBox.classList.add('active');
  }
  
  if (statusDisplay) {
    statusDisplay.textContent = "Utför sparken!";
  }
}

function showRestOnScreen() {
  const kickDisplay = document.getElementById("currentKickDisplay");
  const displayBox = document.getElementById("kickDisplayBox");
  const statusDisplay = document.getElementById("trainingStatus");
  
  if (kickDisplay) {
    kickDisplay.textContent = "VILA!";
  }
  
  if (displayBox) {
    displayBox.classList.remove('active');
    displayBox.classList.add('rest');
  }
  
  if (statusDisplay) {
    statusDisplay.textContent = "Ta en paus...";
  }
}

function updateTrainingTimer() {
  const timerDisplay = document.getElementById("trainingTimerDisplay");
  if (timerDisplay) {
    const minutes = Math.floor(trainingTimeRemaining / 60);
    const seconds = trainingTimeRemaining % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Stop training
function stopKickTraining() {
  trainingActive = false;
  
  // Clear timers
  if (trainingTimer) {
    clearInterval(trainingTimer);
    trainingTimer = null;
  }
  
  if (trainingInterval) {
    clearTimeout(trainingInterval);
    trainingInterval = null;
  }
  
  // Cancel speech
  if (speechSynthesis && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  
  // Reset challenge tempo
  challengeTempo = 3000;
  
  // Update display
  const kickDisplay = document.getElementById("currentKickDisplay");
  const displayBox = document.getElementById("kickDisplayBox");
  const statusDisplay = document.getElementById("trainingStatus");
  
  if (kickDisplay) {
    kickDisplay.textContent = "Träning stoppad";
  }
  
  if (displayBox) {
    displayBox.classList.remove('active', 'rest');
  }
  
  if (statusDisplay) {
    statusDisplay.textContent = "Bra jobbat!";
  }
  
  // Play end beep
  playBeep(GO_FREQUENCY, GO_DURATION);
}


/* ---------- Hjälpfunktioner ---------- */
function getMatchTitle() {
  return document.getElementById("matchTitleInput")?.value || "Match";
}

function formatLiveTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playEndBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  o.connect(g);
  g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
  o.start();
  o.stop(ctx.currentTime + 0.5);
}

function broadcastLiveData() {
  if (!broadcastChannel || !("BroadcastChannel" in window)) return;
  const data = {
    liveScore,
    livePenalties,
    liveScoreNames,
    matchDurationSeconds,
    liveTimeLeft,
    liveTimerRunning,
    totalRounds,
    currentRound,
    roundWins,
    matchEnded,
    restTimeLeft,
    currentHits,
    lastRoundHits,
    totalScore,
    totalHits,
    totalPenalties,
    matchTitle: getMatchTitle(),
    centerMessage,
  };
  broadcastChannel.postMessage(data);
}

// Wrapper functions for HTML onclick handlers
function awardScore(side, value) {
  addScore(side, value);
}

function awardPenalty(side) {
  addPenalty(side);
}

function setLiveScoreNames() {
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function resetLiveMatch() {
  resetLiveScore();
}

function endCurrentRound() {
  checkRoundEnd();
}

function startNextRound() {
  if (matchEnded) return;
  
  // Clear center message
  displayCenterMessage("");
  
  // Clear PTG message (handle both embedded and standalone views)
  const audPTGMessage = document.getElementById("audiencePTGMessage") || document.getElementById("ptgMessage");
  if (audPTGMessage) audPTGMessage.classList.remove("visible");
  
  // Hide statistics boxes (handle both embedded and standalone views)
  const blueStatsBox = document.getElementById("audienceBlueStats") || document.getElementById("blueStats");
  const redStatsBox = document.getElementById("audienceRedStats") || document.getElementById("redStats");
  if (blueStatsBox) blueStatsBox.classList.remove("visible");
  if (redStatsBox) redStatsBox.classList.remove("visible");
  
  // Reset scores and gam-jeom for next round
  liveScore.red = 0;
  liveScore.blue = 0;
  livePenalties.red = 0;
  livePenalties.blue = 0;
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  liveTimeLeft = matchDurationSeconds;
  lastAction = null;
  updateLiveScoreDisplay();
  broadcastLiveData();
  // Do NOT auto-start timer - operator must explicitly click "Starta klockan"
}

function openAudienceWindow() {
  // Open audience view in a new window/tab - use public.html
  const baseUrl = window.location.href.split('/').slice(0, -1).join('/');
  const url = baseUrl + '/public.html';
  window.open(url, '_blank', 'width=1920,height=1080');
  // Broadcast current state immediately after opening
  broadcastLiveData();
}

// Parse URL parameters once at initialization
const urlParams = new URLSearchParams(window.location.search);
const isStandaloneAudienceView = urlParams.get('audienceView') === 'true';

// Page IDs for managing visibility in standalone audience view
const NON_AUDIENCE_PAGES = ['startPage', 'testPage', 'testIntroPage', 'kickCounterPage', 
                            'kickCounterIntroPage', 'kickCalibrationPage', 'kickTimeSelectionPage', 'kickTestPage',
                            'sparringPage', 'kickTrainingIntroPage', 'kickSelectionPage', 'trainingModeSelectionPage',
                            'trainingSettingsPage', 'kickTrainingPage', 'liveScorePage', 
                            'competitionIntroPage', 'competitionParticipantsPage', 'competitionTypePage',
                            'competitionKickSelectionPage', 'competitionSingleKickPage', 'competitionRoundPage',
                            'competitionLeaderboardPage', 'competitionResultsPage'];

// Initialize BroadcastChannel for live synchronization
// Only create one instance and set up message listener
if (("BroadcastChannel" in window) && !broadcastChannel) {
  broadcastChannel = new BroadcastChannel('kicklab-live');
  
  // Listen for messages from operator window
  broadcastChannel.onmessage = (event) => {
    const data = event.data;
    if (data) {
      // Update local state with received data
      Object.assign(liveScore, data.liveScore || {});
      Object.assign(livePenalties, data.livePenalties || {});
      Object.assign(liveScoreNames, data.liveScoreNames || {});
      if (data.matchDurationSeconds !== undefined) matchDurationSeconds = data.matchDurationSeconds;
      if (data.liveTimeLeft !== undefined) liveTimeLeft = data.liveTimeLeft;
      if (data.liveTimerRunning !== undefined) liveTimerRunning = data.liveTimerRunning;
      if (data.totalRounds !== undefined) totalRounds = data.totalRounds;
      if (data.currentRound !== undefined) currentRound = data.currentRound;
      Object.assign(roundWins, data.roundWins || {});
      if (data.matchEnded !== undefined) matchEnded = data.matchEnded;
      if (data.restTimeLeft !== undefined) restTimeLeft = data.restTimeLeft;
      if (data.currentHits) currentHits = JSON.parse(JSON.stringify(data.currentHits));
      if (data.lastRoundHits) lastRoundHits = JSON.parse(JSON.stringify(data.lastRoundHits));
      if (data.totalScore) totalScore = JSON.parse(JSON.stringify(data.totalScore));
      if (data.totalHits) totalHits = JSON.parse(JSON.stringify(data.totalHits));
      if (data.totalPenalties) totalPenalties = JSON.parse(JSON.stringify(data.totalPenalties));
      if (data.centerMessage !== undefined) centerMessage = data.centerMessage;
      
      // Update display if we're in audience mode
      if (isAudienceViewActive()) {
        updateLiveScoreDisplay();
      }
    }
  };
}

// Check if page was opened with audienceView parameter
document.addEventListener("DOMContentLoaded", () => {
  if (isStandaloneAudienceView) {
    // Hide all other pages and show only audience view
    NON_AUDIENCE_PAGES.forEach(pageId => {
      const page = document.getElementById(pageId);
      if (page) page.style.display = 'none';
    });
    
    // Show audience view in standalone mode
    toggleAudienceView(true);
    audienceMode = true;
    
    // Remove close button in standalone audience view
    const closeBtn = document.querySelector('.close-audience');
    if (closeBtn) closeBtn.style.display = 'none';
  } else {
    updateLiveScoreDisplay();
  }
});
