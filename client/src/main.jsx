import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './i18n'; // initialise i18next before the app renders

if (import.meta.env.DEV && typeof console.info === 'function') {
  const originalConsoleInfo = console.info.bind(console);
  console.info = (...args) => {
    const [firstArg] = args;
    if (typeof firstArg === 'string' && firstArg.startsWith('%cDownload the React DevTools')) {
      return;
    }
    originalConsoleInfo(...args);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
