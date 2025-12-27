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

function showSparringPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "block";
  const liveScorePage = document.getElementById("liveScorePage");
  if (liveScorePage) liveScorePage.style.display = "none";
  pauseLiveTimer();
}

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
  const audRedHits = document.getElementById("audienceRedHits");
  const audBlueHits = document.getElementById("audienceBlueHits");
  const displayRedName = liveScoreNames.red.toUpperCase();
  const displayBlueName = liveScoreNames.blue.toUpperCase();
  if (audRedBadge) audRedBadge.textContent = "🇸🇪";
  if (audBlueBadge) audBlueBadge.textContent = "🇸🇪";
  if (audRedName) audRedName.textContent = displayRedName;
  if (audBlueName) audBlueName.textContent = displayBlueName;
  if (audRedScore) audRedScore.textContent = liveScore.red;
  if (audBlueScore) audBlueScore.textContent = liveScore.blue;
  const timerText = restTimeLeft > 0 ? formatLiveTime(restTimeLeft) : formatLiveTime(liveTimeLeft);
  if (audTimer) audTimer.textContent = timerText;
  if (audRound) audRound.textContent = `${currentRound}/${totalRounds}`;
  if (audMatchTitle) audMatchTitle.textContent = `Match ${document.getElementById("matchNumberInput")?.value || "1"}`;
  if (audInfo) audInfo.textContent = restTimeLeft > 0 ? "Paus" : `Rond ${currentRound}`;
  if (audRedPen) audRedPen.textContent = livePenalties.red;
  if (audBluePen) audBluePen.textContent = livePenalties.blue;
  if (audRoundScore) audRoundScore.textContent = `Ronder: ${roundWins.red} - ${roundWins.blue}`;
  if (audWinner) audWinner.textContent = matchEnded ? `WINNER: ${roundWins.red > roundWins.blue ? displayRedName : displayBlueName}` : "";
  if (audRest) audRest.textContent = restTimeLeft > 0 ? `Rest: ${formatLiveTime(restTimeLeft)}` : "";
  const statsRed = restTimeLeft > 0 ? lastRoundHits.red : currentHits.red;
  const statsBlue = restTimeLeft > 0 ? lastRoundHits.blue : currentHits.blue;
  if (audRedHits) {
    audRedHits.textContent = `Huvud ${statsRed.head} | Väst ${statsRed.body} | Slag ${statsRed.punch}`;
  }
  if (audBlueHits) {
    audBlueHits.textContent = `Huvud ${statsBlue.head} | Väst ${statsBlue.body} | Slag ${statsBlue.punch}`;
  }
  broadcastState();
}

function setLiveScoreNames() {
  updateLiveScoreDisplay();
}

function setTotalRounds() {
  const totalInput = document.getElementById("totalRoundsInput");
  if (totalInput) {
    const val = parseInt(totalInput.value, 10);
    if (!isNaN(val) && val > 0) totalRounds = val;
  }
  if (currentRound > totalRounds) currentRound = totalRounds;
  updateLiveScoreDisplay();
}

function adjustLiveScore(side, delta) {
  if (!(side in liveScore)) return;
  liveScore[side] = Math.max(0, liveScore[side] + delta);
  updateLiveScoreDisplay();
}

function awardScore(side, value) {
  if (!(side in liveScore)) return;
  liveScore[side] += value;
  // Statistikkategorier: 1 -> punch, 2/4 -> body, 3/5 -> head
  const hitStats = currentHits[side];
  if (value === 1) hitStats.punch += 1;
  else if (value === 2 || value === 4) hitStats.body += 1;
  else if (value === 3 || value === 5) hitStats.head += 1;
  lastAction = { type: "score", side, value };
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `${liveScoreNames[side]} +${value}`;
  updateLiveScoreDisplay();
}

function awardPenalty(side) {
  if (!(side in liveScore)) return;
  // Gam-jeom: +1 till motståndaren och registrera penalty
  livePenalties[side] += 1;
  const opponent = side === "red" ? "blue" : "red";
  liveScore[opponent] += 1;
  lastAction = { type: "penalty", side, value: 1 };
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `${liveScoreNames[side]} gam-jeom ( +1 ${liveScoreNames[opponent]} )`;
  updateLiveScoreDisplay();
}

