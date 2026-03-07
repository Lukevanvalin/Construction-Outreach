'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Prospect, ProspectStatus, PROSPECT_STATUSES, STATUS_COLORS } from '@/lib/types';

function StatusBadge({ status }: { status: ProspectStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['New Lead'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  );
}

function AddProspectModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    status: 'New Lead' as ProspectStatus,
    introduction_date: '',
    source_email_thread: '',
    project_requirements: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          introduction_date: form.introduction_date || null,
        }),
      });
      if (res.ok) {
        onAdded();
        onClose();
        setForm({
          name: '',
          company: '',
          email: '',
          phone: '',
          status: 'New Lead',
          introduction_date: '',
          source_email_thread: '',
          project_requirements: '',
        });
      }
    } catch (err) {
      console.error('Error creating prospect:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-sand-200">
          <h2 className="text-lg font-semibold text-navy-900">Add New Prospect</h2>
          <p className="text-sm text-navy-500 mt-1">Enter the details for the new contractor prospect.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Company *</label>
              <input
                type="text"
                required
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                placeholder="Company name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProspectStatus })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none bg-white"
              >
                {PROSPECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Introduction Date</label>
              <input
                type="date"
                value={form.introduction_date}
                onChange={(e) => setForm({ ...form, introduction_date: e.target.value })}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Source Email Thread</label>
            <input
              type="text"
              value={form.source_email_thread}
              onChange={(e) => setForm({ ...form, source_email_thread: e.target.value })}
              className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
              placeholder="Reference to email thread"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Project Requirements</label>
            <textarea
              value={form.project_requirements}
              onChange={(e) => setForm({ ...form, project_requirements: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none"
              placeholder="Describe project requirements..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-sand-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-navy-600 bg-sand-100 rounded-lg hover:bg-sand-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-warm-500 rounded-lg hover:bg-warm-600 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Prospect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [dbInitialized, setDbInitialized] = useState<boolean | null>(null);

  const fetchProspects = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/prospects?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProspects(data);
        setDbInitialized(true);
      } else {
        setDbInitialized(false);
      }
    } catch {
      setDbInitialized(false);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const initializeDb = async () => {
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      if (res.ok) {
        setDbInitialized(true);
        fetchProspects();
      }
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-warm-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-navy-500 text-sm">Loading prospects...</p>
        </div>
      </div>
    );
  }

  if (dbInitialized === false) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-sm">
          <div className="w-16 h-16 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-navy-900 mb-2">Database Setup Required</h2>
          <p className="text-navy-500 text-sm mb-6">
            The database tables need to be created before you can start tracking prospects.
            Make sure your DATABASE_URL environment variable is configured.
          </p>
          <button
            onClick={initializeDb}
            className="px-6 py-2.5 bg-warm-500 text-white font-medium rounded-lg hover:bg-warm-600 text-sm"
          >
            Initialize Database
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Prospects</h1>
          <p className="text-navy-500 text-sm mt-1">
            {prospects.length} contractor{prospects.length !== 1 ? 's' : ''} in your pipeline
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-lg hover:bg-warm-600 text-sm shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Prospect
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none bg-white text-navy-700"
        >
          <option value="">All Statuses</option>
          {PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Prospects Table */}
      {prospects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm">
          <div className="w-16 h-16 bg-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-navy-700 mb-1">No prospects yet</h3>
          <p className="text-navy-500 text-sm mb-4">Get started by loading the Matt Joblon introductions or adding a prospect manually.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/seed', { method: 'POST' });
                  const data = await res.json();
                  if (res.ok) {
                    fetchProspects();
                  } else {
                    alert(data.error || 'Failed to seed data');
                  }
                } catch (err) {
                  console.error('Seed error:', err);
                  alert('Failed to seed data');
                }
              }}
              className="px-4 py-2 bg-navy-800 text-white font-medium rounded-lg hover:bg-navy-900 text-sm"
            >
              Load Matt Joblon Introductions
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-warm-500 text-white font-medium rounded-lg hover:bg-warm-600 text-sm"
            >
              Add Prospect Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand-200">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider">Name / Company</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider">Next Meeting</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider">Last Interaction</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider">Introduced</th>
                <th className="text-right px-6 py-3.5 text-xs font-semibold text-navy-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {prospects.map((prospect) => (
                <tr key={prospect.id} className="hover:bg-sand-50">
                  <td className="px-6 py-4">
                    <Link href={`/prospects/${prospect.id}`} className="block">
                      <div className="font-medium text-navy-900 text-sm">{prospect.name}</div>
                      <div className="text-navy-500 text-xs mt-0.5">{prospect.company}</div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={prospect.status as ProspectStatus} />
                  </td>
                  <td className="px-6 py-4 text-sm text-navy-600">
                    {prospect.upcoming_meeting_date
                      ? format(new Date(prospect.upcoming_meeting_date), 'MMM d, yyyy h:mm a')
                      : <span className="text-navy-300">--</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-sm text-navy-600">
                    {prospect.last_interaction_date
                      ? format(new Date(prospect.last_interaction_date), 'MMM d, yyyy')
                      : <span className="text-navy-300">--</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-sm text-navy-600">
                    {prospect.introduction_date
                      ? format(new Date(prospect.introduction_date), 'MMM d, yyyy')
                      : <span className="text-navy-300">--</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/prospects/${prospect.id}`}
                      className="text-warm-500 hover:text-warm-600 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddProspectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAdded={fetchProspects}
      />
    </div>
  );
}
