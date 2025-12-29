/*
 * Uppdaterad version av KickLabs huvudskript. Den här filen innehåller
 * fixar för att kunna avbryta alla tester via stop‑knappar och dämpa
 * ljud när sparringträningen stoppas. Funktionen stopKickTest() är
 * ny, och stopSparringTraining() uppdaterar nu användargränssnittet när
 * träningen avbryts.
 */

// Variabler för reaktionstestet
let audioCtx, mediaStream, mediaStreamSource, analyser, dataArray, animationId, startTime;
let recentResults = JSON.parse(localStorage.getItem("recentResults")) || [];
let bestTime = parseFloat(localStorage.getItem("bestTime")) || null;
const commands = ["Vänster spark", "Höger spark", "Bakåt", "Blockera"];
let testActive = false;

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
let roundEndReason = "";

/* ---------- Generella sidväxlingar ---------- */
function showStartPage() {
  document.getElementById("startPage").style.display = "block";
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
  stopListening();
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
function stopTest() {
  testActive = false;
  stopListening();
  document.getElementById("status").textContent = "Test stoppat.";
}

function showTestPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "block";
  document.getElementById("kickCounterPage").style.display = "none";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";
  pauseLiveTimer();
  loadStats();
}

function startTest() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById("status").textContent = "Mikrofon krävs för testet.";
    return;
  }
  const command = commands[Math.floor(Math.random() * commands.length)];
  document.getElementById("command").textContent = `Gör: ${command}`;
  document.getElementById("status").textContent = "Lyssnar...";
  testActive = true;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaStream = stream;
      mediaStreamSource = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      mediaStreamSource.connect(analyser);
      startTime = performance.now();
      listenForImpact();
    })
    .catch(() => {
      document.getElementById("status").textContent = "Mikrofon behövs för testet.";
      testActive = false;
    });
}

function listenForImpact() {
  function checkVolume() {
    if (!testActive) return;
    analyser.getByteTimeDomainData(dataArray);
    let max = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = Math.abs(dataArray[i] - 128);
      if (value > max) max = value;
    }
    if (max > 40) {
      const reactionTime = performance.now() - startTime;
      saveResult(reactionTime);
    } else {
      animationId = requestAnimationFrame(checkVolume);
    }
  }
  animationId = requestAnimationFrame(checkVolume);
}

function stopListening() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  mediaStream = null;
}

function saveResult(time) {
  testActive = false;
  stopListening();
  recentResults.unshift(time);
  if (recentResults.length > 5) recentResults.pop();
  localStorage.setItem("recentResults", JSON.stringify(recentResults));
  let historyText = " Senaste resultat ";
  for (let t of recentResults) {
    historyText += ` ${(t / 1000).toFixed(2)}s `;
  }
  document.getElementById("history").innerHTML = historyText;
  if (!bestTime || time < bestTime) {
    bestTime = time;
    localStorage.setItem("bestTime", bestTime);
    document.getElementById("highscore").innerHTML = ` 🎉 Nytt rekord! ${(bestTime / 1000).toFixed(2)} s `;
  } else {
    document.getElementById("highscore").innerHTML = ` Bästa tid ${(bestTime / 1000).toFixed(2)} s `;
  }
  document.getElementById("result").textContent = `Tid: ${(time / 1000).toFixed(2)} sekunder`;
  document.getElementById("status").textContent = "Klart!";
}

function resetStats() {
  localStorage.removeItem("recentResults");
  localStorage.removeItem("bestTime");
  recentResults = [];
  bestTime = null;
  document.getElementById("history").innerHTML = "";
  document.getElementById("highscore").innerHTML = "";
  document.getElementById("result").textContent = "";
  document.getElementById("status").textContent = "Statistik nollställd.";
}