function resetLiveScore() {
  liveScore.red = 0;
  liveScore.blue = 0;
  livePenalties.red = 0;
  livePenalties.blue = 0;
  currentHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  updateLiveScoreDisplay();
}

function undoLastAction() {
  if (!lastAction) {
    const status = document.getElementById("liveScoreStatus");
    if (status) status.textContent = "Inget att ångra.";
    return;
  }
  if (lastAction.type === "score") {
    liveScore[lastAction.side] = Math.max(0, liveScore[lastAction.side] - lastAction.value);
  } else if (lastAction.type === "penalty") {
    const opponent = lastAction.side === "red" ? "blue" : "red";
    liveScore[opponent] = Math.max(0, liveScore[opponent] - 1);
    livePenalties[lastAction.side] = Math.max(0, livePenalties[lastAction.side] - 1);
  }
  lastAction = null;
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = "Senaste åtgärden ångrad.";
  updateLiveScoreDisplay();
}

function updateLiveMeta() {
  const matchInput = document.getElementById("matchNumberInput");
  const roundInput = document.getElementById("roundNumberInput");
  const matchDisplay = document.getElementById("liveMatchNumber");
  const roundDisplay = document.getElementById("liveRoundNumber");
  if (matchInput && matchDisplay) matchDisplay.textContent = matchInput.value || "1";
  if (roundInput && roundDisplay) {
    const rVal = parseInt(roundInput.value, 10);
    currentRound = !isNaN(rVal) && rVal > 0 ? rVal : 1;
    roundDisplay.textContent = currentRound;
  }
  const totalInput = document.getElementById("totalRoundsInput");
  if (totalInput) {
    const val = parseInt(totalInput.value, 10);
    if (!isNaN(val) && val > 0) totalRounds = val;
  }
  const totalRoundsEl = document.getElementById("liveTotalRounds");
  if (totalRoundsEl) totalRoundsEl.textContent = totalRounds;
}

function setMatchDuration() {
  const durInput = document.getElementById("matchDurationInput");
  if (durInput) {
    const val = parseInt(durInput.value, 10);
    if (!isNaN(val) && val > 0) {
      matchDurationSeconds = val;
    }
  }
  liveTimeLeft = matchDurationSeconds;
  updateLiveScoreDisplay();
}

