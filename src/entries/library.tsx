import React from 'react';
import { createRoot } from 'react-dom/client';
import { Library } from '../screens/library/Library';
import '../styles/globals.css';

document.body.classList.add('app-window');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Library />
  </React.StrictMode>,
);
