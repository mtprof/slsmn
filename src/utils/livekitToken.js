import { SignJWT } from 'https://esm.sh/jose@6.2.3';

export async function generateLiveKitToken(apiKey, apiSecret, roomName, participantName, metadata = '') {
  const secret = new TextEncoder().encode(apiSecret);
  
  const claims = {
    video: {
      room: roomName,
      roomJoin: true
    }
  };
  
  if (metadata) {
    claims.metadata = metadata;
  }
  
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(apiKey)
    .setSubject(participantName)
    .setExpirationTime('2h')
    .sign(secret);
    
  return token;
}