function formatLiveTime(seconds) {
  const clamped = Math.max(0, Math.round(seconds));
  const m = Math.floor(clamped / 60).toString().padStart(2, "0");
  const s = (clamped % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function startLiveTimer() {
  if (liveTimerRunning) return;
  if (liveTimeLeft <= 0) {
    liveTimeLeft = matchDurationSeconds;
  }
  liveTimerRunning = true;
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = "Matchklockan startad";
  liveTimerId = setInterval(() => {
    liveTimeLeft -= 1;
    if (liveTimeLeft <= 0) {
      liveTimeLeft = 0;
      endCurrentRound();
    } else {
      updateLiveScoreDisplay();
    }
  }, 1000);
}

function pauseLiveTimer() {
  liveTimerRunning = false;
  if (liveTimerId) clearInterval(liveTimerId);
  liveTimerId = null;
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = "Matchklockan pausad";
  updateLiveScoreDisplay();
}

function resetLiveMatch() {
  pauseLiveTimer();
  stopRestTimer();
  liveTimeLeft = matchDurationSeconds;
  currentRound = 1;
  roundWins = { red: 0, blue: 0 };
  matchEnded = false;
  lastRoundHits = { red: { head: 0, body: 0, punch: 0 }, blue: { head: 0, body: 0, punch: 0 } };
  const roundInput = document.getElementById("roundNumberInput");
  if (roundInput) roundInput.value = currentRound;
  const roundDisplay = document.getElementById("liveRoundNumber");
  if (roundDisplay) roundDisplay.textContent = currentRound;
  resetLiveScore();
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `Match nollställd – ${liveScoreNames.red}: ${liveScore.red} | ${liveScoreNames.blue}: ${liveScore.blue}`;
  updateLiveScoreDisplay();
}

function endCurrentRound() {
  if (matchEnded) return;
  pauseLiveTimer();
  liveTimeLeft = 0;
  if (liveScore.red === liveScore.blue) {
    const tieStatus = document.getElementById("liveScoreStatus");
    if (tieStatus) tieStatus.textContent = "Oavgjort – ge utslags-poäng innan du går vidare.";
    return;
  }
  const winner = liveScore.red > liveScore.blue ? "red" : "blue";
  roundWins[winner] += 1;
  lastRoundHits = JSON.parse(JSON.stringify(currentHits));
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `${liveScoreNames[winner]} vinner rond ${currentRound}.`;
  // Avgör om matchen är klar (bäst av totalRounds, standard 3)
  const needed = Math.floor(totalRounds / 2) + 1;
  if (roundWins[winner] >= needed) {
    matchEnded = true;
    stopRestTimer();
    showMatchWinner(winner);
    return;
  }
  startRestTimer();
}

function startNextRound() {
  if (matchEnded) {
    const status = document.getElementById("liveScoreStatus");
    if (status) status.textContent = "Matchen är redan avgjord.";
    return;
  }
  stopRestTimer();
  prepareNextRound();
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `Rond ${currentRound} förberedd. Starta klockan.`;
  updateLiveScoreDisplay();
}

function prepareNextRound() {
  currentRound = Math.min(currentRound + 1, totalRounds);
  const roundInput = document.getElementById("roundNumberInput");
  if (roundInput) roundInput.value = currentRound;
  const roundDisplay = document.getElementById("liveRoundNumber");
  if (roundDisplay) roundDisplay.textContent = currentRound;
  resetLiveScore();
  liveTimeLeft = matchDurationSeconds;
  updateLiveScoreDisplay();
}

function startRestTimer() {
  stopRestTimer();
  restTimeLeft = 60;
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `Paus ${formatLiveTime(restTimeLeft)} – starta nästa rond när du är redo.`;
  restTimerId = setInterval(() => {
    restTimeLeft -= 1;
    if (restTimeLeft <= 0) {
      restTimeLeft = 0;
      stopRestTimer();
      const st = document.getElementById("liveScoreStatus");
      if (st) st.textContent = "Paus klar – tryck Nästa rond och starta klockan.";
    }
    updateLiveScoreDisplay();
  }, 1000);
  updateLiveScoreDisplay();
}

function stopRestTimer() {
  if (restTimerId) clearInterval(restTimerId);
  restTimerId = null;
  restTimeLeft = 0;
}

function showMatchWinner(side) {
  matchEnded = true;
  pauseLiveTimer();
  stopRestTimer();
  const status = document.getElementById("liveScoreStatus");
  if (status) status.textContent = `Vinnare: ${liveScoreNames[side]}`;
  const audWinner = document.getElementById("audienceWinner");
  if (audWinner) audWinner.textContent = `WINNER: ${liveScoreNames[side]}`;
  updateLiveScoreDisplay();
}

function toggleAudienceView(show) {
  const view = document.getElementById("audienceView");
  if (!view) return;
  view.style.display = show ? "block" : "none";
  updateLiveScoreDisplay();
}

function broadcastState() {
  if (!broadcastChannel || audienceMode) return;
  const payload = {
    liveScore: { ...liveScore },
    livePenalties: { ...livePenalties },
    liveScoreNames: { ...liveScoreNames },
    currentRound,
    totalRounds,
    liveTimeLeft,
    matchDurationSeconds,
    matchNumber: document.getElementById("matchNumberInput")?.value || "1",
    timerRunning: liveTimerRunning,
    roundWins,
    matchEnded,
    lastRoundHits,
    restTimeLeft,
    currentHits,
  };
  broadcastChannel.postMessage(payload);
}

function applyIncomingState(state) {
  // Uppdaterar publikvyn i en separat flik utan att påverka operatörens flik.
  const redName = state.liveScoreNames?.red || "Röd";
  const blueName = state.liveScoreNames?.blue || "Blå";
  const timerText = formatLiveTime(state.liveTimeLeft ?? 0);
  const audRedName = document.getElementById("audienceRedName");
  const audBlueName = document.getElementById("audienceBlueName");
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
  const audRedHits = document.getElementById("audienceRedHits");
  const audBlueHits = document.getElementById("audienceBlueHits");
  if (audRedName) audRedName.textContent = redName;
  if (audBlueName) audBlueName.textContent = blueName;
  if (audRedScore) audRedScore.textContent = state.liveScore?.red ?? 0;
  if (audBlueScore) audBlueScore.textContent = state.liveScore?.blue ?? 0;
  if (audTimer) audTimer.textContent = timerText;
  if (audRound) audRound.textContent = `${state.currentRound ?? 1}/${state.totalRounds ?? 1}`;
  if (audInfo) audInfo.textContent = `Rond ${state.currentRound ?? 1}`;
  if (audMatchTitle) audMatchTitle.textContent = `Match ${state.matchNumber ?? "1"}`;
  if (audRedPen) audRedPen.textContent = state.livePenalties?.red ?? 0;
  if (audBluePen) audBluePen.textContent = state.livePenalties?.blue ?? 0;
  if (audRoundScore) {
    const rw = state.roundWins || { red: 0, blue: 0 };
    audRoundScore.textContent = `Ronder: ${rw.blue} - ${rw.red}`;
  }
  if (audWinner) {
    if (state.matchEnded) {
      const rw = state.roundWins || { red: 0, blue: 0 };
      const winnerSide = (rw.red || 0) > (rw.blue || 0) ? redName : blueName;
      audWinner.textContent = `WINNER: ${winnerSide}`;
    } else {
      audWinner.textContent = "";
    }
  }
  if (audRest) audRest.textContent = state.restTimeLeft > 0 ? `Rest: ${formatLiveTime(state.restTimeLeft)}` : "";
  const statsRed = state.restTimeLeft > 0 ? state.lastRoundHits?.red : state.currentHits?.red;
  const statsBlue = state.restTimeLeft > 0 ? state.lastRoundHits?.blue : state.currentHits?.blue;
  if (audRedHits) {
    const lr = statsRed || { head: 0, body: 0, punch: 0 };
    audRedHits.textContent = `Huvud ${lr.head} | Väst ${lr.body} | Slag ${lr.punch}`;
  }
  if (audBlueHits) {
    const lb = statsBlue || { head: 0, body: 0, punch: 0 };
    audBlueHits.textContent = `Huvud ${lb.head} | Väst ${lb.body} | Slag ${lb.punch}`;
  }
}

// Säkerställ att vi startar på startmenyn även om någon vy sparats i cache
document.addEventListener("DOMContentLoaded", () => {
  if ("BroadcastChannel" in window) {
    broadcastChannel = new BroadcastChannel("kicklab-live-score");
    broadcastChannel.onmessage = (event) => {
      if (!audienceMode) return;
      if (!event.data) return;
      applyIncomingState(event.data);
    };
  }
  toggleAudienceView(false);
  showStartPage();
  const params = new URLSearchParams(window.location.search);
  if (params.get("audience") === "1") {
    audienceMode = true;
    matchEnded = false;
    restTimeLeft = 0;
    const loader = document.getElementById("loaderOverlay");
    if (loader) loader.style.display = "none";
    document.querySelectorAll(".page-container").forEach((el) => (el.style.display = "none"));
    toggleAudienceView(true);
  }
});

function openAudienceWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set("audience", "1");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function playBeep() {
  const duration = 0.1;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.value = 1000;
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

function playEndBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = 600;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.4);
}

async function startTest() {
  testActive = true;
  document.getElementById("result").textContent = "";
  document.getElementById("command").textContent = "";
  document.getElementById("status").textContent = "Vänta på signal...";

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamSource = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);
    mediaStreamSource.connect(analyser);

    const randomDelay = Math.random() * 3000 + 2000;
    setTimeout(() => {
      if (!testActive) return;
      const selectedCommand = commands[Math.floor(Math.random() * commands.length)];
      document.getElementById("command").textContent = selectedCommand;
      playBeep();
      startTime = performance.now();
      listenForImpact();
      document.getElementById("status").textContent = "Väntar på smäll...";
    }, randomDelay);
  } catch (error) {
    document.getElementById("status").textContent = "Mikrofon krävs för att använda appen";
  }
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
      document.getElementById("result").textContent = `${reactionTime.toFixed(0)} ms`;
      stopListening();
      saveResult(reactionTime);
    } else {
      animationId = requestAnimationFrame(checkVolume);
    }
  }
  checkVolume();
}

