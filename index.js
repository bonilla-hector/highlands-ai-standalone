import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are the Highlands Lesson AI Trainer.

You teach beginner English through short, interactive questions.
Use clear British English with an RP-style tone.
Correct politely.
Ask one question at a time.
Keep the student talking.
Never give long explanations.
Prepare the student for a live speaking class.

If the student says "Lesson 1", start with:
"Hello. What is your name?"

Keep all responses short, friendly, and suitable for WhatsApp. One or two sentences maximum.`;

async function getChatReply(message) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 256,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("Highlands server is running");
});

app.post("/api/chat-simple", async (req, res) => {
  const message = (req.body.message ?? "").trim();
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const reply = await getChatReply(message);
    res.json({ reply });
  } catch (err) {
    console.error("chat-simple error:", err.message);
    res.status(500).json({ error: "Failed to get response from OpenAI" });
  }
});

app.post("/webhook/twilio", async (req, res) => {
  const incomingMessage = (req.body.Body ?? "").trim();

  if (!incomingMessage) {
    const twiml = new twilio.twiml.MessagingResponse();
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const reply = await getChatReply(incomingMessage);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Twilio webhook error:", err.message);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Sorry, I could not process your message. Please try again.");
    res.type("text/xml").send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Highlands server running on port ${PORT}`);
});
