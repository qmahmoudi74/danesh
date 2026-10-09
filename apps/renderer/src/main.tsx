import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, Button, Heading } from 'react-aria-components';
import { SystemCheck } from './screens/SystemCheck.tsx';
import { AppShell } from './components/Layout.tsx';
import { Banner } from './components/Status.tsx';
import './app.css';
function App() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => { const changed = () => setRoute(location.hash); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  if (route === '#/system-check') return <SystemCheck />;
  return <AppShell home><Heading level={1} tabIndex={-1} className="display">دانش</Heading><Banner variant="info" title="نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست" body="این نسخه فقط زیرساخت امن و پایدار برنامه را آماده می‌کند. ورود فایل PDF، خواندن و یادگیری در نسخه‌های بعدی اضافه می‌شود. تا آن زمان می‌توانید با «بررسی سامانه» وضعیت برنامه را روی این رایانه ببینید." /><div><Button className="button primary" onPress={() => { location.hash = '/system-check'; }}>بررسی سامانه</Button></div></AppShell>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<React.StrictMode><I18nProvider locale="fa-IR"><App /></I18nProvider></React.StrictMode>);