function stopListening() {
  testActive = false;
  if (animationId) cancelAnimationFrame(animationId);
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
}

function saveResult(time) {
  recentResults.unshift(time);
  if (recentResults.length > 3) recentResults.pop();
  localStorage.setItem("recentResults", JSON.stringify(recentResults));

  let historyText = " Senaste resultat ";
  for (let t of recentResults) {
    historyText += ` ${t.toFixed(0)} ms `;
  }
  historyText += " ";

  const avg = recentResults.reduce((a, b) => a + b, 0) / recentResults.length;
  historyText += ` Snitt: ${avg.toFixed(0)} ms `;
  document.getElementById("history").innerHTML = historyText;

  if (bestTime === null || time < bestTime) {
    bestTime = time;
    localStorage.setItem("bestTime", bestTime);
    document.getElementById("highscore").innerHTML = ` 🎉 Nytt rekord! ${bestTime.toFixed(0)} ms 🎉 `;
    document.getElementById("cheerSound").play();
  } else {
    document.getElementById("highscore").innerHTML = ` Bästa tid ${bestTime.toFixed(0)} ms `;
  }
}

function resetStats() {
  localStorage.removeItem("recentResults");
  localStorage.removeItem("bestTime");
  recentResults = [];
  bestTime = null;
  document.getElementById("history").innerHTML = "";
  document.getElementById("highscore").innerHTML = "";
  document.getElementById("command").textContent = "";
  document.getElementById("result").textContent = "";
  document.getElementById("status").textContent = "";
}

