const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Ключ берется из переменных окружения Render, а не из кода!
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const response = await axios.post(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    'scope=GIGACHAT_API_PERS',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': crypto.randomUUID(),
        'Authorization': 'Basic ' + GIGACHAT_AUTH_KEY
      }
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_at * 1000) - 60000;
  return cachedToken;
}

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const token = await getAccessToken();

    const chatResponse = await axios.post(
      'https://api.giga.chat/v1/chat/completions',
      {
        model: 'GigaChat',
        messages: [
          { role: 'system', content: 'Ты полезный и дружелюбный помощник. Отвечай кратко и по делу.' },
          { role: 'user', content: message }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      }
    );

    res.json({ reply: chatResponse.data.choices[0].message.content });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка на сервере прокси' });
  }
});

// Render сам подставит нужный порт, не меняй эту строку
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));