import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@chatui/core/dist/index.css';
import 'mdui/mdui.css';
import { setColorScheme } from 'mdui';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);