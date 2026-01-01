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

/* ---------- Generella sidväxlingar ---------- */
function showStartPage() {
  document.getElementById("startPage").style.display = "block";
  document.getElementById("testIntroPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "none";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";

  // Dölj även tävlingssidorna om de är aktiva (både setup och run)
  const compSetup = document.getElementById("competitionSetupPage");
  const compRun = document.getElementById("competitionRunPage");
  const compRound = document.getElementById("competitionRoundPage");
  const overlay = document.getElementById("countdownOverlay");
  if (compSetup) compSetup.style.display = "none";
  if (compRun) compRun.style.display = "none";
  if (compRound) compRound.style.display = "none";
  if (overlay) overlay.style.display = "none";

  document.getElementById("sparringCommand").textContent = "";
  document.getElementById("sparringStatus").textContent = "Klicka 'Starta' för att börja träningen";

  stopSparringTraining();
  stopReactionTest();
  pauseLiveTimer();
  toggleAudienceView(false);
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
let reactionTestActive = false;
let reactionStartTime = null;
let reactionCanRegisterHit = true;
let reactionAnimationId = null;
const REACTION_THRESHOLD = 50; // Adjustable threshold for kick detection
const REACTION_COOLDOWN = 300; // ms between hits
let reactionResults = JSON.parse(localStorage.getItem("reactionResults")) || [];
let reactionBestTime = parseFloat(localStorage.getItem("reactionBestTime")) || null;

function showTestIntroPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testIntroPage").style.display = "block";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";
  pauseLiveTimer();
}

function showReactionTestPage() {
  document.getElementById("testIntroPage").style.display = "none";
  document.getElementById("testPage").style.display = "block";
  loadReactionStats();
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
    document.getElementById("statusText").textContent = "Väntar på spark...";
    document.getElementById("timeValue").textContent = "0.000";
    document.getElementById("timeDisplay").classList.remove("hit");
    document.getElementById("startBtn").style.opacity = "0.5";
    document.getElementById("stopBtn").style.opacity = "1";
    
    // Wait random time before signaling GO
    const waitTime = Math.random() * 3000 + 2000; // 2-5 seconds
    setTimeout(() => {
      if (reactionTestActive) {
        document.getElementById("statusText").textContent = "GÅ!";
        document.getElementById("statusText").style.color = "#ff8008";
        reactionStartTime = performance.now();
        checkReactionVolume();
      }
    }, waitTime);
    
  } catch (error) {
    document.getElementById("statusText").textContent = "Mikrofon behövs för testet.";
    reactionTestActive = false;
  }
}

