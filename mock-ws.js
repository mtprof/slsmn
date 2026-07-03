const http = require('http');
const crypto = require('crypto');
const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});
server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
               'Upgrade: websocket\r\n' +
               'Connection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.on('data', buffer => {
    // Basic decode of websocket frame
    const len = buffer[1] & 127;
    const maskStart = len === 126 ? 4 : (len === 127 ? 10 : 2);
    const dataStart = maskStart + 4;
    const mask = buffer.slice(maskStart, dataStart);
    let decoded = '';
    for (let i = 0; i < buffer.length - dataStart; i++) {
      decoded += String.fromCharCode(buffer[dataStart + i] ^ mask[i % 4]);
    }
    console.log("RECEIVED:", decoded);
  });
});
server.listen(8080, () => console.log('Mock WS listening on 8080'));
