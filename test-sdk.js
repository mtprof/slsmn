const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: 'fake', httpOptions: { baseUrl: 'ws://localhost:8080' } });

async function run() {
  const session = await ai.models.generateContentStream({
    model: 'models/gemini-3.1-flash-live-preview',
    contents: 'hi',
  });
  console.log(session);
}
run();
