import React, { useState, useEffect } from 'react';
import { Mail, Inbox, Trash2, X, ExternalLink, Copy, Check, Info, Bell } from 'lucide-react';

interface SimulatedEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  linkUrl: string;
  createdAt: string;
  read: boolean;
}

export default function SimulatedMailbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [emails, setEmails] = useState<SimulatedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SimulatedEmail | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load emails from localStorage
  const loadEmails = () => {
    try {
      const stored = localStorage.getItem('tumpang_simulated_emails');
      if (stored) {
        setEmails(JSON.parse(stored));
      } else {
        setEmails([]);
      }
    } catch (e) {
      console.error('Failed to parse simulated emails:', e);
    }
  };

  useEffect(() => {
    loadEmails();

    // Listen for custom new email event
    const handleNewEmail = () => {
      loadEmails();
      // Show notification badge and optionally open mailbox or play sound
    };

    window.addEventListener('tumpang_new_email', handleNewEmail);
    return () => {
      window.removeEventListener('tumpang_new_email', handleNewEmail);
    };
  }, []);

  const handleMarkAllRead = () => {
    const updated = emails.map(email => ({ ...email, read: true }));
    setEmails(updated);
    localStorage.setItem('tumpang_simulated_emails', JSON.stringify(updated));
  };

  const handleDeleteEmail = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = emails.filter(email => email.id !== id);
    setEmails(updated);
    localStorage.setItem('tumpang_simulated_emails', JSON.stringify(updated));
    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
    }
  };

  const handleClearAll = () => {
    if (confirm('Hapus semua email simulasi?')) {
      setEmails([]);
      localStorage.removeItem('tumpang_simulated_emails');
      setSelectedEmail(null);
    }
  };

  const handleSelectEmail = (email: SimulatedEmail) => {
    setSelectedEmail(email);
    // Mark as read
    const updated = emails.map(e => e.id === email.id ? { ...e, read: true } : e);
    setEmails(updated);
    localStorage.setItem('tumpang_simulated_emails', JSON.stringify(updated));
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Extract credentials (Email and Password) from approved email body for helper display
  const extractCredentials = (body: string) => {
    const emailMatch = body.match(/Email:\s*([^\n]+)/i);
    const passwordMatch = body.match(/Kata Sandi:\s*([^\n]+)/i);
    
    return {
      email: emailMatch ? emailMatch[1].trim() : null,
      password: passwordMatch ? passwordMatch[1].trim() : null
    };
  };

  const unreadCount = emails.filter(e => !e.read).length;

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="simulated-mailbox-fab"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[99] bg-rose-600 hover:bg-rose-700 text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 group border-2 border-white/20"
        title="Kotak Masuk Email Simulasi"
      >
        <Mail className="w-6 h-6 animate-pulse" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce shadow-md">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Slide-over Drawer Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Simulated Mailbox Panel */}
      <div
        id="simulated-mailbox-panel"
        className={`fixed top-0 right-0 h-screen w-full sm:max-w-md bg-white shadow-2xl z-[101] flex flex-col transition-transform duration-300 ease-out font-sans border-l border-slate-150 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-slate-950 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-600/20 text-rose-400 rounded-xl border border-rose-500/10">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Simulasi Kotak Masuk</h3>
              <p className="text-[10px] text-slate-400 font-medium">Tempat menerima email & OTP (Demo Sandbox)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {emails.length > 0 && (
              <button 
                onClick={handleClearAll}
                className="p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                title="Hapus Semua"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Notification Banner */}
        <div className="bg-amber-50 border-b border-amber-100 p-3 flex gap-2.5 text-xs text-amber-800">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Info Simulasi:</strong> Pendaftaran Merchant yang disetujui Admin akan mengirimkan email notifikasi berisi <strong>Kata Sandi</strong> dan <strong>Link Akses</strong> ke kotak masuk ini.
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {selectedEmail ? (
            /* Individual Email Reader */
            <div className="flex-1 flex flex-col overflow-hidden animate-fadeIn">
              {/* Back to list button */}
              <div className="p-3 bg-white border-b border-slate-150 flex items-center justify-between">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-xs font-bold text-slate-600 hover:text-rose-600 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  &larr; Kembali ke Daftar
                </button>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(selectedEmail.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Email Envelope details */}
              <div className="p-4 bg-white border-b border-slate-150 flex flex-col gap-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Dari:</span>{' '}
                  <span className="text-slate-700 font-semibold font-mono">{selectedEmail.from}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Ke:</span>{' '}
                  <span className="text-slate-800 font-bold font-mono">{selectedEmail.to}</span>
                </div>
                <div className="mt-1">
                  <h4 className="font-display font-extrabold text-sm text-slate-900 mt-1">
                    {selectedEmail.subject}
                  </h4>
                </div>
              </div>

              {/* Main Body */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {/* Visual credentials card helper (Auto-extracted) */}
                {(() => {
                  const creds = extractCredentials(selectedEmail.body);
                  if (creds.email && creds.password) {
                    return (
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
                        <div className="flex items-center gap-1.5 text-rose-700">
                          <Bell className="w-4 h-4 text-rose-600" />
                          <h5 className="font-bold text-xs uppercase tracking-wider">Akses Portal Merchant Anda</h5>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2 text-xs">
                          <div className="bg-white p-2 rounded-xl border border-rose-100 flex justify-between items-center">
                            <div>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase">Email</p>
                              <p className="font-mono font-bold text-slate-800">{creds.email}</p>
                            </div>
                            <button
                              onClick={() => handleCopyText(creds.email!, 'email')}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                              title="Salin Email"
                            >
                              {copiedId === 'email' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="bg-white p-2 rounded-xl border border-rose-100 flex justify-between items-center">
                            <div>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase">Kata Sandi</p>
                              <p className="font-mono font-black text-rose-700 tracking-wider text-sm">{creds.password}</p>
                            </div>
                            <button
                              onClick={() => handleCopyText(creds.password!, 'pass')}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                              title="Salin Kata Sandi"
                            >
                              {copiedId === 'pass' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {selectedEmail.linkUrl && (
                          <button
                            onClick={() => {
                              window.location.search = selectedEmail.linkUrl;
                            }}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-rose-600/10 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Masuk Langsung ke Portal
                          </button>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Raw Body text */}
                <div className="bg-white border border-slate-150 p-4 rounded-2xl shadow-xs text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedEmail.body}
                </div>

                {/* Direct Link click fallback */}
                {selectedEmail.linkUrl && !extractCredentials(selectedEmail.body).password && (
                  <button
                    onClick={() => {
                      window.location.search = selectedEmail.linkUrl;
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    Buka Tautan Lampiran
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Email List view */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 bg-white border-b border-slate-150 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold">Total: {emails.length} email</span>
                {emails.length > 0 && (
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-rose-600 hover:text-rose-700 font-bold cursor-pointer hover:underline"
                  >
                    Tandai Semua Dibaca
                  </button>
                )}
              </div>

              {emails.length === 0 ? (
                /* Empty State */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-200 border border-slate-100 flex items-center justify-center mb-4 text-slate-400">
                    <Inbox className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">Kotak Masuk Kosong</h4>
                  <p className="text-xs text-slate-400 mt-2 max-w-[240px] leading-relaxed">
                    Belum ada email simulasi yang masuk. Kirim pendaftaran kemitraan Anda dan minta Admin menyetujuinya di panel admin.
                  </p>
                </div>
              ) : (
                /* List Items */
                <div className="flex-1 overflow-y-auto divide-y divide-slate-150">
                  {emails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className={`p-4 transition-all hover:bg-white flex gap-3 cursor-pointer relative group ${
                        !email.read ? 'bg-rose-50/20 font-semibold border-l-4 border-rose-500' : 'bg-transparent'
                      }`}
                    >
                      {/* Read status dot */}
                      {!email.read && (
                        <div className="absolute right-4 top-4 w-2 h-2 rounded-full bg-rose-500" />
                      )}

                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        !email.read 
                          ? 'bg-rose-100/50 border-rose-200 text-rose-600' 
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}>
                        <Mail className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${!email.read ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                            {email.to}
                          </p>
                          <span className="text-[9px] text-slate-400 font-medium font-mono flex-shrink-0">
                            {new Date(email.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <h4 className={`text-xs truncate mt-0.5 ${!email.read ? 'text-slate-900 font-extrabold' : 'text-slate-700 font-medium'}`}>
                          {email.subject}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate mt-1 leading-relaxed">
                          {email.body}
                        </p>
                      </div>

                      {/* Inline Delete Button (shown on hover) */}
                      <button
                        onClick={(e) => handleDeleteEmail(email.id, e)}
                        className="opacity-0 group-hover:opacity-100 absolute right-4 bottom-4 p-1 bg-slate-100 hover:bg-rose-50 rounded-md text-slate-400 hover:text-rose-600 transition-all cursor-pointer border border-slate-200"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
