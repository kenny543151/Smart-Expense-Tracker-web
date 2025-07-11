import functions from 'firebase-functions';
import axios from 'axios';
import cors from 'cors';

const corsHandler = cors({ origin: true });

export const sendEmail = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
      const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', req.body, {
        headers: { 'Content-Type': 'application/json' },
      });
      res.status(200).json({ status: 'success', data: response.data });
    } catch (error) {
      console.error('EmailJS error:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
});