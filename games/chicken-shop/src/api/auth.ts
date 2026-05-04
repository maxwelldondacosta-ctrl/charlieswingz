const SESSION_KEY = 'cw_session'

export type CwSession = {
  token: string
  user: { id: string; email: string; name: string }
}

export function getSession(): CwSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CwSession
  } catch {
    return null
  }
}

export function requireSession(): CwSession {
  const session = getSession()
  if (!session) {
    window.location.href = '/profile'
    throw new Error('No session — redirecting to login')
  }
  return session
}
