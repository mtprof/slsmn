with open('src/main.js', 'w') as f:
    f.write("""// Modern Vanilla JS Controller for the AI Salesman Live Prototype
import { drawVisualizer } from "./utils/visualizer.js?v=5";
import { generateLiveKitToken } from "./utils/livekitToken.js";
import { Room, RoomEvent, createLocalAudioTrack, Track } from "livekit-client";

document.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
  const screenIdle = document.getElementById("screen-idle");
  const screenConnecting = document.getElementById("screen-connecting");
  const screenActive = document.getElementById("screen-active");
  const screenError = document.getElementById("screen-error");
  const screenClosed = document.getElementById("screen-closed");

  // Inputs
  const inputLivekitUrl = document.getElementById("input-livekit-url");
  const inputLivekitKey = document.getElementById("input-livekit-key");
  const inputLivekitSecret = document.getElementById("input-livekit-secret");
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
  let lkUrl = localStorage.getItem("lk_url") || "";
  let lkKey = localStorage.getItem("lk_key") || "";
  let lkSecret = localStorage.getItem("lk_secret") || "";
  let productName = localStorage.getItem("gemini_sales_product") || "Porsche 911";
  let voiceName = localStorage.getItem("gemini_sales_voice") || "Puck";
  let rememberSettings = localStorage.getItem("gemini_sales_remember") !== "false";

  // Pre-fill fields
  if (inputLivekitUrl) inputLivekitUrl.value = lkUrl;
  if (inputLivekitKey) inputLivekitKey.value = lkKey;
  if (inputLivekitSecret) inputLivekitSecret.value = lkSecret;
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
  let room = null;
  let localAudioTrack = null;

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
  async function terminateSession() {
    if (room) {
      await room.disconnect();
      room = null;
    }
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack = null;
    }

    activeSpeaker = "none";
    updateActiveSpeakerUI();
    volumesState.userVolume = 0;
    volumesState.salesmanVolume = 0;
  }

  function updateActiveSpeakerUI() {
    if (!activeSpeakerText || !activeSpeakerDot) return;
    if (activeSpeaker === "salesman") {
      activeSpeakerText.innerText = "Salesman Speaking";
      activeSpeakerDot.className = "w-1.5 h-1.5 rounded-full transition-colors duration-300 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
    } else if (activeSpeaker === "customer") {
      activeSpeakerText.innerText = "You are speaking";
      activeSpeakerDot.className = "w-1.5 h-1.5 rounded-full transition-colors duration-300 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
    } else {
      activeSpeakerText.innerText = "Listening...";
      activeSpeakerDot.className = "w-1.5 h-1.5 rounded-full transition-colors duration-300 bg-neutral-600";
    }
  }

  function appendTranscript(speaker, text) {
    if (!liveTranscriptFeed) return;
    
    // Check if we need to append to the last block or create a new one
    const lastBlock = liveTranscriptFeed.lastElementChild;
    const isSameSpeaker = lastBlock && lastBlock.dataset.speaker === speaker;

    if (isSameSpeaker) {
      const p = document.createElement("p");
      p.className = "mt-1";
      p.innerText = text;
      const body = lastBlock.querySelector('.transcript-body');
      if(body) body.appendChild(p);
    } else {
      const block = document.createElement("div");
      block.dataset.speaker = speaker;
      block.className = `p-3 rounded-lg text-[11px] leading-relaxed border ${
        speaker === "Salesman" 
          ? "bg-neutral-900/50 border-neutral-800 text-neutral-300" 
          : "bg-emerald-950/20 border-emerald-900/30 text-emerald-400 ml-4"
      }`;

      const header = document.createElement("div");
      header.className = `font-mono uppercase tracking-widest text-[9px] mb-1.5 ${
        speaker === "Salesman" ? "text-neutral-500" : "text-emerald-500/70"
      }`;
      header.innerText = speaker;

      const body = document.createElement("div");
      body.className = "transcript-body";
      const p = document.createElement("p");
      p.innerText = text;
      body.appendChild(p);

      block.appendChild(header);
      block.appendChild(body);
      liveTranscriptFeed.appendChild(block);
    }
    // Scroll transcript window to bottom
    liveTranscriptFeed.scrollTop = liveTranscriptFeed.scrollHeight;
  }

  // --- Confetti ---
  function triggerConfetti() {
    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext("2d");
    const particles = [];
    const colors = ["#34d399", "#10b981", "#059669", "#ffffff"];
    
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        r: Math.random() * 4 + 1,
        dx: Math.random() * 10 - 5,
        dy: Math.random() * 10 - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 10,
        tiltAngle: 0,
        tiltAngleInc: (Math.random() * 0.07) + 0.05
      });
    }

    let animId;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2;
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
      document.body.removeChild(canvas);
    }, 9000);
  }

  // --- Connect to Service ---
  async function initializeSession() {
    lkUrl = inputLivekitUrl.value.trim();
    lkKey = inputLivekitKey.value.trim();
    lkSecret = inputLivekitSecret.value.trim();
    productName = inputProduct.value.trim();
    voiceName = selectVoice ? selectVoice.value : "Puck";
    rememberSettings = checkboxRemember ? checkboxRemember.checked : true;

    // Persist settings if requested
    if (rememberSettings) {
      localStorage.setItem("lk_url", lkUrl);
      localStorage.setItem("lk_key", lkKey);
      localStorage.setItem("lk_secret", lkSecret);
      localStorage.setItem("gemini_sales_product", productName);
      localStorage.setItem("gemini_sales_voice", voiceName);
      localStorage.setItem("gemini_sales_remember", "true");
    } else {
      localStorage.removeItem("lk_url");
      localStorage.removeItem("lk_key");
      localStorage.removeItem("lk_secret");
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

    try {
      // 1. Generate LiveKit token using our utility
      const roomName = "sales-room-" + Math.floor(Math.random() * 10000);
      const token = await generateLiveKitToken(lkKey, lkSecret, roomName, "customer");
      
      // 2. Initialize Room
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.Connected, () => {
        transitionTo("active");
        if (textPitchingItem) textPitchingItem.innerText = `Pitching You: ${productName}`;
        if (liveTranscriptFeed) {
          liveTranscriptFeed.innerHTML = `
            <div class="py-4 text-center text-neutral-600 text-[10px] font-mono uppercase tracking-widest border-b border-neutral-900 pb-2 mb-4">
              Connection established. Speak now...
            </div>
          `;
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          document.body.appendChild(element);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (callStatus === "active" || callStatus === "connecting") {
           transitionTo("idle");
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (speakers.length > 0) {
          const speaker = speakers[0];
          if (speaker === room.localParticipant) {
            activeSpeaker = "customer";
            volumesState.userVolume = speaker.audioLevel || 0;
          } else {
            activeSpeaker = "salesman";
            volumesState.salesmanVolume = speaker.audioLevel || 0;
          }
        } else {
          activeSpeaker = "none";
          volumesState.userVolume = 0;
          volumesState.salesmanVolume = 0;
        }
        updateActiveSpeakerUI();
      });

      // Data channel for transcripts or agent events
      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        const textPayload = new TextDecoder().decode(payload);
        try {
          const data = JSON.parse(textPayload);
          if (data.type === "transcript") {
            appendTranscript(data.speaker || "Salesman", data.text);
          } else if (data.type === "deal_closed") {
             setTimeout(() => {
                terminateSession();
                transitionTo("closed");
                
                if (invoiceProduct) invoiceProduct.innerText = productName;
                if (invoiceBuyer) invoiceBuyer.innerText = data.customerName || "The Sophisticated Buyer";
                if (invoicePrice) invoicePrice.innerText = data.agreedPriceOrTerms || "Premium standard value";
                if (dossierText) dossierText.innerText = data.customerPsychologicalProfile || "Exhibited rapid analysis metrics coupled with tactical validation thresholds.";
                
                triggerConfetti();
              }, 1400);
          }
        } catch(e) {
           // Not JSON, just append as text if topic is transcript
           if (topic === "transcript") {
              appendTranscript("Salesman", textPayload);
           }
        }
      });

      await room.connect(lkUrl, token);
      
      // Publish Local Mic
      localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
      });
      await room.localParticipant.publishTrack(localAudioTrack);

    } catch (e) {
      console.error("LiveKit connection error", e);
      if (errorText) errorText.innerText = `Connection failed: ${e.message}`;
      transitionTo("error");
      terminateSession();
    }
  }

  // --- Bind Action Event Listeners ---
  if (btnStartCall) {
    btnStartCall.addEventListener("click", async () => {
      lkUrl = inputLivekitUrl.value.trim();
      lkKey = inputLivekitKey.value.trim();
      lkSecret = inputLivekitSecret.value.trim();
      productName = inputProduct.value.trim();

      if (!lkUrl || !lkKey || !lkSecret) {
        if (errorText) errorText.innerText = "Please input valid LiveKit configuration.";
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
      
      // 2. Connect session
      initializeSession();
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
""")