async function initReactionAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  reactionAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  reactionAnalyser = reactionAudioContext.createAnalyser();
  reactionMicrophone = reactionAudioContext.createMediaStreamSource(stream);
  reactionMicrophone.connect(reactionAnalyser);
  reactionAnalyser.fftSize = 256;
  reactionDataArray = new Uint8Array(reactionAnalyser.fftSize);
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
  
  // Check if sound is above threshold and cooldown has passed
  if (volume > REACTION_THRESHOLD && reactionCanRegisterHit && reactionStartTime) {
    registerReactionHit();
    reactionCanRegisterHit = false;
    setTimeout(() => {
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
    // Scale volume to percentage (0-100)
    const percentage = Math.min((volume / REACTION_THRESHOLD) * 50, 100);
    fillElement.style.width = percentage + "%";
  }
}

function registerReactionHit() {
  if (!reactionStartTime) return;
  
  const reactionTime = performance.now() - reactionStartTime;
  
  // Update UI
  document.getElementById("timeValue").textContent = (reactionTime / 1000).toFixed(3);
  document.getElementById("timeDisplay").classList.add("hit");
  document.getElementById("statusText").textContent = "TRÄFF!";
  document.getElementById("statusText").style.color = "#ff8008";
  
  // Save result
  saveReactionResult(reactionTime);
  
  // Stop test
  stopReactionTest();
}

function stopReactionTest() {
  reactionTestActive = false;
  
  if (reactionAnimationId) {
    cancelAnimationFrame(reactionAnimationId);
    reactionAnimationId = null;
  }
  
  if (reactionMicrophone && reactionMicrophone.mediaStream) {
    reactionMicrophone.mediaStream.getTracks().forEach(track => track.stop());
  }
  
  // Update UI
  document.getElementById("startBtn").style.opacity = "1";
  document.getElementById("stopBtn").style.opacity = "0.5";
  
  if (!reactionStartTime) {
    document.getElementById("statusText").textContent = "Test stoppad.";
    document.getElementById("statusText").style.color = "#00dddd";
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

// Keep old functions for compatibility but make them call new ones
function startTest() {
  startReactionTest();
}

function stopTest() {
  stopReactionTest();
}

function resetStats() {
  localStorage.removeItem("reactionResults");
  localStorage.removeItem("reactionBestTime");
  reactionResults = [];
  reactionBestTime = null;
  loadReactionStats();
  document.getElementById("timeValue").textContent = "0.000";
  document.getElementById("statusText").textContent = "Statistik nollställd.";
  document.getElementById("statusText").style.color = "#00dddd";
}

/* ---------- Sparkräknare ---------- */
let kickAudioCtx, kickMediaStream, kickMediaStreamSource, kickAnalyser, kickDataArray, kickAnimationId;
let kickTestActive = false;
let kickCount = 0;
let kickRecentResults = JSON.parse(localStorage.getItem("kickRecentResults")) || [];
let bestKickCount = parseInt(localStorage.getItem("bestKickCount")) || 0;
let kickTestDuration = 15;
let kickTimeRemaining = kickTestDuration;
let kickTestInterval = null;

function showKickCounterPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "block";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";
  stopListening();
  pauseLiveTimer();
  loadKickStats();
}

function updateTestDuration() {
  const val = parseInt(document.getElementById("testDuration").value, 10);
  if (!isNaN(val) && val > 0) {
    kickTestDuration = val;
    kickTimeRemaining = val;
    document.getElementById("kickTimer").textContent = `${kickTimeRemaining} sekunder`;
  }
}

function startKickTest() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById("kickStatus").textContent = "Mikrofon krävs för testet.";
    return;
  }
  kickCount = 0;
  kickTimeRemaining = kickTestDuration;
  document.getElementById("kickCount").textContent = `${kickCount} sparkar`;
  document.getElementById("kickTimer").textContent = `${kickTimeRemaining} sekunder`;
  document.getElementById("kickStatus").textContent = "Lyssnar efter sparkar...";
  kickTestActive = true;

  if (!kickAudioCtx) kickAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    kickMediaStream = stream;
    kickMediaStreamSource = kickAudioCtx.createMediaStreamSource(stream);
    kickAnalyser = kickAudioCtx.createAnalyser();
    kickAnalyser.fftSize = 2048;
    const bufferLength = kickAnalyser.frequencyBinCount;
    kickDataArray = new Uint8Array(bufferLength);
    kickMediaStreamSource.connect(kickAnalyser);
    listenForKickImpact();

    // Starta timer
    kickTestInterval = setInterval(() => {
      kickTimeRemaining--;
      if (kickTimeRemaining <= 0) {
        endKickTest();
      } else {
        document.getElementById("kickTimer").textContent = `${kickTimeRemaining} sekunder`;
      }
    }, 1000);
  }).catch(() => {
    document.getElementById("kickStatus").textContent = "Mikrofon behövs för sparkräknaren.";
    kickTestActive = false;
  });
}

function listenForKickImpact() {
  function checkKickVolume() {
    if (!kickTestActive) return;
    kickAnalyser.getByteTimeDomainData(kickDataArray);
    let max = 0;
    for (let i = 0; i < kickDataArray.length; i++) {
      const value = Math.abs(kickDataArray[i] - 128);
      if (value > max) max = value;
    }
    if (max > 40) {
      kickCount++;
      document.getElementById("kickCount").textContent = `${kickCount} sparkar`;
    }
    kickAnimationId = requestAnimationFrame(checkKickVolume);
  }
  checkKickVolume();
}

