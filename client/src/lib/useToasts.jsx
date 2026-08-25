import React, { createContext, useContext, useState, useCallback } from 'react';

const Ctx = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const push = useCallback((toast) => {
    const id = ++seq;
    setToasts(t => [...t, { ...toast, id }]);
    if (toast.ttl !== 0) setTimeout(() => dismiss(id), toast.ttl ?? 4000);
    return id;
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ push, dismiss }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : ''}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="toast__btn" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToasts = () => useContext(Ctx);
