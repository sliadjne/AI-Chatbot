import React, { useRef } from 'react'

const ChatForm = ({chatHistory, setChatHistory, generateBotResponse}) => {
  const inputRef = useRef();

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const userMessage = inputRef.current.value.trim();
    if(!userMessage) return;
    inputRef.current.value = "";

    // Create a new history snapshot (avoid stale closure)
    const newHistory = [...chatHistory, { role: "user", text: userMessage }];

    // Immediately update chat history with the user's message and a Thinking... placeholder
    setChatHistory([...newHistory, { role: "model", text: "Thinking..." }]);

    // Call generateBotResponse immediately with the snapshot (no artificial delay)
    generateBotResponse(newHistory);
  };
      
    

  return (
    <form action="#" className="chat-form" onSubmit={handleFormSubmit}>
        <input ref={inputRef} type="text" placeholder="Message..." 
          className="message-input" required />
          <button className="material-symbols-rounded">arrow_upward</button>
        </form>
  )
}

export default ChatForm;