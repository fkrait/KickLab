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

function showStartPage() {
  document.getElementById("startPage").style.display = "block";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "none";

  document.getElementById("sparringCommand").textContent = "";
  document.getElementById("sparringStatus").textContent = "Klicka 'Starta' för att börja träningen";

  stopSparringTraining();
  stopListening();
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
  loadStats();
}

function showSparringPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "none";
  document.getElementById("sparringPage").style.display = "block";
}

function showKickCounterPage() {
  document.getElementById("startPage").style.display = "none";
  document.getElementById("testPage").style.display = "none";
  document.getElementById("kickCounterPage").style.display = "block";
  stopListening();
  loadKickStats();
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