function loadStats() {
  if (recentResults.length > 0) {
    let historyText = " Senaste resultat ";
    for (let t of recentResults) {
      historyText += ` ${(t / 1000).toFixed(2)}s `;
    }
    document.getElementById("history").innerHTML = historyText;
  }
  if (bestTime) {
    document.getElementById("highscore").innerHTML = ` Bästa tid ${(bestTime / 1000).toFixed(2)} s `;
  }
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
    roundScore.textContent = `Ronder: ${liveScoreNames.red} ${roundWins.red} – ${roundWins.blue} ${liveScoreNames.blue}`;
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
  if (audRoundScore) audRoundScore.textContent = `Ronder: ${roundWins.red} – ${roundWins.blue}`;
  if (audWinner) audWinner.textContent = matchEnded ? `Vinnare: ${roundWins.red > roundWins.blue ? liveScoreNames.red : liveScoreNames.blue}` : "";
  if (audRest) audRest.textContent = restTimeLeft > 0 ? `Paus: ${formatLiveTime(restTimeLeft)}` : "";
  
  // Update hit counters with icons
  if (audRedPunch) audRedPunch.textContent = currentHits.red.punch;
  if (audRedHead) audRedHead.textContent = currentHits.red.head;
  if (audRedBody) audRedBody.textContent = currentHits.red.body;
  if (audBluePunch) audBluePunch.textContent = currentHits.blue.punch;
  if (audBlueHead) audBlueHead.textContent = currentHits.blue.head;
  if (audBlueBody) audBlueBody.textContent = currentHits.blue.body;
}

function addScore(side, value) {
  if (matchEnded) return;
  liveScore[side] += value;
  lastAction = { type: "score", side, value };
  
  // Map score values to hit types based on Taekwondo scoring rules
  // 1 point = punch or body kick (we'll count as punch for +1)
  // 2 points = body kick (vest)
  // 3 points = head kick
  // 4+ points = advanced/spinning techniques (counted as head for simplicity)
  if (value === 1) {
    currentHits[side].punch += 1;
  } else if (value === 2) {
    currentHits[side].body += 1;
  } else if (value >= 3) {
    currentHits[side].head += 1;
  }
  
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function addPenalty(side) {
  if (matchEnded) return;
  livePenalties[side] += 1;
  // Gam-jeom ger poäng till motståndaren
  const other = side === "red" ? "blue" : "red";
  liveScore[other] += 1;
  lastAction = { type: "penalty", side, value: 1 };
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function removePenalty(side) {
  if (livePenalties[side] <= 0 || matchEnded) return;
  livePenalties[side] -= 1;
  const other = side === "red" ? "blue" : "red";
  liveScore[other] = Math.max(0, liveScore[other] - 1);
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
    
    // Also undo the hit counter
    if (value === 1) {
      currentHits[side].punch = Math.max(0, currentHits[side].punch - 1);
    } else if (value === 2) {
      currentHits[side].body = Math.max(0, currentHits[side].body - 1);
    } else if (value >= 3) {
      currentHits[side].head = Math.max(0, currentHits[side].head - 1);
    }
  } else if (type === "penalty") {
    // Om senaste var +1 penalty: ta bort penalty och dra av poäng från motståndaren
    const other = side === "red" ? "blue" : "red";
    if (value === 1) {
      livePenalties[side] = Math.max(0, livePenalties[side] - 1);
      liveScore[other] = Math.max(0, liveScore[other] - 1);
    } else if (value === -1) {
      livePenalties[side] += 1;
      liveScore[other] += 1;
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
  roundWins = { red: 0, blue: 0 };
  currentRound = 1;
  liveTimeLeft = matchDurationSeconds;
  matchEnded = false;
  restTimeLeft = 0;
  clearInterval(restTimerId);
  lastAction = null;
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
  if (!isNaN(val) && val > 0) {
    totalRounds = val;
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
      startLiveTimer();
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
  // Spara träffstatistik per rond
  lastRoundHits = JSON.parse(JSON.stringify(currentHits));
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };

  currentRound++;
  if (currentRound > totalRounds) {
    matchEnded = true;
    showWinner();
  } else {
    restTimeLeft = parseInt(document.getElementById("restSeconds")?.value, 10) || 30;
    startRest();
  }
  updateLiveMeta();
  updateLiveScoreDisplay();
  broadcastLiveData();
}

function showWinner() {
  pauseLiveTimer();
  const winner = roundWins.red > roundWins.blue ? liveScoreNames.red : liveScoreNames.blue;
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `Matchen slut! Vinnare: ${winner}`;
  const audWinner = document.getElementById("audienceWinner");
  if (audWinner) audWinner.textContent = `Vinnare: ${winner}`;
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
    matchTitle: getMatchTitle(),
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
  // Reset scores for next round
  liveScore.red = 0;
  liveScore.blue = 0;
  livePenalties.red = 0;
  livePenalties.blue = 0;
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  liveTimeLeft = matchDurationSeconds;
  lastAction = null;
  updateLiveScoreDisplay();
  broadcastLiveData();
  startLiveTimer();
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
      
      // Update display if we're in audience mode
      if (audienceMode || isStandaloneAudienceView) {
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
