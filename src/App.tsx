import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  PhoneCall,
  PhoneOff,
  User,
  Tag,
  Key,
  Volume2,
  VolumeX,
  Flame,
  ShieldAlert,
  Info,
  HelpCircle,
  CheckCircle,
  TrendingUp,
  RefreshCw,
  Award,
  DollarSign,
  FileText,
  Brain,
  MessageSquare
} from "lucide-react";

// Types for Gemini Live API over WebSockets
interface FunctionCall {
  name: string;
  args: {
    customerPsychologicalProfile?: string;
    agreedPriceOrTerms?: string;
    customerName?: string;
  };
  id: string;
}

interface LiveMessage {
  setupComplete?: {};
  serverContent?: {
    modelTurn?: {
      parts: Array<{
        inlineData?: {
          mimeType: string;
          data: string;
        };
        text?: string;
      }>;
    };
    interrupted?: boolean;
  };
  toolCall?: {
    functionCalls: FunctionCall[];
  };
}

// Available Salesman Voice options
const VOICES = [
  { id: "Zephyr", name: "Zephyr", vibe: "Warm, enthusiastic & high-rapport (Default)" },
  { id: "Aoede", name: "Aoede", vibe: "Sophisticated, clear & highly polished" },
  { id: "Puck", name: "Puck", vibe: "Bold, charismatic & energetic" },
  { id: "Charon", name: "Charon", vibe: "Authoritative, elite & exclusive" },
  { id: "Kore", name: "Kore", vibe: "Calm, consultative & professional" }
];

