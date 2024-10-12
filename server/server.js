import express from "express";
import * as dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from "path";
import mongoose from "mongoose";
import multer from "multer";
import mammoth from "mammoth";
import axios from "axios";

const __dirname = path.resolve();
dotenv.config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  userId: String,
  chats: [{
    role: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }]
});

const FileSchema = new mongoose.Schema({
  userId: String,
  fileType : String,
  fileContent: String
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', FileSchema)
const MODEL_NAME = 'gemini-pro';
const API_KEY = process.env.API_KEY;

async function runChat(userInput, userId) {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const generationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 1000,
  };

  const initialMessage = {
    role: "user",
    parts: [{
      text: `
        You are an educational chatbot for science (college students).
        You provide resources about every piece of information you give.
        You are only allowed to provide information related to science.
        If You get asked about anything but not science don't answer and say your not allowed to.
        Try to response with short answers if possible.
        Your not allowed to say bad words or anything not related to science.
        If you get asked hi answer with short answers.
      `
    }]
  };
  const parts = {
      role: "model",
      parts: [{ text: "Hello I am your assistant with science. How can I help you?"}],
  }

  let userChats = [];
  const user = await User.findOne({ userId });

  if (user) {
    userChats = user.chats.map(chat => ({
      role: chat.role,
      parts: [{ text: chat.message }]
    }));
  }

  const chat = model.startChat({
    generationConfig,
    history: [...userChats, initialMessage, parts],
  });

  const result = await chat.sendMessage(userInput);
  const responseText = result.response.text();

  if (!user) {
    await User.create({ userId, chats: [{ role: "user", message: userInput }, { role: "model", message: responseText }] });
  } else {
    user.chats.push({ role: "user", message: userInput });
    user.chats.push({ role: "model", message: responseText });
    await user.save();
  }

  return responseText;
}

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'client')));

app.post("/chats", async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    if (!prompt || !userId) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const secondPrompt = prompt.toLowerCase();

    if (secondPrompt.trim() === `/delete data ${userId}`) {
      await User.findOneAndDelete({ userId });
      return res.json({ response: `All data with user ID: ${userId} has been deleted!` });
    } else if (secondPrompt.trim() === "/delete data") {
      return res.json({ response: 'Please provide the user ID. You can use /my id to get your id.' });
    } else if(secondPrompt.trim() === '/my id') {
      return res.json({ response: `Your User id is: ${userId}` });
    }

    const response = await runChat(prompt, userId);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/chat-history/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findOne({ userId });
    if (!user) return res.json({ chats: [] });

    const chats = user.chats.map(chat => ({
      role: chat.role,
      message: chat.message
    }));

    res.json({ chats });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads'); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

app.post('/upload/:userId', upload.single('file'), async (req, res) => {
  const userId = req.params.userId;
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = req.file.path;

  if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    mammoth.extractRawText({ path: filePath })
      .then(async result => {
        res.status(200).json({ message: 'File uploaded successfully', content: result.value });
        const data = await File.findOne({userId : userId})
        if(!data) {
          File.create({
            userId : userId,
            fileType: req.file.filename,
            fileContent : result.value
          })
          return
        }
      })
      .catch(err => {
        console.error('Error reading docx file:', err);
        res.status(500).json({ message: 'Error reading file' });
      });
  } else {
    res.status(200).json({ message: 'File uploaded successfully' });
  }
});

app.listen(5000, () => console.log("Server is running on port http://localhost:5000"));
