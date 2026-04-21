//app/contexts/QuotesContext.jsx
import { createContext, useEffect, useState } from 'react'
import { supabase, auth } from '../lib/supabase'
import { useUser } from '../hooks/useUser'

export const QuotesContext = createContext()

export function QuotesProvider({ children }) {
  const [quotes, setQuotes] = useState([])
  const { user } = useUser()

  async function fetchQuotes() {
    try {
      const { data, error } = await supabase
        .from('tradify_native_app_db')
        .select('*')
        .eq('userId', user.id) // only this user's rows
      if (error) throw error
      setQuotes(data)
      console.log(data)
    } catch (error) {
      console.error('Fetch quotes error:', error.message)
    }
  }

  async function fetchQuoteById(id) {
    try {
      const { data, error } = await supabase
        .from('tradify_native_app_db')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data
    } catch (error) {
      console.log('Fetch quote by ID error:', error.message)
      return null
    }
  }

  // ---- Totals with fixed 20% VAT ----
  const VAT_RATE = 0.20
  function computeTotals(items = []) {
    let subtotal = 0
    for (const it of items) {
      const qty = Number(it?.qty || 0)
      const price = Number(it?.unit_price || 0)
      subtotal += qty * price
    }
    const round2 = (n) => Math.round(n * 100) / 100
    const tax_total = round2(subtotal * VAT_RATE)
    const grand_total = round2(subtotal + tax_total)
    return { subtotal: round2(subtotal), tax_total, grand_total }
  }

  // Calculate valid_until date (7 days from now) for sent quotes
  function getValidUntilDate() {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString()
  }

  // Insert with new fields (no title), totals, and owner
  async function createQuote(data) {
    try {
      const items = Array.isArray(data?.line_items) ? data.line_items : []
      const { subtotal, tax_total, grand_total } = computeTotals(items)

      // Set issued_at and valid_until only when status is 'sent'
      const isSent = data?.status === 'sent'
      const now = new Date().toISOString()

      // Phase 11 — quote terms. A trade-picked custom valid-until date
      // overrides the auto-7-days-on-send default.
      const validUntil = data?.valid_until_override
        ? data.valid_until_override
        : (isSent ? getValidUntilDate() : null)

      const payload = {

        request_id: data?.request_id ?? null, // <-- ensure it's sent to the DB
        project_title: data?.project_title ?? null,

        // text fields
        comments: data?.comments ?? null,
        full_name: data?.full_name ?? null,
        email: data?.email ?? null,
        phone_number: data?.phone_number ?? null,
        job_address: data?.job_address ?? null,

        // meta
        status: data?.status || 'draft',
        currency: data?.currency || 'GBP',
        valid_until: validUntil,
        issued_at: isSent ? now : null,

        // Phase 11 — quote terms (flat columns added by Phase 11 migration)
        earliest_start: data?.earliest_start ?? null,
        duration_text: data?.duration_text ?? null,
        valid_until_override: data?.valid_until_override ?? null,
        deposit_percent: data?.deposit_percent ?? null,

        // structured arrays
        measurements: Array.isArray(data?.measurements) ? data.measurements : [],
        line_items: items,

        // totals (20% VAT)
        subtotal,
        tax_total,
        grand_total,

        // ownership: set BOTH so policies work with either schema.
        // `client_id` is what the RLS UPDATE policy keys off on the
        // client-side decide (accept/decline) — without it, clients
        // cannot touch the row. A DB trigger will also back-fill it
        // from quote_requests.requester_id as a safety net, but we
        // prefer to send it from here when we know it.
        trade_id: data?.trade_id ?? user?.id ?? null,
        userId:   data?.userId   ?? user?.id ?? null,
        ...(data?.client_id ? { client_id: data.client_id } : {}),
      }

      const { data: inserted, error } = await supabase
        .from('tradify_native_app_db')
        .insert([payload])
        .select()
        .single()

      if (error) throw error

      setQuotes((prev) => (Array.isArray(prev) ? [inserted, ...prev] : [inserted]))
      return inserted
    } catch (error) {
      console.error('Create quote error:', error.message)
      throw error
    }
  }

  // Update an existing quote (e.g., editing a draft)
  async function updateQuote(id, data) {
    try {
      const items = Array.isArray(data?.line_items) ? data.line_items : []
      const { subtotal, tax_total, grand_total } = computeTotals(items)

      // Set issued_at and valid_until only when status is 'sent'
      const isSent = data?.status === 'sent'
      const now = new Date().toISOString()

      // Phase 11 — custom valid-until overrides auto-7-day default on send.
      const validUntil = data?.valid_until_override
        ? data.valid_until_override
        : (isSent ? getValidUntilDate() : undefined)

      const payload = {
        project_title: data?.project_title ?? null,
        comments: data?.comments ?? null,
        status: data?.status || 'draft',
        ...(validUntil !== undefined && { valid_until: validUntil }),
        ...(isSent && { issued_at: now }),
        // Phase 11 — quote terms
        earliest_start: data?.earliest_start ?? null,
        duration_text: data?.duration_text ?? null,
        valid_until_override: data?.valid_until_override ?? null,
        deposit_percent: data?.deposit_percent ?? null,
        measurements: Array.isArray(data?.measurements) ? data.measurements : [],
        line_items: items,
        subtotal,
        tax_total,
        grand_total,
      }

      const { data: updated, error } = await supabase
        .from('tradify_native_app_db')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      setQuotes((prev) =>
        Array.isArray(prev)
          ? prev.map((q) => (q.id === id ? updated : q))
          : [updated]
      )
      return updated
    } catch (error) {
      console.error('Update quote error:', error.message)
      throw error
    }
  }

  async function deleteQuote(id) {
    try {
      const { error } = await supabase
        .from('tradify_native_app_db')
        .delete()
        .eq('id', id)
      if (error) throw error
      console.log(`Quote with id ${id} deleted`)
    } catch (error) {
      console.log('Delete quote error:', error.message)
    }
  }

  useEffect(() => {
    if (!user) {
      setQuotes([])
      return
    }

    // initial fetch
    fetchQuotes()

    const channel = supabase
      .channel('quotes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE
          schema: 'public',
          table: 'tradify_native_app_db',
        },
        (payload) => {
          console.log('[REALTIME EVENT]', payload)

          if (payload.eventType === 'INSERT') {
            setQuotes((prev) => (Array.isArray(prev) ? [...prev, payload.new] : [payload.new]))
          }

          if (payload.eventType === 'UPDATE') {
            setQuotes((prev) =>
              Array.isArray(prev)
                ? prev.map((b) => (b.id === payload.new.id ? payload.new : b))
                : [payload.new]
            )
          }

          if (payload.eventType === 'DELETE') {
            setQuotes((prev) =>
              Array.isArray(prev) ? prev.filter((b) => b.id !== payload.old.id) : []
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  return (
    <QuotesContext.Provider
      value={{ quotes, fetchQuotes, fetchQuoteById, createQuote, updateQuote, deleteQuote }}
    >
      {children}
    </QuotesContext.Provider>
  )
}