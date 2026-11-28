import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  GraduationCap,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getActivationStatus, toErrorMessage } from '../api/client.js';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import Badge from '../components/common/Badge.jsx';

const EDUCATION_OPTIONS = [
  "Bachelor's Degree (Engineering / Tech)",
  "Bachelor's Degree (Commerce / Business / Arts / Science)",
  "Master's Degree / Post-Graduation",
  'Diploma / Vocational Training',
  'Higher Secondary / High School',
  'Working Professional (Transitioning to Data / Tech)',
  'Other',
];

export default function PersonalDetails() {
  const { student, submitProfileCompletion, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: student?.name || '',
    phone: student?.phone || '',
    city: student?.city || '',
    education: student?.education || '',
    headline: student?.headline || '',
    bio: student?.bio || '',
  });

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(student?.profileCompleted));
  const [activationData, setActivationData] = useState(null);

  useEffect(() => {
    if (student) {
      setForm((prev) => ({
        name: student.name || prev.name,
        phone: student.phone || prev.phone,
        city: student.city || prev.city,
        education: student.education || prev.education,
        headline: student.headline || prev.headline,
        bio: student.bio || prev.bio,
      }));
      if (student.profileCompleted) {
        setSubmitted(true);
      }
    }
  }, [student]);

  useEffect(() => {
    if (isAuthenticated) {
      getActivationStatus()
        .then(setActivationData)
        .catch(() => {});
    }
  }, [isAuthenticated, submitted]);

  const setField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Full name is required';
    if (!form.phone.trim()) {
      errs.phone = 'Contact phone number is required';
    } else if (!/^[+\d][\d\s-]{6,19}$/.test(form.phone.trim())) {
      errs.phone = 'Enter a valid phone number (e.g. +91 9876543210)';
    }
    if (!form.city.trim()) errs.city = 'City / Location is required';
    if (!form.education.trim()) errs.education = 'Educational background is required';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await submitProfileCompletion(form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(toErrorMessage(err, 'Failed to save personal details. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Learner Onboarding</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Complete Your Personal Details
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Please provide your details below. Once submitted, our Admin team will verify your payment, assign your course package, and deliver your 4-digit activation PIN.
          </p>
        </div>

        {/* 3-Step Onboarding Pipeline Indicator */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
              submitted ? 'bg-emerald-50 border-emerald-200' : 'bg-primary-50 border-primary-200'
            }`}>
              <div className={`p-2 rounded-lg ${
                submitted ? 'bg-emerald-600 text-white' : 'bg-primary-600 text-white'
              }`}>
                {submitted ? <CheckCircle2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">1. Personal Details</span>
                <span className={submitted ? 'text-emerald-700 font-medium' : 'text-primary-700 font-medium'}>
                  {submitted ? 'Completed' : 'In Progress'}
                </span>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
              activationData?.paymentStatus === 'verified'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`p-2 rounded-lg ${
                activationData?.paymentStatus === 'verified'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                <Clock className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">2. Payment Verification</span>
                <span className={activationData?.paymentStatus === 'verified' ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {activationData?.paymentStatus === 'verified' ? 'Payment Verified' : 'Awaiting Admin'}
                </span>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
              activationData?.isActivated
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`p-2 rounded-lg ${
                activationData?.isActivated ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">3. PIN Activation</span>
                <span className={activationData?.isActivated ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {activationData?.isActivated ? 'Courses Unlocked' : 'Single-use 4-Digit PIN'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Status Banner when Details are Submitted */}
        {submitted ? (
          <div className="bg-white rounded-2xl border border-emerald-200 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">
                  Personal Details Submitted Successfully!
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your onboarding information is saved. Your payment verification request is currently active in the Admin Dashboard.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs text-slate-700">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Registered Name</span>
                <span className="font-semibold text-slate-900">{student?.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Registered Email</span>
                <span className="font-mono text-slate-900">{student?.email}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Contact Phone</span>
                <span className="font-semibold text-slate-900">{student?.phone || form.phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Education Background</span>
                <span className="font-semibold text-slate-900">{student?.education || form.education}</span>
              </div>
            </div>

            <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-primary-900 font-semibold text-sm">
                <KeyRound className="h-4 w-4 text-primary-600" />
                <span>What happens next?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Once the Administrator verifies your payment and assigns your course package (Core Skills, Advanced Skills, or Full LMS), you will receive an LMS notification containing your <strong>individual 4-digit activation PIN</strong>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              {activationData?.isActivated ? (
                <Button
                  variant="primary"
                  to="/my-courses"
                  className="w-full sm:w-auto flex items-center justify-center gap-2"
                  onClick={() => navigate('/my-courses')}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Go to My Courses</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  to="/activate"
                  className="w-full sm:w-auto flex items-center justify-center gap-2"
                  onClick={() => navigate('/activate')}
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Enter Activation PIN</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                to="/notifications"
                className="w-full sm:w-auto"
                onClick={() => navigate('/notifications')}
              >
                Check LMS Notifications
              </Button>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-xs text-primary-600 hover:text-primary-700 underline py-2 sm:ml-auto"
              >
                Edit details
              </button>
            </div>
          </div>
        ) : (
          /* Personal Details Form */
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
            {submitError && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={form.name}
                      onChange={setField('name')}
                      placeholder="e.g. Rahul Sharma"
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors ${
                        errors.name ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'
                      }`}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                {/* Email (Read-only) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Registered Email (Read-only)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={student?.email || ''}
                      disabled
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500 cursor-not-allowed font-mono"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={setField('phone')}
                      placeholder="e.g. +91 9876543210"
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors ${
                        errors.phone ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'
                      }`}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                </div>

                {/* City / Location */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    City / Location <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={form.city}
                      onChange={setField('city')}
                      placeholder="e.g. Bangalore, Karnataka"
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors ${
                        errors.city ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'
                      }`}
                    />
                  </div>
                  {errors.city && <p className="text-xs text-red-600 mt-1">{errors.city}</p>}
                </div>
              </div>

              {/* Educational Background */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Educational Background <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <select
                    value={form.education}
                    onChange={setField('education')}
                    className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors ${
                      errors.education ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <option value="">Select your education level...</option>
                    {EDUCATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.education && <p className="text-xs text-red-600 mt-1">{errors.education}</p>}
              </div>

              {/* Headline / Career Goal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Professional Goal / Headline <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={form.headline}
                    onChange={setField('headline')}
                    placeholder="e.g. Aspiring Data Analyst / BI Developer"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Bio / Learning Objectives */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Learning Objectives / Background <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={setField('bio')}
                  placeholder="Share a short note about what you hope to achieve in this program..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Your information is protected under LMS privacy standards.</span>
                </p>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="flex items-center gap-2"
                >
                  <span>{submitting ? 'Saving Details...' : 'Submit Personal Details'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
