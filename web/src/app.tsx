import type { Session } from '@supabase/supabase-js';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';

import { supabase } from './supabase';
import { api } from './api';
import { BusinessRegistration } from './business-registration';
import { Households, RegisterHousehold, ResidentPage } from './households';

function Header({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  return <header className="topbar"><Link className="brand" to="/"><span className="brand-mark">W</span><span>Waste<span>Worx</span></span></Link>
    <nav>{session ? <><Link to="/">Home</Link><Link to="/admin">Dashboard</Link><Link to="/admin/businesses">Businesses</Link><Link to="/review">Review pages</Link><button onClick={async () => { await supabase?.auth.signOut(); navigate('/sign-in'); }}>Sign out</button></> : <><Link to="/sign-in">Sign in</Link><Link to="/sign-up">Create account</Link><Link to="/review">Review pages</Link></>}</nav>
  </header>;
}

function SignIn({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent) { event.preventDefault(); if (!supabase) return setError('Supabase is not configured for the migration bridge.'); setBusy(true); setError(null); const { data, error: failure } = await supabase.auth.signInWithPassword({ email, password }); setBusy(false); if (failure || !data.session) return setError(failure?.message ?? 'Unable to sign in.'); onSession(data.session); navigate('/admin'); }
  return <main className="auth-layout"><section className="auth-card"><p className="eyebrow">WASTEWORX</p><h1>Welcome back</h1><p>Sign in to manage household and business recycling operations.</p>{error ? <p className="message">{error}</p> : null}<form onSubmit={submit}><label>Email<input name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label><label>Password<input name="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><Link className="muted-link" to="/forgot-password">Forgot password?</Link></section></main>;
}

function signupConfirmationUrl(search: URLSearchParams) {
  const url = new URL('/confirm-email', window.location.origin);
  const invitation = search.get('invitation');
  if (invitation === 'business' || invitation === 'household') url.searchParams.set('invitation', invitation);
  return url.href;
}

function SignUp() {
  const [search] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!supabase) {
      setError('Account creation is unavailable. Please contact WasteWorx support.');
      return;
    }

    setBusy(true);
    const fallback = 'We couldn’t complete signup. If you’ve already registered, sign in or reset your password. Otherwise, try again in a few minutes.';
    try {
      const { data, error: failure } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: signupConfirmationUrl(search) },
      });

      switch (failure?.code) {
        case 'weak_password':
          setError(failure.message);
          return;
        case 'over_email_send_rate_limit':
        case 'over_request_rate_limit':
          setError('Too many attempts. Wait a few minutes before trying again.');
          return;
        case 'signup_disabled':
          setError('Account creation is unavailable. Please contact WasteWorx support.');
          return;
      }

      if (failure) setError(fallback);
      else setMessage(data.session ? 'Account created.' : 'Check your inbox and spam folder for a confirmation email. If you’ve already registered, sign in or reset your password.');
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-layout"><section className="auth-card">
    <p className="eyebrow">WASTEWORX</p>
    <h1>Create account</h1>
    {error ? <p className="message" role="alert">{error}</p> : null}
    {message ? <p className="success" role="status">{message}</p> : null}
    {message ? <Link className="muted-link" to={`/confirm-email?${search}`}>Resend confirmation email</Link> : null}
    <form onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
    <Link className="muted-link" to={`/sign-in?${search}`}>Sign in</Link>
    <Link className="muted-link" to="/forgot-password">Forgot password?</Link>
  </section></main>;
}

