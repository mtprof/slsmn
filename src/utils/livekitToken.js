import { SignJWT } from 'https://esm.sh/jose@6.2.3';

export async function generateLiveKitToken(apiKey, apiSecret, roomName, participantName) {
  const secret = new TextEncoder().encode(apiSecret);
  
  const token = await new SignJWT({
    video: {
      room: roomName,
      roomJoin: true
    }
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(apiKey)
    .setSubject(participantName)
    .setExpirationTime('2h')
    .sign(secret);
    
  return token;
}
