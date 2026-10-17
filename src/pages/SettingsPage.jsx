import { useState } from 'react';
import { ArrowRight, Settings } from 'lucide-react';
import Button from '../components/common/Button';
import { useTheme } from '../hooks/useTheme';

function profileName(user) {
  return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
}

export default function SettingsPage({ user, onUpdate }) {
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState(() => ({
    firstName: user?.firstName || profileName(user).split(' ')[0] || '',
    lastName: user?.lastName || profileName(user).split(' ').slice(1).join(' '),
    username: user?.username || '',
    phoneNumber: user?.phoneNumber || '',
    email: user?.email || '',
  }));
  const [saved, setSaved] = useState(false);

  const update = (key) => (event) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };
  const submit = (event) => {
    event.preventDefault();
    const updates = {
      ...form,
      name: [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' '),
    };
    onUpdate(updates);
    setSaved(true);
  };

  return (
    <main className="inner-page settings-page">
      <div className="page-title">
        <span className="eyebrow"><Settings size={13} /> ACCOUNT PREFERENCES</span>
        <h1>Settings.</h1>
        <p>Keep your CricPulse profile up to date.</p>
      </div>
      <section className="settings-card">
        <h2>Your profile</h2>
        <p className="settings-note">Profile changes are saved on this device.</p>
        <form className="form-stack settings-form" onSubmit={submit}>
          <div className="settings-fields">
            <label>First name<input autoComplete="given-name" value={form.firstName || ''} onChange={update('firstName')} /></label>
            <label>Last name<input autoComplete="family-name" value={form.lastName || ''} onChange={update('lastName')} /></label>
            <label>Username<input autoComplete="username" value={form.username || ''} onChange={update('username')} /></label>
            <label>Phone number<input type="tel" autoComplete="tel" value={form.phoneNumber || ''} onChange={update('phoneNumber')} /></label>
            <label>Email address<input type="email" autoComplete="email" value={form.email || ''} onChange={update('email')} /></label>
          </div>
          <div className="settings-submit">
            {saved && <p className="success-message" role="status">Your profile has been saved.</p>}
            <Button type="submit">Save changes <ArrowRight size={16} /></Button>
          </div>
        </form>
        <section className="settings-theme" aria-labelledby="theme-heading">
          <h2 id="theme-heading">Appearance</h2>
          <p className="settings-note">Choose how CricPulse looks on this device.</p>
          <label className="settings-theme-label" htmlFor="theme-preference">Theme</label>
          <select
            id="theme-preference"
            className="settings-theme-select"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </section>
      </section>
    </main>
  );
}
