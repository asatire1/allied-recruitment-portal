/**
 * Message Reply Page
 * Allows candidates to reply to messages via one-time link
 */

import { useState, useEffect } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functionsEU } from '../lib/firebase'

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'ready' | 'submitting' | 'success' | 'error'

interface TokenData {
  candidateName: string
  originalMessage: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MessageReply() {
  const [state, setState] = useState<PageState>('loading')
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')

  // Extract token from URL
  const token = window.location.pathname.split('/reply/')[1]

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No reply token provided')
      setState('error')
      return
    }

    validateToken()
  }, [token])

  const validateToken = async () => {
    try {
      const validateFn = httpsCallable(functionsEU, 'validateMessageReplyToken')
      const result = await validateFn({ token }) as { data: { valid: boolean; error?: string; candidateName?: string; originalMessage?: string } }

      if (result.data.valid) {
        setTokenData({
          candidateName: result.data.candidateName || 'there',
          originalMessage: result.data.originalMessage || null
        })
        setState('ready')
      } else {
        setError(result.data.error || 'Invalid link')
        setState('error')
      }
    } catch (err: any) {
      console.error('Token validation error:', err)
      setError('Failed to validate link. Please try again.')
      setState('error')
    }
  }

  const handleSubmit = async () => {
    if (!reply.trim()) return

    setState('submitting')
    try {
      const submitFn = httpsCallable(functionsEU, 'submitMessageReply')
      await submitFn({ token, content: reply.trim() })
      setState('success')
    } catch (err: any) {
      console.error('Submit error:', err)
      setError(err.message || 'Failed to send reply. Please try again.')
      setState('error')
    }
  }

  // ============================================================================
  // RENDER STATES
  // ============================================================================

  if (state === 'loading') {
    return (
      <div className="reply-page">
        <div className="reply-card">
          <div className="loading-spinner" />
          <p className="loading-text">Loading...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="reply-page">
        <div className="reply-card error-card">
          <div className="error-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1>Unable to Reply</h1>
          <p className="error-message">{error}</p>
          <p className="error-hint">
            This link may have expired or already been used.
            Please contact recruitment@alliedpharmacies.com if you need assistance.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="reply-page">
        <div className="reply-card success-card">
          <div className="success-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="48" height="48">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1>Reply Sent!</h1>
          <p>Thank you for your response. Our recruitment team will review your message.</p>
          <p className="success-hint">You can close this page now.</p>
        </div>
      </div>
    )
  }

  // Ready state - show reply form
  return (
    <div className="reply-page">
      <div className="reply-card">
        <h1>Reply to Message</h1>
        <p className="greeting">Hi {tokenData?.candidateName?.split(' ')[0] || 'there'},</p>

        {tokenData?.originalMessage && (
          <div className="original-message">
            <span className="original-label">Original message:</span>
            <p>{tokenData.originalMessage}</p>
          </div>
        )}

        <div className="reply-form">
          <label htmlFor="reply-input">Your reply:</label>
          <textarea
            id="reply-input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply here..."
            rows={6}
            disabled={state === 'submitting'}
          />

          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={!reply.trim() || state === 'submitting'}
          >
            {state === 'submitting' ? 'Sending...' : 'Send Reply'}
          </button>
        </div>

        <p className="reply-notice">
          This link can only be used once. After sending, you won't be able to edit your reply.
        </p>
      </div>
    </div>
  )
}

export default MessageReply
