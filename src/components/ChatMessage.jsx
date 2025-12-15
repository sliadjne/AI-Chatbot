import { ChatbotIcon } from "./ChatbotIcon";
import { useEffect, useState } from "react";

const ChatMessage = ({chat}) => {
  const [displayed, setDisplayed] = useState(chat.text || "");

  useEffect(() => {
    let mounted = true;
    // If the message includes a fullText property, animate typing
    if (chat.fullText) {
      setDisplayed("");
      const full = chat.fullText;
      // typing speed in ms per character (lower is faster)
      const speed = 10;
      let i = 0;
      const tick = () => {
        if (!mounted) return;
        i += 1;
        setDisplayed(full.slice(0, i));
        if (i < full.length) {
          setTimeout(tick, speed);
        }
      };
      // start typing after a very short pause to make it feel natural
      setTimeout(tick, 50);
    } else {
      // no fullText — display static text
      setDisplayed(chat.text || "");
    }
    return () => { mounted = false };
  }, [chat.fullText, chat.text]);

  return (
    <div data-role={chat.role} className={`message ${chat.role === "model" ? 'bot' : 'user'}-message`}>
        {chat.role === "model" && <ChatbotIcon />}
        <p className="message-text">{displayed}</p>
      </div>
  )
}

export default ChatMessage