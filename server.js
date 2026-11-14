process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Ключ берется из переменных окружения Layero
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY;

let cachedToken = null;
let tokenExpiry = 0;

// Функция для получения токена
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

// Проверка, что сервер жив (для Layero)
app.get('/', (req, res) => {
  res.send('Proxy is running');
});

// Основной эндпоинт для чата
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const token = await getAccessToken();

    // Добавляем системный промпт в начало истории
    const fullMessages = [
      {
        role: 'system',
        content: `Ты — строгий, но добрый учитель русского языка. Твоя цель — помогать школьникам учиться, а не делать домашнюю работу за них.
        
        Твои правила:
        1. Если ученик спрашивает правило, объясняй его простыми словами, приводи примеры. Если правило сложное (например, "н и нн"), разбей объяснение на шаги.
        2. Если ученик просит задание, придумай интересное упражнение (найди ошибку в тексте, вставь пропущенные буквы, определи часть речи).
        3. Когда ученик присылает ответ на задание, ОБЯЗАТЕЛЬНО проверь его. Если есть ошибки, не просто пиши "неверно", а объясни, какое правило было нарушено и как правильно.
        4. Не пиши готовые сочинения или изложения. Вместо этого предложи план, накидай идеи или помоги исправить уже написанное.
        5. Будь вежливым, используй педагогический тон. Хвали за правильные ответы, но мягко указывай на ошибки.
        6. Если вопрос не по теме русского языка, вежливо скажи, что ты помогаешь только с русским языком.`
      },
      ...messages
    ];

    const chatResponse = await axios.post(
      'https://api.giga.chat/v1/chat/completions',
      {
        model: 'GigaChat-2-Pro', // Умная модель
        messages: fullMessages
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

// Запуск сервера на правильном порту и адресе (важно для Layero!)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