function loadStats() {
  if (recentResults.length > 0) {
    let historyText = " Senaste resultat ";
    for (let t of recentResults) {
      historyText += ` ${t.toFixed(0)} ms `;
    }
    historyText += " ";
    const avg = recentResults.reduce((a, b) => a + b, 0) / recentResults.length;
    historyText += ` Snitt: ${avg.toFixed(0)} ms `;
    document.getElementById("history").innerHTML = historyText;
  }
  if (bestTime !== null) {
    document.getElementById("highscore").innerHTML = ` Bästa tid ${bestTime.toFixed(0)} ms `;
  }
}

// ----- Kick counter -----
let kickAudioCtx,
  kickMediaStream,
  kickMediaStreamSource,
  kickAnalyser,
  kickDataArray,
  kickAnimationId;
let kickCount = 0,
  kickTimeRemaining = 15,
  kickTestDuration = 15,
  kickTestActive = false,
  kickTestInterval;
let kickRecentResults = JSON.parse(localStorage.getItem("kickRecentResults")) || [];
let bestKickCount = parseInt(localStorage.getItem("bestKickCount")) || 0;
let lastKickTime = 0;
const kickCooldown = 200;

function updateTestDuration() {
  kickTestDuration = parseInt(document.getElementById("testDuration").value);
  document.getElementById("kickTimer").textContent = `${kickTestDuration} sekunder`;
}

function speakText(text) {
  return new Promise((resolve) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "sv-SE";
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      utterance.onend = () => resolve();
      speechSynthesis.speak(utterance);
    } else {
      setTimeout(resolve, 1000);
    }
  });
}

async function startKickTest() {
  kickTestDuration = parseInt(document.getElementById("testDuration").value);
  document.getElementById("kickCount").textContent = "0 sparkar";
  document.getElementById("kickTimer").textContent = `${kickTestDuration} sekunder`;
  document.getElementById("kickStatus").textContent = "Förbereder mikrofon...";

  kickCount = 0;
  kickTimeRemaining = kickTestDuration;
  kickTestActive = false;

  try {
    kickAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    kickMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    kickMediaStreamSource = kickAudioCtx.createMediaStreamSource(kickMediaStream);
    kickAnalyser = kickAudioCtx.createAnalyser();
    kickAnalyser.fftSize = 2048;
    kickDataArray = new Uint8Array(kickAnalyser.fftSize);
    kickMediaStreamSource.connect(kickAnalyser);

    await new Promise((resolve) => setTimeout(resolve, 500));
    document.getElementById("kickStatus").textContent = "3";
    await speakText("3");
    document.getElementById("kickStatus").textContent = "2";
    await speakText("2");
    document.getElementById("kickStatus").textContent = "1";
    await speakText("1");
    document.getElementById("kickStatus").textContent = "STARTA!";
    await speakText("Starta");

    startKickListening();
  } catch (error) {
    document.getElementById("kickStatus").textContent = "Mikrofon krävs för att använda appen";
  }
}