export default function App() {
  // UI & Form state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_sales_api_key") || "");
  const [productName, setProductName] = useState(() => localStorage.getItem("gemini_sales_product") || "Porsche 911");
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem("gemini_sales_voice") || "Zephyr");
  const [saveSettings, setSaveSettings] = useState(true);

  // Call status state
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "active" | "error" | "closed">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState<"salesman" | "customer" | "none">("none");

  // Running transcript
  const [transcripts, setTranscripts] = useState<Array<{ sender: "Salesman" | "You"; text: string; id: string }>>([]);

  // Deal Closed successful state
  const [dealClosedData, setDealClosedData] = useState<{
    customerName: string;
    agreedPrice: string;
    psychologicalProfile: string;
  } | null>(null);

  // Real-time audio levels for visualizations
  const [userVolume, setUserVolume] = useState(0);
  const [salesmanVolume, setSalesmanVolume] = useState(0);

  // Refs for audio processing & socket connection (to avoid stale closures in callbacks)
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Volume meter refs
  const userVolumeRef = useRef(0);
  const salesmanVolumeRef = useRef(0);

  // Save config changes
  useEffect(() => {
    if (saveSettings) {
      localStorage.setItem("gemini_sales_api_key", apiKey);
      localStorage.setItem("gemini_sales_product", productName);
      localStorage.setItem("gemini_sales_voice", voiceName);
    }
  }, [apiKey, productName, voiceName, saveSettings]);

  // Clean up all audio and socket connections on unmount
  useEffect(() => {
    return () => {
      terminateSession();
    };
  }, []);

  // Animate custom visualizer ring
  useEffect(() => {
    let lastTime = 0;
    const draw = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) / 3.2;

      // Decay volumes smoothly
      userVolumeRef.current *= 0.88;
      salesmanVolumeRef.current *= 0.88;

      // Update state for simple UI progress indicators
      setUserVolume(userVolumeRef.current);
      setSalesmanVolume(salesmanVolumeRef.current);

      const activeVol = activeSpeaker === "customer" ? userVolumeRef.current : salesmanVolumeRef.current;
      const ringScale = 1 + activeVol * 1.5;
      const currentRadius = baseRadius * ringScale;

      // Draw background glow
      const glow = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.8, centerX, centerY, currentRadius * 1.4);
      if (callStatus === "connecting") {
        glow.addColorStop(0, "rgba(217, 119, 6, 0.05)");
        glow.addColorStop(1, "rgba(217, 119, 6, 0.0)");
      } else if (callStatus === "active") {
        if (activeSpeaker === "customer") {
          glow.addColorStop(0, "rgba(14, 165, 233, 0.08)");
          glow.addColorStop(1, "rgba(14, 165, 233, 0.0)");
        } else if (activeSpeaker === "salesman") {
          glow.addColorStop(0, "rgba(16, 185, 129, 0.08)");
          glow.addColorStop(1, "rgba(16, 185, 129, 0.0)");
        } else {
          glow.addColorStop(0, "rgba(99, 102, 241, 0.03)");
          glow.addColorStop(1, "rgba(99, 102, 241, 0.0)");
        }
      } else {
        glow.addColorStop(0, "rgba(75, 85, 99, 0.02)");
        glow.addColorStop(1, "rgba(75, 85, 99, 0.0)");
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Draw visualizer ring particle wave
      ctx.beginPath();
      const segments = 120;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Generate nice organic noise using sine waves
        const offsetMultiplier = activeVol > 0.01 ? activeVol * 25 : 2;
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

      // Style ring based on status
      ctx.lineWidth = 2.5;
      if (callStatus === "connecting") {
        ctx.strokeStyle = "rgba(217, 119, 6, 0.75)"; // Amber pulsing
        ctx.shadowColor = "rgba(217, 119, 6, 0.3)";
        ctx.shadowBlur = 10;
      } else if (callStatus === "active") {
        if (activeSpeaker === "customer") {
          ctx.strokeStyle = "rgba(14, 165, 233, 0.85)"; // Sky blue
          ctx.shadowColor = "rgba(14, 165, 233, 0.4)";
          ctx.shadowBlur = 12;
        } else if (activeSpeaker === "salesman") {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.85)"; // Emerald green/gold
          ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
          ctx.shadowBlur = 15;
        } else {
          ctx.strokeStyle = "rgba(99, 102, 241, 0.4)"; // Indigo muted
          ctx.shadowColor = "rgba(99, 102, 241, 0.1)";
          ctx.shadowBlur = 5;
        }
      } else {
        ctx.strokeStyle = "rgba(107, 114, 128, 0.3)"; // Gray line
        ctx.shadowBlur = 0;
      }
      ctx.stroke();

      // Reset shadows
      ctx.shadowBlur = 0;

      // Draw centered pulse indicator
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(17, 24, 39, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [callStatus, activeSpeaker]);

  // Clean up all components of the session
  const terminateSession = () => {
    // 1. Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    // 2. Stop microphone capture
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      if (inputAudioCtxRef.current.state !== "closed") {
        inputAudioCtxRef.current.close();
      }
      inputAudioCtxRef.current = null;
    }

    // 3. Stop salesman audio playback nodes
    scheduledNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    scheduledNodesRef.current = [];
    nextStartTimeRef.current = 0;

    if (outputAudioCtxRef.current) {
      if (outputAudioCtxRef.current.state !== "closed") {
        outputAudioCtxRef.current.close();
      }
      outputAudioCtxRef.current = null;
    }

    // Reset speaker and volumes
    setActiveSpeaker("none");
    userVolumeRef.current = 0;
    salesmanVolumeRef.current = 0;
  };

  // Convert Float32 microphone data to 16-bit PCM little-endian
  const downsampleAndPCMEncode = (buffer: Float32Array, inputSampleRate: number): ArrayBuffer => {
    const targetSampleRate = 16000;
    if (inputSampleRate === targetSampleRate) {
      const l = buffer.length;
      const pcmBuffer = new Int16Array(l);
      for (let i = 0; i < l; i++) {
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
  };

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Playback an incoming 24kHz raw audio chunk back-to-back using Web Audio context
  const playSalesmanAudioChunk = (base64Audio: string) => {
    try {
      if (!outputAudioCtxRef.current) {
        // Initialize output AudioContext at 24000Hz as standard for Gemini audio output
        outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000
        });
        nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
      }

      const audioCtx = outputAudioCtxRef.current;

      // Resume context if suspended
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      // Convert Base64 to ArrayBuffer
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Read as 16-bit PCM
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      let sumSquares = 0;

      for (let i = 0; i < pcm16.length; i++) {
        const val = pcm16[i] / 32768;
        float32[i] = val;
        sumSquares += val * val;
      }

      // Calculate instantaneous volume for the salesman visualizer
      const rms = Math.sqrt(sumSquares / pcm16.length);
      salesmanVolumeRef.current = Math.max(salesmanVolumeRef.current, rms);
      if (rms > 0.005) {
        setActiveSpeaker("salesman");
      }

      // Create Web Audio Buffer
      const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      // Create Source Node
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      // Clean up reference when playback finishes
      source.onended = () => {
        scheduledNodesRef.current = scheduledNodesRef.current.filter((node) => node !== source);
        if (scheduledNodesRef.current.length === 0) {
          setActiveSpeaker("none");
        }
      };

      scheduledNodesRef.current.push(source);

      // Schedule gapless playback
      const currentTime = audioCtx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    } catch (e) {
      console.error("Error decoding or playing salesman audio chunk", e);
    }
  };

  // Halt all scheduled playback (user speaking over model or connection closed)
  const clearSalesmanAudioQueue = () => {
    scheduledNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    scheduledNodesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setActiveSpeaker("none");
    salesmanVolumeRef.current = 0;
  };

  // Connect to the Live API WebSocket
  const startSalesSession = async () => {
    if (!apiKey) {
      setErrorMessage("Please input your Gemini AI Studio API Key to start.");
      setCallStatus("error");
      return;
    }
    if (!productName.trim()) {
      setErrorMessage("Please enter a product name for the salesman to sell.");
      setCallStatus("error");
      return;
    }

    setErrorMessage("");
    setCallStatus("connecting");
    setTranscripts([]);
    setDealClosedData(null);

    try {
      // 1. Establish the WebSocket connection directly to Google Generative Language Service
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
      const socket = new WebSocket(endpoint);
      wsRef.current = socket;

      socket.onopen = () => {
        // Send initial Handshake config
        const voiceNameSelected = voiceName;
        const systemPrompt = `You are the world's absolute best, most psychologically sophisticated, and emotionally intelligent digital salesman.
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

        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-exp",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceNameSelected
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
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

        socket.send(JSON.stringify(setupMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const response: LiveMessage = JSON.parse(event.data);

          // A: Setup Completed successfully -> Start Recording mic audio
          if (response.setupComplete) {
            setCallStatus("active");
            startMicrophoneRecording();
            return;
          }

          // B: Interrupted -> immediately clear the playback queue so the user can speak over the AI
          if (response.serverContent?.interrupted) {
            clearSalesmanAudioQueue();
            return;
          }

          // C: Incoming Salesman Audio Output
          const parts = response.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                playSalesmanAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                // If text transcription is returned, append it to the live transcript panel
                setTranscripts((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.sender === "Salesman") {
                    return [...prev.slice(0, -1), { ...last, text: last.text + " " + part.text }];
                  } else {
                    return [...prev, { sender: "Salesman", text: part.text || "", id: Math.random().toString() }];
                  }
                });
              }
            }
          }

          // D: Function Call Intercept (e.g. Deal Closed victory trigger)
          const functionCalls = response.toolCall?.functionCalls;
          if (functionCalls) {
            for (const call of functionCalls) {
              if (call.name === "closeDeal") {
                const args = call.args;
                
                // Play final congrats audio if queued, then transition
                setTimeout(() => {
                  terminateSession();
                  setCallStatus("closed");
                  setDealClosedData({
                    customerName: args.customerName || "The Sophisticated Buyer",
                    agreedPrice: args.agreedPriceOrTerms || "Premium standard value",
                    psychologicalProfile: args.customerPsychologicalProfile || "Exhibited status-driven characteristics coupled with logical evaluation. Addressed initial caution via strategic reciprocity and customized scarcity framing."
                  });
                  triggerVictoryConfetti();
                }, 1500);

                // Send quick tool response back to close websocket properly
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        name: "closeDeal",
                        response: { output: { success: true } },
                        id: call.id
                      }]
                    }
                  }));
                }
              }
            }
          }
        } catch (err) {
          console.error("Error processing websocket payload", err);
        }
      };

      socket.onerror = (e) => {
        console.error("WebSocket Connection Error", e);
        setErrorMessage("Live Service connection failed. Double-check your API Key and network.");
        setCallStatus("error");
        terminateSession();
      };

      socket.onclose = (e) => {
        if (callStatus !== "closed") {
          setCallStatus("idle");
          terminateSession();
        }
      };

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An unexpected error occurred during setup.");
      setCallStatus("error");
      terminateSession();
    }
  };

  // Start capturing user microphone audio
  const startMicrophoneRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      micStreamRef.current = stream;

      // Initialize recording AudioContext
      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      inputAudioCtxRef.current = inputAudioCtx;

      const source = inputAudioCtx.createMediaStreamSource(stream);
      // 2048 buffer size, 1 input channel, 1 output channel
      const processor = inputAudioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      const inputSampleRate = inputAudioCtx.sampleRate;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate instantaneous volume level for visualization
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        userVolumeRef.current = Math.max(userVolumeRef.current, rms);

        // Update speaker state based on volume threshold
        if (rms > 0.012) {
          setActiveSpeaker("customer");
          // If customer is actively speaking, immediately silence the playing salesman audio
          if (scheduledNodesRef.current.length > 0) {
            clearSalesmanAudioQueue();
          }
        }

        // Resample client audio to 16000Hz PCM and convert to Base64
        const pcmBuffer = downsampleAndPCMEncode(inputData, inputSampleRate);
        const base64Audio = arrayBufferToBase64(pcmBuffer);

        // Send binary frame over WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm",
                data: base64Audio
              }]
            }
          }));
        }
      };

    } catch (err) {
      console.error("Microphone Access Blocked", err);
      setErrorMessage("Could not access microphone. Ensure microphone permissions are allowed.");
      setCallStatus("error");
      terminateSession();
    }
  };

  // Canvas confetti animation on sale close
  const triggerVictoryConfetti = () => {
    const canvas = document.getElementById("confetti-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#10b981", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa"];
    const particles = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    }));

    let animationId: number;

    const animateConfetti = () => {
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

        // Recycle particles
        if (p.y > canvas.height) {
          p.x = Math.random() * canvas.width;
          p.y = -20;
          p.tilt = Math.random() * 10 - 5;
        }
      });

      animationId = requestAnimationFrame(animateConfetti);
    };

    animateConfetti();

    // Clean up animation after 10 seconds
    setTimeout(() => {
      cancelAnimationFrame(animationId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 10000);
  };

  const handleEndCall = () => {
    terminateSession();
    setCallStatus("idle");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-indigo-500/30 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-900/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-emerald-900/10 blur-[130px] pointer-events-none" />

      {/* Confetti canvas for victory deals */}
      <canvas id="confetti-canvas" className="absolute inset-0 pointer-events-none z-50" />

      {/* Modern minimal header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {callStatus === "active" && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="text-base font-display font-semibold tracking-tight text-white leading-none">
              AI Salesman
            </h1>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider uppercase">
              Gemini 2.0 Live Prototype
            </span>
          </div>
        </div>

        {callStatus === "active" && (
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${
              activeSpeaker === "salesman" ? "bg-emerald-500 animate-pulse" :
              activeSpeaker === "customer" ? "bg-sky-500 animate-pulse" : "bg-slate-600"
            }`} />
            <span className="text-xs font-mono text-slate-400">
              {activeSpeaker === "salesman" ? "Salesman Speaking" :
               activeSpeaker === "customer" ? "Listening to You" : "Silent"}
            </span>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 flex flex-col justify-center items-center relative z-10">
        <AnimatePresence mode="wait">
          
          {/* STATE 1: IDLE / CONFIG FORM */}
          {callStatus === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-xl bg-slate-900/60 border border-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl relative"
            >
              <div className="mb-6 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-3">
                  <Flame className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-mono text-indigo-300 font-medium uppercase tracking-wider">
                    World's Best Persuasion Prototype
                  </span>
                </div>
                <h2 className="text-2xl font-display font-semibold tracking-tight text-white">
                  Meet Your Digital Salesman
                </h2>
                <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                  Provide your Gemini API key and define the product. He will dynamically analyze your voice, mood, and style to persuade you to buy.
                </p>
              </div>

              {errorMessage && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex gap-3 items-start text-rose-300 text-sm">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                  <div>
                    <span className="font-semibold block">Configuration Error</span>
                    <p className="text-rose-300/90 text-xs mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Field 1: API Key */}
                <div>
                  <label htmlFor="api-key" className="block text-xs font-mono font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    Gemini API Key
                  </label>
                  <div className="relative">
                    <input
                      id="api-key"
                      type="password"
                      placeholder="AI Studio API Key (AIzaSy...)"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-100 placeholder-slate-600 text-sm transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                    Used 100% client-side in your browser to establish connection. Never sent to any external server. Free-tier compatible.
                  </p>
                </div>

                {/* Field 2: Product Name */}
                <div>
                  <label htmlFor="product-name" className="block text-xs font-mono font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                    Product to Sell
                  </label>
                  <input
                    id="product-name"
                    type="text"
                    placeholder="e.g. Porsche 911"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-100 placeholder-slate-600 text-sm transition-all font-medium"
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    The item this dynamic AI psychologist salesman must focus on selling you.
                  </p>
                </div>

                {/* Field 3: Voice Selection (Extra Flavor) */}
                <div>
                  <label htmlFor="voice-select" className="block text-xs font-mono font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                    Salesman Character Voice
                  </label>
                  <select
                    id="voice-select"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-300 text-sm transition-all"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} &mdash; {v.vibe}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Save LocalStorage option */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="save-settings"
                    type="checkbox"
                    checked={saveSettings}
                    onChange={(e) => setSaveSettings(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="save-settings" className="text-xs text-slate-400 cursor-pointer select-none">
                    Remember API key & product locally on this browser
                  </label>
                </div>

                {/* Connect trigger */}
                <button
                  onClick={startSalesSession}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white py-3.5 px-6 rounded-xl font-medium tracking-tight flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <PhoneCall className="w-4 h-4" />
                  Start Sales Pitch &ldquo;Call&rdquo;
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE 2: CONNECTING / ATTEMPTING HANDSHAKE */}
          {callStatus === "connecting" && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900/50 border border-slate-900/80 p-10 rounded-2xl shadow-2xl text-center flex flex-col items-center justify-center min-h-[350px]"
            >
              <div className="relative w-48 h-48 mb-8 flex items-center justify-center">
                <canvas ref={canvasRef} width={220} height={220} className="absolute inset-0" />
                <div className="relative bg-slate-950 w-24 h-24 rounded-full flex items-center justify-center border border-amber-500/20 shadow-xl">
                  <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
              </div>

              <h3 className="text-xl font-display font-medium text-white tracking-tight animate-pulse">
                Initiating Session...
              </h3>
              <p className="text-sm text-slate-400 mt-2 max-w-xs leading-relaxed">
                Connecting to Gemini Flash Live services. Please allow microphone access if prompted.
              </p>
              
              <button
                onClick={handleEndCall}
                className="mt-8 text-xs font-mono tracking-wider uppercase text-slate-500 hover:text-slate-300 transition-colors py-2 px-4 rounded border border-slate-800 hover:bg-slate-900 cursor-pointer"
              >
                Cancel Call
              </button>
            </motion.div>
          )}

          {/* STATE 3: ACTIVE CONVERSATION */}
          {callStatus === "active" && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-3xl flex flex-col md:flex-row gap-6 items-stretch"
            >
              {/* Call Stage (Left Column) */}
              <div className="flex-1 bg-slate-900/50 border border-slate-900/80 p-8 rounded-2xl flex flex-col justify-between items-center text-center relative overflow-hidden min-h-[420px]">
                {/* Strategic Badge */}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4 self-center">
                  <Brain className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400 tracking-wider uppercase font-medium">
                    Salesman: Dynamic Psychology Mode
                  </span>
                </div>

                {/* Pulse Visualizer Ring */}
                <div className="relative w-56 h-56 my-4 flex items-center justify-center">
                  <canvas ref={canvasRef} width={260} height={260} className="absolute inset-0" />
                  <div className="relative bg-slate-950 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-2xl border border-slate-800">
                    {activeSpeaker === "salesman" ? (
                      <Volume2 className="w-8 h-8 text-emerald-400 animate-pulse" />
                    ) : activeSpeaker === "customer" ? (
                      <Volume2 className="w-8 h-8 text-sky-400 animate-pulse" />
                    ) : (
                      <VolumeX className="w-8 h-8 text-slate-600" />
                    )}
                    <span className="text-[10px] font-mono text-slate-500 mt-2 tracking-wide uppercase">
                      {activeSpeaker === "salesman" ? "Pitching" :
                       activeSpeaker === "customer" ? "You" : "Listening"}
                    </span>
                  </div>
                </div>

                {/* Dialogue Prompt */}
                <div className="max-w-xs mt-4">
                  <h4 className="text-base font-display font-medium text-white leading-tight">
                    Pitching You: {productName}
                  </h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Objections? Skepticism? Push back! He is analyzing your traits to close the deal.
                  </p>
                </div>

                {/* Hang up controller */}
                <button
                  onClick={handleEndCall}
                  className="mt-6 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white py-3 px-6 rounded-xl font-medium tracking-tight flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  End Pitch Call
                </button>
              </div>

              {/* Live Status & Subtitles (Right Column) */}
              <div className="w-full md:w-80 bg-slate-900/30 border border-slate-900/60 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    Live Activity feed
                  </h3>
                  
                  <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
                    {transcripts.length === 0 ? (
                      <div className="py-8 text-center text-slate-600 text-xs italic">
                        No verbal exchange transcribed yet. Talk into your mic to initiate conversation...
                      </div>
                    ) : (
                      transcripts.map((t) => (
                        <div key={t.id} className="text-xs leading-relaxed border-b border-slate-900/80 pb-3 last:border-none">
                          <span className={`font-mono uppercase tracking-wider font-semibold block mb-0.5 ${
                            t.sender === "Salesman" ? "text-emerald-400" : "text-sky-400"
                          }`}>
                            {t.sender}
                          </span>
                          <p className="text-slate-300">{t.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Strategy overview */}
                <div className="mt-6 pt-4 border-t border-slate-900">
                  <div className="flex gap-2.5 items-start p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-400 leading-normal">
                      <strong>Psychology Mode:</strong> The salesman responds dynamically. He is designed to hear and counter any pricing concerns, skepticism, or needs automatically. Say "deal" or "I'll buy it" to complete.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE 4: ERROR STATE */}
          {callStatus === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900/60 border border-slate-900 p-8 rounded-2xl shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-display font-semibold text-white tracking-tight">
                Pitch Session Failed
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                {errorMessage || "We couldn't connect or establish the live call with the salesman."}
              </p>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => setCallStatus("idle")}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-4 rounded-xl text-sm font-medium transition-all cursor-pointer"
                >
                  Adjust Key or Product
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE 5: DEAL CLOSED (VICTORY!) */}
          {callStatus === "closed" && dealClosedData && (
            <motion.div
              key="closed"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.15 }}
              className="w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/30 shadow-2xl shadow-emerald-950/20 p-8 rounded-3xl relative"
            >
              {/* Crown Badge */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-mono text-[10px] uppercase font-bold tracking-widest px-4 py-1.5 rounded-full shadow-lg shadow-emerald-500/20 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                Deal Closed Successfully
              </div>

              <div className="text-center mt-4 mb-8">
                <h2 className="text-4xl font-display font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 animate-pulse">
                  CONGRATULATIONS!
                </h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  The salesman has successfully closed the deal. Here is the receipt and psychological debrief.
                </p>
              </div>

              {/* Master Sales Invoice Agreement */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Product Sold</span>
                  <span className="text-base font-display font-semibold text-white mt-1 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-400 shrink-0" />
                    {productName}
                  </span>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Acquired By</span>
                  <span className="text-base font-display font-semibold text-white mt-1 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-sky-400 shrink-0" />
                    {dealClosedData.customerName}
                  </span>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Agreed Value</span>
                  <span className="text-base font-display font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                    {dealClosedData.agreedPrice}
                  </span>
                </div>
              </div>

              {/* Psychological Debrief Dossier */}
              <div className="bg-indigo-950/20 border border-indigo-900/30 p-6 rounded-2xl mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                    Strategic Sales Psychology Debrief
                  </h3>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed font-sans space-y-3">
                  <p className="bg-slate-950/40 p-4 rounded-xl border border-indigo-950 text-xs text-indigo-200 italic leading-relaxed">
                    &ldquo;{dealClosedData.psychologicalProfile}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-4 text-[11px] text-slate-500">
                  <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                  <span>The custom persuasion tactics were synthesized and executed on-the-fly.</span>
                </div>
              </div>

              {/* Restart controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setCallStatus("idle")}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white py-3.5 px-6 rounded-xl font-medium tracking-tight flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  Pitch Another Customer / Product
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Modern Minimal Footer */}
      <footer className="border-t border-slate-900 py-6 px-6 bg-slate-950 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4 relative z-10">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
          <span>Worlds Best Digital Salesman Prototype</span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://ai.google.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <Info className="w-3.5 h-3.5" />
            Gemini Multimodal Live API
          </a>
        </div>
      </footer>
    </div>
  );
}
