import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Laptop, Lock, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getActivationStatus, getOrCreateDeviceId, toErrorMessage } from '../api/client.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const points = [
  'One-time 4-digit PIN delivered via LMS Notifications',
  'Instantly unlocks all courses included in your verified package',
  'Once activated, log in normally with email & password without re-entering PIN',
];

export default function StudentActivation() {
  const { activateWithPin, isAuthenticated, student } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(() => searchParams.get('email') || student?.email || '');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [emailError, setEmailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [errorDetails, setErrorDetails] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activatedSuccess, setActivatedSuccess] = useState(null);
  const [existingActivation, setExistingActivation] = useState(null);

  const digitRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Update email if signed-in student loads
  useEffect(() => {
    if (student?.email && !email) {
      setEmail(student.email);
    }
  }, [student, email]);

  // If authenticated, check if already activated to avoid repeated PIN entry
  useEffect(() => {
    if (isAuthenticated) {
      getActivationStatus()
        .then((status) => {
          if (status?.isActivated) {
            setExistingActivation(status);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  // Auto-focus the first digit input on mount, or email if empty
  useEffect(() => {
    if (!searchParams.get('email') && !student?.email) {
      // Focus email or first digit
    }
    digitRefs[0]?.current?.focus();
  }, [searchParams, student]);

  const handleDigitChange = (index, value) => {
    // Keep only the last character if multiple are entered
    const sanitized = value.replace(/\D/g, '').slice(-1);
    const next = [...pinDigits];
    next[index] = sanitized;
    setPinDigits(next);
    setSubmitError('');

    // Advance to next input if filled
    if (sanitized && index < 3) {
      digitRefs[index + 1]?.current?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !pinDigits[index] && index > 0) {
      digitRefs[index - 1]?.current?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      digitRefs[index - 1]?.current?.focus();
    } else if (event.key === 'ArrowRight' && index < 3) {
      digitRefs[index + 1]?.current?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setPinDigits(next);
    setSubmitError('');

    // Focus on the next empty box or the last box
    const focusIndex = Math.min(pasted.length, 3);
    digitRefs[focusIndex]?.current?.focus();
  };

  const fullPin = pinDigits.join('');

  const validate = () => {
    let valid = true;
    if (!email.trim()) {
      setEmailError('Enter your registered email address');
      valid = false;
    } else if (!emailPattern.test(email)) {
      setEmailError('Enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    if (fullPin.length !== 4) {
      setSubmitError('Please enter all 4 digits of your activation PIN');
      valid = false;
    }

    return valid;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setErrorDetails(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const deviceId = getOrCreateDeviceId();
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        screen: `${window.screen.width}x${window.screen.height}`,
      };

      const result = await activateWithPin({
        email: email.trim().toLowerCase(),
        pin: fullPin,
        deviceId,
        deviceInfo,
      });

      setActivatedSuccess(result);
    } catch (err) {
      const code = err?.response?.data?.code;
      const msg = toErrorMessage(err, 'Activation failed. Please check your credentials and try again.');

      setSubmitError(msg);
      setErrorDetails(code);

      // Reset PIN boxes if incorrect
      if (code === 'INVALID_PIN' || code === 'NO_ACTIVE_PIN') {
        setPinDigits(['', '', '', '']);
        digitRefs[0]?.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // If already activated, show already active status and navigate to courses
  if (existingActivation) {
    return (
      <AuthLayout
        title="Package Already Activated"
        subtitle="Your account is already active with authorized course package access."
        points={points}
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-surface-900">
              Your Package is Active
            </h2>
            <p className="mt-2 text-sm text-surface-600">
              {existingActivation.packageName ? `Package: "${existingActivation.packageName}". ` : ''}
              You do not need to enter an activation PIN again.
            </p>
          </div>

          {existingActivation.authorizedCourses?.length > 0 && (
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-left">
              <span className="block text-xs font-semibold uppercase tracking-wider text-surface-500">
                Unlocked Courses ({existingActivation.authorizedCourses.length})
              </span>
              <ul className="mt-3 space-y-2">
                {existingActivation.authorizedCourses.map((course) => (
                  <li key={course._id || course.id} className="flex items-center gap-2.5 text-sm font-medium text-surface-900">
                    <span className="h-2 w-2 rounded-full bg-primary-600" />
                    <span>{course.title || 'Course'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => navigate('/my-courses', { replace: true })}
          >
            <span>Go to My Courses</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // If activation is complete, show the celebration state
  if (activatedSuccess) {
    return (
      <AuthLayout
        title="Device Activation Complete"
        subtitle="Your LMS access is now active and securely bound to this device."
        points={points}
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-surface-900">
              Device Activated Successfully!
            </h2>
            <p className="mt-2 text-sm text-surface-600">
              This system is now authorized as your primary device (System A). Your authorized courses are unlocked.
            </p>
          </div>

          {/* Authorized Courses Card */}
          {activatedSuccess.authorizedCourses?.length > 0 && (
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-left">
              <span className="block text-xs font-semibold uppercase tracking-wider text-surface-500">
                Unlocked Courses ({activatedSuccess.authorizedCourses.length})
              </span>
              <ul className="mt-3 space-y-2">
                {activatedSuccess.authorizedCourses.map((course) => (
                  <li key={course._id || course.id} className="flex items-center gap-2.5 text-sm font-medium text-surface-900">
                    <span className="h-2 w-2 rounded-full bg-primary-600" />
                    <span>{course.title || 'Course'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-primary-50/70 p-3.5 text-left text-xs text-primary-900">
            <strong>Security Reminder:</strong> Your activation is locked to this browser/device. You do not need to re-enter your PIN when continuing sessions.
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => navigate('/my-courses', { replace: true })}
          >
            Start Learning Now
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Activate Course Package"
      subtitle="Enter your registered email and the 4-digit PIN received in your LMS notifications."
      points={points}
      footer={
        <div className="text-center text-sm text-surface-600">
          Already activated your package?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Sign in with password
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Error notification banner */}
        {submitError && (
          <div
            role="alert"
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed ${
              errorDetails === 'ALREADY_ACTIVATED_ON_OTHER_DEVICE'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {errorDetails === 'ALREADY_ACTIVATED_ON_OTHER_DEVICE' ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            )}
            <div className="flex-1">
              <p className="font-semibold">
                {errorDetails === 'ALREADY_ACTIVATED_ON_OTHER_DEVICE'
                  ? 'PIN Already Activated on Another Device'
                  : 'Activation Failed'}
              </p>
              <p className="mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        {/* Email Address */}
        <div>
          <Input
            id="email"
            name="email"
            type="email"
            label="Registered Student Email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError('');
            }}
            error={emailError}
            icon={Mail}
            disabled={submitting || Boolean(student?.email)}
            hint={student?.email ? `Signed in as ${student.email}` : undefined}
          />
        </div>

        {/* 4-Digit PIN Input with Individual Boxes */}
        <div>
          <label className="block text-sm font-semibold text-surface-900 mb-2">
            4-Digit Activation PIN
          </label>
          <div className="flex justify-between gap-3 sm:gap-4" onPaste={handlePaste}>
            {pinDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={digitRefs[idx]}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={submitting}
                className="h-14 w-full rounded-xl border-2 border-surface-300 bg-surface-50 text-center font-mono text-2xl font-bold text-surface-900 transition-all duration-150 focus:border-primary-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-600/15 disabled:opacity-50"
                aria-label={`PIN digit ${idx + 1}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-surface-500">
            Check your registered email address for the 4-digit code sent upon payment approval.
          </p>
        </div>

        {/* First Device Hardware Binding Notice */}
        <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-4">
          <div className="flex items-start gap-3">
            <Laptop className="h-5 w-5 flex-shrink-0 text-primary-600 mt-0.5" />
            <div className="text-xs text-primary-950 leading-relaxed">
              <span className="font-semibold block text-primary-900 mb-0.5">
                First Device Binding Rule
              </span>
              This PIN can only be used once for first-time activation. Once activated, access is bound to this device (System A). The PIN cannot be reused on a secondary computer or phone.
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={submitting || fullPin.length !== 4 || !email}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          Activate LMS on this Device
        </Button>
      </form>
    </AuthLayout>
  );
}
