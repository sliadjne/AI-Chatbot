import { ChatbotIcon } from "./components/ChatbotIcon";

const App = () => {
  return <div className="container">
    <div className="chatbot-popup">
      {/* Chatbot Header */}
     <div className="chat-header">
      <div className="header-info">
        <ChatbotIcon />
        <h2 className="logo-text"> Chatbox</h2>
      </div>
      <button className="material-symbols-rounded">keyboard_arrow_down</button>
      </div> 

    {/* Chatbot Body */}
      <div className="chat-body">
      <div className="message bot-message">
        <ChatbotIcon />
        <p className="message-text">
          Hey girly🩷 <br /> Anything I can help?
        </p>
      </div>
      <div className="message user-message">
        <p className="message-text">
          Don't be afraid to ask me anything! I'm here to help you out💗
        </p>
      </div>
      </div>
      
    {/* Chatbot Footer */}
      <div className="chat-footer"> 
        <form action="#" className="chat-form">
          <input type="text" placeholder="Message..." 
          className="message-input" required />
          <button className="material-symbols-rounded">arrow_upward</button>
        </form>
      </div>
    </div>
  </div>
  
};

  export default App;