import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  GraduationCap,
  History,
  Hourglass,
  Info,
  KeyRound,
  Laptop,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import {
  authorizeActivationCourses,
  generatePackagePin,
  getAdminPackages,
  getStudentActivation,
  reauthorizeActivation,
  regeneratePackagePin,
  resetActivation,
  revokeActivation,
  toErrorMessage,
  verifyActivationPayment,
} from '../../api/client';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import Input from '../common/Input.jsx';
import { Alert, formatDate, formatMoney, Panel, Pill } from './ui.jsx';
import { ACTIVATION_STATUS } from '../../constants';

const STATUS_CONFIG = {
  [ACTIVATION_STATUS.PAYMENT_PENDING]: { label: 'Payment Pending', tone: 'amber', icon: Hourglass },
  [ACTIVATION_STATUS.PAYMENT_VERIFIED]: { label: 'Payment Verified (Awaiting Package / PIN)', tone: 'amber', icon: CheckCircle2 },
  [ACTIVATION_STATUS.COURSE_AUTHORIZED]: { label: 'Package Assigned & Ready for PIN', tone: 'blue', icon: KeyRound },
  [ACTIVATION_STATUS.PIN_GENERATED]: { label: '4-Digit PIN Issued (Awaiting Student Activation)', tone: 'blue', icon: KeyRound },
  [ACTIVATION_STATUS.NOT_ACTIVATED]: { label: 'Not Activated', tone: 'amber', icon: Clock },
  [ACTIVATION_STATUS.ACTIVATED]: { label: 'Activated (Courses Unlocked & Primary Device Bound)', tone: 'green', icon: Laptop },
  [ACTIVATION_STATUS.EXPIRED]: { label: 'Activation Expired', tone: 'amber', icon: AlertTriangle },
  [ACTIVATION_STATUS.REVOKED]: { label: 'Revoked', tone: 'red', icon: XCircle },
};

