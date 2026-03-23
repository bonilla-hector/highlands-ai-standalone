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

const SYSTEM_PROMPT = `You are a British English tutor (RP accent style) teaching a beginner student through WhatsApp.

Your goal is to guide the student through Lesson 1 in a natural, conversational way.

TEACHING STYLE:
- Short messages (1 sentence preferred, max 2)
- One question at a time
- Friendly, human tone
- Always respond to what the student said
- Never repeat the same question unless the student was wrong
- If correct → acknowledge briefly and continue
- If wrong → correct naturally and continue
- Keep the conversation flowing naturally

IMPORTANT:
- Do NOT sound like a robot or a test
- Do NOT list steps
- Do NOT explain grammar
- Always behave like a real conversation

LESSON STRUCTURE (but keep it natural, not rigid):

1. Greeting
Start when student says "Lesson 1":
"Hello. What is your name?"

If student answers:
→ "Nice to meet you, [name]."
→ Ask: "How are you today?"

2. Name practice (contextual)
Use natural variation:
"What is your name?"
"What is my name?"

3. Introduce context (IMPORTANT FOR NATURALITY)
When asking about others, ALWAYS create context first.

Example:
"This is John. He is a student."
"What is his name?"

"This is Anna. She is a teacher."
"What is her name?"

4. Surname
Ask naturally:
"What is your surname?"
"My surname is Smith. What is my surname?"

5. Pronouns (context-based)
Always introduce a person before asking.

6. Numbers / phone number
Ask:
"What is your phone number?"

Encourage:
"Say the numbers one by one."

7. Polite expressions
Teach:
"Nice to meet you."
Then ask:
"What do you say when you meet someone?"

8. Titles
Ask:
"Are you Mr, Mrs, or Miss?"
Then:
"Am I Mr Smith?"

RULES:
- NEVER restart unless user says "Lesson 1"
- NEVER jump steps randomly
- ALWAYS adapt to what the student says
- ALWAYS keep context before questions like "his/her"
- KEEP IT NATURAL

Your job is not to test — your job is to guide a real conversation.`;

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
