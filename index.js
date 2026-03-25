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

// ================= AI EVALUATION =================
async function evaluateAnswer(userInput, expectedPattern, correctAnswer) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content: `
You are an English teacher.

Rules:
- If correct → reply ONLY: CORRECT
- If incorrect → reply ONLY with the correct sentence
- No explanations
- No extra text
`,
        },
        {
          role: "user",
          content: `
Student: "${userInput}"
Expected: ${expectedPattern}
Correct answer: ${correctAnswer}
`,
        },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim();

    if (!result || result.toUpperCase().includes("CORRECT")) {
      return { correct: true };
    }

    return { correct: false, correction: result };
  } catch (err) {
    console.error(err);
    return { correct: true };
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
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    // ========= START =========
    if (incoming.toLowerCase() === "lesson 1") {
      state.step = 1;
      state.name = "";
      state.surname = "";

      twiml.message("Great! Let's start Lesson 1 🙂");
      twiml.message("What's your name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 1 — NAME =========
    if (state.step === 1) {
      state.name = incoming.replace(/my name is/i, "").trim();
      state.step = 2;

      twiml.message(`Nice to meet you, ${state.name}.`);
      twiml.message("How are you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 2 — HOW ARE YOU =========
    if (state.step === 2) {
      const evalRes = await evaluateAnswer(
        incoming,
        "I am fine / I'm fine",
        "I'm fine."
      );

      if (!evalRes.correct) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${evalRes.correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 3;

      twiml.message("Good 🙂");
      twiml.message("This is John. He is a student. What is his name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 3 — HIS =========
    if (state.step === 3) {
      const evalRes = await evaluateAnswer(
        incoming,
        "His name is John",
        "His name is John."
      );

      if (!evalRes.correct) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${evalRes.correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 4;

      twiml.message("Good 🙂");
      twiml.message("This is Anna. She is a teacher. What is her name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 4 — HER =========
    if (state.step === 4) {
      const evalRes = await evaluateAnswer(
        incoming,
        "Her name is Anna",
        "Her name is Anna."
      );

      if (!evalRes.correct) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${evalRes.correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 5;

      twiml.message("Good 🙂");
      twiml.message("What is your surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 5 — SURNAME =========
    if (state.step === 5) {
      state.surname = incoming;
      state.step = 6;

      twiml.message("Good 🙂");
      twiml.message("My surname is Smith. What is my surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 6 =========
    if (state.step === 6) {
      const evalRes = await evaluateAnswer(
        incoming,
        "Your surname is Smith",
        "Your surname is Smith."
      );

      if (!evalRes.correct) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${evalRes.correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 7;

      twiml.message("Good 🙂");
      twiml.message("What is your phone number?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 7 =========
    if (state.step === 7) {
      state.step = 8;

      twiml.message("Good 🙂");
      twiml.message("When you meet someone, you say: nice to meet you. What do you say?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 8 =========
    if (state.step === 8) {
      const evalRes = await evaluateAnswer(
        incoming,
        "Nice to meet you",
        "Nice to meet you."
      );

      if (!evalRes.correct) {
        twiml.message(`❌ ${incoming}`);
        twiml.message(`✅ ${evalRes.correction}`);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 9;

      twiml.message("Good 🙂");
      twiml.message("Are you Mr, Mrs, or Miss?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= STEP 9 =========
    if (state.step === 9) {
      state.step = 10;

      twiml.message("Good 🙂");
      twiml.message("Am I Mr Smith?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ========= FINAL =========
    twiml.message("Excellent 🎉 Lesson complete. Type 'Lesson 1' to restart.");
    return res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error(err);

    twiml.message("Something went wrong. Please try again.");
    return res.type("text/xml").send(twiml.toString());
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
