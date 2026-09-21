require('dotenv').config();
const { createClient } = require('redis');

(async () => {
  const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000 } });
  client.on('error', (err) => console.log('Error:', err.message));
  await client.connect();
  const cached = await client.get('earthquakes:all_day');
  console.log('Cached length:', cached?.length);
  const parsed = JSON.parse(cached || '[]');
  console.log('Events:', parsed.length);
  if (parsed.length > 0) console.log('First:', JSON.stringify(parsed[0]).slice(0, 200));
  await client.quit();
})();