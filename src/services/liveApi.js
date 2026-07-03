// Service class managing WebSocket integration with Gemini Live API

export class GeminiLiveSession {
  /**
   * @param {Object} params
   * @param {string} params.apiKey
   * @param {string} params.productName
   * @param {string} params.voiceName
   * @param {function} params.onSetupComplete
   * @param {function} [params.onAudioChunk]
   * @param {function} [params.onTranscript]
   * @param {function} [params.onInterrupted]
   * @param {function} [params.onCloseDeal]
   * @param {function} [params.onError]
   * @param {function} [params.onClose]
   */
  constructor({
    apiKey,
    productName,
    voiceName,
    onSetupComplete,
    onAudioChunk,
    onTranscript,
    onInterrupted,
    onCloseDeal,
    onError,
    onClose
  }) {
    this.apiKey = apiKey;
    this.productName = productName;
    this.voiceName = voiceName || "Puck";
    // Force the default 3.1 flash live model as requested
    this.modelName = "models/gemini-3.1-flash-live-preview";

    this.onSetupComplete = onSetupComplete;
    this.onAudioChunk = onAudioChunk;
    this.onTranscript = onTranscript;
    this.onInterrupted = onInterrupted;
    this.onCloseDeal = onCloseDeal;
    this.onError = onError;
    this.onClose = onClose;

    this.socket = null;
  }

  /**
   * Establish WebSocket connection and send BidiGenerateContentSetup payload
   */
  connect() {
    try {
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey)}`;
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        const prompt = `You are the world's absolute best, most psychologically sophisticated, and emotionally intelligent digital salesman.
Your sole mission is to sell "${this.productName}" to the customer you are in a live phone conversation with.

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
            model: this.modelName,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: this.voiceName
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

        this.socket.send(JSON.stringify(setupMsg));
      };

      this.socket.onmessage = async (event) => {
        try {
          let rawData = event.data;
          if (rawData instanceof Blob) {
            rawData = await rawData.text();
          } else if (rawData instanceof ArrayBuffer) {
            const decoder = new TextDecoder('utf-8');
            rawData = decoder.decode(rawData);
          }
          const response = JSON.parse(rawData);

          // A: Handshake completion
          if (response.setupComplete) {
            if (this.onSetupComplete) this.onSetupComplete();
            return;
          }

          // B: Interrupted
          if (response.serverContent?.interrupted) {
            if (this.onInterrupted) this.onInterrupted();
            return;
          }

          // C: Incoming audio and transcript
          const parts = response.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                if (this.onAudioChunk) this.onAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                if (this.onTranscript) this.onTranscript(part.text);
              }
            }
          }

          // D: Tool Close Deal interceptor
          const functionCalls = response.toolCall?.functionCalls;
          if (functionCalls) {
            for (const call of functionCalls) {
              if (call.name === "closeDeal") {
                const args = call.args;
                // Confirm tool receipt to seal transaction
                this.sendToolResponse("closeDeal", call.id, { success: true });
                if (this.onCloseDeal) this.onCloseDeal(args);
              }
            }
          }

        } catch (err) {
          console.error("Websocket payload decode error", err);
        }
      };

      this.socket.onerror = (e) => {
        if (this.onError) this.onError(e);
      };

      this.socket.onclose = (event) => {
        if (this.onClose) this.onClose(event);
      };

    } catch (err) {
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Stream a raw PCM audio chunk to the channel
   * @param {string} base64Audio
   */
  sendAudioChunk(base64Audio) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio
          }]
        }
      }));
    }
  }

  /**
   * Send a function response back to the socket
   * @param {string} functionName
   * @param {string} callId
   * @param {Object} outputObj
   */
  sendToolResponse(functionName, callId, outputObj) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        toolResponse: {
          functionResponses: [{
            name: functionName,
            response: { output: outputObj },
            id: callId
          }]
        }
      }));
    }
  }

  /**
   * Safely tear down active WebSocket link
   */
  close() {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
  }
}
