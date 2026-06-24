import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from './popup';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Popup root not found.');
}

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);

