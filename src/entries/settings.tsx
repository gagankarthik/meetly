import React from 'react';
import { createRoot } from 'react-dom/client';
import { Settings } from '../screens/settings/Settings';
import '../styles/globals.css';

document.body.classList.add('app-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);
