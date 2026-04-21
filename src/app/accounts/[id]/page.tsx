'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { Account, Deal, Contact, TimelineEvent, DocumentRow, SlaCommitment, STAGE_COLORS } from '@/lib/types';

interface AccountBundle {
  account: Account;
  deals: Deal[];
  contacts: Contact[];
  timeline: TimelineEvent[];
  documents: DocumentRow[];
  slas: SlaCommitment[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

function StagePill({ stage, type }: { stage: Deal['stage']; type: Deal['type'] }) {
  const c = STAGE_COLORS[stage];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {type} · {stage}
    </span>
  );
}

const SOURCE_ICON: Record<string, string> = {
  bubbles: '🫧',
  gmail: '✉️',
  gcal: '📅',
  slack: '💬',
  imessage: '📱',
  manual: '✍️',
  docusign: '✍︎',
  dropbox_sign: '✍︎',
  research: '🔎',
  system: '⚙︎',
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AccountBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(`/api/accounts/${id}`).then((r) => r.json()).then((d) => setData(d)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const runResearch = async () => {
    setResearching(true);
    try {
      await fetch(`/api/accounts/${id}/research`, { method: 'POST' });
      refresh();
    } finally {
      setResearching(false);
    }
  };

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    const now = new Date().toISOString();
    setChat((c) => [...c, { role: 'user', content: message, at: now }]);
    setSending(true);
    try {
      const res = await fetch(`/api/accounts/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId }),
      });
      const body = await res.json();
      if (body.session_id) setSessionId(body.session_id);
      setChat((c) => [...c, { role: 'assistant', content: body.assistant || '(no reply)', at: new Date().toISOString() }]);
      // Refresh in case the agent recorded a note or updated something
      refresh();
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) return <div className="p-8 text-navy-500">Loading…</div>;
  if (!data) return <div className="p-8 text-red-600">Account not found.</div>;

  const { account, deals, contacts, timeline, documents, slas } = data;

  return (
    <div className="flex h-screen">
      {/* Main column */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <Link href="/accounts" className="text-xs text-navy-500 hover:text-navy-700">← all accounts</Link>
            <h1 className="text-2xl font-bold text-navy-900 mt-1">{account.name}</h1>
            <div className="text-sm text-navy-500 mt-0.5">
              {[account.primary_domain, account.location, account.industry].filter(Boolean).join(' · ') || 'No research yet'}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {deals.map((d) => <StagePill key={d.id} stage={d.stage} type={d.type} />)}
            </div>
          </div>

          {/* Company research */}
          <section className="bg-white border border-sand-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Company research</h2>
              <button
                onClick={runResearch}
                disabled={researching}
                className="text-xs px-3 py-1 bg-warm-500 hover:bg-warm-600 disabled:opacity-50 text-white rounded-md"
              >
                {researching ? 'Researching…' : account.research_updated_at ? 'Refresh research' : 'Run research'}
              </button>
            </div>
            {account.description ? (
              <div className="space-y-2 text-sm">
                <p className="text-navy-700">{account.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-navy-600 pt-2">
                  {account.ceo_name && <div><span className="text-navy-400">CEO</span><br />{account.ceo_name}</div>}
                  {account.employee_count != null && <div><span className="text-navy-400">Employees</span><br />{account.employee_count.toLocaleString()}</div>}
                  {account.annual_revenue && <div><span className="text-navy-400">Revenue</span><br />{account.annual_revenue}</div>}
                  {account.founded_year && <div><span className="text-navy-400">Founded</span><br />{account.founded_year}</div>}
                </div>
              </div>
            ) : (
              <div className="text-xs text-navy-400">No research yet. Click &quot;Run research&quot; to populate.</div>
            )}
          </section>

          {/* Deals */}
          <section className="bg-white border border-sand-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wide mb-3">Deals ({deals.length})</h2>
            <div className="space-y-2">
              {deals.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3 p-3 border border-sand-100 rounded-lg">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-navy-900">{d.name}</div>
                    {d.notes && <div className="text-xs text-navy-500 mt-1 line-clamp-2">{d.notes}</div>}
                  </div>
                  <StagePill stage={d.stage} type={d.type} />
                </div>
              ))}
            </div>
          </section>

          {/* Contacts */}
          <section className="bg-white border border-sand-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wide mb-3">Contacts ({contacts.length})</h2>
            <div className="space-y-1.5">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-navy-900">{c.full_name}</span>
                    {c.title && <span className="text-navy-500"> · {c.title}</span>}
                    {c.is_key_figure && <span className="ml-2 text-[10px] bg-warm-100 text-warm-700 px-1.5 py-0.5 rounded">KEY</span>}
                  </div>
                  <div className="text-xs text-navy-400">{c.email || c.phone || ''}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Documents */}
          {documents.length > 0 && (
            <section className="bg-white border border-sand-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wide mb-3">Documents ({documents.length})</h2>
              <div className="space-y-2">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-navy-900">{d.title}</span>
                      <span className="ml-2 text-xs text-navy-500">{d.kind}</span>
                    </div>
                    <div className="text-xs text-navy-400">{d.state}{d.signed_at ? ' · signed' : ''}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Timeline */}
          <section className="bg-white border border-sand-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wide mb-3">Timeline ({timeline.length})</h2>
            <div className="space-y-2">
              {timeline.map((t) => (
                <div key={t.id} className="flex items-start gap-3 text-sm">
                  <div className="text-xs text-navy-400 w-20 flex-shrink-0 pt-0.5">
                    {format(new Date(t.occurred_at), 'MMM d')}
                  </div>
                  <div className="w-6 flex-shrink-0 text-center">{SOURCE_ICON[t.source] || '·'}</div>
                  <div className="min-w-0">
                    <div className="text-navy-800">{t.summary}</div>
                    <div className="text-[11px] text-navy-400 mt-0.5">{t.source} · {t.kind.replace(/_/g, ' ')}</div>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && <div className="text-xs text-navy-400">No events yet.</div>}
            </div>
          </section>
        </div>
      </div>

      {/* Chat panel */}
      <aside className="w-96 border-l border-sand-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-sand-200">
          <h2 className="text-sm font-semibold text-navy-900">Ask the account agent</h2>
          <p className="text-xs text-navy-500 mt-0.5">Grounded in this account&apos;s timeline. Add context from calls / iMessage here.</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {chat.length === 0 && (
            <div className="text-xs text-navy-400 italic">
              Try: &quot;what&apos;s the last thing that happened here?&quot;<br />
              or: &quot;note that I had a call with [name] today, they said [X]&quot;
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                m.role === 'user' ? 'bg-warm-500 text-white' : 'bg-sand-100 text-navy-900'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && <div className="text-xs text-navy-400">Agent is thinking…</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-sand-200">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Ask or add context…"
              className="flex-1 px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="px-3 py-2 bg-warm-500 hover:bg-warm-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
