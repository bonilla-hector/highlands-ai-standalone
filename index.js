import "dotenv/config";
import express from "express";
import cors from "cors";
import twilio from "twilio";

const app = express();
const PORT = process.env.PORT || 3000;

const userState = {};

// ================= UTIL =================
const normalize = (text) =>
  text.toLowerCase().replace(/[^\w\s]/g, "").trim();

// ================= VALIDAÇÕES =================

// Nome válido
function extractName(input) {
  const clean = normalize(input);

  if (clean.startsWith("my name is ")) {
    return clean.replace("my name is ", "").trim();
  }

  if (clean.startsWith("i am ") || clean.startsWith("im ")) {
    return clean.replace("i am ", "").replace("im ", "").trim();
  }

  // Nome simples (ex: Hector)
  if (/^[a-z]+$/.test(clean)) {
    return clean;
  }

  return null;
}

// Resposta "I'm fine"
function isFineAnswer(input) {
  const clean = normalize(input);
  return ["i am fine", "im fine", "i'm fine", "fine"].includes(clean);
}

// Resposta correta genérica
function isExact(input, correct) {
  return normalize(input) === normalize(correct);
}

// ================= HELPER =================
function sendCorrection(twiml, wrong, correct, question) {
  twiml.message(`❌ ${wrong}`);
  twiml.message(`✅ ${correct}`);
  twiml.message(question);
}

// ================= EXPRESS =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) => {
  res.send("Server running");
});

// ================= TWILIO =================
app.post("/webhook/twilio", (req, res) => {
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

    // ===== STEP 1 — NAME =====
    if (state.step === 1) {
      const name = extractName(incoming);

      if (!name) {
        return sendResponse(
          res,
          sendCorrection(
            twiml,
            incoming,
            "My name is John.",
            "What’s your name?"
          )
        );
      }

      state.name = capitalize(name);
      state.step = 2;

      twiml.message(`Nice to meet you, ${state.name}.`);
      twiml.message("How are you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 2 — HOW ARE YOU =====
    if (state.step === 2) {
      if (!isFineAnswer(incoming)) {
        sendCorrection(
          twiml,
          incoming,
          "I'm fine.",
          "How are you today?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 3;
      twiml.message("Good 🙂");
      twiml.message("This is John. He is a student. What is his name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 3 — HIS NAME =====
    if (state.step === 3) {
      if (!isExact(incoming, "His name is John")) {
        sendCorrection(
          twiml,
          incoming,
          "His name is John.",
          "What is his name?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 4;
      twiml.message("Good 🙂");
      twiml.message("This is Anna. She is a teacher. What is her name?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 4 — HER NAME =====
    if (state.step === 4) {
      if (!isExact(incoming, "Her name is Anna")) {
        sendCorrection(
          twiml,
          incoming,
          "Her name is Anna.",
          "What is her name?"
        );
        return res.type("text/xml").send(twiml.toString());
      }

      state.step = 5;
      twiml.message("Good 🙂");
      twiml.message("What is your surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 5 — SURNAME =====
    if (state.step === 5) {
      state.step = 6;

      twiml.message("Good 🙂");
      twiml.message("My surname is Smith. What is my surname?");
      return res.type("text/xml").send(twiml.toString());
    }

    // ===== STEP 6 =====
    if (state.step === 6) {
      if (!isExact(incoming, "Your surname is Smith")) {
        sendCorrection(
          twiml,
          incoming,
          "Your surname is Smith.",
          "What is my surname?"
        );
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
      if (!isExact(incoming, "Nice to meet you")) {
        sendCorrection(
          twiml,
          incoming,
          "Nice to meet you.",
          "What do you say when you meet someone?"
        );
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

// ================= HELPERS =================
function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function sendResponse(res, twiml) {
  return res.type("text/xml").send(twiml.toString());
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});