import { useState } from "react";
import { ChatbotIcon } from "./components/ChatbotIcon";
import ChatForm from "./components/ChatForm";
import ChatMessage from "./components/ChatMessage";
import LandingPage from "./components/LandingPage";
// MenstrualTracker is now integrated into Dashboard as a tab
import Dashboard from "./components/Dashboard";
import { MLPredictionProvider, useMLPrediction } from "./context/MLPredictionContext";

const AppContent = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [chatHistory, seeChatHistory] = useState([]);
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);
  const { mlPrediction, userFeatures } = useMLPrediction();

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 50);
  };

  // Helper: detect greetings or 'what does this chatbox do' queries so we can reply locally
  const isGreetingOrIntro = (text) => {
    if (!text) return false;
    const t = text.trim().toLowerCase();
    // common short greetings
    const short = /^(hi|hello|hey|hai|helo|hey girly|hello there)\b[!.]?$/i;
    if (short.test(t)) return true;
    // variants asking what the chatbox does
    const what = /(what (does|is) (this )?(chat(box)?|this chat|you) (do|for)|what do you do|what can you do|what is this)/i;
    if (what.test(t)) return true;
    return false;
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const generateBotResponse = async (history) => {
    // For speed, send only the latest user message to the API (smaller payload)
    const last = history[history.length - 1];
    const cannedIntro = `Hi girly, I’m Pennly 🌼\nI help explain your hormonal cycle, its phases, and the changes you may notice along the way 📘✨\nEverything here is meant to support learning and understanding at your own pace 🤍`;

    // Short-circuit for very common greetings or 'what does this chatbox do' to keep replies fast and friendly
    if (isGreetingOrIntro(last?.text)) {
      seeChatHistory((prev) => [...prev, { role: 'model', text: '', fullText: cannedIntro }]);
      return;
    }
    
    // Build personalized context from ML prediction
    let userContext = '';
    if (mlPrediction && userFeatures) {
      userContext = `\n\nUser's Health Context (for personalized guidance):
- Cycle Pattern: ${mlPrediction.prediction === 1 ? 'Possible PCOS pattern detected' : 'Normal pattern'}
- Risk Level: ${mlPrediction.riskLevel}
- Cycle Length: ${userFeatures.cycleLength} days
- Menstrual Regularity: ${userFeatures.Menstrual_Irregularity === 1 ? 'Irregular' : 'Regular'}
- Estimated BMI: ${userFeatures.BMI.toFixed(1)}
- Current Phase: Based on cycle data

Use this context to provide more personalized, relevant advice. If the user has irregular cycles or possible PCOS pattern, suggest lifestyle modifications, stress management, and when appropriate, mention consulting healthcare professionals. Always maintain a supportive, non-diagnostic tone.`;
    }

    const prompt = 
      `ur role is to provide clear, supportive, and medically-informed guidance about menstruation, hormonal changes, symptoms, emotional experiences, and common concerns related to the monthly cycle.
        Guidelines:
      - Tone: calm, reassuring, gentle; use empathetic and non-alarmist language.
      - Always respond in **2 - 3 sentences maximum**.
      - Explain concepts in simple, reassuring language suitable for teens and adults.
      - Normalize menstruation as a natural biological process.
      - If users feel scared, worried, or confused, validate their feelings and reassure them kindly.
      - Provide general wellness suggestions such as rest, hydration, warmth, light exercise, and when appropriate, medically standard advice to seek help if symptoms are severe or unusual.
      - Do **not** diagnose medical conditions; instead, give general educational information.
      - Remain non-judgmental, empathetic, and comforting at all times.
      - If the user greets the bot or asks what it does, respond briefly with the friendly intro: "Hi girly, I’m Pennly 🌼\nI help explain your hormonal cycle, its phases, and the changes you may notice along the way Everything here is meant to support learning and understanding at your own pace 📘✨".
      - Avoid graphic details and keep explanations approachable and respectful.
      - If a question falls outside menstruation, answer briefly and gently redirect back to helpful educational information.

      Your purpose is to educate, comfort, and empower users with trustworthy, easy-to-understand information about the menstrual cycle, don't diagnose but just explain and give suggestions
      yet reassure them. refer answers from 
      1. https://journals.physiology.org/doi/full/10.1152/japplphysiol.00346.2023 
      2. https://www.ijrrjournal.com/IJRR_Vol.11_Issue.4_April2024/IJRR45.pdf 
      3. https://clinicsearchonline.org/article/impact-of-hormonal-imbalance-during-menstrual-cycle-a-review
      4. https://internationalmedicaljournal.org/index.php/ijmhsr/article/view/204/208${userContext}`;


    const contents = {
      contents: [
          {
            role: "model",
            parts: [
              { text: prompt }
            ]
          },
          {
            role: "user",
            parts: [
              { text: last.text }
            ]
          }
        ]
    };

    const requestOptions = {
      method: "POST",
      headers:{ "Content-Type": "application/json" },
      body: JSON.stringify(contents)
    };

    try {
      const response = await fetch(import.meta.env.VITE_API_URL, requestOptions);
      const data = await response.json();
      console.log(data)
      
      const botMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (botMessage) {
        // Store the bot response as fullText and empty text so the UI can animate typing
        seeChatHistory((prev) => {
          const idx = prev.findIndex(m => m.role === 'model' && m.text === 'Thinking...');
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = { role: 'model', text: '', fullText: botMessage };
            return next;
          }
          return [...prev, { role: 'model', text: '', fullText: botMessage }];
        });
      } else {
        // Fallback when API response shape is unexpected
        seeChatHistory((prev) => {
          const idx = prev.findIndex(m => m.role === 'model' && m.text === 'Thinking...');
          if (idx !== -1) {
            const next = [...prev];
            // console.log(next)
            next[idx] = { role: 'model', text: '', fullText: 'Sorry, no valid response.' };
            return next;
          }
          return [...prev, { role: 'model', text: '', fullText: 'Sorry, no valid response.' }];
        });
      }
    } catch (error) {
      console.error("Error fetching bot response:", error);
      // Replace Thinking... with error message if present (use fullText for typing animation)
      seeChatHistory((prev) => {
        const idx = prev.findIndex(m => m.role === 'model' && m.text === 'Thinking...');
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { role: 'model', text: '', fullText: 'Sorry, something went wrong!' };
          return next;
        }
        return [...prev, { role: 'model', text: '', fullText: 'Sorry, something went wrong!' }];
      });
    }
  };

  // Handle login
  const handleLogin = (credentials) => {
    console.log('User logged in:', credentials.username);
    setIsLoggedIn(true);
  };

  // Handle guest access
  const handleGuestAccess = () => {
    console.log('User accessing as guest');
    setIsLoggedIn(true);
  };

  // Handle logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    seeChatHistory([]);
    setOpen(false);
  };

  // Show landing page if not logged in
  if (!isLoggedIn) {
    return <LandingPage onLogin={handleLogin} onGuestAccess={handleGuestAccess} />;
  }

  const chatUI = (
    <div className="container">
      <button className="logout-btn" onClick={handleLogout}>
        ← Logout
      </button>
      <Dashboard />
      
      {/* Chatbot popup rendered only when open */}
      {open && (
        <div className={`chatbot-popup ${closing ? 'closing' : 'open'}`}>
        {/* Chatbot Header */}
       <div className="chat-header">
        <div className="header-info">
          <ChatbotIcon />
          <h2 className="logo-text"> Chatbox</h2>
        </div>
        <button aria-label="Close chatbot" className="material-symbols-rounded" onClick={handleClose}>keyboard_arrow_down</button>
        </div> 

      {/* Chatbot Body */}
        <div className="chat-body">
        <div className="message bot-message">
          <ChatbotIcon />
          <p className="message-text">
            Hi girly, I’m Pennly 🌼 <br />
            I help explain your hormonal cycle, its phases, and the changes you may notice along the way 📘✨ <br />
            Everything here is meant to support learning and understanding at your own pace 🤍
          </p>
        </div>

        {/* Render chat history */}
        {chatHistory.map((chat, index) =>(
          <ChatMessage key={index} chat={chat} />
        ))}
        </div>
        
      {/* Chatbot Footer */}
        <div className="chat-footer"> 
          <ChatForm chatHistory={chatHistory} setChatHistory={seeChatHistory} generateBotResponse={generateBotResponse} />
        </div>
      </div>
      )}

      {/* Floating toggle button shown when chatbot is closed */}
      {!open && (
        <button aria-label="Open chatbot" className={`chatbot-toggle ${closing ? 'closing' : 'open'}`} onClick={handleOpen}>
          <ChatbotIcon />
        </button>
      )}
    </div>
  );

  return chatUI;
};

const App = () => {
  return (
    <MLPredictionProvider>
      <AppContent />
    </MLPredictionProvider>
  );
};

export default App;