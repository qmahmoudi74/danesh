import React from 'react';
import { I18nProvider } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import { platform } from './lib/theme.ts';
import { Router } from './router.tsx';
import './app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
document.documentElement.dataset.platform = platform;
createRoot(root).render(
  <React.StrictMode>
    <I18nProvider locale="fa-IR">
      <Router />
    </I18nProvider>
  </React.StrictMode>,
);
