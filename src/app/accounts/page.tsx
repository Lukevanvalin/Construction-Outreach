'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { STAGE_COLORS, DealStage, DealType } from '@/lib/types';

interface AccountRow {
  id: string;
  name: string;
  status: string;
  primary_domain: string | null;
  location: string | null;
  industry: string | null;
  employee_count: number | null;
  deal_count: number;
  contact_count: number;
  last_activity_at: string | null;
  deals_summary: Array<{ stage: DealStage; type: DealType }> | null;
}

function StagePill({ stage, type }: { stage: DealStage; type: DealType }) {
  const c = STAGE_COLORS[stage];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {type} · {stage}
    </span>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      setLoading(true);
      fetch(`/api/accounts${q}`)
        .then((r) => r.json())
        .then((rows) => setAccounts(rows))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Accounts</h1>
          <p className="text-sm text-navy-500 mt-1">{accounts.length} companies · account-centric view</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts…"
          className="w-72 px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
        />
      </div>

      {loading && <div className="text-navy-500 text-sm">Loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/accounts/${a.id}`}
            className="block bg-white rounded-xl border border-sand-200 p-5 hover:border-warm-400 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-navy-900 truncate">{a.name}</h3>
                <div className="text-xs text-navy-500 mt-0.5">
                  {[a.primary_domain, a.location, a.industry].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="text-right text-xs text-navy-500 flex-shrink-0">
                {a.contact_count} contacts
                <br />
                {a.deal_count} {a.deal_count === 1 ? 'deal' : 'deals'}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {(a.deals_summary || []).map((d, i) => (
                <StagePill key={i} stage={d.stage} type={d.type} />
              ))}
            </div>

            <div className="text-xs text-navy-400">
              {a.last_activity_at
                ? `Last activity ${format(new Date(a.last_activity_at), 'MMM d')}`
                : 'No activity yet'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
