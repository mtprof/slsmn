import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace the single API key block with 3 blocks
replacement = """
          <!-- Field 1: LiveKit URL -->
          <div>
            <label for="input-livekit-url" class="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">
              LiveKit WebSocket URL
            </label>
            <input
              id="input-livekit-url"
              type="text"
              placeholder="wss://your-project.livekit.cloud"
              class="w-full px-4 py-3 bg-neutral-900/40 border border-neutral-900 hover:border-neutral-800 focus:border-neutral-700 focus:outline-none text-white placeholder-neutral-700 text-xs rounded-lg transition-all font-mono"
            />
          </div>
          
          <!-- Field 2: LiveKit API Key -->
          <div>
            <label for="input-livekit-key" class="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">
              LiveKit API Key
            </label>
            <input
              id="input-livekit-key"
              type="text"
              placeholder="devkey"
              class="w-full px-4 py-3 bg-neutral-900/40 border border-neutral-900 hover:border-neutral-800 focus:border-neutral-700 focus:outline-none text-white placeholder-neutral-700 text-xs rounded-lg transition-all font-mono"
            />
          </div>
          
          <!-- Field 3: LiveKit API Secret -->
          <div>
            <label for="input-livekit-secret" class="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">
              LiveKit API Secret
            </label>
            <input
              id="input-livekit-secret"
              type="password"
              placeholder="secret"
              class="w-full px-4 py-3 bg-neutral-900/40 border border-neutral-900 hover:border-neutral-800 focus:border-neutral-700 focus:outline-none text-white placeholder-neutral-700 text-xs rounded-lg transition-all font-mono"
            />
          </div>
"""

pattern = r'<!-- Field 1: API Key -->.*?</div>'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