function startKickListening() {
  kickTestActive = true;
  kickTimeRemaining = kickTestDuration;
  lastKickTime = 0;
  document.getElementById("kickStatus").textContent = "Sparka så mycket du kan!";

  kickTestInterval = setInterval(() => {
    kickTimeRemaining--;
    document.getElementById("kickTimer").textContent = `${kickTimeRemaining} sekunder`;
    if (kickTimeRemaining <= 0) {
      endKickTest();
    }
  }, 1000);

  listenForKicks();
}

function listenForKicks() {
  function checkKickVolume() {
    if (!kickTestActive) return;
    kickAnalyser.getByteTimeDomainData(kickDataArray);
    let max = 0;
    for (let i = 0; i < kickDataArray.length; i++) {
      const value = Math.abs(kickDataArray[i] - 128);
      if (value > max) max = value;
    }
    const currentTime = performance.now();
    if (max > 40 && currentTime - lastKickTime > kickCooldown) {
      kickCount++;
      lastKickTime = currentTime;
      document.getElementById("kickCount").textContent = `${kickCount} sparkar`;
    }
    if (kickTestActive) {
      kickAnimationId = requestAnimationFrame(checkKickVolume);
    }
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
  document.getElementById("kickStatus").textContent = "Klicka 'Starta Test' för att börja";
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
  if (bestKickCount > 0) {
    document.getElementById("kickHighscore").innerHTML = ` Bästa resultat ${bestKickCount} sparkar `;
  }
}

function startSparringTraining() {
  const duration = parseInt(document.getElementById("sparringDuration").value);
  const statusEl = document.getElementById("sparringStatus");
  const commandEl = document.getElementById("sparringCommand");
  const commands = [
    "Tornado",
    "Huvudspark",
    "Jopp höger",
    "Jopp vänster",
    "Slag",
    "Sax",
    "Clash",
    "Pitchagi höger",
    "Pitchagi vänster",
    "Bakspark",
    "Spark främre",
    "Spark bakre",
  ];
  let remainingTime = duration;
  let intervalId, commandIntervalId;
  statusEl.textContent = `Tid kvar: ${remainingTime} sekunder`;
  commandEl.textContent = "Startar...";
  commandEl.style.fontSize = "2rem";
  commandEl.style.fontWeight = "bold";
  if ("speechSynthesis" in window) {
    const sayCommand = (text) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "sv-SE";
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;
      speechSynthesis.speak(utterance);
    };
    // start commands every two seconds
    commandIntervalId = setInterval(() => {
      const command = commands[Math.floor(Math.random() * commands.length)];
      commandEl.textContent = command;
      sayCommand(command);
    }, 2000);
    // Start countdown
    intervalId = setInterval(() => {
      remainingTime--;
      statusEl.textContent = `Tid kvar: ${remainingTime} sekunder`;
      if (remainingTime <= 0) {
        clearInterval(intervalId);
        clearInterval(commandIntervalId);
        playEndBeep();
        statusEl.textContent = "Träning klar!";
        commandEl.textContent = "Bra jobbat!";
        sayCommand("Bra jobbat! Sparringträningen är slut");
      }
    }, 1000);
    // Save interval IDs globally so that we can clear them later
    sparringInterval = intervalId;
    sparringTimeout = commandIntervalId;
  } else {
    statusEl.textContent = "Din webbläsare stöder inte talsyntes.";
  }
}

/* ===== Tävlingsläge (competition mode) ===== */

// Visa tävlingssidan och initiera namninmatning
function showCompetitionSetupPage() {
  // Visa inställningssidan för tävling och döljer andra sidor
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "none";
  const setupPage = document.getElementById("competitionSetupPage");
  const runPage = document.getElementById("competitionRunPage");
  const roundPage = document.getElementById("competitionRoundPage");
  const overlay = document.getElementById("countdownOverlay");
  if (setupPage) setupPage.style.display = "block";
  if (runPage) runPage.style.display = "none";
  if (roundPage) roundPage.style.display = "none";
  if (overlay) overlay.style.display = "none";
  // Avbryt alla pågående tester
  stopTest();
  stopSparringTraining();
  stopListening();
  // Förbered namninputfält
  updateCompetitionNameInputs();
}

// Uppdatera antalet namnfält baserat på vald antal deltagare
function updateCompetitionNameInputs() {
  const countInput = document.getElementById("competitionCount");
  if (!countInput) return;
  const count = parseInt(countInput.value) || 0;
  const container = document.getElementById("competitionNames");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = `competitionName${i}`;
    input.placeholder = `Deltagare ${i + 1} namn`;
    input.style.marginBottom = "0.5rem";
    input.style.width = "80%";
    container.appendChild(input);
    container.appendChild(document.createElement("br"));
  }
}

