process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Проверяем, что токен есть и до истечения осталось больше 60 секунд
  if (cachedToken && Date.now() < (tokenExpiry - 60000)) {
    return cachedToken;
  }

  console.log('Получаем новый токен GigaChat...');
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
  // expires_at приходит в миллисекундах
  tokenExpiry = response.data.expires_at; 
  console.log('Новый токен получен. Истекает:', new Date(tokenExpiry).toLocaleString());
  return cachedToken;
}

app.get('/', (req, res) => {
  res.send('Proxy is running');
});

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    let token = await getAccessToken();

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

    // Функция для отправки запроса в GigaChat
    const sendToGigaChat = async (accessToken) => {
      return await axios.post(
        'https://api.giga.chat/v1/chat/completions',
        {
          model: 'GigaChat-2-Pro',
          messages: fullMessages
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
          }
        }
      );
    };

    let chatResponse;
    try {
      chatResponse = await sendToGigaChat(token);
    } catch (error) {
      // Если GigaChat ответил 401 (токен протух), сбрасываем кэш и пробуем ещё раз
      if (error.response && error.response.status === 401) {
        console.log('Токен протух, обновляем и пробуем снова...');
        cachedToken = null; 
        tokenExpiry = 0;
        token = await getAccessToken(); // Получаем новый
        chatResponse = await sendToGigaChat(token); // Повторяем запрос
      } else {
        throw error; // Если ошибка другая — пробрасываем дальше
      }
    }

    res.json({ reply: chatResponse.data.choices[0].message.content });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка на сервере прокси' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
