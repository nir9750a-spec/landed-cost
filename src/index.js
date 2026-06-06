import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ShareView from './components/ShareView';
import reportWebVitals from './reportWebVitals';

// Lightweight router — the only public route besides "/" is /share/<token>
// which renders the guest portal.
//
// NOTE: the AuthGate login wall is temporarily DISABLED on production. It locked
// users out because Supabase email-confirmation was on and redirect URLs weren't
// configured. Re-enable by wrapping <App/> in <AuthGate> again AFTER:
//   1. Supabase → Auth → turn OFF "Confirm email"
//   2. Supabase → Auth → URL Configuration → add the prod + localhost URLs
//   3. create + verify a login works
function Root() {
  if (typeof window !== 'undefined') {
    const m = /^\/share\/([A-Za-z0-9]+)\/?$/.exec(window.location.pathname);
    if (m) return <ShareView token={m[1]} />;
  }
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
