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

// fallback inteligente (quando o aluno foge do script)
async function aiFallback(message) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content:
            "You are a friendly English tutor. Reply briefly and guide the student back to the lesson.",
        },
        { role: "user", content: message },
      ],
    });

    return completion.choices[0]?.message?.content || "";
  } catch {
    return "Let's continue the lesson 🙂";
  }
}

// ================= HELPERS =================
function cleanName(text) {
  return text.replace(/my name is/i, "").trim();
}

function isShort(text) {
  return text.length < 2;
}

function looksLikePhone(text) {
  return /[0-9]/.test(text);
}

// ================= EXPRESS =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("Highlands server is running");
});

// ================= TWILIO WEBHOOK =================
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
    // ================= RESET =================
    if (incoming.toLowerCase() === "lesson 1") {
      state.step = 1;
      state.name = "";
      state.surname = "";

      reply = "Hello. What is your name?";
    }

    // ================= STEP 1 — NAME =================
    else if (state.step === 1) {
      if (isShort(incoming)) {
        reply = "Please tell me your name 🙂";
      } else {
        state.name = cleanName(incoming);
        state.step = 2;

        reply = `Nice to meet you, ${state.name}. How are you today?`;
      }
    }

    // ================= STEP 2 — HOW ARE YOU =================
    else if (state.step === 2) {
      state.step = 3;
      reply = "Good. What is your name?";
    }

    // ================= STEP 3 — NAME STRUCTURE =================
    else if (state.step === 3) {
      state.step = 4;
      reply = `Good. My name is James. What is my name?`;
    }

    // ================= STEP 4 — CONTEXT (HIS) =================
    else if (state.step === 4) {
      state.step = 5;
      reply = "This is John. He is a student. What is his name?";
    }

    // ================= STEP 5 — CONTEXT (HER) =================
    else if (state.step === 5) {
      state.step = 6;
      reply = "Good. This is Anna. She is a teacher. What is her name?";
    }

    // ================= STEP 6 — SURNAME =================
    else if (state.step === 6) {
      state.step = 7;
      reply = "What is your surname?";
    }

    // ================= STEP 7 — SURNAME STRUCTURE =================
    else if (state.step === 7) {
      state.surname = incoming;
      state.step = 8;

      reply = "My surname is Smith. What is my surname?";
    }

    // ================= STEP 8 — PHONE =================
    else if (state.step === 8) {
      state.step = 9;
      reply = "What is your phone number?";
    }

    // ================= STEP 9 — PHONE VALIDATION =================
    else if (state.step === 9) {
      if (!looksLikePhone(incoming)) {
        reply = "Please use numbers 🙂";
      } else {
        state.step = 10;
        reply =
          "Good. When you meet someone, you say: nice to meet you. What do you say?";
      }
    }

    // ================= STEP 10 — POLITE =================
    else if (state.step === 10) {
      state.step = 11;
      reply = "Good. Are you Mr, Mrs, or Miss?";
    }

    // ================= STEP 11 — TITLES =================
    else if (state.step === 11) {
      state.step = 12;
      reply = "Good. Am I Mr Smith?";
    }

    // ================= FINAL =================
    else if (state.step === 12) {
      state.step = 999;

      reply =
        "Excellent. Lesson complete 🎉 Type 'Lesson 1' to restart.";
    }

    // ================= FALLBACK =================
    else {
      reply = await aiFallback(incoming);
    }

    // ================= SEND =================
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
  console.log(`Highlands server running on port ${PORT}`);
});
