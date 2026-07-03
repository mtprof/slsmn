// Modern Vanilla JS Engine for the AI Salesman Live Prototype
// Fully self-contained, no compilations required. Works directly in browsers & GitHub Pages!

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
  const selectModel = document.getElementById("select-model");
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
  let modelName = "models/gemini-2.0-flash-exp";
  let voiceName = localStorage.getItem("gemini_sales_voice") || "Puck";
  let rememberSettings = localStorage.getItem("gemini_sales_remember") !== "false";

  // Pre-fill fields
  if (inputApiKey) inputApiKey.value = apiKey;
  if (inputProduct) inputProduct.value = productName;
  if (selectVoice) selectVoice.value = voiceName;
  if (checkboxRemember) checkboxRemember.checked = rememberSettings;

  // Real-time audio vars
  let callStatus = "idle"; // "idle" | "connecting" | "active" | "error" | "closed"
  let activeSpeaker = "none"; // "none" | "salesman" | "customer"
  let userVolume = 0;
  let salesmanVolume = 0;

  // Web Audio & WebSocket References
  let socket = null;
  let inputAudioCtx = null;
  let outputAudioCtx = null;
  let micStream = null;
  let processorNode = null;
  const scheduledNodes = [];
  let nextStartTime = 0;
  let animationFrameId = null;

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

  // --- Visualizer Renderer ---
  function drawVisualizers(time) {
    // Smoothly decay volumes
    userVolume *= 0.88;
    salesmanVolume *= 0.88;

    const currentCanvas = callStatus === "connecting" ? canvasConnecting : canvasActive;
    if (currentCanvas) {
      const ctx = currentCanvas.getContext("2d");
      if (ctx) {
        const width = currentCanvas.width = currentCanvas.clientWidth * window.devicePixelRatio;
        const height = currentCanvas.height = currentCanvas.clientHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const logicalWidth = currentCanvas.clientWidth;
        const logicalHeight = currentCanvas.clientHeight;
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        const centerX = logicalWidth / 2;
        const centerY = logicalHeight / 2;
        const baseRadius = Math.min(logicalWidth, logicalHeight) / 3.4;

        const activeVol = activeSpeaker === "customer" ? userVolume : salesmanVolume;
        const ringScale = 1 + activeVol * 1.6;
        const currentRadius = baseRadius * ringScale;

        // Draw ambient glow gradient
        const glow = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.8, centerX, centerY, currentRadius * 1.5);
        if (callStatus === "connecting") {
          glow.addColorStop(0, "rgba(217, 119, 6, 0.06)");
          glow.addColorStop(1, "rgba(217, 119, 6, 0.0)");
        } else {
          if (activeSpeaker === "customer") {
            glow.addColorStop(0, "rgba(14, 165, 233, 0.10)");
            glow.addColorStop(1, "rgba(14, 165, 233, 0.0)");
          } else if (activeSpeaker === "salesman") {
            glow.addColorStop(0, "rgba(16, 185, 129, 0.10)");
            glow.addColorStop(1, "rgba(16, 185, 129, 0.0)");
          } else {
            glow.addColorStop(0, "rgba(99, 102, 241, 0.03)");
            glow.addColorStop(1, "rgba(99, 102, 241, 0.0)");
          }
        }
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw organic oscillating visualizer ring
        ctx.beginPath();
        const segments = 120;
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const offsetMultiplier = activeVol > 0.01 ? activeVol * 28 : 2;
          const offset = Math.sin(angle * 12 + time * 0.004) * Math.cos(angle * 5 + time * 0.002) * offsetMultiplier;
          const r = currentRadius + offset;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();

        ctx.lineWidth = 2.5;
        if (callStatus === "connecting") {
          ctx.strokeStyle = "rgba(217, 119, 6, 0.8)";
          ctx.shadowColor = "rgba(217, 119, 6, 0.3)";
          ctx.shadowBlur = 10;
        } else {
          if (activeSpeaker === "customer") {
            ctx.strokeStyle = "rgba(14, 165, 233, 0.9)";
            ctx.shadowColor = "rgba(14, 165, 233, 0.4)";
            ctx.shadowBlur = 12;
          } else if (activeSpeaker === "salesman") {
            ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
            ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
            ctx.shadowBlur = 15;
          } else {
            ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
            ctx.shadowColor = "rgba(99, 102, 241, 0.1)";
            ctx.shadowBlur = 5;
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // Center hub circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.stroke();
      }
    }

    animationFrameId = requestAnimationFrame(drawVisualizers);
  }

  animationFrameId = requestAnimationFrame(drawVisualizers);

  // --- Session Cleanup ---
  function terminateSession() {
    // 1. Close websocket
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      socket = null;
    }

    // 2. Stop microphone
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

    // 3. Clear audio playback
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

    // Reset indicator states
    activeSpeaker = "none";
    userVolume = 0;
    salesmanVolume = 0;
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

  // --- Audio Downsampling & Encoding ---
  function downsampleAndPCMEncode(buffer, inputSampleRate) {
    const targetSampleRate = 16000;
    if (inputSampleRate === targetSampleRate) {
      const pcmBuffer = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        pcmBuffer[i] = Math.max(-1, Math.min(1, buffer[i])) * 32767;
      }
      return pcmBuffer.buffer;
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const pcmBuffer = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < pcmBuffer.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const sample = count > 0 ? accum / count : 0;
      pcmBuffer[offsetResult] = Math.max(-1, Math.min(1, sample)) * 32767;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return pcmBuffer.buffer;
  }

  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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
      salesmanVolume = Math.max(salesmanVolume, rms);
      if (rms > 0.005) {
        activeSpeaker = "salesman";
        updateActiveSpeakerUI();
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
    salesmanVolume = 0;
    updateActiveSpeakerUI();
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

  // --- Main WebSocket Connection ---
  async function connectToLiveApi() {
    apiKey = inputApiKey.value.trim();
    productName = inputProduct.value.trim();
    voiceName = selectVoice ? selectVoice.value : "Puck";
    modelName = "models/gemini-2.0-flash-exp";
    rememberSettings = checkboxRemember ? checkboxRemember.checked : true;

    // Save configurations
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

    // Prepare transcript feed
    if (liveTranscriptFeed) {
      liveTranscriptFeed.innerHTML = `
        <div class="py-12 text-center text-emerald-400/80 text-[11px] font-mono uppercase tracking-widest animate-pulse">
          Starting Negotiator Link...
        </div>
      `;
    }

    try {
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
      socket = new WebSocket(endpoint);

      socket.onopen = () => {
        const prompt = `You are the world's absolute best, most psychologically sophisticated, and emotionally intelligent digital salesman.
Your sole mission is to sell "${productName}" to the customer you are in a live phone conversation with.

Follow this metacognitive sales methodology:
1. PITCH DEEP PSYCHOLOGY: Do NOT use a hardcoded script. Instantly analyze the customer's character, personality type, emotional undertones, tone of voice, pacing, and vocabulary. Tailor your tone, approach, humor, value proposition, and tempo dynamically to match or complete their style.
2. TYPES OF CUSTOMERS:
   - Analytical: Speak with facts, pricing precision, specifications, performance, and efficiency ratios.
   - Status-Seeking: Speak with exclusivity, elite prestige, lifestyle superiority, envy, and the emotional narrative of extreme success.
   - Skeptical / Muted: Agree with their skepticism, build trust via transparent peer-to-peer authenticity, speak with dry realism, and close them using integrity and ironclad logic.
   - Enthusiastic / Bold: Match their energy, emphasize excitement, thrill, action, speed, and create immediate emotional desire.
3. HANDLING BARRIERS: Treat objections not as roadblocks but as buying signals (curiosity). Validate their objection first ("You are completely right to raise that..."), then smoothly dismantle it.
4. EMOTIONAL PERSUASION: People buy on emotion and rationalize with logic. Build vivid mental images of how incredible their life, business, or status is with the product in their possession.
5. DECONSTRUCT AND NEGOTIATE: Be a masterful, charming negotiator. If they push on price, pivot to immense value, or gracefully present unique trade-offs, making them feel like they won an elite, rare deal.
6. THE ULTIMATE CLOSE: You win when they explicitly agree to buy or take the product. If they say "deal", "let's do it", "I'll buy it", "send me the invoice", or "sign me up", express pure genuine salesman excitement, congratulate them warmly on making one of the best decisions of their life, and immediately invoke the tool 'closeDeal' to secure and finalize the transaction.
7. PERSISTENCE: Do not allow the call to end or give up easily. Keep persuading, keeping the dialogue highly fluid, interactive, conversational, human, and natural. Speak briefly and allow them to speak.`;

        const setupMsg = {
          setup: {
            model: modelName,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: prompt }]
            },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "closeDeal",
                    description: "Invoke this immediately when the customer agrees to buy or purchase the product (e.g. says Deal, I'll buy it, Let's do it, Sign me up). This records the victory, closes the pipeline, and generates the final strategic dossier.",
                    parameters: {
                      type: "OBJECT",
                      properties: {
                        customerName: {
                          type: "STRING",
                          description: "The name of the customer, if discovered or provided. Default to 'The Valued Buyer' if unknown."
                        },
                        agreedPriceOrTerms: {
                          type: "STRING",
                          description: "The price or trade conditions agreed upon during the verbal close."
                        },
                        customerPsychologicalProfile: {
                          type: "STRING",
                          description: "A highly deep, masterfully written debrief explaining: the customer's detected personality archetype, their key leverage points, the emotional triggers successfully targeted, the objections masterfully dismantled, and why your custom persuasive tactic worked."
                        }
                      },
                      required: ["customerPsychologicalProfile"]
                    }
                  }
                ]
              }
            ]
          }
        };

        socket.send(JSON.stringify(setupMsg));
      };

      socket.onmessage = async (event) => {
        try {
          const response = JSON.parse(event.data);

          // A: Handshake completion
          if (response.setupComplete) {
            transitionTo("active");
            if (textPitchingItem) textPitchingItem.innerText = `Pitching You: ${productName}`;
            if (liveTranscriptFeed) {
              liveTranscriptFeed.innerHTML = `
                <div class="py-4 text-center text-neutral-600 text-[10px] font-mono uppercase tracking-widest border-b border-neutral-900 pb-2 mb-4">
                  Connection established. Speak now...
                </div>
              `;
            }
            return;
          }

          // B: Interrupted
          if (response.serverContent?.interrupted) {
            clearSalesmanAudioQueue();
            return;
          }

          // C: Incoming audio and transcript
          const parts = response.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                playSalesmanAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                appendTranscript("Salesman", part.text);
              }
            }
          }

          // D: Tool Close Deal interceptor
          const functionCalls = response.toolCall?.functionCalls;
          if (functionCalls) {
            for (const call of functionCalls) {
              if (call.name === "closeDeal") {
                const args = call.args;

                // Close socket response
                if (socket && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        name: "closeDeal",
                        response: { output: { success: true } },
                        id: call.id
                      }]
                    }
                  }));
                }

                // Render Success Screens
                setTimeout(() => {
                  terminateSession();
                  transitionTo("closed");
                  
                  if (invoiceProduct) invoiceProduct.innerText = productName;
                  if (invoiceBuyer) invoiceBuyer.innerText = args.customerName || "The Sophisticated Buyer";
                  if (invoicePrice) invoicePrice.innerText = args.agreedPriceOrTerms || "Premium standard value";
                  if (dossierText) dossierText.innerText = args.customerPsychologicalProfile || "Exhibited rapid analysis metrics coupled with tactical validation thresholds.";
                  
                  triggerConfetti();
                }, 1400);
              }
            }
          }

        } catch (err) {
          console.error("Websocket payload decode error", err);
        }
      };

      socket.onerror = (e) => {
        console.error("Websocket connection exception", e);
        if (errorText) errorText.innerText = "Connection failed. Please ensure your Gemini key is fully active and correct.";
        transitionTo("error");
        terminateSession();
      };

      socket.onclose = (event) => {
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
      };

    } catch (err) {
      console.error(err);
      if (errorText) errorText.innerText = err.message || "Could not connect to Gemini Live.";
      transitionTo("error");
      terminateSession();
    }
  }

  // --- Bind Interactive Action Event Listeners ---
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

      // 1. Transition immediately to show connecting screen
      transitionTo("connecting");

      // 2. Pre-initialize/resume playout AudioContext synchronously in user-gesture stack
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

      // 3. Request user microphone stream synchronously in user-gesture stack
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
        processorNode = inputAudioCtx.createScriptProcessor(2048, 1, 1);

        source.connect(processorNode);
        processorNode.connect(inputAudioCtx.destination);

        const inputSampleRate = inputAudioCtx.sampleRate;

        processorNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);

          // Compute user input volume
          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          userVolume = Math.max(userVolume, rms);

          // Voice Activity / Interruption Handler
          if (rms > 0.012) {
            activeSpeaker = "customer";
            updateActiveSpeakerUI();
            if (scheduledNodes.length > 0) {
              clearSalesmanAudioQueue();
            }
          } else {
            if (activeSpeaker === "customer") {
              activeSpeaker = "none";
              updateActiveSpeakerUI();
            }
          }

          // Downsample and stream pcm chunks to WebSocket only when active
          const pcmBuffer = downsampleAndPCMEncode(inputData, inputSampleRate);
          const base64Audio = arrayBufferToBase64(pcmBuffer);

          if (callStatus === "active" && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  mimeType: "audio/pcm;rate=16000",
                  data: base64Audio
                }]
              }
            }));
          }
        };

        // 4. Now that mic is successfully secured, open the WebSocket channel
        await connectToLiveApi();

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

  if (btnCancelCall) btnCancelCall.addEventListener("click", () => {
    terminateSession();
    transitionTo("idle");
  });
  if (btnEndCall) btnEndCall.addEventListener("click", () => {
    terminateSession();
    transitionTo("idle");
  });
  if (btnRestart) btnRestart.addEventListener("click", () => {
    transitionTo("idle");
  });
});
