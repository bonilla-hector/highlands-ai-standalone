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
  text
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();

// ================= VALIDAÇÃO EXATA =================
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
            "You are checking an A1 English student's answer. If it is grammatically correct and means the same thing, say CORRECT. Otherwise, give ONLY the corrected sentence. No explanation. No extra words.",
        },
        {
          role: "user",
          content: `Student said: "${input}" | Expected: "${correct}"`,
        },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text || text.toUpperCase().startsWith("CORRECT")) return null;
    return text;
  } catch {
    return null;
  }
}

// ================= HELPER: correção + repetir pergunta =================
function sendCorrection(twiml, incoming, correction, question) {
  twiml.message(`❌ ${incoming}\n✅ ${correction}`);
  twiml.message(question);
}

// ================= EXPRESS =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) => {
  res.send("Highlands AI Tutor — running ✅");
});

// ================= TWILIO WEBHOOK =================
app.post("/webhook/twilio", async (req, res) => {
  const incoming = (req.body.Body || "").trim();
  const userId = req.body.From;

  if (!userState[userId]) {
    userState[userId] = { step: 0, name: "", surname: "", title: "" };
  }

  const state = userState[userId];
  const twiml = new twilio.twiml.MessagingResponse();

  try {

    // ===== TRIGGER: "Lesson 1" =====
    if (normalize(incoming) === "lesson 1") {
      state.step = "confirm";
      state.name = "";
      state.surname = "";
      state.title = "";

      twiml.message("Hello! 👋 Are you ready to begin Lesson 1?\n\nReply *Yes* to start or *No* to cancel.");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP: CONFIRM (Yes/No) =====
    if (state.step === "confirm") {
      const c = normalize(incoming);

      if (c === "yes" || c === "y") {
        state.step = 1;
        twiml.message("Great! Let's begin. 🙂");
        twiml.message("What's your name?");
        return res.type("text/xml").send(twiml.toString());
      }

      if (c === "no" || c === "n") {
        state.step = 0;
        twiml.message("No problem! Type *Lesson 1* whenever you're ready. 👍");
        return res.type("text/xml").send(twiml.toString());
      }

      twiml.message("Please reply *Yes* to start or *No* to cancel.");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 1 — What's your name? =====
    // Must use: "My name is [Name]"
    if (state.step === 1) {
      const QUESTION = "What's your name?";

      const match = incoming.match(/^my name is\s+(\w+)/i);

      if (!match) {
        const guessedName = incoming
          .replace(/^(i am|i'm|im|is|i|my name)\s+/i, "")
          .trim()
          .split(" ")[0];
        const nameToUse =
          guessedName.length > 1
            ? guessedName.charAt(0).toUpperCase() + guessedName.slice(1).toLowerCase()
            : "______";

        sendCorrection(twiml, incoming, `My name is ${nameToUse}.`, QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      const name =
        match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      state.name = name;
      state.step = 2;

      twiml.message(`Nice to meet you, ${state.name}. 😊`);
      twiml.message("How are you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 2 — How are you today? =====
    if (state.step === 2) {
      const QUESTION = "How are you today?";
      const valid = [
        "i am fine",
        "im fine",
        "i'm fine",
        "i am fine thank you",
        "i'm fine thank you",
        "fine thank you",
        "fine thanks",
        "very well",
        "very well thank you",
        "i am very well",
        "i'm very well",
        "i am very well thank you",
        "i'm very well thank you",
      ];

      if (!checkAnswer(incoming, valid)) {
        const aiCorrection = await aiCheck(incoming, "I'm fine, thank you.");
        if (aiCorrection) {
          sendCorrection(twiml, incoming, aiCorrection, QUESTION);
        } else {
          // IA aprovou — avança
          state.step = 3;
          twiml.message("Good 🙂");
          twiml.message("This is John. He is a student.\nWhat is his name?");
        }
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 3;
      twiml.message("Good 🙂");
      twiml.message("This is John. He is a student.\nWhat is his name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 3 — What is his name? (John) =====
    // Must use: "His name is John."
    if (state.step === 3) {
      const QUESTION = "This is John. He is a student.\nWhat is his name?";
      const valid = ["his name is john"];

      if (!checkAnswer(incoming, valid)) {
        sendCorrection(twiml, incoming, "His name is John.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 4;
      twiml.message("Good 🙂");
      twiml.message("This is Anna. She is a teacher.\nWhat is her name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 4 — What is her name? (Anna) =====
    // Must use: "Her name is Anna."
    if (state.step === 4) {
      const QUESTION = "This is Anna. She is a teacher.\nWhat is her name?";
      const valid = ["her name is anna"];

      if (!checkAnswer(incoming, valid)) {
        sendCorrection(twiml, incoming, "Her name is Anna.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 5;
      twiml.message("Good 🙂");
      twiml.message("What is your surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 5 — What is your surname? =====
    // Must use: "My surname is [Surname]."
    if (state.step === 5) {
      const QUESTION = "What is your surname?";

      const match = incoming.match(/^my surname is\s+(\w+)/i);

      if (!match) {
        const guessedSurname = incoming
          .replace(/^(is|my surname|my last name is|it is|it's|im)\s+/i, "")
          .trim()
          .split(" ")[0];
        const surnameToUse =
          guessedSurname.length > 1
            ? guessedSurname.charAt(0).toUpperCase() +
              guessedSurname.slice(1).toLowerCase()
            : "______";

        sendCorrection(twiml, incoming, `My surname is ${surnameToUse}.`, QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      const surname =
        match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      state.surname = surname;
      state.step = 6;

      twiml.message("Good 🙂");
      twiml.message("My surname is Smith.\nWhat is my surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 6 — What is my surname? (Smith) =====
    // Must use: "Your surname is Smith."
    if (state.step === 6) {
      const QUESTION = "My surname is Smith.\nWhat is my surname?";
      const valid = ["your surname is smith"];

      if (!checkAnswer(incoming, valid)) {
        sendCorrection(twiml, incoming, "Your surname is Smith.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 7;
      twiml.message("Good 🙂");
      twiml.message("What is your phone number?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 7 — Phone number (open answer) =====
    if (state.step === 7) {
      if (!/\d/.test(incoming)) {
        twiml.message(
          "Please tell me your phone number. 📱\nWhat is your phone number?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 8;
      twiml.message("Thank you 🙂");
      twiml.message(
        "When you meet someone, you say: *Nice to meet you.*\nWhat do you say?"
      );
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 8 — Nice to meet you =====
    if (state.step === 8) {
      const QUESTION = "What do you say when you meet someone?";
      const valid = [
        "nice to meet you",
        "nice to meet you too",
        "it's nice to meet you",
      ];

      if (!checkAnswer(incoming, valid)) {
        sendCorrection(twiml, incoming, "Nice to meet you.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 9;
      twiml.message("Good 🙂");
      twiml.message("Are you Mr, Mrs, or Miss?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 9 — I am Mr/Mrs/Miss [Surname] =====
    // Must use: "I am Mr/Mrs/Miss [Surname]."
    if (state.step === 9) {
      const QUESTION = "Are you Mr, Mrs, or Miss?";
      const cleaned = normalize(incoming);
      const validTitles = ["mr", "mrs", "miss", "ms"];

      const hasTitle = validTitles.some((t) => cleaned.includes(t));
      const hasIAm =
        cleaned.startsWith("i am") ||
        cleaned.startsWith("i'm") ||
        cleaned.startsWith("im ");

      if (!hasTitle || !hasIAm) {
        sendCorrection(
          twiml,
          incoming,
          `I am Mr / Mrs / Miss ${state.surname || "______"}.`,
          QUESTION
        );
        return res.type("text/xml").send(twiml.toString());
      }

      let title = validTitles.find((t) => cleaned.includes(t)) || "mr";
      const titleFormatted =
        title === "mr"
          ? "Mr"
          : title === "mrs"
          ? "Mrs"
          : title === "miss"
          ? "Miss"
          : "Ms";

      state.title = titleFormatted;
      state.step = 10;

      twiml.message(
        `So you are ${titleFormatted} ${state.surname}. Nice to meet you, ${titleFormatted} ${state.surname}!`
      );
      twiml.message("Am I Mr Smith or Mrs Smith?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 10 — You are Mr/Mrs Smith =====
    // Must use: "You are Mr Smith." or "You are Mrs Smith."
    if (state.step === 10) {
      const QUESTION = "Am I Mr Smith or Mrs Smith?";
      const valid = ["you are mr smith", "you are mrs smith"];

      if (!checkAnswer(incoming, valid)) {
        sendCorrection(twiml, incoming, "You are Mr Smith.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 0;
      twiml.message(
        `Excellent! 🎉 Well done, ${state.name}!\nLesson 1 complete.`
      );
      twiml.message(
        "Type *Lesson 1* to practice again, or wait for Lesson 2. 🚀"
      );
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== FALLBACK =====
    twiml.message("Hello! 👋 Type *Lesson 1* to start your English lesson.");
    return res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error(err);
    twiml.message("Something went wrong. Please try again.");
    return res.type("text/xml").send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Highlands AI Tutor running on port ${PORT} ✅`);
});
