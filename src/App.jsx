import { useState } from 'react';
import { ChatbotIcon } from "./components/ChatbotIcon";
import LandingPage from "./components/LandingPage";

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userCredentials, setUserCredentials] = useState(null);

  const handleLogin = (credentials) => {
    setUserCredentials(credentials);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserCredentials(null);
  };

  const handleGuestAccess = () => {
    setUserCredentials({ username: 'Guest' });
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return <LandingPage onLogin={handleLogin} onGuestAccess={handleGuestAccess} />;
  }

  return <div className="container">
    <div className="chatbot-popup">
      {/* Chatbot Header */}
     <div className="chat-header">
      <div className="header-info">
        <ChatbotIcon />
        <h2 className="logo-text"> Chatbox</h2>
      </div>
      <div className="header-actions">
        <button 
          onClick={handleLogout}
          className="back-button material-symbols-rounded" 
          title="Back to Login"
        >
          arrow_back
        </button>
        <button className="material-symbols-rounded">keyboard_arrow_down</button>
      </div>
      </div> 

    {/* Chatbot Body */}
      <div className="chat-body">
      <div className="message bot-message">
        <ChatbotIcon />
        <p className="message-text">
          Hey {userCredentials?.username || 'there'}!🩷 <br /> Anything I can help?
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