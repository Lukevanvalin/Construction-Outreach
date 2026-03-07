'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Prospect,
  InteractionNote,
  MeetingTranscript,
  ProspectStatus,
  PROSPECT_STATUSES,
  STATUS_COLORS,
  AISummaryResponse,
} from '@/lib/types';

function StatusBadge({ status }: { status: ProspectStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['New Lead'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  );
}

function formatDatetimeLocal(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function formatDateInput(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export default function ProspectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const prospectId = params.id as string;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [notes, setNotes] = useState<InteractionNote[]>([]);
  const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Note form
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Transcript form
  const [showTranscriptForm, setShowTranscriptForm] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [processingAI, setProcessingAI] = useState(false);
  const [aiResult, setAiResult] = useState<AISummaryResponse | null>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);

  // Editable fields
  const [editForm, setEditForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    status: 'New Lead' as ProspectStatus,
    project_requirements: '',
    introduction_date: '',
    source_email_thread: '',
    upcoming_meeting_date: '',
    upcoming_meeting_notes: '',
  });

  const fetchProspect = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospects/${prospectId}`);
      if (res.ok) {
        const data = await res.json();
        setProspect(data);
        setEditForm({
          name: data.name || '',
          company: data.company || '',
          email: data.email || '',
          phone: data.phone || '',
          status: data.status || 'New Lead',
          project_requirements: data.project_requirements || '',
          introduction_date: formatDateInput(data.introduction_date),
          source_email_thread: data.source_email_thread || '',
          upcoming_meeting_date: formatDatetimeLocal(data.upcoming_meeting_date),
          upcoming_meeting_notes: data.upcoming_meeting_notes || '',
        });
      }
    } catch (err) {
      console.error('Error fetching prospect:', err);
    }
  }, [prospectId]);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospects/${prospectId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }, [prospectId]);

  const fetchTranscripts = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospects/${prospectId}/transcripts`);
      if (res.ok) {
        const data = await res.json();
        setTranscripts(data);
      }
    } catch (err) {
      console.error('Error fetching transcripts:', err);
    }
  }, [prospectId]);

  useEffect(() => {
    Promise.all([fetchProspect(), fetchNotes(), fetchTranscripts()]).finally(() =>
      setLoading(false)
    );
  }, [fetchProspect, fetchNotes, fetchTranscripts]);

  const saveProspect = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          introduction_date: editForm.introduction_date || null,
          upcoming_meeting_date: editForm.upcoming_meeting_date || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProspect(data);
        setSaveMessage('Saved successfully');
        setTimeout(() => setSaveMessage(''), 2000);
      }
    } catch (err) {
      console.error('Error saving prospect:', err);
      setSaveMessage('Error saving');
    } finally {
      setSaving(false);
    }
  };

  const deleteProspect = async () => {
    if (!confirm('Are you sure you want to delete this prospect? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      }
    } catch (err) {
      console.error('Error deleting prospect:', err);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote }),
      });
      if (res.ok) {
        setNewNote('');
        fetchNotes();
      }
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const processTranscript = async () => {
    if (!transcriptText.trim()) return;
    setProcessingAI(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText }),
      });
      if (res.ok) {
        const data: AISummaryResponse = await res.json();
        setAiResult(data);

        // Auto-fill upcoming meeting date if extracted
        if (data.nextMeetingDate) {
          setEditForm((prev) => ({
            ...prev,
            upcoming_meeting_date: formatDatetimeLocal(data.nextMeetingDate),
          }));
        }
      } else {
        alert('Failed to process transcript. Please check your ANTHROPIC_API_KEY.');
      }
    } catch (err) {
      console.error('Error processing transcript:', err);
      alert('Failed to process transcript.');
    } finally {
      setProcessingAI(false);
    }
  };

  const saveTranscript = async () => {
    if (!aiResult) return;
    setSavingTranscript(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          ai_summary: aiResult.summary,
          extracted_action_items: aiResult.actionItems.join('\n'),
          extracted_meeting_date: aiResult.nextMeetingDate,
        }),
      });
      if (res.ok) {
        setTranscriptText('');
        setAiResult(null);
        setShowTranscriptForm(false);
        fetchTranscripts();
        fetchNotes();
        fetchProspect();
      }
    } catch (err) {
      console.error('Error saving transcript:', err);
    } finally {
      setSavingTranscript(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-warm-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-navy-500 text-sm">Loading prospect...</p>
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-navy-900 mb-2">Prospect Not Found</h2>
          <Link href="/" className="text-warm-500 hover:text-warm-600 text-sm font-medium">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-navy-400 hover:text-navy-600">
            Dashboard
          </Link>
          <span className="text-navy-300">/</span>
          <span className="text-navy-700 font-medium">{prospect.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className="text-sm text-green-600 font-medium">{saveMessage}</span>
          )}
          <button
            onClick={saveProspect}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-warm-500 rounded-lg hover:bg-warm-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={deleteProspect}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">{editForm.name || 'Unnamed Prospect'}</h1>
            <p className="text-navy-500 mt-1">{editForm.company}</p>
          </div>
          <StatusBadge status={editForm.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Contact Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Company</label>
                <input
                  type="text"
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Status & Dates */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Status & Timeline</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ProspectStatus })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none bg-white"
                >
                  {PROSPECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Introduction Date (Matt Joblon)</label>
                <input
                  type="date"
                  value={editForm.introduction_date}
                  onChange={(e) => setEditForm({ ...editForm, introduction_date: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-navy-500 mb-1">Source Email Thread</label>
                <input
                  type="text"
                  value={editForm.source_email_thread}
                  onChange={(e) => setEditForm({ ...editForm, source_email_thread: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                  placeholder="Link or reference to email thread"
                />
              </div>
            </div>
          </div>

          {/* Project Requirements */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Project Requirements</h2>
            <textarea
              value={editForm.project_requirements}
              onChange={(e) => setEditForm({ ...editForm, project_requirements: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none"
              placeholder="Describe the project scope, requirements, timeline, budget considerations..."
            />
          </div>

          {/* Meeting Transcripts */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider">Meeting Transcripts</h2>
              <button
                onClick={() => setShowTranscriptForm(!showTranscriptForm)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warm-600 bg-warm-50 rounded-lg hover:bg-warm-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Transcript
              </button>
            </div>

            {showTranscriptForm && (
              <div className="mb-6 p-4 bg-sand-50 rounded-lg border border-sand-200">
                <h3 className="text-sm font-medium text-navy-800 mb-3">Paste Bubbles Meeting Transcript</h3>
                <textarea
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none mb-3 bg-white"
                  placeholder="Paste the full meeting transcript here..."
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={processTranscript}
                    disabled={processingAI || !transcriptText.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 rounded-lg hover:bg-navy-900 disabled:opacity-50"
                  >
                    {processingAI ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Process with AI
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowTranscriptForm(false);
                      setTranscriptText('');
                      setAiResult(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-800"
                  >
                    Cancel
                  </button>
                </div>

                {/* AI Result */}
                {aiResult && (
                  <div className="mt-4 space-y-4">
                    <div className="p-4 bg-white rounded-lg border border-green-200">
                      <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        AI Summary
                      </h4>
                      <p className="text-sm text-navy-700 whitespace-pre-wrap">{aiResult.summary}</p>
                    </div>

                    {aiResult.actionItems.length > 0 && (
                      <div className="p-4 bg-white rounded-lg border border-blue-200">
                        <h4 className="text-sm font-semibold text-blue-800 mb-2">Action Items</h4>
                        <ul className="space-y-1.5">
                          {aiResult.actionItems.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-navy-700">
                              <span className="text-blue-500 mt-0.5">&#8226;</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiResult.nextMeetingDate && (
                      <div className="p-4 bg-white rounded-lg border border-purple-200">
                        <h4 className="text-sm font-semibold text-purple-800 mb-1">Next Meeting Date (Extracted)</h4>
                        <p className="text-sm text-navy-700">
                          {format(new Date(aiResult.nextMeetingDate), 'EEEE, MMMM d, yyyy h:mm a')}
                        </p>
                        <p className="text-xs text-navy-500 mt-1">This has been auto-filled in the upcoming meeting date field.</p>
                      </div>
                    )}

                    <button
                      onClick={saveTranscript}
                      disabled={savingTranscript}
                      className="w-full px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {savingTranscript ? 'Saving...' : 'Save Transcript & Notes'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Saved Transcripts */}
            {transcripts.length === 0 && !showTranscriptForm ? (
              <p className="text-sm text-navy-400 text-center py-6">No meeting transcripts yet.</p>
            ) : (
              <div className="space-y-4">
                {transcripts.map((t) => (
                  <div key={t.id} className="p-4 border border-sand-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-navy-500">
                        {format(new Date(t.created_at), 'MMM d, yyyy h:mm a')}
                      </span>
                      {t.extracted_meeting_date && (
                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                          Meeting: {format(new Date(t.extracted_meeting_date), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    {t.ai_summary && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-navy-600 mb-1">Summary</h4>
                        <p className="text-sm text-navy-700 whitespace-pre-wrap">{t.ai_summary}</p>
                      </div>
                    )}
                    {t.extracted_action_items && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-navy-600 mb-1">Action Items</h4>
                        <p className="text-sm text-navy-700 whitespace-pre-wrap">{t.extracted_action_items}</p>
                      </div>
                    )}
                    <details className="mt-2">
                      <summary className="text-xs font-medium text-navy-400 cursor-pointer hover:text-navy-600">
                        View Full Transcript
                      </summary>
                      <pre className="mt-2 text-xs text-navy-600 whitespace-pre-wrap bg-sand-50 p-3 rounded-lg max-h-60 overflow-y-auto">
                        {t.transcript}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Meeting */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Upcoming Meeting</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={editForm.upcoming_meeting_date}
                  onChange={(e) => setEditForm({ ...editForm, upcoming_meeting_date: e.target.value })}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">Meeting Notes</label>
                <textarea
                  value={editForm.upcoming_meeting_notes}
                  onChange={(e) => setEditForm({ ...editForm, upcoming_meeting_notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none"
                  placeholder="Agenda, talking points..."
                />
              </div>
            </div>
          </div>

          {/* Interaction Notes */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Interaction Notes</h2>

            {/* Add Note */}
            <div className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-sand-300 rounded-lg text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none resize-none mb-2"
                placeholder="Add a note about this interaction..."
              />
              <button
                onClick={addNote}
                disabled={addingNote || !newNote.trim()}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-warm-500 rounded-lg hover:bg-warm-600 disabled:opacity-50"
              >
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>

            {/* Notes List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-sm text-navy-400 text-center py-4">No interaction notes yet.</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="p-3 bg-sand-50 rounded-lg border border-sand-200">
                    <p className="text-sm text-navy-700 whitespace-pre-wrap">{note.note}</p>
                    <p className="text-xs text-navy-400 mt-2">
                      {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Info */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-navy-900 uppercase tracking-wider mb-4">Record Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-navy-500">Created</span>
                <span className="text-navy-700">{format(new Date(prospect.created_at), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Last Updated</span>
                <span className="text-navy-700">{format(new Date(prospect.updated_at), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Notes</span>
                <span className="text-navy-700">{notes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Transcripts</span>
                <span className="text-navy-700">{transcripts.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