// Bekräfta deltagare och gå vidare till tävlingssidan
function confirmCompetitionParticipants() {
  const countInput = document.getElementById("competitionCount");
  if (!countInput) return;
  const count = parseInt(countInput.value) || 0;
  competitionParticipants = [];
  for (let i = 0; i < count; i++) {
    const nameInput = document.getElementById(`competitionName${i}`);
    const name = nameInput && nameInput.value ? nameInput.value : `Deltagare ${i + 1}`;
    competitionParticipants.push({ name: name, times: [], best: null, avg: null });
  }
  // Om inga deltagare angivits, visa ett meddelande
  if (competitionParticipants.length === 0) {
    alert("Ange minst en deltagare");
    return;
  }
  showCompetitionRunPage();
}

// Visa tävlingssidan där namnen visas och tävlingen kan startas
function showCompetitionRunPage() {
  // Visa endast run-sidan
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "none";
  const setupPage = document.getElementById("competitionSetupPage");
  const runPage = document.getElementById("competitionRunPage");
  const roundPage = document.getElementById("competitionRoundPage");
  const overlay = document.getElementById("countdownOverlay");
  if (setupPage) setupPage.style.display = "none";
  if (runPage) runPage.style.display = "block";
  if (roundPage) roundPage.style.display = "none";
  if (overlay) overlay.style.display = "none";
  // Fyll listan med deltagarnamn
  const listEl = document.getElementById("competitionNamesList");
  if (listEl) {
    listEl.innerHTML = "";
    competitionParticipants.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p.name;
      li.style.marginBottom = "0.3rem";
      listEl.appendChild(li);
    });
  }
  // Rensa status och resultat
  const statusEl = document.getElementById("competitionStatus");
  if (statusEl) statusEl.textContent = "";
  const resultsEl = document.getElementById("competitionResults");
  if (resultsEl) resultsEl.innerHTML = "";
  // Avbryt eventuella tidigare tävlingar
  competitionActive = false;
}

// Visa sidan för nästkommande runda där användaren kan starta nedräkningen.
function showNextRoundStartPage() {
  /*
   * Denna funktion visar en separat sida med stort namn och en stor
   * startknapp för aktuell deltagares spark. Den döljer tävlingsrun-sidan
   * och visar round-sidan. Om tävlingen är avslutad startas finishCompetition().
   */
  if (!competitionActive) return;
  // Om alla deltagare är klara, avsluta
  if (currentParticipantIndex >= competitionParticipants.length) {
    finishCompetition();
    return;
  }
  // Döljer run-sidan och visar runda-sidan
  const runPage = document.getElementById("competitionRunPage");
  const roundPage = document.getElementById("competitionRoundPage");
  if (runPage) runPage.style.display = "none";
  if (roundPage) roundPage.style.display = "block";
  // Uppdatera deltagarnamn och sparknummer
  const nameEl = document.getElementById("roundParticipantName");
  const participant = competitionParticipants[currentParticipantIndex];
  if (nameEl) {
    nameEl.textContent = `${participant.name} – spark ${currentKickIndex + 1}/3`;
  }
  // Säkerställ att overlay är gömd
  const overlay = document.getElementById("countdownOverlay");
  if (overlay) overlay.style.display = "none";
}

// Förbered mikrofonen och analysen i tävlingsläget så att lyssningen
// kan starta direkt när signalen ges. Detta anropas i början av
// varje runda innan nedräkningen.
async function prepareCompetitionMicrophone() {
  try {
    competitionAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    competitionMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    competitionMediaStreamSource = competitionAudioCtx.createMediaStreamSource(competitionMediaStream);
    competitionAnalyser = competitionAudioCtx.createAnalyser();
    competitionAnalyser.fftSize = 2048;
    competitionDataArray = new Uint8Array(competitionAnalyser.fftSize);
    competitionMediaStreamSource.connect(competitionAnalyser);
  } catch (e) {
    const statusEl = document.getElementById("competitionStatus");
    if (statusEl) statusEl.textContent = "Mikrofon krävs för att använda tävlingsläget.";
    competitionActive = false;
    throw e;
  }
}

