import { Link } from 'react-router-dom'
import { Button } from '@allied/shared-ui'
import { useAuth } from '../contexts'

export function Unauthorized() {
  const { user, signOut } = useAuth()

  return (
    <div className="error-page">
      <div className="error-container">
        <div className="error-icon">
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" 
            />
          </svg>
        </div>
        
        <h1 className="error-title">Access Denied</h1>
        
        <p className="error-message">
          Sorry, you don't have permission to access this page.
          {user && (
            <span className="error-role">
              Your current role is <strong>{user.role.replace('_', ' ')}</strong>.
            </span>
          )}
        </p>

        <div className="error-actions">
          <Link to="/">
            <Button variant="primary">
              Go to Dashboard
            </Button>
          </Link>
          
          <Button variant="ghost" onClick={signOut}>
            Sign Out
          </Button>
        </div>

        <p className="error-help">
          If you believe this is a mistake, please contact your administrator.
        </p>
      </div>
    </div>
  )
}

export default Unauthorized
