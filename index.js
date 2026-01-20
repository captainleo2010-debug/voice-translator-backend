require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ENV
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Health check
app.get('/', (req, res) => {
  res.send('Voice translator backend running');
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on('translate_and_speak', async (data) => {
    const { roomId, text, fromLang, toLang } = data;
    console.log('translate_and_speak:', data);
    try {
      const translated = await translateWithGroq(text, fromLang, toLang);
      const audioBuffer = await ttsWithElevenLabs(translated);
      const base64Audio = audioBuffer.toString('base64');

      socket.to(roomId).emit('play_audio', {
        audio: base64Audio,
        textOriginal: text,
        textTranslated: translated,
        fromLang,
        toLang
      });
    } catch (err) {
      console.error('Error in translate_and_speak:', err.response?.data || err.message);
      socket.emit('error_message', 'Translation or TTS failed');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Groq translation function
async function translateWithGroq(text, fromLang, toLang) {
  const prompt = `Translate this from ${fromLang} to ${toLang}. Only return the translated text.\n\nText: """${text}"""`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'mixtral-8x7b-32768',
      messages: [
        { role: 'system', content: 'You are a translation assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 256
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const translated = response.data.choices[0].message.content.trim();
  console.log('Translated:', translated);
  return translated;
}

// ElevenLabs TTS function
async function ttsWithElevenLabs(text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8
      }
    },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    }
  );

  return Buffer.from(response.data);
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
