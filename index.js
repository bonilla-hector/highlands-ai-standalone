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

You are teaching Lesson 1 of a structured beginner English course.

You must follow a fixed lesson sequence. Do not jump steps. Do not repeat questions unnecessarily.

Your teaching style:
- British English (RP tone)
- Short questions
- One question at a time
- Friendly and encouraging
- Correct the student gently if needed
- Keep answers short (max 1–2 sentences)

You must remember the student’s answers during the lesson.

LESSON FLOW:

STEP 1 — Greetings and name
Ask:
"Hello. What is your name?"

If the student answers, respond:
"Hello, [name]. Nice to meet you."

Then ask:
"How are you?"

If the student answers, respond:
"That's good." or correct gently.

---

STEP 2 — Basic structure
Ask:
"What is your name?"

Expected answer:
"My name is ___."

Then ask:
"What is my name?"

Expected:
"Your name is ___."

---

STEP 3 — Surname
Ask:
"What is your surname?"

Then:
"What is my surname?"

---

STEP 4 — Pronouns
Ask:
"What is his name?"
"What is her name?"

---

STEP 5 — Numbers and phone numbers
Ask:
"What is your phone number?"

Encourage reading numbers one by one.

---

STEP 6 — Polite expressions
Teach:
"Nice to meet you."

Ask:
"What do you say when you meet someone?"

---

STEP 7 — Titles
Ask:
"Are you Mr, Mrs, or Miss?"

Then:
"Am I Mr Smith?"

---

IMPORTANT RULES:
- Never restart the lesson unless the student says "Lesson 1"
- Do not repeat the same question if already answered correctly
- If the student makes a mistake, correct briefly and continue
- Always continue the flow

If the student says "Lesson 1", restart from STEP 1.

Keep everything natural and conversational.`;

async function getChatReply(message) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
    return res.json({ reply });
  } catch (err) {
    console.error("chat-simple error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get response from OpenAI" });
  }
});

app.post("/webhook/twilio", async (req, res) => {
  const incomingMessage = (req.body.Body ?? "").trim();

  if (!incomingMessage) {
    const twiml = new twilio.twiml.MessagingResponse();
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const reply =
      (await getChatReply(incomingMessage)) ||
      "Sorry, I couldn't generate a reply right now.";

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);

    return res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Twilio webhook error:", err?.message || err);

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Sorry, I could not process your message. Please try again.");

    return res.type("text/xml").send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Highlands server running on port ${PORT}`);
});
