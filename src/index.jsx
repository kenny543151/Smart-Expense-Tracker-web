import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import emailjs from '@emailjs/browser';
import config from '../public/config';

console.log('Initializing EmailJS with public key:', config.EMAILJS_PUBLIC_KEY); // Debug
emailjs.init({
  publicKey: config.EMAILJS_PUBLIC_KEY,
  blockHeadless: true,
  limitRate: {
    id: 'app',
    throttle: 10000,
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);