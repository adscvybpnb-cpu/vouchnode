'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, ExternalLink, Globe, Lock, Mail, MapPin, MessageCircle, Save, ShieldCheck, Twitter, Github, Linkedin, User as UserIcon } from 'lucide-react';
import Cropper, { Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';
import type { User } from '@/store/auth.store';
import { telegramService } from '@/services/telegram.service';
import { API_ORIGIN } from '@/lib/constants';

interface ProfileForm {
  displayName: string;
  username: string;
  email: string;
  bio: string;
  countryCode: string;
  timezone: string;
  language: string;
  twitterUrl: string;
  linkedinUrl: string;
  githubUrl: string;
  websiteUrl: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const backendOrigin = API_ORIGIN;
const resolveAvatarUrl = (url: string) => url.startsWith('/') ? `${backendOrigin}${url}` : url;
const getUserAvatar = (user: User | null) => user?.avatarUrl || (user as any)?.avatar || (user as any)?.image || '';

const COMMON_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Lagos',
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
];

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [profile, setProfile] = useState<ProfileForm>({
    displayName: '',
    username: '',
    email: '',
    bio: '',
    countryCode: '',
    timezone: '',
    language: 'en',
    twitterUrl: '',
    linkedinUrl: '',
    githubUrl: '',
    websiteUrl: '',
  });
  const [password, setPassword] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(() => getUserAvatar(user));
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoadingTelegram, setIsLoadingTelegram] = useState(false);
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const isMounted = useRef(true);
  const avatarUploadInFlight = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropSourceUrlRef = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (cropSourceUrlRef.current) {
        URL.revokeObjectURL(cropSourceUrlRef.current);
        cropSourceUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfile({
      displayName: user.displayName || user.username || '',
      username: user.username || '',
      email: user.email || '',
      bio: user.bio || '',
      countryCode: user.countryCode || '',
      timezone: user.timezone || '',
      language: user.language || 'en',
      twitterUrl: user.twitterUrl || '',
      linkedinUrl: user.linkedinUrl || '',
      githubUrl: user.githubUrl || '',
      websiteUrl: user.websiteUrl || '',
    });
    setAvatarPreview(getUserAvatar(user));
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'security') return;
    let cancelled = false;
    const refreshTelegramStatus = async () => {
      try {
        const status = await telegramService.getLinkStatus();
        if (!cancelled) {
          setTelegramLinked(status.linked);
          if (status.linked) setTelegramLink(null);
          setTelegramError('');
        }
      } catch (reason) {
        if (!cancelled) setTelegramError(reason instanceof Error ? reason.message : 'Unable to load Telegram link status.');
      } finally {
        if (!cancelled) setIsLoadingTelegram(false);
      }
    };

    setIsLoadingTelegram(true);
    void refreshTelegramStatus();
    const interval = telegramLink ? window.setInterval(() => void refreshTelegramStatus(), 4000) : undefined;
    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [activeTab, telegramLink]);

  const handleTelegramLink = async () => {
    setTelegramError('');
    setIsLinkingTelegram(true);
    try {
      const link = await telegramService.createLink();
      setTelegramLink(link.url);
    } catch (reason) {
      setTelegramError(reason instanceof Error ? reason.message : 'Unable to create a Telegram link.');
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  const updateProfileField = (field: keyof ProfileForm, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      event.target.value = '';
      return;
    }
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
    }
    const sourceUrl = URL.createObjectURL(file);
    cropSourceUrlRef.current = sourceUrl;
    setSelectedAvatarFile(file);
    setCropSourceUrl(sourceUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError('');
    event.target.value = '';
  };

  const cancelAvatarCrop = () => {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    setCropSourceUrl(null);
    setSelectedAvatarFile(null);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createCroppedAvatar = async (sourceUrl: string, area: Area, sourceFile: File) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error('Unable to load the selected image.'));
      loadedImage.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = area.width;
    canvas.height = area.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the cropped image.');
    context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, sourceFile.type || 'image/jpeg', 0.92));
    if (!blob) throw new Error('Unable to create the cropped image.');
    return new File([blob], sourceFile.name, { type: blob.type });
  };

  const saveCroppedAvatar = async () => {
    if (avatarUploadInFlight.current || !cropSourceUrl || !croppedAreaPixels || !selectedAvatarFile) return;
    avatarUploadInFlight.current = true;
    setIsUploadingAvatar(true);
    setError('');
    try {
      const croppedFile = await createCroppedAvatar(cropSourceUrl, croppedAreaPixels, selectedAvatarFile);
      const formData = new FormData();
      formData.append('avatar', croppedFile);
      const response = await apiClient.upload<{ avatarUrl: string }>('/users/profile/avatar', formData);
      if (response.error || !response.data?.avatarUrl) throw new Error(response.error || 'Avatar upload did not return a URL.');
      if (!isMounted.current) return;
      const absoluteAvatarUrl = resolveAvatarUrl(response.data.avatarUrl);
      updateUser({ avatarUrl: absoluteAvatarUrl });
      setAvatarPreview(absoluteAvatarUrl);
      setAvatarLoadFailed(false);
      setMessage('Profile picture updated successfully.');
      cancelAvatarCrop();
    } catch {
      setError('We could not upload your profile picture. Please try again.');
    } finally {
      avatarUploadInFlight.current = false;
      if (isMounted.current) setIsUploadingAvatar(false);
    }
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const updateData: any = {
        displayName: profile.displayName.trim(),
        bio: profile.bio.trim() || null,
        countryCode: profile.countryCode.trim() || null,
        timezone: profile.timezone.trim() || null,
        language: profile.language.trim() || null,
        twitterUrl: profile.twitterUrl.trim() || null,
        linkedinUrl: profile.linkedinUrl.trim() || null,
        githubUrl: profile.githubUrl.trim() || null,
        websiteUrl: profile.websiteUrl.trim() || null,
      };

      const response = await apiClient.patch('/users/profile', updateData);
      if (response.error) throw new Error(response.error);

      if (avatarPreview && !avatarPreview.startsWith('blob:') && !avatarPreview.startsWith('http')) {
        updateData.avatarUrl = avatarPreview;
      }

      const finalResponse = await apiClient.patch('/users/profile', {
        ...updateData,
        avatarUrl: avatarPreview && !avatarPreview.startsWith('blob:') ? avatarPreview : undefined,
      });

      if (finalResponse.error) throw new Error(finalResponse.error);
      if (finalResponse.data) updateUser(finalResponse.data as Partial<User>);
      setMessage('Profile changes saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (password.newPassword !== password.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (password.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await apiClient.patch('/users/me/password', {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
      });
      if (response.error) throw new Error(response.error);
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password updated. Please sign in again on your other devices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const avatarSrc = avatarPreview || getUserAvatar(user);

  return (
    <div className="mx-auto max-w-5xl space-y-8 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-indigo-400">Account settings</p>
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
        <p className="text-slate-400">Manage your personal details, social links, and account security.</p>
      </div>

      {/* Notifications */}
      {(message || error) && (
        <div className={`rounded-xl border px-5 py-4 text-sm font-medium ${error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {error || message}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex w-full overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1 sm:w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            Profile
          </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'security'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Lock className="h-4 w-4" />
          Security
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <form onSubmit={handleProfileSubmit} className="space-y-6">
          {/* Avatar Section */}
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/15 p-2.5 text-indigo-300">
                <UserIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Profile Picture</h2>
                <p className="text-sm text-slate-400">Upload a photo to personalize your account.</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-indigo-500/40 bg-indigo-500/10 text-4xl font-bold text-indigo-200 shadow-lg shadow-indigo-500/10">
                {avatarSrc && !avatarLoadFailed ? (
                  <img
                    src={resolveAvatarUrl(avatarSrc)}
                    alt="Profile avatar"
                    crossOrigin="anonymous"
                    onError={() => setAvatarLoadFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{(profile.displayName || user?.username || '?').slice(0, 1).toUpperCase()}</span>
                )}
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  aria-label="Choose profile picture"
                  disabled={isUploadingAvatar}
                  className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 transition-opacity hover:opacity-100 opacity-0"
                >
                  <Camera className="h-6 w-6 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleAvatarChange}
                  disabled={isUploadingAvatar}
                  aria-label="Profile picture file"
                />
                {isUploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </div>
              <div className="text-center sm:text-left">
                <p className="font-medium text-white">Profile Picture</p>
                <p className="mt-1 text-sm text-slate-400">JPG, PNG or WEBP. Max 5MB.</p>
                <p className="mt-1 text-xs text-slate-500">Click the avatar to upload.</p>
              </div>
            </div>
          </section>

          {/* Personal Information */}
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/15 p-2.5 text-indigo-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Personal Information</h2>
                <p className="text-sm text-slate-400">Update your public profile details.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Full Name</Label>
                <Input
                  id="displayName"
                  value={profile.displayName}
                  onChange={(e) => updateProfileField('displayName', e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={profile.username}
                  readOnly
                  disabled
                  className="cursor-not-allowed opacity-60"
                />
                <p className="text-xs text-slate-500">Username changes are handled by support.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    value={profile.email}
                    onChange={(e) => updateProfileField('email', e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="countryCode"
                    className="pl-9"
                    value={profile.countryCode}
                    onChange={(e) => updateProfileField('countryCode', e.target.value.toUpperCase())}
                    placeholder="US"
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <textarea
                  id="bio"
                  rows={3}
                  maxLength={500}
                  value={profile.bio}
                  onChange={(e) => updateProfileField('bio', e.target.value)}
                  placeholder="Tell us a little about yourself..."
                  className="w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
                />
                <p className="text-xs text-slate-500 text-right">{profile.bio.length}/500</p>
              </div>
            </div>
          </section>

          {/* Social Links */}
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/15 p-2.5 text-cyan-300">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Social Links</h2>
                <p className="text-sm text-slate-400">Connect your social profiles.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="twitterUrl">Twitter / X</Label>
                <div className="relative">
                  <Twitter className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="twitterUrl"
                    className="pl-9"
                    value={profile.twitterUrl}
                    onChange={(e) => updateProfileField('twitterUrl', e.target.value)}
                    placeholder="https://twitter.com/username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn</Label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="linkedinUrl"
                    className="pl-9"
                    value={profile.linkedinUrl}
                    onChange={(e) => updateProfileField('linkedinUrl', e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="githubUrl">GitHub</Label>
                <div className="relative">
                  <Github className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="githubUrl"
                    className="pl-9"
                    value={profile.githubUrl}
                    onChange={(e) => updateProfileField('githubUrl', e.target.value)}
                    placeholder="https://github.com/username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="websiteUrl"
                    className="pl-9"
                    value={profile.websiteUrl}
                    onChange={(e) => updateProfileField('websiteUrl', e.target.value)}
                    placeholder="https://yourwebsite.com"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-300">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Preferences</h2>
                <p className="text-sm text-slate-400">Customize your experience.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={profile.timezone}
                  onChange={(e) => updateProfileField('timezone', e.target.value)}
                  className="w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
                >
                  <option value="">Select timezone</option>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  value={profile.language}
                  onChange={(e) => updateProfileField('language', e.target.value)}
                  className="w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button type="submit" isLoading={isSaving} disabled={isUploadingAvatar} className="min-w-[160px]">
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </form>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-300">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Password & Security</h2>
                <p className="text-sm text-slate-400">Use a strong password to protect your account.</p>
              </div>
            </div>
            <form onSubmit={handlePasswordSubmit} className="max-w-2xl space-y-5">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={password.currentPassword}
                  onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password.newPassword}
                    onChange={(e) => setPassword({ ...password, newPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password.confirmPassword}
                    onChange={(e) => setPassword({ ...password, confirmPassword: e.target.value })}
                    required
                  />
                </div>
              </div>
              <Button type="submit" variant="outline" isLoading={isChangingPassword}>
                Update Password
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-sky-500/15 p-2.5 text-sky-300">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Private Telegram notifications</h2>
                <p className="text-sm text-slate-400">Link your private Telegram chat to receive account and marketplace alerts.</p>
              </div>
            </div>
            {telegramError && <p role="alert" className="mb-4 text-sm text-red-300">{telegramError}</p>}
            {isLoadingTelegram ? (
              <p className="text-sm text-slate-400">Checking Telegram link...</p>
            ) : telegramLinked ? (
              <p role="status" className="text-sm text-emerald-300">Your private Telegram chat is linked.</p>
            ) : telegramLink ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">Open the bot and press Start to complete linking. This link expires in 10 minutes.</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Open Telegram
                  </a>
                  <Button type="button" variant="outline" isLoading={isLinkingTelegram} onClick={() => void handleTelegramLink()}>
                    Generate a fresh link
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" isLoading={isLinkingTelegram} onClick={() => void handleTelegramLink()}>
                <MessageCircle className="mr-2 h-4 w-4" /> Link Telegram Account
              </Button>
            )}
          </section>

          {/* Active Sessions */}
          <section className="rounded-2xl border border-white/10 bg-[#141420] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-rose-500/15 p-2.5 text-rose-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Active Sessions</h2>
                <p className="text-sm text-slate-400">Manage your logged-in devices.</p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-500">
              Session management will be available in a future update.
            </div>
          </section>
        </div>
      )}
      {cropSourceUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-crop-title"
        >
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#141420] p-5 shadow-2xl">
            <div className="mb-4">
              <h2 id="avatar-crop-title" className="text-lg font-semibold text-white">Crop profile picture</h2>
              <p className="mt-1 text-sm text-slate-400">Drag to position your image and use the slider to zoom.</p>
            </div>
            <div className="relative h-[min(70vw,24rem)] w-full overflow-hidden rounded-xl bg-black">
              <Cropper
                image={cropSourceUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            </div>
            <label className="mt-5 block text-sm text-slate-300">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="mt-2 w-full accent-indigo-500"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={cancelAvatarCrop} disabled={isUploadingAvatar}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveCroppedAvatar()} isLoading={isUploadingAvatar}>
                Crop &amp; Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
