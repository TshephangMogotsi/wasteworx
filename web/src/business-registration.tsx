import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import { countries } from './countries';
import { api } from './api';

type Site = { address: string; city: string; name: string };
type Form = {
  contact_email: string; contact_name: string; contact_phone: string; contact_role: string;
  country_code: string; evidence_notes: string; evidence_reference: string; industry: string;
  registered_name: string; registration_exception: string; registration_number: string;
  service_needs: string; sites: Site[]; trading_name: string;
};

const blankSite = (): Site => ({ address: '', city: '', name: '' });
const blankForm = (): Form => ({
  contact_email: '', contact_name: '', contact_phone: '', contact_role: '', country_code: 'BW',
  evidence_notes: '', evidence_reference: '', industry: '', registered_name: '', registration_exception: '',
  registration_number: '', service_needs: '', sites: [blankSite()], trading_name: '',
});
const stages = ['Business', 'Contact', 'Sites', 'Evidence', 'Review'];

function hasEmail(value: string) { return /^\S+@\S+\.\S+$/.test(value); }

export function BusinessRegistration() {
  const [form, setForm] = useState<Form>(blankForm); const [step, setStep] = useState(0); const [siteIndex, setSiteIndex] = useState(0);
  const [noNumber, setNoNumber] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`); const navigate = useNavigate();
  const set = <K extends Exclude<keyof Form, 'sites'>>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submitIssue = () => {
    if (!form.registered_name.trim() || !form.industry.trim() || (!form.registration_number.trim() && !form.registration_exception.trim())) return 'Enter the business identity details.';
    if (!form.contact_name.trim() || !form.contact_phone.trim() || !hasEmail(form.contact_email)) return 'Enter a contact name, phone number and valid email.';
    if (form.sites.some((site) => !site.name.trim() || !site.address.trim() || !site.city.trim())) return 'Complete each collection site.';
    if (!form.evidence_reference.trim()) return 'Enter the verification reference.';
    return null;
  };
  const next = () => { setError(null); setStep((current) => Math.min(current + 1, 4)); };
  async function save(submit: boolean) {
    if (submit) { const issue = submitIssue(); if (issue) return setError(issue); }
    setBusy(true); setError(null);
    try { await api('/businesses', { method: 'POST', body: JSON.stringify({ ...form, submit, request_key: requestKey.current }) }); navigate('/admin/businesses'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save the business.'); }
    finally { setBusy(false); }
  }
  const activeSite = form.sites[siteIndex];
  return <main className="page"><p className="eyebrow">BUSINESS ONBOARDING</p><h1>Register a business</h1><div className="steps">{stages.map((label, index) => <button key={label} className={index === step ? 'active' : ''} disabled={index > step} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</div>
    <section className="form-card">{error ? <p className="message">{error}</p> : null}
      {step === 0 ? <><h2>Business identity</h2><p>Start with the business name and registration details.</p><label>Registered business name<input value={form.registered_name} onChange={(event) => set('registered_name', event.target.value)} /></label><label>Trading name <small>(optional)</small><input value={form.trading_name} onChange={(event) => set('trading_name', event.target.value)} /></label><label className="check"><input type="checkbox" checked={noNumber} onChange={(event) => { setNoNumber(event.target.checked); set('registration_number', ''); set('registration_exception', ''); }} />No business number available</label>{noNumber ? <label>Why is no business number available?<textarea value={form.registration_exception} onChange={(event) => set('registration_exception', event.target.value)} /></label> : <label>Business registration number<input value={form.registration_number} onChange={(event) => set('registration_number', event.target.value)} /></label>}<div className="business-field-row"><div className="business-country"><label>Country</label><div className="country-select"><select value={form.country_code} onChange={(event) => set('country_code', event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select><ChevronDown aria-hidden="true" className="select-chevron-icon" size={28} strokeWidth={3} /></div></div><div className="business-industry"><label>Industry</label><input value={form.industry} onChange={(event) => set('industry', event.target.value)} /></div></div></> : null}
      {step === 1 ? <><h2>Primary contact</h2><div className="contact-field-row"><div className="contact-major"><label>Name<input value={form.contact_name} onChange={(event) => set('contact_name', event.target.value)} /></label></div><div className="contact-minor"><label>Position <small>(optional)</small><input value={form.contact_role} onChange={(event) => set('contact_role', event.target.value)} /></label></div></div><div className="contact-field-row"><div className="contact-major"><label>Email<input type="email" value={form.contact_email} onChange={(event) => set('contact_email', event.target.value)} /></label></div><div className="contact-minor"><label>Phone number<input value={form.contact_phone} onChange={(event) => set('contact_phone', event.target.value)} /></label></div></div><label>Service needs <small>(optional)</small><textarea value={form.service_needs} onChange={(event) => set('service_needs', event.target.value)} placeholder="Materials, quantities and collection frequency" /></label></> : null}
      {step === 2 ? <><h2>Collection sites</h2><div className="site-tabs">{form.sites.map((site, index) => <button key={index} className={siteIndex === index ? 'active' : ''} onClick={() => setSiteIndex(index)}>Site {index + 1}</button>)}<button onClick={() => { setForm((current) => ({ ...current, sites: [...current.sites, blankSite()] })); setSiteIndex(form.sites.length); }}>+ Add site</button></div><label>Site name<input value={activeSite.name} onChange={(event) => setForm((current) => ({ ...current, sites: current.sites.map((site, index) => index === siteIndex ? { ...site, name: event.target.value } : site) }))} /></label><label>Street address<input value={activeSite.address} onChange={(event) => setForm((current) => ({ ...current, sites: current.sites.map((site, index) => index === siteIndex ? { ...site, address: event.target.value } : site) }))} /></label><label>City<input value={activeSite.city} onChange={(event) => setForm((current) => ({ ...current, sites: current.sites.map((site, index) => index === siteIndex ? { ...site, city: event.target.value } : site) }))} /></label></> : null}
      {step === 3 ? <><h2>Verification evidence</h2><p>Record the document or reference checked. Internal notes are only visible to WasteWorx staff.</p><label>Document or verification reference<input value={form.evidence_reference} onChange={(event) => set('evidence_reference', event.target.value)} /></label><label>Internal evidence notes <small>(optional)</small><textarea value={form.evidence_notes} onChange={(event) => set('evidence_notes', event.target.value)} /></label></> : null}
      {step === 4 ? <><h2>Review registration</h2><dl><dt>Business</dt><dd>{form.registered_name}</dd><dt>Country</dt><dd>{countries.find((country) => country.code === form.country_code)?.name}</dd><dt>Contact</dt><dd>{form.contact_name} · {form.contact_email}</dd><dt>Sites</dt><dd>{form.sites.map((site) => site.name || 'Untitled site').join(', ')}</dd><dt>Evidence</dt><dd>{form.evidence_reference}</dd></dl></> : null}
      <div className="form-actions"><button className="secondary" disabled={busy || step === 0} onClick={() => { setError(null); setStep((current) => current - 1); }}>Back</button><button className="secondary" disabled={busy} onClick={() => void save(false)}>Save draft</button>{step < 4 ? <button className="primary" onClick={next}>Continue</button> : <button className="primary" disabled={busy} onClick={() => void save(true)}>{busy ? 'Submitting…' : 'Submit for verification'}</button>}</div>
    </section></main>;
}
