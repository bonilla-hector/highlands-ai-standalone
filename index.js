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
    .replace(/[''`]/g, "'") // normaliza apóstrofos
    .replace(/[^\w\s']/g, "") // remove pontuação exceto apóstrofo
    .replace(/\s+/g, " ") // colapsa espaços duplos
    .trim();

// ================= VALIDAÇÃO FLEXÍVEL =================
// Aceita resposta exata OU parcialmente correta (contém as palavras-chave)
function checkAnswer(input, validAnswers, keywords = []) {
  const cleaned = normalize(input);

  // Verificação exata
  if (validAnswers.some((ans) => cleaned === normalize(ans))) return true;

  // Verificação por palavras-chave (para respostas parciais naturais)
  if (keywords.length > 0) {
    return keywords.every((kw) => cleaned.includes(normalize(kw)));
  }

  return false;
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
            "You are checking an A1 English student's answer. If it is correct or close enough, say CORRECT. Otherwise, give ONLY the corrected sentence. No explanation. No extra words.",
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

// ================= HELPER: enviar correção + repetir pergunta =================
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
    userState[userId] = { step: 0, name: "", surname: "" };
  }

  const state = userState[userId];
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    // ===== START =====
    if (normalize(incoming) === "lesson 1") {
      state.step = 1;
      state.name = "";
      state.surname = "";

      twiml.message("Hello 🙂 Ready? Let's begin Lesson 1.");
      twiml.message("What's your name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 1 — Name =====
    // Aceita: "My name is Hector", "Hector", "Is Hector"
    if (state.step === 1) {
      const cleaned = normalize(incoming);

      // Rejeita respostas obviamente erradas (muito curtas ou sem letra)
      if (cleaned.length < 2 || !/[a-z]/.test(cleaned)) {
        sendCorrection(
          twiml,
          incoming,
          "My name is [your name].",
          "What's your name?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      // Extrai o nome: remove prefixos comuns
      let name = incoming
        .replace(/^(my name is|i am|i'm|is)\s+/i, "")
        .trim();
      // Capitaliza primeira letra
      name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

      state.name = name;
      state.step = 2;

      twiml.message(`Nice to meet you, ${state.name}. 😊`);
      twiml.message("How are you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 2 — How are you =====
    if (state.step === 2) {
      const QUESTION = "How are you today?";
      const valid = [
        "i am fine",
        "im fine",
        "i'm fine",
        "fine",
        "i am fine thank you",
        "i'm fine thank you",
        "fine thank you",
        "fine thanks",
        "very well",
        "very well thank you",
        "i am very well",
        "i'm very well",
      ];

      // Aceita também se contiver "fine" ou "well" (respostas naturais)
      const keywords = []; // deixa só pelas listas acima + aiCheck
      const isCorrect = checkAnswer(incoming, valid, keywords);

      if (!isCorrect) {
        const aiCorrection = await aiCheck(incoming, "I'm fine.");
        if (aiCorrection) {
          sendCorrection(twiml, incoming, aiCorrection, QUESTION);
        } else {
          // IA disse CORRECT — aceita
          state.step = 3;
          twiml.message("Good 🙂");
          twiml.message(
            "This is John. He is a student.\nWhat is his name?"
          );
        }
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 3;
      twiml.message("Good 🙂");
      twiml.message("This is John. He is a student.\nWhat is his name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 3 — His name (John) =====
    if (state.step === 3) {
      const QUESTION = "This is John. He is a student.\nWhat is his name?";
      const valid = ["his name is john"];
      // Aceita variações: "John", "his name is John", "It's John"
      const keywords = ["john"];

      if (!checkAnswer(incoming, valid, keywords)) {
        sendCorrection(twiml, incoming, "His name is John.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 4;
      twiml.message("Good 🙂");
      twiml.message("This is Anna. She is a teacher.\nWhat is her name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 4 — Her name (Anna) =====
    if (state.step === 4) {
      const QUESTION = "This is Anna. She is a teacher.\nWhat is her name?";
      const valid = ["her name is anna"];
      const keywords = ["anna"];

      if (!checkAnswer(incoming, valid, keywords)) {
        sendCorrection(twiml, incoming, "Her name is Anna.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 5;
      twiml.message("Good 🙂");
      twiml.message("What is your surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 5 — Student's surname =====
    if (state.step === 5) {
      const cleaned = normalize(incoming);

      if (cleaned.length < 2 || !/[a-z]/.test(cleaned)) {
        sendCorrection(
          twiml,
          incoming,
          "My surname is [your surname].",
          "What is your surname?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      // Extrai sobrenome
      let surname = incoming
        .replace(/^(my surname is|my last name is|it is|it's|is)\s+/i, "")
        .trim();
      surname =
        surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();

      state.surname = surname;
      state.step = 6;

      twiml.message(`Good 🙂`);
      twiml.message("My surname is Smith.\nWhat is my surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 6 — Tutor's surname (Smith) =====
    if (state.step === 6) {
      const QUESTION = "What is my surname?";
      const valid = ["your surname is smith", "smith"];
      const keywords = ["smith"];

      if (!checkAnswer(incoming, valid, keywords)) {
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
      const cleaned = normalize(incoming);
      // Aceita qualquer resposta que tenha pelo menos um dígito
      if (!/\d/.test(incoming) && cleaned.length < 3) {
        twiml.message("Please tell me your phone number. 📱");
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
      const keywords = ["nice", "meet"];

      if (!checkAnswer(incoming, valid, keywords)) {
        sendCorrection(twiml, incoming, "Nice to meet you.", QUESTION);
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 9;
      twiml.message("Good 🙂");
      twiml.message("Are you Mr, Mrs, or Miss?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 9 — Title (Mr/Mrs/Miss) =====
    if (state.step === 9) {
      const QUESTION = "Are you Mr, Mrs, or Miss?";
      const cleaned = normalize(incoming);
      const validTitles = ["mr", "mrs", "miss", "ms"];

      const hasTitle = validTitles.some((t) => cleaned.includes(t));

      if (!hasTitle) {
        sendCorrection(
          twiml,
          incoming,
          `I am ${validTitles[0]}/${validTitles[2]} [surname].`,
          QUESTION
        );
        return res.type("text/xml").send(twiml.toString());
      }

      // Extrai o título escolhido
      let title = validTitles.find((t) => cleaned.includes(t)) || "Mr/Miss";
      title = title.charAt(0).toUpperCase() + title.slice(1);

      state.step = 10;
      twiml.message("Good 🙂");
      twiml.message(`So you are ${title} ${state.surname}. Nice to meet you, ${title} ${state.surname}!`);
      twiml.message("Am I Mr Smith or Mrs Smith?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 10 — Final question =====
    if (state.step === 10) {
      const QUESTION = "Am I Mr Smith or Mrs Smith?";
      const valid = ["mr smith", "you are mr smith", "you are mrs smith", "mrs smith"];
      const keywords = ["smith"];

      if (!checkAnswer(incoming, valid, keywords)) {
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

    // ===== FALLBACK (sem lição ativa) =====
    twiml.message(
      "Hello! 👋 Type *Lesson 1* to start your English lesson."
    );
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
