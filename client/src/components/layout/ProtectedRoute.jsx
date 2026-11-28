import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Gate for the authenticated experience.
 * Sends signed-out visitors to /login and remembers where they were heading.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, initialising, student } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Allowed paths for learners who are completing onboarding, checking activation notifications, or activating
  const allowedPreActivationPaths = [
    '/complete-profile',
    '/onboarding',
    '/notifications',
    '/activate',
    '/student/activate',
  ];

  // If learner has not completed required personal details, redirect to /complete-profile
  // while allowing access to notification and activation routes
  if (
    student &&
    student.role !== 'admin' &&
    !student.profileCompleted &&
    !allowedPreActivationPaths.includes(location.pathname)
  ) {
    return <Navigate to="/complete-profile" replace />;
  }

  return <Outlet />;
}