// Starta nedräkning och sedan själva sparken när startknappen klickas
async function beginCompetitionRound() {
  /*
   * Denna funktion körs när användaren trycker på startknappen för en
   * specifik runda. Den visar ett svart overlay med orange siffror och
   * använder speakText för nedräkning. Efter nedräkning och signal
   * initieras mätningen via startCompetitionTest().
   */
  if (!competitionActive) return;
  // Göm runda-sidan och visa overlay
  const roundPage = document.getElementById("competitionRoundPage");
  if (roundPage) roundPage.style.display = "none";
  const overlay = document.getElementById("countdownOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  overlay.style.background = "black";
  overlay.style.color = "orange";
  overlay.style.fontSize = "8rem";
  overlay.style.textAlign = "center";
  overlay.style.flexDirection = "column";
  // Förbered mikrofonen tidigt så att den är redo direkt efter signalen.
  try {
    await prepareCompetitionMicrophone();
  } catch (e) {
    // Om mikrofonen inte kan förberedas, avbryt nedräkning och tävling
    const overlay = document.getElementById("countdownOverlay");
    if (overlay) overlay.style.display = "none";
    return;
  }

  // Nedräkning
  overlay.textContent = "3";
  await speakText("3");
  overlay.textContent = "2";
  await speakText("2");
  overlay.textContent = "1";
  await speakText("1");
  overlay.textContent = "KÖR!";
  
  // Pip-ljud
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1000;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Om pip-ljud inte kan spelas behövs ingen åtgärd
  }
  // Dölj overlay och starta mätningen
  overlay.style.display = "none";
  // Uppdatera status för aktuell spark
  const statusEl = document.getElementById("competitionStatus");
  const participant = competitionParticipants[currentParticipantIndex];
  if (statusEl) {
    statusEl.textContent = `${participant.name}: spark ${currentKickIndex + 1}/3 – vänta på smällen...`;
  }
  // Starta mätning
  await startCompetitionTest();
}

// Starta tävlingen genom att läsa in alla deltagare och starta första testet
function startCompetition() {
  /*
   * Starta själva tävlingen. Den här funktionen förutsätter att
   * deltagarnamnen redan har samlats in via confirmCompetitionParticipants()
   * och competitionParticipants-arrayen är ifylld. Vi kontrollerar att
   * minst en deltagare finns och initierar indexvariabler. Sedan rensar
   * vi status/resultat och startar första sparkförsöket.
   */
  if (!competitionParticipants || competitionParticipants.length === 0) {
    alert("Ange minst en deltagare");
    return;
  }
  currentParticipantIndex = 0;
  currentKickIndex = 0;
  competitionActive = true;
  // Rensa resultat och status
  const resultsEl = document.getElementById("competitionResults");
  if (resultsEl) resultsEl.innerHTML = "";
  const statusEl = document.getElementById("competitionStatus");
  if (statusEl) statusEl.textContent = "";
  // Visa nästa runda‑startssida för första deltagaren
  showNextRoundStartPage();
}

// Starta själva mätningen för aktuell deltagare
async function startCompetitionTest() {
  /*
   * Denna funktion initierar mikrofonen och börjar lyssna efter smällen. Den
   * förutsätter att nedräkning och signalering redan har gjorts i
   * beginCompetitionRound().
   */
  if (!competitionActive) return;
  if (currentParticipantIndex >= competitionParticipants.length) {
    finishCompetition();
    return;
  }
  // Om mikrofonen redan är förberedd från nedräkningen används den direkt
  if (competitionMediaStream) {
    competitionStartTime = performance.now();
    listenForImpactCompetition();
    return;
  }
  // Annars förbered mikrofonen nu (extra fallback)
  try {
    await prepareCompetitionMicrophone();
    competitionStartTime = performance.now();
    listenForImpactCompetition();
  } catch (error) {
    const statusEl = document.getElementById("competitionStatus");
    if (statusEl) statusEl.textContent = "Mikrofon krävs för att använda tävlingsläget.";
    competitionActive = false;
    return;
  }
}

// Lyssna på ljudnivå och registrera reaktionstid när smällen kommer
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

// Spara reaktionstiden för aktuell deltagare och hantera nästa spark/deltagare
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

// Avsluta tävlingen och visa vinnare samt resultat
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