function endKickTest() {
  kickTestActive = false;
  clearInterval(kickTestInterval);
  if (kickAnimationId) cancelAnimationFrame(kickAnimationId);
  if (kickMediaStream) kickMediaStream.getTracks().forEach((track) => track.stop());

  playEndBeep();

  document.getElementById("kickStatus").textContent = `Test slutfört! ${kickCount} sparkar på ${kickTestDuration} sekunder`;
  document.getElementById("kickTimer").textContent = "0 sekunder";

  saveKickResult(kickCount);
}

// Ny funktion: stoppa kicktestet utan slutsignal.
function stopKickTest() {
  if (!kickTestActive) return;
  kickTestActive = false;
  clearInterval(kickTestInterval);
  if (kickAnimationId) cancelAnimationFrame(kickAnimationId);
  if (kickMediaStream) kickMediaStream.getTracks().forEach((track) => track.stop());
  // Avbryt mikrofon och uppdatera status utan att spela slutsignalen
  document.getElementById("kickStatus").textContent = `Test stoppat! ${kickCount} sparkar på ${kickTestDuration - kickTimeRemaining} sekunder`;
  document.getElementById("kickTimer").textContent = "0 sekunder";
  saveKickResult(kickCount);
}

function saveKickResult(count) {
  kickRecentResults.unshift(count);
  if (kickRecentResults.length > 5) kickRecentResults.pop();
  localStorage.setItem("kickRecentResults", JSON.stringify(kickRecentResults));
  let historyText = " Senaste resultat ";
  for (let c of kickRecentResults) {
    historyText += ` ${c} sparkar `;
  }
  historyText += " ";
  if (kickRecentResults.length > 0) {
    const avg = kickRecentResults.reduce((a, b) => a + b, 0) / kickRecentResults.length;
    historyText += ` Snitt: ${avg.toFixed(1)} sparkar `;
  }
  document.getElementById("kickHistory").innerHTML = historyText;
  if (count > bestKickCount) {
    bestKickCount = count;
    localStorage.setItem("bestKickCount", bestKickCount);
    document.getElementById("kickHighscore").innerHTML = ` 🎉 Nytt rekord! ${bestKickCount} sparkar! 🎉 `;
    document.getElementById("cheerSound").play();
  } else {
    document.getElementById("kickHighscore").innerHTML = ` Bästa resultat ${bestKickCount} sparkar `;
  }
}

function resetKickStats() {
  localStorage.removeItem("kickRecentResults");
  localStorage.removeItem("bestKickCount");
  kickRecentResults = [];
  bestKickCount = 0;
  document.getElementById("kickHistory").innerHTML = "";
  document.getElementById("kickHighscore").innerHTML = "";
  document.getElementById("kickCount").textContent = "0 sparkar";
  document.getElementById("kickTimer").textContent = `${kickTestDuration} sekunder`;
  document.getElementById("kickStatus").textContent = "Statistik nollställd.";
}

function loadKickStats() {
  if (kickRecentResults.length > 0) {
    let historyText = " Senaste resultat ";
    for (let c of kickRecentResults) {
      historyText += ` ${c} sparkar `;
    }
    historyText += " ";
    const avg = kickRecentResults.reduce((a, b) => a + b, 0) / kickRecentResults.length;
    historyText += ` Snitt: ${avg.toFixed(1)} sparkar `;
    document.getElementById("kickHistory").innerHTML = historyText;
  }
  document.getElementById("kickHighscore").innerHTML = ` Bästa resultat ${bestKickCount} sparkar `;
}

