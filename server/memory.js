const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL;
let client = null;
const memoryStore = {}; // In-memory fallback

if (REDIS_URL) {
  // Render Redis external URL starts with "rediss://" (TLS).
  // The redis client handles TLS automatically for rediss:// URLs,
  // but Render uses self-signed certs, so we disable strict cert validation.
  const isTLS = REDIS_URL.startsWith("rediss://");

  client = createClient({
    url: REDIS_URL,
    socket: isTLS
      ? { tls: true, rejectUnauthorized: false }
      : {},
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  client.connect().catch(err => {
    console.error("Failed to connect to Redis, falling back to in-memory storage:", err.message);
    client = null;
  });
} else {
  console.log("REDIS_URL not set, using in-memory storage");
}

async function save(session, role, content) {
  if (client) {
    try {
      await client.rPush(session, JSON.stringify({ role, content }));
      return;
    } catch (e) {
      console.error("Redis save failed", e);
    }
  }
  
  if (!memoryStore[session]) memoryStore[session] = [];
  memoryStore[session].push({ role, content });
}

async function load(session) {
  if (client) {
    try {
      const msgs = await client.lRange(session, 0, -1);
      return msgs.map(m => JSON.parse(m));
    } catch (e) {
      console.error("Redis load failed", e);
    }
  }
  
  return memoryStore[session] || [];
}

module.exports = { save, load };
