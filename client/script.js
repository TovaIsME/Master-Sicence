import bot from './assets/bot.svg';
import user from './assets/user.svg';

const form = document.querySelector('form');
const chatContainer = document.querySelector('#chat_container');
const inputField = document.querySelector('textarea[name="prompt"]');
const Uploadform = document.getElementById('uploadForm');
const responseDiv = document.getElementById('response');
const fileInput = document.getElementById('file');
const uploadBtn = document.getElementById('uploadBtn');

let loadInterval;

function loader(element) {
  element.textContent = '';
  loadInterval = setInterval(() => {
    element.textContent += '.';
    if (element.textContent === '....') {
      element.textContent = '';
    }
  }, 300);
}

function convertMarkdownToHTML(text) {
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  return text;
}

function typeText(element, text) {
  const containsHTML = /<\/?[a-z][\s\S]*>/i.test(text);

  if (containsHTML) {
    element.innerHTML = text;
  } else {
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 20);
  }
}

function generateUniqueId() {
  const timestamp = Date.now();
  const randomNumber = Math.random();
  const hexadecimalString = randomNumber.toString(16);
  return `id-${timestamp}-${hexadecimalString}`;
}

function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + d.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function checkUserId() {
  let userId = getCookie("userId");
  if (!userId) {
    userId = generateUniqueId();
    setCookie("userId", userId, 365);
  }
  return userId;
}

const userId = checkUserId();

function chatStripe(isAi, value, uniqueId) {
  return `
      <div class="wrapper ${isAi ? 'ai' : ''}">
        <div class="chat">
          <div class="profile">
            <img
              src="${isAi ? bot : user}"
              alt="${isAi ? 'bot' : 'user'}"
            />
          </div>
          <div class="message" id=${uniqueId}>${value}</div>
        </div>
      </div>
    `;
}

const handleSubmit = async (e) => {
  e.preventDefault();

  const data = new FormData(form);

  chatContainer.innerHTML += chatStripe(false, data.get('prompt'));
  form.reset();

  const uniqueId = generateUniqueId();
  chatContainer.innerHTML += chatStripe(true, ' ', uniqueId);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const messageDiv = document.getElementById(uniqueId);
  loader(messageDiv);
  function cleanResponseText(text) {
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1');
    
    text = text.replace(/\*\*(.*?)\*\*:/g, '');
    
    return text.trim();  
  }
  const response = await fetch('http://localhost:5000/chats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: data.get('prompt'),
      userId: userId
    }),
  });

  clearInterval(loadInterval);
  messageDiv.innerHTML = '';

  if (response.ok) {
    const data = await response.json();
    let parsedData = data.response;
    parsedData = cleanResponseText(parsedData);
    typeText(messageDiv, parsedData);
  } else {
    const err = await response.text();
    messageDiv.innerHTML = 'Something went wrong';
    alert(err);
  }
};

async function loadChatHistory() {
  const response = await fetch(`http://localhost:5000/chat-history/${userId}`);
  if (response.ok) {
    const data = await response.json();
    if (data.chats && data.chats.length > 0) {
      data.chats.forEach(chat => {
        chatContainer.innerHTML += chatStripe(chat.role === 'model', chat.message);
      });
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  } else {
    console.error('Failed to load chat history');
  }
}

Uploadform.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(Uploadform);
  try {
    const response = await fetch(`http://localhost:5000/upload/${userId}`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.content) {
      responseDiv.innerHTML = `<p>File uploaded successfully! Content: <pre>${result.content}</pre></p>`;
    } else {
      responseDiv.innerHTML = `<p>${result.message}</p>`;
    }
  } catch (error) {
    responseDiv.innerHTML = `<p>Error uploading file: ${error.message}</p>`;
  }
});

uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  const fileName = event.target.files[0].name;
  uploadBtn.innerHTML = `<img src="assets/upload-icon.svg" alt="Upload Icon" /> ${fileName}`;
});

window.addEventListener('DOMContentLoaded', loadChatHistory);
form.addEventListener('submit', handleSubmit);

inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      e.preventDefault();
      inputField.value += '\n';
    } else {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  }
});
