import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
const PORT = process.env.PORT || 3000;

const userState = {};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================= NORMALIZADOR =================
const normalize = (text) =>
  text.toLowerCase().replace(/[^\w\s]/g, "").trim();

// ================= VALIDAÇÃO FORTE =================
function checkAnswer(input, validAnswers) {
  const cleaned = normalize(input);
  return validAnswers.some((ans) => cleaned === normalize(ans));
}

// ================= IA (fallback leve) =================
async function aiCheck(input, correct) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 40,
      messages: [
        {
          role: "system",
          content:
            "Say CORRECT or give the corrected sentence only. No explanation.",
        },
        {
          role: "user",
          content: `Student: ${input} | Correct: ${correct}`,
        },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text || text.toUpperCase().includes("CORRECT")) return null;
    return text;
  } catch {
    return null;
  }
}

// ================= EXPRESS =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) => {
  res.send("Server running");
});

// ================= TWILIO =================
app.post("/webhook/twilio", async (req, res) => {
  const incoming = (req.body.Body || "").trim();
  const userId = req.body.From;

  if (!userState[userId]) {
    userState[userId] = { step: 0, name: "" };
  }

  const state = userState[userId];
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    // ===== START =====
    if (incoming.toLowerCase() === "lesson 1") {
      state.step = 1;
      state.name = "";

      twiml.message("Hello 🙂 Ready? Let’s begin Lesson 1.");
      twiml.message("What’s your name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 1 =====
    if (state.step === 1) {
      state.name = incoming.replace(/my name is/i, "").trim();
      state.step = 2;

      twiml.message(`Nice to meet you, ${state.name}.`);
      twiml.message("How are you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 2 =====
    if (state.step === 2) {
      const valid = [
        "i am fine",
        "im fine",
        "i'm fine",
        "fine",
      ];

      if (!checkAnswer(incoming, valid)) {
        const aiCorrection = await aiCheck(incoming, "I'm fine.");
        const correction = aiCorrection || "I'm fine.";

        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 3;
      twiml.message("Good 🙂");
      twiml.message("This is John. He is a student. What is his name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 3 =====
    if (state.step === 3) {
      const valid = ["his name is john"];

      if (!checkAnswer(incoming, valid)) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ His name is John.`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 4;
      twiml.message("Good 🙂");
      twiml.message("This is Anna. She is a teacher. What is her name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 4 =====
    if (state.step === 4) {
      const valid = ["her name is anna"];

      if (!checkAnswer(incoming, valid)) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ Her name is Anna.`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 5;
      twiml.message("Good 🙂");
      twiml.message("What is your surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 5 =====
    if (state.step === 5) {
      state.step = 6;

      twiml.message("Good 🙂");
      twiml.message("My surname is Smith. What is my surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 6 =====
    if (state.step === 6) {
      const valid = ["your surname is smith"];

      if (!checkAnswer(incoming, valid)) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ Your surname is Smith.`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 7;
      twiml.message("Good 🙂");
      twiml.message("What is your phone number?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 7 =====
    if (state.step === 7) {
      state.step = 8;

      twiml.message("Good 🙂");
      twiml.message("When you meet someone, you say: nice to meet you. What do you say?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 8 =====
    if (state.step === 8) {
      const valid = ["nice to meet you"];

      if (!checkAnswer(incoming, valid)) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ Nice to meet you.`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 9;
      twiml.message("Good 🙂");
      twiml.message("Are you Mr, Mrs, or Miss?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 9 =====
    if (state.step === 9) {
      state.step = 10;

      twiml.message("Good 🙂");
      twiml.message("Am I Mr Smith?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== FINAL =====
    twiml.message("Excellent 🎉 Lesson complete. Type 'Lesson 1' to restart.");
    return res.type("text/xml").send(twiml.toString());

  } catch (err) {
    console.error(err);
    twiml.message("Something went wrong.");
    return res.type("text/xml").send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
