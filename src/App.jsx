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

  const generateBotResponse = async (history) => {
    // For speed, send only the latest user message to the API (smaller payload)
    const last = history[history.length - 1];
    const contents = [{ role: last.role, parts: [{ text: last.text }] }];

    const requestOptions = {
      method: "POST",
      headers:{ "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    };

    try {
      const response = await fetch(import.meta.env.VITE_API_URL, requestOptions);
      const data = await response.json();
      
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

  return <div className="container">
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
          Hey girly🩷 <br /> Anything I can help?
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
  
};

  export default App;