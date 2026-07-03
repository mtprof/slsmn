import re

with open('src/main.js', 'r') as f:
    content = f.read()

# Replace imports
import_replacement = """// Modern Vanilla JS Controller for the AI Salesman Live Prototype
import { drawVisualizer } from "./utils/visualizer.js?v=5";
import { generateLiveKitToken } from "./utils/livekitToken.js";
import { Room, RoomEvent, createLocalAudioTrack, Track } from "livekit-client";
"""
content = re.sub(r'// Modern Vanilla JS Controller.*?(?=document\.addEventListener)', import_replacement, content, flags=re.DOTALL)

# Replace input IDs
content = content.replace('const inputApiKey = document.getElementById("input-api-key");', 
                          'const inputLivekitUrl = document.getElementById("input-livekit-url");\n  const inputLivekitKey = document.getElementById("input-livekit-key");\n  const inputLivekitSecret = document.getElementById("input-livekit-secret");')
content = content.replace('let apiKey = localStorage.getItem("gemini_sales_api_key") || "";',
                          'let lkUrl = localStorage.getItem("lk_url") || "";\n  let lkKey = localStorage.getItem("lk_key") || "";\n  let lkSecret = localStorage.getItem("lk_secret") || "";')
content = content.replace('if (inputApiKey) inputApiKey.value = apiKey;',
                          'if (inputLivekitUrl) inputLivekitUrl.value = lkUrl;\n  if (inputLivekitKey) inputLivekitKey.value = lkKey;\n  if (inputLivekitSecret) inputLivekitSecret.value = lkSecret;')

content = content.replace('localStorage.setItem("gemini_sales_api_key", apiKey);',
                          'localStorage.setItem("lk_url", lkUrl);\n      localStorage.setItem("lk_key", lkKey);\n      localStorage.setItem("lk_secret", lkSecret);')
content = content.replace('localStorage.removeItem("gemini_sales_api_key");',
                          'localStorage.removeItem("lk_url");\n      localStorage.removeItem("lk_key");\n      localStorage.removeItem("lk_secret");')


with open('src/main.js', 'w') as f:
    f.write(content)
