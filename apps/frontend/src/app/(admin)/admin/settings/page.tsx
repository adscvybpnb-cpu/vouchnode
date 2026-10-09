'use client';
import { ChangeEvent, useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminService } from '@/services/admin.service';
import { APP_NAME } from '@/lib/constants';
type Setting = { key: string; value: string; type: string; group: string; description?: string | null };
export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]); const [draft, setDraft] = useState<Record<string, string>>({}); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const load = () => { setLoading(true); setError(''); void adminService.getSettings().then((items) => { setSettings(items as Setting[]); setDraft(Object.fromEntries((items as Setting[]).map((item) => [item.key, item.value]))); }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load settings.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const save = () => { setSaving(true); setSaved(false); setError(''); const editableDraft = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'site_name')); void adminService.updateSettings(editableDraft).then((items) => { const normalized = items as Setting[]; setSettings(normalized); setDraft(Object.fromEntries(normalized.map((item) => [item.key, item.value]))); setSaved(true); }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to save settings.')).finally(() => setSaving(false)); };
  const updateFastLaunchSetting = async (enabled: boolean) => {
    const previousValue = draft.seller_fast_launch_enabled;
    const nextValue = String(enabled);
    setSaved(false);
    setError('');
    setDraft((current) => ({ ...current, seller_fast_launch_enabled: nextValue }));
    setSaving(true);
    try {
      const items = await adminService.updateSettings({ seller_fast_launch_enabled: nextValue });
      const normalized = items as Setting[];
      const savedSetting = normalized.find((setting) => setting.key === 'seller_fast_launch_enabled');
      if (!savedSetting || savedSetting.value.toLowerCase() !== nextValue) {
        throw new Error('The server did not confirm the fast-launch setting.');
      }
      setSettings(normalized);
      setDraft((current) => ({ ...current, seller_fast_launch_enabled: savedSetting.value }));
      setSaved(true);
    } catch (requestError) {
      setDraft((current) => ({ ...current, seller_fast_launch_enabled: previousValue || 'false' }));
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the fast-launch setting.');
    } finally {
      setSaving(false);
    }
  };
  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploading(true); setError(''); setSaved(false);
    try {
      const result = await adminService.uploadLogo(file);
      setDraft((current) => ({ ...current, site_logo_url: result.logoUrl }));
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to upload logo.');
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  };
  const brandingKeys = new Set(['site_name', 'site_logo_url', 'site_description', 'site_keywords']);
  const renderSetting = (setting: Setting) => (
    <label key={setting.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <span className="text-sm font-semibold text-white">{setting.key}</span>
      <span className="mt-1 block text-xs text-slate-500">{setting.description || `${setting.group} setting (${setting.type.toLowerCase()})`}</span>
      {setting.type === 'BOOLEAN'
        ? <input type="checkbox" checked={draft[setting.key] === 'true'} disabled={saving && setting.key === 'seller_fast_launch_enabled'} onChange={(event) => setting.key === 'seller_fast_launch_enabled' ? void updateFastLaunchSetting(event.target.checked) : setDraft((current) => ({ ...current, [setting.key]: String(event.target.checked) }))} className="mt-3 h-4 w-4 accent-cyan-400" />
        : <Input className="mt-3" type={setting.type === 'NUMBER' ? 'number' : 'text'} step={setting.type === 'NUMBER' ? 'any' : undefined} value={setting.key === 'site_name' ? APP_NAME : draft[setting.key] || ''} disabled={setting.key === 'site_name'} onChange={(event) => setDraft((current) => ({ ...current, [setting.key]: event.target.value }))} />}
      {setting.key === 'site_logo_url' && <div className="mt-3 flex items-center gap-3"><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} disabled={logoUploading} className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-400/15 file:px-3 file:py-2 file:text-cyan-200" />{logoUploading && <span className="text-xs text-slate-400">Uploading...</span>}</div>}
    </label>
  );
  return <AdminPage title="Settings" description="Manage live branding, platform controls, fees, and maintenance mode." loading={loading} error={error} onRetry={load} actions={<Button onClick={save} isLoading={saving} disabled={settings.length === 0}>Save changes</Button>}>{settings.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">No system settings have been configured.</p> : <div className="space-y-6">{saved && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">Settings saved.</p>}<section><h2 className="mb-3 text-lg font-semibold text-white">Global branding</h2><div className="grid gap-4 md:grid-cols-2">{settings.filter((setting) => brandingKeys.has(setting.key)).map(renderSetting)}</div></section><section><h2 className="mb-3 text-lg font-semibold text-white">Platform controls</h2><div className="grid gap-4 md:grid-cols-2">{settings.filter((setting) => !brandingKeys.has(setting.key)).map(renderSetting)}</div></section></div>}</AdminPage>;
}