function ConfirmEmail({ session }: { session: Session | null }) {
  const [search] = useSearchParams();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const linkFailed = hash.has('error') || hash.has('error_code') || search.has('error') || search.has('error_code');
  const signedIn = Boolean(session) && !linkFailed;
  const invitation = new URL(signupConfirmationUrl(search)).search;
  const signInUrl = `/sign-in${invitation}`;

  async function resend(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!supabase) {
      setError('Confirmation is currently unavailable. Please contact WasteWorx support.');
      return;
    }

    setBusy(true);
    try {
      const { error: failure } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: signupConfirmationUrl(search) },
      });
      if (failure?.status === 429) {
        setError('Wait a few minutes before requesting another link.');
      } else if (failure && (failure.status ?? 0) >= 500) {
        setError('We couldn’t send a confirmation email. Try again in a few minutes.');
      } else {
        setNotice('If your account still needs confirmation, check your inbox and spam folder for a new link.');
      }
    } catch {
      setError('We couldn’t send a confirmation email. Try again in a few minutes.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-layout"><section className="auth-card">
    <p className="eyebrow">WASTEWORX</p>
    <h1>{signedIn ? 'You’re signed in' : 'Confirm your email'}</h1>
    {signedIn ? <p>Continue to your WasteWorx account.</p> : <>
      <p>{linkFailed ? 'This link may have expired or already been used. If you’ve confirmed your email, sign in. Otherwise, request a fresh link below.' : 'Open the link in your confirmation email. If you need a new link, enter the email you used to sign up.'}</p>
      {error ? <p className="message" role="alert">{error}</p> : null}
      {notice ? <p className="success" role="status">{notice}</p> : null}
      <form onSubmit={resend}>
        <label>Email<input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send a fresh link'}</button>
      </form>
    </>}
    <Link className="muted-link" to={signInUrl}>{signedIn ? 'Continue to WasteWorx' : 'Sign in'}</Link>
  </section></main>;
}

function ForgotPassword() { const [email, setEmail] = useState(''); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); async function submit(event: FormEvent) { event.preventDefault(); if (!supabase) return setError('Supabase is not configured.'); const { error: failure } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` }); if (failure) setError(failure.message); else setMessage('If an account exists, a reset link is on its way.'); } return <main className="auth-layout"><section className="auth-card"><h1>Reset password</h1>{error ? <p className="message">{error}</p> : null}{message ? <p className="success">{message}</p> : null}<form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button className="primary">Send reset link</button></form></section></main>; }
function UpdatePassword() { const [password, setPassword] = useState(''); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); async function submit(event: FormEvent) { event.preventDefault(); if (!supabase) return setError('Supabase is not configured.'); const { error: failure } = await supabase.auth.updateUser({ password }); if (failure) setError(failure.message); else setMessage('Your password has been updated.'); } return <main className="auth-layout"><section className="auth-card"><h1>Choose a new password</h1>{error ? <p className="message">{error}</p> : null}{message ? <p className="success">{message}</p> : null}<form onSubmit={submit}><label>New password<input name="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary">Update password</button></form></section></main>; }

function Dashboard({ session }: { session: Session }) {
  return <main className="page"><p className="eyebrow">OPERATIONS</p><h1>WasteWorx dashboard</h1><p className="lede">Signed in as {session.user.email}. The web-only replacement is now the active frontend foundation.</p><div className="cards"><Link className="card" to="/admin/businesses"><h2>Businesses</h2><p>Register, review and activate business recycling clients.</p></Link><article className="card"><h2>Households</h2><p>Household registration and collection operations are next in the web port.</p></article></div></main>;
}

type Business = { id: string; registered_name: string; verification_status: string; service_status: string; updated_at: string };
function Businesses() {
  const [businesses, setBusinesses] = useState<Business[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => { try { const data = await api<{ businesses: Business[] }>('/businesses'); setBusinesses(data.businesses); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load businesses.'); } finally { setLoading(false); } })(); }, []);
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">BUSINESS ONBOARDING</p><h1>Businesses</h1></div><Link className="primary link-button" to="/admin/businesses/new">Register a business</Link></div>{error ? <p className="message">{error}</p> : null}{loading ? <p>Loading businesses…</p> : businesses.length ? <div className="table">{businesses.map((business) => <article key={business.id}><strong>{business.registered_name || 'Untitled draft'}</strong><span>{business.verification_status === 'draft' ? <Link className="row-link" to={`/admin/businesses/${business.id}/edit`}>Continue draft</Link> : business.verification_status.replaceAll('_', ' ')}</span><span>{business.service_status}</span></article>)}</div> : <section className="empty"><h2>No businesses yet</h2><p>Register the first business recycling client.</p></section>}</main>;
}

const reviewGroups = [
  { title: 'Resident experience', links: [['Home', '/'], ['Activity', '/activity'], ['Sorting guide', '/guide'], ['Rewards', '/rewards'], ['Business account', '/business-account']] },
  { title: 'Operations', links: [['Admin dashboard', '/admin'], ['Businesses', '/admin/businesses'], ['Register a business', '/admin/businesses/new'], ['Households', '/admin/households'], ['Register a household', '/admin/register-household']] },
  { title: 'Authentication', links: [['Sign in', '/sign-in'], ['Create account', '/sign-up'], ['Forgot password', '/forgot-password'], ['Update password', '/update-password']] },
] as const;

function PageReview({ session }: { session: Session | null }) {
  return <main className="page"><p className="eyebrow">UI REVIEW</p><h1>Explore WasteWorx pages</h1><p className="lede">Use this hub to review every screen currently in the web app. Authentication screens require signing out first when you have an active session.</p><div className="review-groups">{reviewGroups.map((group) => <section className="review-group" key={group.title}><h2>{group.title}</h2><div>{group.links.map(([label, path]) => <Link className="review-link" key={path} to={path}>{label}<span>→</span></Link>)}</div></section>)}</div>{!session ? <p className="message">Sign in to review the resident and operations pages.</p> : null}</main>;
}

function Protected({ session, children }: { session: Session | null; children: ReactNode }) { return session ? <>{children}</> : <Navigate to="/sign-in" replace />; }

function PageNotFound({ session }: { session: Session | null }) {
  return <main className="auth-layout">
    <section className="auth-card">
      <p className="eyebrow">WASTEWORX · 404</p>
      <h1>Page not found</h1>
      <p>This link may be out of date, or the page may have moved.</p>
      <Link className="muted-link" to={session ? '/admin' : '/sign-in'}>
        {session ? 'Go to dashboard' : 'Go to sign in'}
      </Link>
    </section>
  </main>;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { if (!supabase) return setReady(true); void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }); const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return <main className="auth-layout"><p>Loading WasteWorx…</p></main>;
  return <><Header session={session} /><Routes><Route path="/review" element={<PageReview session={session} />} /><Route path="/sign-in" element={session ? <Navigate to="/admin" replace /> : <SignIn onSession={setSession} />} /><Route path="/sign-up" element={<SignUp />} /><Route path="/confirm-email" element={<ConfirmEmail session={session} />} /><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/update-password" element={<UpdatePassword />} /><Route path="/" element={<Protected session={session}><ResidentPage eyebrow="HOME" title="WasteWorx"><h2>Collection made simple</h2><p>View your household recycling activity, sorting guide and rewards.</p><div className="cards"><Link className="card" to="/activity">Activity</Link><Link className="card" to="/guide">Sorting guide</Link><Link className="card" to="/rewards">Rewards</Link></div></ResidentPage></Protected>} /><Route path="/activity" element={<Protected session={session}><ResidentPage eyebrow="ACTIVITY" title="Collection activity"><h2>Your collection history</h2><p>Collection tracking will appear here as operations are recorded.</p></ResidentPage></Protected>} /><Route path="/guide" element={<Protected session={session}><ResidentPage eyebrow="SORTING GUIDE" title="Sort it right"><h2>Clean, dry and separated</h2><p>Keep recyclable materials separated and follow the collection guidance from WasteWorx.</p></ResidentPage></Protected>} /><Route path="/rewards" element={<Protected session={session}><ResidentPage eyebrow="REWARDS" title="Rewards"><h2>Earn as you recycle</h2><p>Rewards will show after verified collection activity is connected.</p></ResidentPage></Protected>} /><Route path="/business-account" element={<Protected session={session}><ResidentPage eyebrow="BUSINESS" title="Business account"><h2>Business recycling operations</h2><p>Business administrators can view active sites and collection reporting here.</p></ResidentPage></Protected>} /><Route path="/admin" element={<Protected session={session}><Dashboard session={session!} /></Protected>} /><Route path="/admin/households" element={<Protected session={session}><Households /></Protected>} /><Route path="/admin/register-household" element={<Protected session={session}><RegisterHousehold /></Protected>} /><Route path="/admin/businesses" element={<Protected session={session}><Businesses /></Protected>} /><Route path="/admin/businesses/new" element={<Protected session={session}><BusinessRegistration key="new" /></Protected>} /><Route path="/admin/businesses/:id/edit" element={<Protected session={session}><BusinessRegistration key="edit" /></Protected>} /><Route path="*" element={<PageNotFound session={session} />} /></Routes></>;
}
