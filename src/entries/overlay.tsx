import React from 'react';
import { createRoot } from 'react-dom/client';
import { Overlay } from '../screens/overlay/Overlay';
import '../styles/globals.css';

document.body.classList.add('overlay-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
);