/* ---------- Tävlingsläge (reaktionstid) ---------- */
function updateCompetitionNameInputs() {
  const count = parseInt(document.getElementById("competitionCount").value, 10) || 0;
  const container = document.getElementById("competitionNames");
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Deltagare ${i + 1}`;
    input.id = `participant-${i}`;
    input.style.marginBottom = "0.5rem";
    container.appendChild(input);
  }
}

function startCompetition() {
  const count = parseInt(document.getElementById("competitionCount").value, 10) || 0;
  competitionParticipants = [];
  for (let i = 0; i < count; i++) {
    const nameInput = document.getElementById(`participant-${i}`);
    const name = nameInput ? nameInput.value.trim() || `Deltagare ${i + 1}` : `Deltagare ${i + 1}`;
    competitionParticipants.push({ name, times: [], best: Infinity, avg: Infinity });
  }
  if (competitionParticipants.length === 0) {
    alert("Ange minst en deltagare.");
    return;
  }
  currentParticipantIndex = 0;
  currentKickIndex = 0;
  const statusEl = document.getElementById("competitionStatus");
  const listEl = document.getElementById("competitionNamesList");
  if (statusEl) statusEl.textContent = "Tävling startad!";
  if (listEl) listEl.innerHTML = competitionParticipants.map(p => `<li>${p.name}</li>`).join("");
  document.getElementById("competitionSetupPage").style.display = "none";
  document.getElementById("competitionRunPage").style.display = "block";
  competitionActive = true;
  showNextRoundStartPage();
}

function showCompetitionSetupPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("competitionSetupPage").style.display = "block";
}

function showNextRoundStartPage() {
  if (currentParticipantIndex >= competitionParticipants.length) return;
  const participant = competitionParticipants[currentParticipantIndex];
  const overlay = document.getElementById("countdownOverlay");
  const countdownEl = document.getElementById("countdownNumber");
  const infoEl = document.getElementById("overlayInfo");
  const titleEl = document.getElementById("overlayTitle");
  if (!overlay || !countdownEl || !infoEl || !titleEl) return;
  overlay.style.display = "flex";
  titleEl.textContent = `${participant.name}, spark ${currentKickIndex + 1} av 3`;
  infoEl.textContent = "Gör dig redo. Start om 3...";
  let count = 3;
  countdownEl.textContent = count;
  const interval = setInterval(() => {
    count--;
    countdownEl.textContent = count;
    if (count <= 0) {
      clearInterval(interval);
      overlay.style.display = "none";
      startCompetitionRound();
    }
  }, 1000);
}

async function startCompetitionRound() {
  if (!competitionActive) return;
  // Stoppa tidigare stream om den finns
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach((track) => track.stop());
  }
  // Förbered mikrofonen i förväg så att nedräkning och start hänger ihop
  try {
    await prepareCompetitionMicrophone();
  } catch (err) {
    const statusEl = document.getElementById("competitionStatus");
    if (statusEl) statusEl.textContent = "Mikrofon krävs för att använda tävlingsläget.";
    competitionActive = false;
    return;
  }
  // Säkerställ att start sker efter en minimal fördröjning så att analys hinner initieras
  setTimeout(() => {
    if (!competitionActive) return;
    competitionStartTime = performance.now();
    listenForImpactCompetition();
  }, 120);
}

async function prepareCompetitionMicrophone() {
  competitionAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  competitionMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  competitionMediaStreamSource = competitionAudioCtx.createMediaStreamSource(competitionMediaStream);
  competitionAnalyser = competitionAudioCtx.createAnalyser();
  competitionAnalyser.fftSize = 2048;
  const bufferLength = competitionAnalyser.frequencyBinCount;
  competitionDataArray = new Uint8Array(bufferLength);
  competitionMediaStreamSource.connect(competitionAnalyser);
}

function listenForImpactCompetition() {
  function checkVolume() {
    if (!competitionActive) return;
    competitionAnalyser.getByteTimeDomainData(competitionDataArray);
    let max = 0;
    for (let i = 0; i < competitionDataArray.length; i++) {
      const value = Math.abs(competitionDataArray[i] - 128);
      if (value > max) max = value;
    }
    if (max > 40) {
      const reactionTime = performance.now() - competitionStartTime;
      saveCompetitionResult(reactionTime);
    } else {
      requestAnimationFrame(checkVolume);
    }
  }
  checkVolume();
}

function saveCompetitionResult(time) {
  // Stoppa mikrofonen
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach((track) => track.stop());
    competitionMediaStream = null;
  }
  const participant = competitionParticipants[currentParticipantIndex];
  participant.times.push(time);
  if (participant.times.length === 3) {
    // Beräkna bästa och snitt
    participant.best = Math.min(...participant.times);
    participant.avg = participant.times.reduce((a, b) => a + b, 0) / participant.times.length;
    // Gå vidare till nästa deltagare
    currentParticipantIndex++;
    currentKickIndex = 0;
  } else {
    // Fler sparkar kvar för samma deltagare
    currentKickIndex++;
  }
  // Vänta kort innan nästa runda startar för att ge användaren feedback
  setTimeout(() => {
    if (currentParticipantIndex < competitionParticipants.length) {
      showNextRoundStartPage();
    } else {
      competitionActive = false;
      finishCompetition();
    }
  }, 800);
}

function finishCompetition() {
  // Avbryt pågående lyssning
  if (competitionMediaStream) {
    competitionMediaStream.getTracks().forEach((track) => track.stop());
    competitionMediaStream = null;
  }
  competitionActive = false;
  if (competitionParticipants.length === 0) return;
  let bestKickTime = Infinity;
  let bestKickWinner = null;
  let bestAvgTime = Infinity;
  let bestAvgWinner = null;
  // Beräkna vinnare
  competitionParticipants.forEach((p) => {
    if (p.best < bestKickTime) {
      bestKickTime = p.best;
      bestKickWinner = p.name;
    }
    if (p.avg < bestAvgTime) {
      bestAvgTime = p.avg;
      bestAvgWinner = p.name;
    }
  });
  let resultHtml = "";
  resultHtml += `<p>Vinnare snabbaste spark: ${bestKickWinner} (${bestKickTime.toFixed(0)} ms)</p>`;
  resultHtml += `<p>Vinnare bästa snitt: ${bestAvgWinner} (${bestAvgTime.toFixed(0)} ms)</p>`;
  resultHtml += "<h3>Resultat:</h3><ul>";
  competitionParticipants.forEach((p) => {
    const timesStr = p.times.map((t) => t.toFixed(0)).join(", ");
    resultHtml += `<li>${p.name}: tider = ${timesStr} ms, bästa = ${p.best.toFixed(0)} ms, snitt = ${p.avg.toFixed(0)} ms</li>`;
  });
  resultHtml += "</ul>";
  const resultsEl = document.getElementById("competitionResults");
  if (resultsEl) resultsEl.innerHTML = resultHtml;
  const statusEl = document.getElementById("competitionStatus");
  if (statusEl) statusEl.textContent = "Tävlingen är avslutad!";

  // När tävlingen är klar ska vi se till att rätt sida visas.
  // Döljer inställningssidan och rundsidan och visar resultatsidan
  const setupPage = document.getElementById("competitionSetupPage");
  const runPage = document.getElementById("competitionRunPage");
  const roundPage = document.getElementById("competitionRoundPage");
  const overlay = document.getElementById("countdownOverlay");
  if (setupPage) setupPage.style.display = "none";
  if (roundPage) roundPage.style.display = "none";
  if (overlay) overlay.style.display = "none";
  if (runPage) runPage.style.display = "block";
}

/* ---------- Live sparring score ---------- */
function showLiveScorePage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "none";
  const compSetup = document.getElementById("competitionSetupPage");
  const compRun = document.getElementById("competitionRunPage");
  const compRound = document.getElementById("competitionRoundPage");
  if (compSetup) compSetup.style.display = "none";
  if (compRun) compRun.style.display = "none";
  if (compRound) compRound.style.display = "none";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "block";
  stopTest();
  stopKickTest();
  stopSparringTraining();
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
const NON_AUDIENCE_PAGES = ['startPage', 'testPage', 'kickCounterPage', 'sparringPage', 
                            'liveScorePage', 'competitionSetupPage', 'competitionRunPage', 
                            'competitionRoundPage'];

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
