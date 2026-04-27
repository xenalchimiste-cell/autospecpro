const fetch = require('node-fetch');
async function test() {
  const key = process.env.GROQ_API_KEY;
  if (!key) { console.log('No GROQ key'); return; }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/2021_Porsche_911_GT3_1.jpg/1200px-2021_Porsche_911_GT3_1.jpg' } }] }
      ]
    })
  });
  const data = await res.json();
  console.log(data);
}
test();
