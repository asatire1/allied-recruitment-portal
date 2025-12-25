import { Link } from 'react-router-dom'
import { Button } from '@allied/shared-ui'

export function NotFound() {
  return (
    <div className="error-page">
      <div className="error-container">
        <div className="error-code">404</div>
        
        <h1 className="error-title">Page Not Found</h1>
        
        <p className="error-message">
          Sorry, we couldn't find the page you're looking for.
          It might have been moved or doesn't exist.
        </p>

        <div className="error-actions">
          <Link to="/">
            <Button variant="primary">
              Go to Dashboard
            </Button>
          </Link>
          
          <Button variant="ghost" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  )
}

export default NotFound
