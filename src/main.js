// Modern Vanilla JS Controller for the AI Salesman Live Prototype
// Cleanly modularized and split into smaller, maintainable modules

import { downsampleAndPCMEncode, arrayBufferToBase64 } from "./utils/audio.js?v=5";
import { drawVisualizer } from "./utils/visualizer.js?v=5";
import { GeminiLiveSession } from "./services/liveApi.js?v=5";

document.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
  const screenIdle = document.getElementById("screen-idle");
  const screenConnecting = document.getElementById("screen-connecting");
  const screenActive = document.getElementById("screen-active");
  const screenError = document.getElementById("screen-error");
  const screenClosed = document.getElementById("screen-closed");

  // Inputs
  const inputApiKey = document.getElementById("input-api-key");
  const inputProduct = document.getElementById("input-product");
  const selectVoice = document.getElementById("select-voice");
  const checkboxRemember = document.getElementById("checkbox-remember");

  // Buttons
  const btnStartCall = document.getElementById("btn-start-call");
  const btnCancelCall = document.getElementById("btn-cancel-call");
  const btnEndCall = document.getElementById("btn-end-call");
  const btnRestart = document.getElementById("btn-restart");

  // Status & Dynamic Indicators
  const activeSpeakerText = document.getElementById("active-speaker-text");
  const activeSpeakerDot = document.getElementById("active-speaker-dot");
  const textPitchingItem = document.getElementById("text-pitching-item");
  const liveTranscriptFeed = document.getElementById("live-transcript-feed");
  const errorText = document.getElementById("error-text");

  // Closed Victory UI
  const invoiceProduct = document.getElementById("invoice-product");
  const invoiceBuyer = document.getElementById("invoice-buyer");
  const invoicePrice = document.getElementById("invoice-price");
  const dossierText = document.getElementById("dossier-text");

  // Visualizer Canvases
  const canvasConnecting = document.getElementById("canvas-connecting");
  const canvasActive = document.getElementById("canvas-active");

  // --- State Managers ---
  let apiKey = localStorage.getItem("gemini_sales_api_key") || "";
  let productName = localStorage.getItem("gemini_sales_product") || "Porsche 911";
  let voiceName = localStorage.getItem("gemini_sales_voice") || "Puck";
  let rememberSettings = localStorage.getItem("gemini_sales_remember") !== "false";

  // Pre-fill fields
  if (inputApiKey) inputApiKey.value = apiKey;
  if (inputProduct) inputProduct.value = productName;
  if (selectVoice) selectVoice.value = voiceName;
  if (checkboxRemember) checkboxRemember.checked = rememberSettings;

  // Real-time audio states
  let callStatus = "idle"; // "idle" | "connecting" | "active" | "error" | "closed"
  let activeSpeaker = "none"; // "none" | "salesman" | "customer"
  const volumesState = {
    userVolume: 0,
    salesmanVolume: 0
  };

  // Web Audio & WebSocket references
  let session = null;
  let inputAudioCtx = null;
  let outputAudioCtx = null;
  let micStream = null;
  let processorNode = null;
  const scheduledNodes = [];
  let nextStartTime = 0;

  // --- Transition Helpers ---
  function transitionTo(status) {
    callStatus = status;
    
    // Hide all screens
    [screenIdle, screenConnecting, screenActive, screenError, screenClosed].forEach(el => {
      if (el) {
        el.classList.add("hidden");
        el.classList.remove("opacity-100");
        el.classList.add("opacity-0");
      }
    });

    // Show target screen with a smooth fade-in
    let targetEl = null;
    if (status === "idle") targetEl = screenIdle;
    else if (status === "connecting") targetEl = screenConnecting;
    else if (status === "active") targetEl = screenActive;
    else if (status === "error") targetEl = screenError;
    else if (status === "closed") targetEl = screenClosed;

    if (targetEl) {
      targetEl.classList.remove("hidden");
      setTimeout(() => {
        targetEl.classList.remove("opacity-0");
        targetEl.classList.add("opacity-100");
      }, 50);
    }

    // Refresh lucide icons if dynamic elements are rendered
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Visualizer Animation Frame loop ---
  function animateVisualizer(time) {
    const currentCanvas = callStatus === "connecting" ? canvasConnecting : canvasActive;
    if (currentCanvas && (callStatus === "connecting" || callStatus === "active")) {
      drawVisualizer(currentCanvas, time, callStatus, activeSpeaker, volumesState);
    }
    requestAnimationFrame(animateVisualizer);
  }
  requestAnimationFrame(animateVisualizer);

  // --- Session Cleanup ---
  function terminateSession() {
    // 1. Close session
    if (session) {
      session.close();
      session = null;
    }

    // 2. Stop microphone stream & recording processor
    if (processorNode) {
      processorNode.disconnect();
      processorNode = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    if (inputAudioCtx) {
      if (inputAudioCtx.state !== "closed") {
        inputAudioCtx.close();
      }
      inputAudioCtx = null;
    }

    // 3. Clear scheduled playback nodes & playout context
    scheduledNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {}
    });
    scheduledNodes.length = 0;
    nextStartTime = 0;

    if (outputAudioCtx) {
      if (outputAudioCtx.state !== "closed") {
        outputAudioCtx.close();
      }
      outputAudioCtx = null;
    }

    // Reset status flags
    activeSpeaker = "none";
    volumesState.userVolume = 0;
    volumesState.salesmanVolume = 0;
    updateActiveSpeakerUI();
  }

  // --- Speaker State UI Updater ---
  function updateActiveSpeakerUI() {
    if (!activeSpeakerText || !activeSpeakerDot) return;

    if (activeSpeaker === "salesman") {
      activeSpeakerText.innerText = "Salesman Speaking";
      activeSpeakerDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
    } else if (activeSpeaker === "customer") {
      activeSpeakerText.innerText = "Listening to You";
      activeSpeakerDot.className = "w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse";
    } else {
      activeSpeakerText.innerText = "Silent";
      activeSpeakerDot.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
    }
  }

  // --- Append Live Transcripts ---
  function appendTranscript(sender, text) {
    if (!liveTranscriptFeed) return;

    // Check if the last transcript block is from the same sender
    const blocks = liveTranscriptFeed.children;
    const lastBlock = blocks[blocks.length - 1];

    if (lastBlock && lastBlock.dataset.sender === sender) {
      const p = lastBlock.querySelector("p");
      if (p) p.innerText += " " + text;
    } else {
      const block = document.createElement("div");
      block.className = "text-xs leading-relaxed border-b border-slate-900/85 pb-3 last:border-none";
      block.dataset.sender = sender;

      const header = document.createElement("span");
      header.className = `font-mono uppercase tracking-wider font-semibold block mb-0.5 ${
        sender === "Salesman" ? "text-emerald-400" : "text-sky-400"
      }`;
      header.innerText = sender;

      const body = document.createElement("p");
      body.className = "text-slate-300";
      body.innerText = text;

      block.appendChild(header);
      block.appendChild(body);
      liveTranscriptFeed.appendChild(block);
    }

    // Scroll transcript window to bottom
    liveTranscriptFeed.scrollTop = liveTranscriptFeed.scrollHeight;
  }

  // --- Playback Pipeline ---
  function playSalesmanAudioChunk(base64Audio) {
    try {
      if (!outputAudioCtx) {
        outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
        nextStartTime = outputAudioCtx.currentTime;
      }

      if (outputAudioCtx.state === "suspended") {
        outputAudioCtx.resume();
      }

      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      let sumSquares = 0;

      for (let i = 0; i < pcm16.length; i++) {
        const val = pcm16[i] / 32768;
        float32[i] = val;
        sumSquares += val * val;
      }

      const rms = Math.sqrt(sumSquares / pcm16.length);
      volumesState.salesmanVolume = Math.max(volumesState.salesmanVolume, rms);
      if (rms > 0.005) {
        if (activeSpeaker !== "salesman") {
          activeSpeaker = "salesman";
          updateActiveSpeakerUI();
        }
      }

      const audioBuffer = outputAudioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioCtx.destination);

      source.onended = () => {
        const idx = scheduledNodes.indexOf(source);
        if (idx > -1) scheduledNodes.splice(idx, 1);
        if (scheduledNodes.length === 0) {
          activeSpeaker = "none";
          updateActiveSpeakerUI();
        }
      };

      scheduledNodes.push(source);

      const currentTime = outputAudioCtx.currentTime;
      if (nextStartTime < currentTime) {
        nextStartTime = currentTime;
      }

      source.start(nextStartTime);
      nextStartTime += audioBuffer.duration;

    } catch (e) {
      console.error("Audio playback failure", e);
    }
  }

  function clearSalesmanAudioQueue() {
    scheduledNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {}
    });
    scheduledNodes.length = 0;
    if (outputAudioCtx) {
      nextStartTime = outputAudioCtx.currentTime;
    }
    activeSpeaker = "none";
    volumesState.salesmanVolume = 0;
    updateActiveSpeakerUI();
  }

  // --- Confetti Canvas Animation ---
  function triggerConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#10b981", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa"];
    const particles = Array.from({ length: 130 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    }));

    let animId;

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle);
        p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();

        if (p.y > canvas.height) {
          p.x = Math.random() * canvas.width;
          p.y = -20;
          p.tilt = Math.random() * 10 - 5;
        }
      });

      animId = requestAnimationFrame(animate);
    }

    animate();

    setTimeout(() => {
      cancelAnimationFrame(animId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 9000);
  }

  // --- Connect to Service ---
  function initializeSession() {
    apiKey = inputApiKey.value.trim();
    productName = inputProduct.value.trim();
    voiceName = selectVoice ? selectVoice.value : "Puck";
    rememberSettings = checkboxRemember ? checkboxRemember.checked : true;

    // Persist settings if requested
    if (rememberSettings) {
      localStorage.setItem("gemini_sales_api_key", apiKey);
      localStorage.setItem("gemini_sales_product", productName);
      localStorage.setItem("gemini_sales_voice", voiceName);
      localStorage.setItem("gemini_sales_remember", "true");
    } else {
      localStorage.removeItem("gemini_sales_api_key");
      localStorage.removeItem("gemini_sales_product");
      localStorage.removeItem("gemini_sales_voice");
      localStorage.setItem("gemini_sales_remember", "false");
    }

    if (liveTranscriptFeed) {
      liveTranscriptFeed.innerHTML = `
        <div class="py-12 text-center text-emerald-400/80 text-[11px] font-mono uppercase tracking-widest animate-pulse">
          Starting Negotiator Link...
        </div>
      `;
    }

    session = new GeminiLiveSession({
      apiKey,
      productName,
      voiceName,
      onSetupComplete: () => {
        transitionTo("active");
        if (textPitchingItem) textPitchingItem.innerText = `Pitching You: ${productName}`;
        if (liveTranscriptFeed) {
          liveTranscriptFeed.innerHTML = `
            <div class="py-4 text-center text-neutral-600 text-[10px] font-mono uppercase tracking-widest border-b border-neutral-900 pb-2 mb-4">
              Connection established. Speak now...
            </div>
          `;
        }
      },
      onAudioChunk: (base64Audio) => {
        playSalesmanAudioChunk(base64Audio);
      },
      onTranscript: (text) => {
        appendTranscript("Salesman", text);
      },
      onInterrupted: () => {
        clearSalesmanAudioQueue();
      },
      onCloseDeal: (args) => {
        setTimeout(() => {
          terminateSession();
          transitionTo("closed");
          
          if (invoiceProduct) invoiceProduct.innerText = productName;
          if (invoiceBuyer) invoiceBuyer.innerText = args.customerName || "The Sophisticated Buyer";
          if (invoicePrice) invoicePrice.innerText = args.agreedPriceOrTerms || "Premium standard value";
          if (dossierText) dossierText.innerText = args.customerPsychologicalProfile || "Exhibited rapid analysis metrics coupled with tactical validation thresholds.";
          
          triggerConfetti();
        }, 1400);
      },
      onError: (e) => {
        console.error("Websocket connection exception", e);
        if (errorText) errorText.innerText = "Connection failed. Please ensure your Gemini key is fully active and correct.";
        transitionTo("error");
        terminateSession();
      },
      onClose: (event) => {
        if (callStatus === "connecting") {
          console.error("Websocket closed during handshake/connection phase", event);
          if (errorText) {
            errorText.innerText = `Connection closed immediately by server (Close Code: ${event.code || 'unknown'}). This usually indicates an invalid, expired, or rate-limited Gemini API Key, or that the selected Gemini Live API model is currently unavailable in your region.`;
          }
          transitionTo("error");
          terminateSession();
        } else if (callStatus !== "closed" && callStatus !== "error") {
          transitionTo("idle");
          terminateSession();
        }
      }
    });

    session.connect();
  }

  // --- Bind Action Event Listeners ---
  if (btnStartCall) {
    btnStartCall.addEventListener("click", async () => {
      apiKey = inputApiKey.value.trim();
      productName = inputProduct.value.trim();

      if (!apiKey) {
        if (errorText) errorText.innerText = "Please input a valid Gemini API Key.";
        transitionTo("error");
        return;
      }
      if (!productName) {
        if (errorText) errorText.innerText = "Please input a product to sell.";
        transitionTo("error");
        return;
      }

      // 1. Transition to connecting view
      transitionTo("connecting");

      // 2. Resume output AudioContext synchronously in user gesture
      try {
        if (!outputAudioCtx || outputAudioCtx.state === "closed") {
          outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000
          });
        }
        if (outputAudioCtx.state === "suspended") {
          await outputAudioCtx.resume();
        }
        nextStartTime = outputAudioCtx.currentTime;
      } catch (audioErr) {
        console.warn("Playout AudioContext pre-initialization ignored or postponed", audioErr);
      }

      // 3. Secure microphone access synchronously
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        micStream = stream;
        inputAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (inputAudioCtx.state === "suspended") {
          await inputAudioCtx.resume();
        }
        const source = inputAudioCtx.createMediaStreamSource(stream);
        processorNode = inputAudioCtx.createScriptProcessor(4096, 1, 1);

        source.connect(processorNode);
        processorNode.connect(inputAudioCtx.destination);

        const inputSampleRate = inputAudioCtx.sampleRate;

        processorNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);

          // Compute input volume
          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          volumesState.userVolume = Math.max(volumesState.userVolume, rms);

          // User interruption check
          if (rms > 0.012) {
            if (activeSpeaker !== "customer") {
              activeSpeaker = "customer";
              updateActiveSpeakerUI();
            }
            if (scheduledNodes.length > 0) {
              clearSalesmanAudioQueue();
            }
          } else {
            if (activeSpeaker === "customer") {
              activeSpeaker = "none";
              updateActiveSpeakerUI();
            }
          }

          // Encode PCM and send to session
          const pcmBuffer = downsampleAndPCMEncode(inputData, inputSampleRate);
          const base64Audio = arrayBufferToBase64(pcmBuffer);

          if (callStatus === "active" && session) {
            session.sendAudioChunk(base64Audio);
          }
        };

        // 4. Connect session over WebSocket
        initializeSession();

      } catch (micErr) {
        console.error("Microphone or playout permission request failed in click context", micErr);
        if (errorText) {
          const errMsg = micErr.message || micErr.name || String(micErr);
          errorText.innerText = `Could not access microphone (${errMsg}). Please verify that a microphone is plugged in, and that you have granted microphone access to this application in your browser settings.`;
        }
        transitionTo("error");
        terminateSession();
      }
    });
  }

  if (btnCancelCall) {
    btnCancelCall.addEventListener("click", () => {
      terminateSession();
      transitionTo("idle");
    });
  }
  if (btnEndCall) {
    btnEndCall.addEventListener("click", () => {
      terminateSession();
      transitionTo("idle");
    });
  }
  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      transitionTo("idle");
    });
  }
});
