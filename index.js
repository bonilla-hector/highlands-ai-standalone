import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
const PORT = process.env.PORT || 3000;

// ================= STATE =================
const userState = {};

// ================= OPENAI =================
if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================= AI CORRECTION =================
async function correctAndRespond(userInput, instruction) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: `
You are a friendly British English tutor.

Your job:
1. If the student's sentence has a mistake → correct it naturally
2. If correct → briefly acknowledge
3. Continue the lesson based on instruction

RULES:
- Keep it VERY short (1–2 sentences)
- Be natural (like WhatsApp)
- No explanations
- No grammar terms

Examples:
Student: I fine
Reply: I'm fine 🙂 Good. (continue)

Student: My name is John
Reply: Nice 🙂 (continue)
`,
        },
        {
          role: "user",
          content: `Student: "${userInput}" \nNext step: ${instruction}`,
        },
      ],
    });

    return completion.choices[0]?.message?.content || "";
  } catch (err) {
    console.error("AI error:", err.message);
    return instruction;
  }
}

// ================= EXPRESS =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("Highlands server running");
});

// ================= TWILIO =================
app.post("/webhook/twilio", async (req, res) => {
  const incoming = (req.body.Body || "").trim();
  const userId = req.body.From;

  if (!userState[userId]) {
    userState[userId] = {
      step: 0,
      name: "",
      surname: "",
    };
  }

  const state = userState[userId];
  let reply = "";

  try {
    // ================= START =================
    if (incoming.toLowerCase() === "lesson 1") {
      state.step = 1;
      state.name = "";
      state.surname = "";

      reply = "Great! Let's start Lesson 1 🙂\n\nWhat's your name?";
    }

    // ================= STEP 1 — NAME =================
    else if (state.step === 1) {
      state.name = incoming.replace(/my name is/i, "").trim();
      state.step = 2;

      reply = `Nice to meet you, ${state.name}. How are you today?`;
    }

    // ================= STEP 2 — HOW ARE YOU =================
    else if (state.step === 2) {
      state.step = 3;

      reply = await correctAndRespond(
        incoming,
        "Say: Good. This is John. He is a student. What is his name?"
      );
    }

    // ================= STEP 3 — HIS =================
    else if (state.step === 3) {
      state.step = 4;

      reply = await correctAndRespond(
        incoming,
        "Say: Good. This is Anna. She is a teacher. What is her name?"
      );
    }

    // ================= STEP 4 — HER =================
    else if (state.step === 4) {
      state.step = 5;

      reply = await correctAndRespond(
        incoming,
        "Ask: What is your surname?"
      );
    }

    // ================= STEP 5 — SURNAME =================
    else if (state.step === 5) {
      state.surname = incoming;
      state.step = 6;

      reply = await correctAndRespond(
        incoming,
        "Say: My surname is Smith. What is my surname?"
      );
    }

    // ================= STEP 6 =================
    else if (state.step === 6) {
      state.step = 7;

      reply = await correctAndRespond(
        incoming,
        "Ask: What is your phone number?"
      );
    }

    // ================= STEP 7 =================
    else if (state.step === 7) {
      state.step = 8;

      reply = await correctAndRespond(
        incoming,
        "Say: Good 🙂 When you meet someone, you say 'nice to meet you'. What do you say?"
      );
    }

    // ================= STEP 8 =================
    else if (state.step === 8) {
      state.step = 9;

      reply = await correctAndRespond(
        incoming,
        "Ask: Are you Mr, Mrs, or Miss?"
      );
    }

    // ================= STEP 9 =================
    else if (state.step === 9) {
      state.step = 10;

      reply = await correctAndRespond(
        incoming,
        "Ask: Am I Mr Smith?"
      );
    }

    // ================= FINAL =================
    else {
      reply = "Excellent 🎉 Lesson complete. Type 'Lesson 1' to restart.";
    }

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);

    return res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error(err);

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Something went wrong. Please try again.");

    return res.type("text/xml").send(twiml.toString());
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
