import React from 'react';
import { createRoot } from 'react-dom/client';
import { Hub } from '../screens/hub/Hub';
import '../styles/globals.css';

document.body.classList.add('app-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Hub />
  </React.StrictMode>,
);