export default function AdminLearnerActivation({ learner, courses = [], onUpdated }) {
  const [data, setData] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [generatedPinNotice, setGeneratedPinNotice] = useState(null);

  // Modals state
  const [packagePinModal, setPackagePinModal] = useState({
    open: false,
    packageId: '',
    amount: '',
    reference: '',
    notes: '',
  });

  const [regenerateModal, setRegenerateModal] = useState({
    open: false,
    reason: '',
  });

  const [resetModal, setResetModal] = useState({
    open: false,
    reason: '',
  });

  const [revokeModal, setRevokeModal] = useState({
    open: false,
    reason: '',
  });

  const [courseSources, setCourseSources] = useState({});

  const load = useCallback(async () => {
    if (!learner?.id && !learner?._id) return;
    setLoading(true);
    setError('');
    try {
      const [res, pkgs] = await Promise.all([
        getStudentActivation(learner.id || learner._id),
        getAdminPackages().catch(() => []),
      ]);
      setData(res.activation);
      setCourseSources(res.courseSources || {});
      setPackages(pkgs || []);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to load device activation details'));
    } finally {
      setLoading(false);
    }
  }, [learner]);

  useEffect(() => {
    load();
  }, [load]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  // Generate 4-digit PIN for assigned package
  const handleGeneratePackagePin = async (e) => {
    e.preventDefault();
    if (!packagePinModal.packageId) {
      setError('Please select a course package (Core Skills, Advanced Skills, or Full LMS).');
      return;
    }

    setActionBusy(true);
    setError('');
    try {
      const res = await generatePackagePin({
        studentId: learner.id || learner._id,
        packageId: packagePinModal.packageId,
        paymentAmount: Number(packagePinModal.amount) || undefined,
        paymentReference: packagePinModal.reference,
        paymentNotes: packagePinModal.notes,
      });

      setGeneratedPinNotice({
        pin: res.pin,
        packageName: res.activation?.packageName || 'Course Package',
        studentName: learner?.name,
      });

      setPackagePinModal({ open: false, packageId: '', amount: '', reference: '', notes: '' });
      showSuccess(`4-digit PIN (${res.pin}) generated successfully and delivered to learner via LMS notification!`);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to generate package activation PIN'));
    } finally {
      setActionBusy(false);
    }
  };

  // Regenerate 4-digit PIN
  const handleRegeneratePin = async (e) => {
    e.preventDefault();
    setActionBusy(true);
    setError('');
    try {
      const res = await regeneratePackagePin({
        studentId: learner.id || learner._id,
        reason: regenerateModal.reason,
      });

      setGeneratedPinNotice({
        pin: res.pin,
        packageName: res.activation?.packageName || data?.packageName || 'Course Package',
        studentName: learner?.name,
      });

      setRegenerateModal({ open: false, reason: '' });
      showSuccess(`New 4-digit PIN (${res.pin}) generated! Previous PIN has been invalidated.`);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to regenerate activation PIN'));
    } finally {
      setActionBusy(false);
    }
  };

  // Reset Activation Submission (Clears Hardware Binding)
  const handleResetActivation = async (e) => {
    e.preventDefault();
    setActionBusy(true);
    setError('');
    try {
      await resetActivation({
        studentId: learner.id || learner._id,
        reason: resetModal.reason,
      });
      setResetModal({ open: false, reason: '' });
      showSuccess('Device activation reset successfully. Old hardware binding cleared. Learner can reactivate on replacement computer.');
      await load();
      onUpdated?.();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to reset device activation'));
    } finally {
      setActionBusy(false);
    }
  };

  // Revoke Activation Submission
  const handleRevokeActivation = async (e) => {
    e.preventDefault();
    setActionBusy(true);
    setError('');
    try {
      await revokeActivation({
        studentId: learner.id || learner._id,
        reason: revokeModal.reason,
      });
      setRevokeModal({ open: false, reason: '' });
      showSuccess('Activation revoked successfully. Course access immediately restricted.');
      await load();
      onUpdated?.();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to revoke activation'));
    } finally {
      setActionBusy(false);
    }
  };

  // Re-authorize Activation
  const handleReauthorize = async () => {
    setActionBusy(true);
    setError('');
    try {
      await reauthorizeActivation({ studentId: learner.id || learner._id });
      showSuccess('Activation re-authorized. You can now generate an activation PIN.');
      await load();
      onUpdated?.();
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to re-authorize activation'));
    } finally {
      setActionBusy(false);
    }
  };

  const copyToClipboard = (text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      showSuccess('PIN copied to clipboard!');
    }
  };

  const isPaymentVerified = data?.paymentStatus === 'verified';
  const hasAuthorizedCourses = Boolean(data?.authorizedCourses && data.authorizedCourses.length > 0);
  const isActivated = Boolean(data?.isActivated && data?.status === ACTIVATION_STATUS.ACTIVATED);
  const isRevoked = data?.status === ACTIVATION_STATUS.REVOKED;

  let computedStatusKey = data?.status || ACTIVATION_STATUS.PAYMENT_PENDING;
  if (!isActivated && !isRevoked) {
    if (data?.status === 'pin_generated') {
      computedStatusKey = ACTIVATION_STATUS.PIN_GENERATED;
    } else if (isPaymentVerified && hasAuthorizedCourses) {
      computedStatusKey = ACTIVATION_STATUS.COURSE_AUTHORIZED;
    } else if (isPaymentVerified) {
      computedStatusKey = ACTIVATION_STATUS.PAYMENT_VERIFIED;
    } else {
      computedStatusKey = ACTIVATION_STATUS.PAYMENT_PENDING;
    }
  }

  const statusInfo = STATUS_CONFIG[computedStatusKey] || {
    label: 'Pending',
    tone: 'amber',
    icon: Info,
  };

  const StatusIcon = statusInfo.icon;

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="flex items-center gap-3 text-ink-500">
          <RefreshCw className="h-5 w-5 animate-spin text-primary-600" />
          <span>Loading activation details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <Alert tone="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert tone="success" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {/* Generated PIN Notice Banner */}
      {generatedPinNotice && (
        <div className="rounded-2xl border-2 border-primary-500 bg-primary-50/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-primary-900 font-bold">
              <KeyRound className="h-5 w-5 text-primary-600" />
              <span>4-Digit Activation PIN Issued</span>
            </div>
            <Pill tone="blue">{generatedPinNotice.packageName}</Pill>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-primary-200">
            <div>
              <span className="text-xs text-ink-500 block">Student: {generatedPinNotice.studentName}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-3xl font-extrabold tracking-widest text-primary-700">
                  {generatedPinNotice.pin}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedPinNotice.pin)}
                  className="p-1.5 rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 text-xs flex items-center gap-1 font-sans"
                  title="Copy PIN"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-ink-600 sm:text-right space-y-1">
              <p className="flex items-center sm:justify-end gap-1.5 text-emerald-700 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Dispatched to Student LMS Notification</span>
              </p>
              <p className="text-ink-400">Student enters this PIN once at /activate to unlock courses.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Lifecycle Status Overview */}
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl flex items-center justify-center ${
                statusInfo.tone === 'green'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : statusInfo.tone === 'red'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-primary-50 text-primary-600 border border-primary-200'
              }`}
            >
              <StatusIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-ink-900">{learner?.name}</h3>
                <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Registered Email: <span className="font-mono text-ink-700">{learner?.email}</span>
                {data?.packageName && (
                  <span className="ml-2 font-medium text-primary-700 font-sans">
                    &bull; Package: {data.packageName}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isActivated && !isRevoked && (
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  setPackagePinModal({
                    open: true,
                    packageId: data?.packageId?._id || data?.packageId || (packages[0]?._id || ''),
                    amount: data?.paymentAmount || packages[0]?.price || '',
                    reference: data?.paymentReference || '',
                    notes: data?.paymentNotes || '',
                  })
                }
                disabled={actionBusy}
              >
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                {data?.status === 'pin_generated' ? 'Re-Assign Package & PIN' : 'Verify Payment & Generate PIN'}
              </Button>
            )}

            {data?.status === 'pin_generated' && !isActivated && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRegenerateModal({ open: true, reason: '' })}
                disabled={actionBusy}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate PIN
              </Button>
            )}

            {isActivated ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setResetModal({ open: true, reason: '' })}
                  disabled={actionBusy}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reset Device Activation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setRevokeModal({ open: true, reason: '' })}
                  disabled={actionBusy}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Revoke Activation
                </Button>
              </>
            ) : isRevoked ? (
              <Button size="sm" variant="primary" onClick={handleReauthorize} disabled={actionBusy}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                Re-Authorize Access
              </Button>
            ) : null}
          </div>
        </div>

        {/* Status Pipeline Progress Indicator */}
        <div className="mt-6 pt-5 border-t border-ink-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-ink-50/70 border border-ink-100">
            <span className="text-ink-400 block font-medium">1. Personal Details &amp; Payment</span>
            <span className={`font-semibold mt-0.5 block ${isPaymentVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isPaymentVerified ? 'Payment Verified' : 'Awaiting Payment Verification'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-ink-50/70 border border-ink-100">
            <span className="text-ink-400 block font-medium">2. Package &amp; 4-Digit PIN</span>
            <span className={`font-semibold mt-0.5 block ${data?.packageName ? 'text-primary-600' : 'text-ink-400'}`}>
              {data?.packageName ? `${data.packageName} (PIN Issued)` : 'No Package Assigned'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-ink-50/70 border border-ink-100">
            <span className="text-ink-400 block font-medium">3. Student Activation</span>
            <span className={`font-semibold mt-0.5 block ${isActivated ? 'text-emerald-600' : 'text-ink-500'}`}>
              {isActivated ? 'Activated (Courses Unlocked)' : 'Awaiting Student 4-Digit PIN Entry'}
            </span>
          </div>
        </div>
      </div>

      {/* Learner Personal Details Card */}
      <Panel
        title="Learner Onboarding & Personal Details"
        description="Submitted by learner during initial profile completion"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-xl border border-ink-100 bg-surface-50">
            <span className="text-ink-400 block font-medium">Contact Phone</span>
            <span className="font-semibold text-ink-900 mt-1 block flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary-600" />
              <span>{learner?.phone || 'Not provided'}</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-ink-100 bg-surface-50">
            <span className="text-ink-400 block font-medium">City / Location</span>
            <span className="font-semibold text-ink-900 mt-1 block flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary-600" />
              <span>{learner?.city || 'Not provided'}</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-ink-100 bg-surface-50">
            <span className="text-ink-400 block font-medium">Educational Background</span>
            <span className="font-semibold text-ink-900 mt-1 block flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-primary-600" />
              <span className="truncate" title={learner?.education}>{learner?.education || 'General'}</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-ink-100 bg-surface-50">
            <span className="text-ink-400 block font-medium">Onboarding Profile Status</span>
            <div className="mt-1">
              {learner?.profileCompleted ? (
                <Pill tone="green">Details Submitted</Pill>
              ) : (
                <Pill tone="amber">Pending Details</Pill>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Package Assignment & Authorized Courses Section */}
      <Panel
        title="Course Package Assignment & PIN Status"
        description="The 3-tier package system automatically authorizes the courses mapped to the selected package"
      >
        <div className="space-y-5">
          {data?.packageName ? (
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-primary-950">{data.packageName}</h4>
                    <Pill tone="blue">Tier {data.packageId?.tier || 'Assigned'}</Pill>
                  </div>
                  <p className="text-xs text-ink-600 mt-1">
                    {data.packageId?.description || 'Courses unlocked upon one-time 4-digit PIN activation.'}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-ink-500 block">Payment Reference</span>
                  <span className="font-mono text-xs font-semibold text-ink-900 block">
                    {data.paymentReference || 'Direct Verification'}
                  </span>
                </div>
              </div>

              {/* Course list under package */}
              <div>
                <span className="text-xs font-bold text-ink-800 uppercase tracking-wider block mb-2">
                  Courses Included In This Package ({data.authorizedCourses?.length || 0})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(data.authorizedCourses || []).map((course) => {
                    const cId = course._id || course.id || course;
                    const cTitle = course.title || 'Course';
                    const isRazorpay = courseSources[String(cId)]?.source === 'razorpay';
                    return (
                      <div
                        key={String(cId)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-ink-100 bg-white text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="font-medium text-ink-900 truncate">{cTitle}</span>
                        </div>
                        {isRazorpay && (
                          <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
                            Razorpay
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center space-y-3">
              <KeyRound className="h-8 w-8 text-ink-400 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-ink-900">No Course Package Assigned Yet</h4>
                <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
                  Verify the student's payment and assign one of the 3 packages (Core Skills, Advanced Skills, or Full LMS) to generate their individual 4-digit activation PIN.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setPackagePinModal({
                    open: true,
                    packageId: packages[0]?._id || '',
                    amount: packages[0]?.price || '',
                    reference: data?.paymentReference || '',
                    notes: '',
                  })
                }
              >
                Select Package &amp; Generate PIN
              </Button>
            </div>
          )}
        </div>
      </Panel>

      {/* MODAL: Verify Payment, Select Package & Generate PIN */}
      <Modal
        open={packagePinModal.open}
        onClose={() => setPackagePinModal({ ...packagePinModal, open: false })}
        title="Verify Payment & Assign Course Package"
        description="Select the course package the learner paid for and generate their individual 4-digit activation PIN"
      >
        <form onSubmit={handleGeneratePackagePin} className="space-y-5">
          {/* Package Selection Cards */}
          <div>
            <label className="text-xs font-bold text-ink-800 uppercase tracking-wider block mb-2">
              Select Course Package <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {packages.map((pkg) => {
                const isSelected = packagePinModal.packageId === pkg._id;
                return (
                  <div
                    key={pkg._id}
                    onClick={() =>
                      setPackagePinModal({
                        ...packagePinModal,
                        packageId: pkg._id,
                        amount: packagePinModal.amount || pkg.price || '',
                      })
                    }
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50/50 ring-2 ring-primary-500/20'
                        : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-primary-600 bg-primary-600 text-white' : 'border-ink-300'
                        }`}>
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="font-bold text-sm text-ink-900">{pkg.name}</span>
                        <Pill tone={pkg.tier === 1 ? 'blue' : pkg.tier === 2 ? 'purple' : 'green'}>
                          Tier {pkg.tier}
                        </Pill>
                      </div>
                      <span className="font-semibold text-xs text-ink-900">
                        {pkg.price ? formatMoney(pkg.price) : 'Free'}
                      </span>
                    </div>

                    <p className="text-xs text-ink-500 mt-1.5 pl-6">{pkg.description}</p>

                    {pkg.courses?.length > 0 && (
                      <div className="mt-2 pl-6 flex flex-wrap gap-1.5">
                        {pkg.courses.map((c) => (
                          <span
                            key={c._id || c.id}
                            className="inline-block px-2 py-0.5 rounded-md bg-ink-100 text-[10.5px] font-medium text-ink-700"
                          >
                            {c.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Verification inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Payment Amount (₹)"
              type="number"
              placeholder="e.g. 4999"
              value={packagePinModal.amount}
              onChange={(e) => setPackagePinModal({ ...packagePinModal, amount: e.target.value })}
              required
            />

            <Input
              label="Payment Reference / UTR / Transaction ID"
              placeholder="e.g. UPI-9283749281 / Bank Ref"
              value={packagePinModal.reference}
              onChange={(e) => setPackagePinModal({ ...packagePinModal, reference: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-800 block mb-1">
              Internal Admin Notes (Optional)
            </label>
            <textarea
              className="w-full text-xs rounded-xl border border-ink-200 p-2.5 focus:border-primary-600 focus:outline-none"
              rows={2}
              placeholder="e.g. Verified via Bank Statement"
              value={packagePinModal.notes}
              onChange={(e) => setPackagePinModal({ ...packagePinModal, notes: e.target.value })}
            />
          </div>

          <div className="p-3 rounded-xl bg-primary-50 border border-primary-200 text-xs text-primary-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary-600" />
              <span>Automatic PIN Generation &amp; Notification</span>
            </p>
            <p className="text-ink-600 leading-relaxed">
              Upon clicking Generate, a secure 4-digit PIN will be assigned exclusively to this student and package, and immediately delivered to the student's LMS notifications.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPackagePinModal({ ...packagePinModal, open: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={actionBusy} className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" />
              <span>Generate &amp; Send Activation PIN</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Regenerate PIN */}
      <Modal
        open={regenerateModal.open}
        onClose={() => setRegenerateModal({ ...regenerateModal, open: false })}
        title="Regenerate Activation PIN"
        description="Issues a new 4-digit PIN for this learner and invalidates the previous PIN"
      >
        <form onSubmit={handleRegeneratePin} className="space-y-4">
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
            <strong>Audit Safeguard:</strong> Regenerating the PIN will permanently invalidate the previous PIN. The student will receive an LMS notification with their new PIN.
          </div>

          <Input
            label="Reason for Regeneration"
            placeholder="e.g. Student misplaced PIN / PIN expired"
            value={regenerateModal.reason}
            onChange={(e) => setRegenerateModal({ ...regenerateModal, reason: e.target.value })}
            required
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRegenerateModal({ ...regenerateModal, open: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={actionBusy}>
              Confirm Regeneration
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Reset Activation Confirmation */}
      <Modal
        open={resetModal.open}
        onClose={() => setResetModal({ ...resetModal, open: false })}
        title="Reset Device Activation"
        description="Clears the current hardware lock so the student can activate on a replacement computer."
      >
        <form onSubmit={handleResetActivation} className="space-y-4">
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 leading-relaxed">
            <strong>Hardware Binding Reset:</strong> The current primary device (System A) binding will be cleared. The student will be able to activate on their replacement computer.
          </div>

          <Input
            label="Reason for Reset"
            placeholder="e.g. Student formatted laptop / Changed primary computer"
            value={resetModal.reason}
            onChange={(e) => setResetModal({ ...resetModal, reason: e.target.value })}
            required
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetModal({ ...resetModal, open: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={actionBusy}>
              Confirm Reset
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Revoke Activation Confirmation */}
      <Modal
        open={revokeModal.open}
        onClose={() => setRevokeModal({ ...revokeModal, open: false })}
        title="Revoke Device Activation"
        description="Immediately revokes course access and blocks all devices."
      >
        <form onSubmit={handleRevokeActivation} className="space-y-4">
          <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-900">
            <strong>Critical:</strong> The learner will be locked out of lessons, videos, and study materials immediately.
          </div>

          <Input
            label="Reason for Revocation"
            placeholder="e.g. Payment chargeback / Policy violation"
            value={revokeModal.reason}
            onChange={(e) => setRevokeModal({ ...revokeModal, reason: e.target.value })}
            required
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeModal({ ...revokeModal, open: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="bg-red-600 hover:bg-red-700 text-white" loading={actionBusy}>
              Confirm Revocation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
