import React from 'react';
import { createRoot } from 'react-dom/client';
import { Auth } from '../screens/auth/Auth';
import '../styles/globals.css';

document.body.classList.add('app-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Auth />
  </React.StrictMode>,
);
