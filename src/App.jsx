import { useState } from "react";
import { ChatbotIcon } from "./components/ChatbotIcon";
import ChatForm from "./components/ChatForm";
import ChatMessage from "./components/ChatMessage";

const App = () => {
  const [chatHistory, seeChatHistory] = useState([]);
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 50);
  };

  const handleOpen = () => {
    setOpen(true);
  };

  // Delay helper for backoff
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const generateBotResponse = async (history) => {
    const last = history[history.length - 1];
    const contents = [{ role: last.role, parts: [{ text: last.text }] }];

    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    };

    // Retry with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(import.meta.env.VITE_API_URL, requestOptions);

        if (response.status === 429 && attempt < 3) {
          console.warn(`Rate limit hit, retrying in ${attempt * 1000}ms...`);
          await delay(attempt * 1000);
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Error: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        const botMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

        // If valid bot message
        if (botMessage) {
          seeChatHistory((prev) => {
            const idx = prev.findIndex(
              (m) => m.role === "model" && m.text === "Thinking..."
            );
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = { role: "model", text: "", fullText: botMessage };
              return next;
            }
            return [...prev, { role: "model", text: "", fullText: botMessage }];
          });
        } else {
          // Fallback text
          seeChatHistory((prev) => {
            const idx = prev.findIndex(
              (m) => m.role === "model" && m.text === "Thinking..."
            );
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = {
                role: "model",
                text: "",
                fullText: "Sorry, no valid response.",
              };
              return next;
            }
            return [
              ...prev,
              { role: "model", text: "", fullText: "Sorry, no valid response." },
            ];
          });
        }

        return data; // stop loop
      } catch (error) {
        // Last attempt -> show error
        if (attempt === 3) {
          console.error("Failed after 3 attempts:", error);
          seeChatHistory((prev) => {
            const idx = prev.findIndex(
              (m) => m.role === "model" && m.text === "Thinking..."
            );
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = {
                role: "model",
                text: "",
                fullText: "Sorry, something went wrong!",
              };
              return next;
            }
            return [
              ...prev,
              {
                role: "model",
                text: "",
                fullText: "Sorry, something went wrong!",
              },
            ];
          });
          throw error;
        }

        // wait and retry
        console.warn(`Attempt ${attempt} failed, retrying...`);
        await delay(attempt * 1000);
      }
    }
  };

  return (
    <div className="container">
      {open && (
        <div className={`chatbot-popup ${closing ? "closing" : "open"}`}>
          {/* Chatbot Header */}
          <div className="chat-header">
            <div className="header-info">
              <ChatbotIcon />
              <h2 className="logo-text"> Chatbox</h2>
            </div>
            <button
              aria-label="Close chatbot"
              className="material-symbols-rounded"
              onClick={handleClose}
            >
              keyboard_arrow_down
            </button>
          </div>

          {/* Chatbot Body */}
          <div className="chat-body">
            <div className="message bot-message">
              <ChatbotIcon />
              <p className="message-text">
                Hey girly🩷 <br /> Anything I can help?
              </p>
            </div>

            {chatHistory.map((chat, index) => (
              <ChatMessage key={index} chat={chat} />
            ))}
          </div>

          {/* Chatbot Footer */}
          <div className="chat-footer">
            <ChatForm
              chatHistory={chatHistory}
              setChatHistory={seeChatHistory}
              generateBotResponse={generateBotResponse}
            />
          </div>
        </div>
      )}

      {!open && (
        <button
          aria-label="Open chatbot"
          className={`chatbot-toggle ${closing ? "closing" : "open"}`}
          onClick={handleOpen}
        >
          <ChatbotIcon />
        </button>
      )}
    </div>
  );
};

export default App;
