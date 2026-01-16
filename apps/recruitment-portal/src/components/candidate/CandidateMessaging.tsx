// ============================================================================
// Candidate Messaging Component
// Chat-style interface for messaging candidates via email with reply links
// Location: apps/recruitment-portal/src/components/candidate/CandidateMessaging.tsx
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions } from '@allied/shared-lib'
import { Card, Spinner } from '@allied/shared-ui'
import type { Timestamp } from 'firebase/firestore'

// ============================================================================
// TYPES
// ============================================================================

export interface CandidateMessage {
  id: string
  candidateId: string
  type: 'outbound' | 'inbound'
  content: string
  sentAt: Timestamp
  sentBy?: string
  sentByName?: string
  replyToken?: string
  replyTokenUsed?: boolean
  emailSent?: boolean
}

interface CandidateMessagingProps {
  candidateId: string
  candidateName: string
  candidateEmail?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateMessaging({
  candidateId,
  candidateName,
  candidateEmail
}: CandidateMessagingProps) {
  const db = getFirebaseDb()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<CandidateMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)

  // Load messages for this candidate
  useEffect(() => {
    if (!candidateId) return

    const messagesRef = collection(db, 'candidateMessages')
    const q = query(
      messagesRef,
      where('candidateId', '==', candidateId),
      orderBy('sentAt', 'asc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CandidateMessage[]
      setMessages(data)
      setLoading(false)
    }, (error) => {
      console.error('Error loading messages:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [db, candidateId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as any)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !candidateEmail || sending) return

    setSending(true)
    try {
      const functions = getFirebaseFunctions()
      const sendMessage = httpsCallable(functions, 'sendCandidateMessage')

      await sendMessage({
        candidateId,
        candidateName,
        candidateEmail,
        content: newMessage.trim()
      })

      setNewMessage('')
    } catch (err: any) {
      console.error('Error sending message:', err)
      alert(err.message || 'Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const firstName = candidateName?.split(' ')[0] || 'candidate'

  return (
    <Card className="sidebar-card messaging-card">
      <h3>Messages</h3>

      <div className="messages-container">
        {loading ? (
          <div className="messages-loading">
            <Spinner size="sm" />
          </div>
        ) : messages.length === 0 ? (
          <div className="messages-empty">
            <span className="empty-icon">💬</span>
            <p>No messages yet</p>
            <p className="empty-hint">Send a message to {firstName}</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.type === 'outbound' ? 'outbound' : 'inbound'}`}
              >
                <div className="message-content">{msg.content}</div>
                <div className="message-meta">
                  <span className="message-time">{formatTime(msg.sentAt)}</span>
                  {msg.type === 'outbound' && msg.emailSent && (
                    <span className="message-status" title="Email sent">✓</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="message-input-container">
        <textarea
          className="message-input"
          placeholder={candidateEmail ? `Message ${firstName}...` : 'No email address'}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={!candidateEmail}
          rows={2}
        />
        <button
          className="send-button"
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || !candidateEmail || sending}
          title="Send message"
        >
          {sending ? '...' : '➤'}
        </button>
      </div>
    </Card>
  )
}

export default CandidateMessaging
