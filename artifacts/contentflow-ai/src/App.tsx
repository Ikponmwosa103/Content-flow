import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  useCreateBrand, useCreateContent, useCreateWorkspace, useDeleteBrand, useDeleteContent,
  useGenerateContent, useGetCalendar, useGetContent, useGetDashboard, useGetUsage, useGetWorkspace,
  useHealthCheck, useListBrands, useListContents, useListPlans, useUpdateBrand, useUpdateContent, useUpdateWorkspace,
  getGetDashboardQueryKey, getGetUsageQueryKey, getGetWorkspaceQueryKey, getListBrandsQueryKey,
  getListContentsQueryKey, getGetCalendarQueryKey, getGetContentQueryKey, getHealthCheckQueryKey,
  getListPlansQueryKey, setAuthTokenGetter, setBaseUrl,
} from '@workspace/api-client-react';
import type { Brand, ContentItem, ContentInput, Platform, ContentType, ContentStatus } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Download,
  CircleHelp, Clock3, Copy, Filter, Layers3, LayoutDashboard, LoaderCircle,
  LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, Sparkles, Trash2, WandSparkles, X,
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import './contentflow.css';
import './contentflow-ui-polish.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function getApiBaseUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (import.meta.env.PROD && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('VITE_API_BASE_URL must be an API origin, without a path or query string');
  }
  return url.origin;
}
const apiBaseUrl = getApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
setBaseUrl(apiBaseUrl);
const usesCrossOriginApi = Boolean(apiBaseUrl && apiBaseUrl !== window.location.origin);
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const platformOptions: Platform[] = ['instagram', 'linkedin', 'x', 'facebook', 'tiktok', 'blog', 'email'];
const typeOptions: ContentType[] = ['caption', 'post', 'thread', 'blog', 'email'];
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatDate = (value: string | Date | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date';
const formatUtcDate = (value: string | Date | null) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : '—';
function apiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error && !error.message.startsWith('HTTP ') ? error.message : fallback;
}

function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'brand-mark-small' : ''}`} aria-label="ContentFlow">
    <span className="mark-glyph"><i /><i /><i /></span>{!small && <span className="brand-word">content<span>flow</span></span>}
  </span>;
}
function ClerkCacheInvalidator() {
  const { addListener } = useClerk(); const qc = useQueryClient();
  useEffect(() => {
    let prior: string | null | undefined;
    const off = addListener(({ user }) => { const id = user?.id ?? null; if (prior !== undefined && prior !== id) qc.clear(); prior = id; });
    return off;
  }, [addListener, qc]);
  return null;
}
function ClerkApiTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    if (!usesCrossOriginApi) {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}
const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#327b63', colorForeground: '#222a3b', colorMutedForeground: '#777a7d',
    colorDanger: '#b4473d', colorBackground: '#fffefa', colorInput: '#fffefa',
    colorInputForeground: '#222a3b', colorNeutral: '#e7e1d5', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fffefa] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#222a3b] font-bold', headerSubtitle: 'text-[#777a7d]',
    socialButtonsBlockButtonText: 'text-[#222a3b] font-semibold', formFieldLabel: 'text-[#343b4c] font-semibold',
    footerActionLink: 'text-[#327b63] font-semibold', footerActionText: 'text-[#777a7d]', dividerText: 'text-[#777a7d]',
    identityPreviewEditButton: 'text-[#327b63]', formFieldSuccessText: 'text-[#327b63]', alertText: 'text-[#343b4c]',
    logoBox: 'mb-2', logoImage: 'max-h-9', socialButtonsBlockButton: 'border-[#e7e1d5] rounded-xl',
    formButtonPrimary: 'bg-[#327b63] hover:bg-[#28654f] rounded-xl font-semibold', formFieldInput: 'border-[#e7e1d5] rounded-xl',
    footerAction: 'border-t border-[#eee9df]', dividerLine: 'bg-[#e7e1d5]', alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg border-[#e7e1d5]', formFieldRow: 'gap-2', main: 'gap-4',
  },
};

function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false, testId, className = '' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; testId: string; className?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`btn btn-${variant} ${className}`}>{children}</button>;
}
function Field({ label: fieldLabel, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="field-label">{fieldLabel}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function Input(props: InputHTMLAttributes<HTMLInputElement> & { testId: string }) {
  const { testId, ...rest } = props; return <input {...rest} data-testid={testId} className={`input ${rest.className || ''}`} />;
}
function Select({ value, onChange, options, testId }: { value: string; onChange: (v: string) => void; options: Array<string | { value: string; label: string }>; testId: string }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="input select" data-testid={testId}>{options.map(option => { const v = typeof option === 'string' ? option : option.value; const text = typeof option === 'string' ? (label(v) || 'All') : option.label; return <option value={v} key={v}>{text}</option>; })}</select>;
}
function LoadingBlock({ text = 'Loading your workspace' }: { text?: string }) {
  return <div className="loading-panel" role="status" data-testid="status-loading"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-medium" /><span>{text}</span></div>;
}
function ErrorBlock({ retry, message = 'We could not load this view.' }: { retry: () => void; message?: string }) {
  return <div className="error-panel" role="alert" data-testid="status-error"><CircleHelp size={18} /><div><strong>Something interrupted the flow.</strong><p>{message}</p></div><Button variant="secondary" onClick={retry} testId="button-retry">Try again</Button></div>;
}
function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state" data-testid="empty-state"><span className="empty-orbit"><Layers3 size={21} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
function StatusPill({ status, id }: { status: ContentStatus; id?: number }) { return <span className={`status-pill status-${status}`} data-testid={`status-content-${status}${id ? `-${id}` : ''}`}>{status}</span>; }
function PlatformTag({ platform, id }: { platform: string; id?: number }) { return <span className={`platform-tag platform-${platform}`} data-testid={`text-platform-${platform}${id ? `-${id}` : ''}`}>{platform}</span>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]');
    (firstFocusable || dialogRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'));
      if (!focusables.length) return;
      const first = focusables[0]; const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="modal surface soft-shadow fade-up" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><p className="eyebrow">CONTENTFLOW WORKSPACE</p><h2 className="font-display">{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close" data-testid="button-close-modal"><X size={18} /></button></div>
      {children}
    </section>
  </div>;
}
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/create', label: 'Create', icon: Sparkles },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/brands', label: 'Brands', icon: Layers3 },
  { href: '/pricing', label: 'Plans', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];
function AppShell({ children, title, subtitle, action }: { children: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  const [loc] = useLocation(); const { signOut } = useClerk(); const { user } = useUser(); const [mobileOpen, setMobileOpen] = useState(false); const workspace = useGetWorkspace();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  return <div className="app-frame">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/dashboard" className="side-brand" data-testid="link-brand-home"><BrandMark /></Link>
      <Link href="/settings" className="workspace-chip" data-testid="link-workspace-settings"><span className="workspace-avatar">{(workspace.data?.name || user?.firstName || 'W').slice(0, 1).toUpperCase()}</span><span><b>{workspace.data?.name || 'Your workspace'}</b><small>Creator workspace</small></span><MoreHorizontal size={17} /></Link>
      <p className="side-label">WORKSPACE</p>
      <nav className="side-nav" aria-label="Main navigation">{navItems.map(({ href, label: text, icon: Icon }) => <Link href={href} key={href} onClick={() => setMobileOpen(false)} className={`nav-link ${loc === href ? 'nav-active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}><Icon size={18} strokeWidth={1.8} /><span>{text}</span>{href === '/create' && <span className="nav-new">NEW</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="health-line"><span className={`health-dot ${health.isError ? 'is-down' : health.data ? 'is-up' : ''}`} /><span>{health.isLoading ? 'Connecting…' : health.isError ? 'Connection issue' : 'All systems connected'}</span></div><button className="profile-row" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><span className="profile-avatar">{user?.firstName?.[0] || 'C'}</span><span><b>{user?.fullName || 'Creator'}</b><small>Sign out</small></span><LogOut size={15} /></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileOpen(v => !v)} aria-label="Open menu" data-testid="button-mobile-menu"><Menu size={20} /></button><div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{title}</b></div><div className="top-actions"><span className="connection-status"><i className={`health-dot ${health.isError ? 'is-down' : health.data ? 'is-up' : ''}`} />{health.isLoading ? 'Connecting' : health.isError ? 'Offline' : 'Connected'}</span><Link href="/create" className="btn btn-primary top-create" data-testid="link-create-top"><Plus size={16} /> New draft</Link></div></header>
      <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">YOUR CONTENT DESK</p><h1 className="font-display">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>{children}</div>
    </main>
  </div>;
}
function Page({ title, subtitle, children, action }: { title: string; subtitle: string; children: ReactNode; action?: ReactNode }) {
  return <Protected><AppShell title={title} subtitle={subtitle} action={action}>{children}</AppShell></Protected>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Landing /></Show></>;
}
function AuthPage({ signup = false }: { signup?: boolean }) {
  return <div className="auth-page"><div className="auth-backdrop"><span className="auth-orb" /><span className="auth-orb auth-orb-two" /></div><Link href="/" className="auth-logo"><BrandMark /></Link><div className="auth-intro"><p className="eyebrow">A CLEARER WAY TO CREATE</p><h1 className="font-display">{signup ? 'Make space for better ideas.' : 'Your next good idea is here.'}</h1><p>Keep every brand detail, draft and publishing plan in one calm place.</p></div><div className="auth-card">{signup ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /> : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />}</div><p className="auth-footer">ContentFlow AI <span>·</span> Your ideas, in good company.</p></div>;
}
function Landing() {
  const health = useHealthCheck();
  return <div className="landing">
    <header className="landing-nav"><Link href="/" className="landing-logo" data-testid="link-landing-home"><BrandMark /></Link><div className="landing-nav-links"><a href="#workflow" data-testid="link-workflow">How it works</a><a href="#brand-context" data-testid="link-brand-context">Brand context</a></div><div className="landing-auth"><span className="connection-status"><i className={`health-dot ${health.isError ? 'is-down' : health.data ? 'is-up' : ''}`} />{health.isLoading ? 'Connecting' : health.isError ? 'Reconnecting' : 'Ready'}</span><Link href="/sign-in" className="btn btn-ghost" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="btn btn-primary" data-testid="link-sign-up">Start creating <ArrowRight size={15} /></Link></div></header>
    <section className="hero-section">
      <div className="hero-copy fade-up"><p className="eyebrow"><span className="eyebrow-mark" />A BETTER HOME FOR YOUR CONTENT</p><h1 className="font-display">Make good ideas<br />go <em>further.</em></h1><p className="hero-description">Your brand context, AI drafts and publishing plan — all moving in the same direction.</p><div className="hero-buttons"><Link href="/sign-up" className="btn btn-primary btn-large" data-testid="link-hero-start">Build your workspace <ArrowRight size={17} /></Link><a href="#workflow" className="text-link" data-testid="link-explore">See how it works <ArrowDownRight size={16} /></a></div><div className="hero-proof"><div className="proof-lines"><i /><i /><i /></div><span>One clear workflow. No scattered notes.</span></div></div>
      <div className="hero-art fade-up"><div className="art-sun" /><div className="editor-window"><div className="window-top"><span className="window-dots"><i /><i /><i /></span><span className="window-title">BRAND CONTEXT / VOICE</span><span className="window-save"><Check size={12} /> SAVED</span></div><div className="window-content"><span className="window-kicker">YOUR PLATFORM · YOUR FORMAT</span><h3>Ideas, with<br />direction.</h3><p>Start with what matters to your brand. Shape it into a draft that is ready to refine.</p><div className="window-footer"><span className="mini-brand"><b>C</b> Brand voice</span><span className="window-status">IN PROGRESS</span></div></div></div><div className="floating-note note-context"><span className="note-icon"><Layers3 size={15} /></span><span><b>Brand voice</b><small>Context that stays close</small></span><Check size={14} className="note-check" /></div><div className="floating-note note-calendar"><CalendarDays size={15} /><span><b>Publishing plan</b><small>Keep every next step visible</small></span></div><div className="art-stamp"><span>IDEAS<br />IN MOTION</span><ArrowUpRight size={15} /></div></div>
      <div className="hero-index mono">01 <span>/</span> 04</div>
    </section>
    <section id="workflow" className="workflow-section">
      <div className="section-intro"><p className="eyebrow">FROM CONTEXT TO CALENDAR</p><h2 className="font-display">A steady rhythm<br />for the work.</h2><p>Content feels lighter when every step knows what came before it.</p></div>
      <div className="workflow-steps"><article className="workflow-step"><span className="step-number mono">01</span><div className="step-rule" /><h3>Give it context</h3><p>Save your brand voice, audience and content pillars once. Every draft starts grounded.</p><Layers3 size={19} /></article><article className="workflow-step"><span className="step-number mono">02</span><div className="step-rule" /><h3>Shape the idea</h3><p>Turn a topic into a useful first draft, shaped for the platform and purpose.</p><WandSparkles size={19} /></article><article className="workflow-step"><span className="step-number mono">03</span><div className="step-rule" /><h3>Keep it moving</h3><p>Refine, save and place your work on a calendar that keeps the whole plan visible.</p><CalendarDays size={19} /></article></div>
    </section>
    <section id="brand-context" className="brand-context-section"><div className="brand-context-art"><div className="context-paper"><p className="eyebrow">YOUR BRAND / VOICE NOTES</p><h3 className="font-display">Make useful<br />feel human.</h3><div className="context-lines"><i /><i /><i /></div><div className="context-tags"><span>Voice</span><span>Audience</span><span>Pillars</span></div></div><Sparkles className="context-asterisk" size={40} /></div><div className="context-copy"><p className="eyebrow">LESS REPEATING YOURSELF</p><h2 className="font-display">Your voice should<br />travel with you.</h2><p>ContentFlow remembers what makes each brand distinct, so new work feels consistent without feeling copied.</p><div className="context-list"><div><Check size={15} /><span>Audience and point of view</span></div><div><Check size={15} /><span>Voice, pillars and platforms</span></div><div><Check size={15} /><span>Multiple brands, one workspace</span></div></div><Link href="/sign-up" className="text-link" data-testid="link-brand-cta">Set up your brand context <ArrowRight size={16} /></Link></div></section>
    <section className="closing-section"><div className="closing-top"><p className="eyebrow">LESS TAB-HOPPING. MORE FOLLOW-THROUGH.</p><span className="closing-line" /></div><h2 className="font-display">Make room for<br /><em>the good work.</em></h2><Link href="/sign-up" className="btn btn-primary btn-large" data-testid="link-closing-start">Start your workspace <ArrowRight size={17} /></Link><div className="closing-foot"><BrandMark small /><span>Ideas, in good company.</span><span className="mono">CONTENTFLOW AI · CREATOR WORKSPACE</span></div></section>
  </div>;
}

function Dashboard() {
  const dash = useGetDashboard(); const brands = useListBrands(); const usage = useGetUsage(); const qc = useQueryClient();
  const [, setLocation] = useLocation();
  if (dash.isLoading || brands.isLoading) return <Page title="Overview" subtitle="A clear view of what is moving."><LoadingBlock /></Page>;
  if (dash.isError || brands.isError) return <Page title="Overview" subtitle="A clear view of what is moving."><ErrorBlock retry={() => { void dash.refetch(); void brands.refetch(); }} /></Page>;
  const d = dash.data;
  if (!d) return <Page title="Overview" subtitle="A clear view of what is moving."><LoadingBlock /></Page>;
  const usageData = usage.data || d.usage;
  return <Page title="Overview" subtitle={`Here is what is happening in ${d.workspace.name}.`} action={<Link href="/create" className="btn btn-primary" data-testid="link-dashboard-create"><Sparkles size={16} /> Create a draft</Link>}>
    <div className="dashboard-grid fade-up">
      <section className="welcome-panel"><div className="welcome-copy"><p className="eyebrow">YOUR WORKSPACE / {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}</p><h2 className="font-display">A good week<br />starts <em>here.</em></h2><p>Keep the next idea close and the rest will follow.</p><Link href="/create" className="welcome-link" data-testid="link-welcome-create">Start with an idea <ArrowRight size={15} /></Link></div><div className="welcome-shape"><span /><span /><span /></div></section>
      <div className="metric-stack"><MetricCard label="Saved content" value={d.contentCount} caption="drafts and scheduled" icon={<BookOpen size={16} />} /><MetricCard label="Brands" value={d.brandCount} caption="distinct voices, one desk" icon={<Layers3 size={16} />} /></div>
      <section className="usage-panel surface"><div className="section-topline"><div><p className="eyebrow">{usageData.planName}</p><h3>Monthly usage</h3></div><span className="usage-count mono">{usageData.used}<small> / {usageData.limit}</small></span></div><div className="usage-track"><span style={{ width: `${Math.min(100, usageData.limit ? (usageData.used / usageData.limit) * 100 : 0)}%` }} /></div><div className="usage-foot"><span>{usageData.remaining} generations remaining</span><span>Resets {formatUtcDate(usageData.periodEnd)} UTC</span></div></section>
      <section className="content-panel surface"><div className="section-topline"><div><p className="eyebrow">RECENTLY SAVED</p><h3>Your latest work</h3></div><Link href="/library" className="text-link small-link" data-testid="link-view-library">View library <ArrowRight size={14} /></Link></div>
        {d.recentContent.length ? <div className="compact-list">{d.recentContent.map(item => <ContentRow key={item.id} item={item} onClick={() => setLocation('/library')} />)}</div> : <Empty title="Nothing saved yet" detail="Start with an idea and your first draft will appear here." action={<Link href="/create" className="btn btn-secondary" data-testid="link-empty-create">Create your first draft</Link>} />}
      </section>
      <section className="upcoming-panel surface"><div className="section-topline"><div><p className="eyebrow">COMING UP</p><h3>On the calendar</h3></div><Link href="/calendar" className="icon-link" aria-label="Open calendar" data-testid="link-open-calendar"><ArrowRight size={16} /></Link></div>
        {d.upcomingContent.length ? <div className="upcoming-list">{d.upcomingContent.map(item => <div className="upcoming-item" key={item.id} data-testid={`item-upcoming-${item.id}`}><div className="date-block"><b>{item.scheduledAt ? new Date(item.scheduledAt).getDate() : '—'}</b><small>{item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase() : 'TBD'}</small></div><div className="upcoming-copy"><b>{item.title}</b><span>{item.brandName} · {item.platform}</span></div><ArrowUpRight size={15} /></div>)}</div> : <Empty title="A little breathing room" detail="Schedule a saved draft and it will show up here." action={<Link href="/library" className="text-link" data-testid="link-schedule-library">Choose a draft <ArrowRight size={14} /></Link>} />}
      </section>
    </div>
  </Page>;
}
function MetricCard({ label: name, value, caption, icon }: { label: string; value: number; caption: string; icon: ReactNode }) {
  return <div className="metric-card surface"><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-arrow"><ArrowUpRight size={15} /></span></div><strong data-testid={`value-metric-${name.toLowerCase().replace(' ', '-')}`}>{value}</strong><span className="metric-label">{name}</span><small>{caption}</small></div>;
}
function ContentRow({ item, onClick }: { item: ContentItem; onClick: (item: ContentItem) => void }) {
  return <button className="content-row" onClick={() => onClick(item)} data-testid={`row-content-${item.id}`}><span className="content-row-main"><span className="row-title">{item.title}</span><span className="row-meta">{item.brandName} <i>·</i> {formatDate(item.updatedAt)}</span></span><PlatformTag platform={item.platform} id={item.id} /><StatusPill status={item.status} id={item.id} /></button>;
}
function Onboarding() {
  const [workspaceName, setWorkspaceName] = useState(''); const [brandName, setBrandName] = useState(''); const [industry, setIndustry] = useState('');
  const [voice, setVoice] = useState(''); const [audience, setAudience] = useState(''); const [website, setWebsite] = useState(''); const [pillars, setPillars] = useState('');
  const existingWorkspace = useGetWorkspace(); const createWorkspace = useCreateWorkspace(); const createBrand = useCreateBrand(); const qc = useQueryClient(); const [error, setError] = useState('');
  const saving = createWorkspace.isPending || createBrand.isPending;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const workspace = existingWorkspace.data || await createWorkspace.mutateAsync({ data: { name: workspaceName.trim() } });
      qc.setQueryData(getGetWorkspaceQueryKey(), workspace);
      await createBrand.mutateAsync({ data: { name: brandName.trim(), industry, website: website || null, brandVoice: voice, targetAudience: audience, contentPillars: pillars.split(',').map(x => x.trim()).filter(Boolean) } });
      await Promise.all([qc.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() }), qc.invalidateQueries({ queryKey: getListBrandsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetUsageQueryKey() })]);
    } catch { setError('We could not save this setup. Check your connection and try again.'); }
  };
  return <Protected><main className="onboarding-page"><Link href="/" className="auth-logo"><BrandMark /></Link><div className="onboarding-layout"><div className="onboarding-aside"><p className="eyebrow">A GOOD PLACE TO BEGIN</p><h1 className="font-display">One home.<br /><em>Your whole voice.</em></h1><p>Set up the workspace and first brand that will guide every draft from here.</p><div className="onboarding-progress"><span className="progress-active" /><span /><span /></div><small>STEP 01 <i>OF</i> 01</small></div><form className="onboarding-form surface soft-shadow" onSubmit={submit}><div className="form-heading"><span className="form-step">01</span><div><p className="eyebrow">FIRST, YOUR FOUNDATION</p><h2 className="font-display">Set the context.</h2></div></div>{!existingWorkspace.data && <Field label="Workspace name"><Input required value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Name your workspace" maxLength={100} testId="input-workspace-name" /></Field>}<div className="form-divider"><span>{existingWorkspace.data ? 'ADD YOUR FIRST BRAND' : 'FIRST BRAND'}</span></div><Field label="Brand name"><Input required value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Name your brand" maxLength={100} testId="input-brand-name" /></Field><div className="form-two"><Field label="Industry"><Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Independent retail" maxLength={100} testId="input-brand-industry" /></Field><Field label="Website"><Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="brand.com" maxLength={500} testId="input-brand-website" /></Field></div><Field label="Brand voice" hint="How should your brand sound?"><textarea required value={voice} onChange={e => setVoice(e.target.value)} className="input textarea" placeholder="Clear, warm, thoughtful — never overly polished." maxLength={2000} data-testid="input-brand-voice" /></Field><Field label="Who is it for?" hint="Describe the people you want to reach."><textarea required value={audience} onChange={e => setAudience(e.target.value)} className="input textarea" placeholder="Curious people looking for…" maxLength={2000} data-testid="input-target-audience" /></Field><Field label="Content pillars" hint="Add a few themes, separated by commas."><Input value={pillars} onChange={e => setPillars(e.target.value)} placeholder="Behind the scenes, practical tips, point of view" testId="input-content-pillars" /></Field>{error && <div className="form-error" role="alert" data-testid="status-onboarding-error">{error}</div>}<Button type="submit" disabled={saving || existingWorkspace.isLoading} testId="button-create-workspace">{saving ? <><LoaderCircle className="spin" size={16} /> Setting up…</> : existingWorkspace.isLoading ? 'Checking workspace…' : <>Create workspace <ArrowRight size={16} /></>}</Button></form></div></main></Protected>;
}

function CreatePage() {
  const brands = useListBrands(); const create = useCreateContent(); const generate = useGenerateContent(); const qc = useQueryClient();
  const [brandId, setBrandId] = useState(''); const [platform, setPlatform] = useState<Platform>('instagram'); const [contentType, setContentType] = useState<ContentType>('caption');
  const [topic, setTopic] = useState(''); const [objective, setObjective] = useState(''); const [tone, setTone] = useState(''); const [cta, setCta] = useState('');
  const requestId = useRef<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null); const [message, setMessage] = useState('');
  useEffect(() => { if (!brandId && brands.data?.length) setBrandId(String(brands.data[0].id)); }, [brands.data, brandId]);
  const onGenerate = (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    setDraft(null);
    const stableRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = stableRequestId;
    generate.mutate({ data: { requestId: stableRequestId, brandId: Number(brandId), platform, contentType, topic: topic.trim(), objective: objective || undefined, tone: tone || undefined, callToAction: cta || undefined } }, {
      onSuccess: result => { requestId.current = null; setDraft({ title: result.title, body: result.body }); void Promise.all([qc.invalidateQueries({ queryKey: getGetUsageQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() })]); },
      onError: error => setMessage(apiErrorMessage(error, 'The draft could not be generated. Please try again.')),
    });
  };
  const onSave = () => { if (!draft) return; create.mutate({ data: { brandId: Number(brandId), title: draft.title, body: draft.body, platform, contentType, status: 'draft', tags: [] } }, { onSuccess: () => { setMessage('Saved to your library.'); setDraft(null); void Promise.all([qc.invalidateQueries({ queryKey: getListContentsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetUsageQueryKey() })]); }, onError: () => setMessage('Could not save this draft. Try again.') }); };
  if (brands.isLoading) return <Page title="Create" subtitle="Turn a clear brief into a useful first draft."><LoadingBlock text="Loading your brand context" /></Page>;
  if (brands.isError) return <Page title="Create" subtitle="Turn a clear brief into a useful first draft."><ErrorBlock retry={() => void brands.refetch()} /></Page>;
  const brandList = brands.data ?? [];
  return <Page title="Create" subtitle="Turn a clear brief into a useful first draft.">
    {!brandList.length ? <div className="surface page-empty"><Empty title="Start with a brand" detail="A brand voice gives every generated draft a useful point of view." action={<Link href="/brands" className="btn btn-primary" data-testid="link-create-brand">Set up a brand <ArrowRight size={15} /></Link>} /></div> :
      <div className="create-layout fade-up"><form className="brief-panel surface" onSubmit={onGenerate}><div className="section-topline"><div><p className="eyebrow">THE BRIEF</p><h3>What are we making?</h3></div><span className="brief-index mono">01—04</span></div>
        <Field label="Brand"><Select value={brandId} onChange={value => { if (value !== brandId) requestId.current = null; setBrandId(value); }} options={brandList.map(b => ({ value: String(b.id), label: b.name }))} testId="select-create-brand" /> <span className="field-hint">{brandList.find(b => String(b.id) === brandId)?.name} voice will guide the draft</span></Field>
        <div className="form-two"><Field label="Platform"><Select value={platform} onChange={value => { if (value !== platform) requestId.current = null; setPlatform(value as Platform); }} options={platformOptions} testId="select-create-platform" /></Field><Field label="Format"><Select value={contentType} onChange={value => { if (value !== contentType) requestId.current = null; setContentType(value as ContentType); }} options={typeOptions} testId="select-create-type" /></Field></div>
        <Field label="The idea" hint="Be specific. A question, launch, insight or point of view."><textarea required value={topic} onChange={e => { if (e.target.value !== topic) requestId.current = null; setTopic(e.target.value); }} className="input textarea idea-field" maxLength={2000} placeholder="What do you want people to think, feel or do?" data-testid="input-create-topic" /></Field>
        <div className="form-two"><Field label="Objective (optional)"><Input value={objective} onChange={e => { if (e.target.value !== objective) requestId.current = null; setObjective(e.target.value); }} placeholder="e.g. Introduce a new service" maxLength={1000} testId="input-create-objective" /></Field><Field label="Tone (optional)"><Input value={tone} onChange={e => { if (e.target.value !== tone) requestId.current = null; setTone(e.target.value); }} placeholder="e.g. Warm and direct" maxLength={200} testId="input-create-tone" /></Field></div>
        <Field label="Call to action (optional)"><Input value={cta} onChange={e => { if (e.target.value !== cta) requestId.current = null; setCta(e.target.value); }} placeholder="e.g. Explore the collection" maxLength={500} testId="input-create-cta" /></Field>
        {message && <p className={`inline-message ${message.startsWith('Saved') ? 'success' : ''}`} role="status" data-testid="status-create-message">{message}</p>}
        <Button type="submit" disabled={generate.isPending || !brandId} testId="button-generate-draft">{generate.isPending ? <><LoaderCircle size={16} className="spin" /> Finding the words…</> : <><WandSparkles size={16} /> Generate draft <span className="button-end-arrow"><ArrowRight size={15} /></span></>}</Button>
      </form><section className="draft-stage">
        {generate.isPending ? <div className="draft-loading surface" data-testid="status-generating"><div className="sparkle-loader"><Sparkles size={22} /></div><p className="eyebrow">GIVING THE IDEA A SHAPE</p><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-medium" /></div> :
          draft ? <article className="generated-draft surface fade-up"><div className="generated-top"><p className="eyebrow"><Sparkles size={13} /> FIRST DRAFT</p><span className="generated-platform">{platform} / {contentType}</span></div><h2 className="font-display" data-testid="text-generated-title">{draft.title}</h2><textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} className="generated-body input" aria-label="Generated draft body" data-testid="input-generated-body" /><div className="generated-footer"><span><span className="draft-dot" /> Ready for your edit</span><span className="mono">{draft.body.length} CHARACTERS</span></div><div className="generated-actions"><Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(`${draft.title}\n\n${draft.body}`); setMessage('Draft copied to clipboard.'); }} testId="button-copy-draft"><Copy size={15} /> Copy</Button><Button disabled={create.isPending} onClick={onSave} testId="button-save-draft">{create.isPending ? 'Saving…' : <><Check size={15} /> Save to library</>}</Button></div></article> :
                          <div className="draft-placeholder"><div className="placeholder-art"><span /><span /><span /><Sparkles size={23} /></div><p className="eyebrow">YOUR DRAFT WILL LAND HERE</p><h2 className="font-display">Good work starts<br />with a clear brief.</h2><p>Add an idea and we’ll shape it around the brand and platform you chose.</p></div>}
      </section></div>}
  </Page>;
}

function Library() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [platform, setPlatform] = useState(''); const [brandId, setBrandId] = useState('');
  const params = useMemo(() => ({ q: q || undefined, status: status ? status as ContentStatus : undefined, platform: platform ? platform as Platform : undefined, brandId: brandId ? Number(brandId) : undefined }), [q, status, platform, brandId]);
  const content = useListContents(params, { query: { queryKey: getListContentsQueryKey(params) } }); const brands = useListBrands(); const update = useUpdateContent(); const remove = useDeleteContent(); const qc = useQueryClient();
  const [editing, setEditing] = useState<ContentItem | null>(null); const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null); const [notice, setNotice] = useState('');
  const brandList = brands.data ?? [];
  const invalidate = (id?: number) => Promise.all([qc.invalidateQueries({ queryKey: getListContentsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetCalendarQueryKey() }), ...(id ? [qc.invalidateQueries({ queryKey: getGetContentQueryKey(id) })] : [])]);
  if (content.isLoading || brands.isLoading) return <Page title="Library" subtitle="Find, refine and organize your saved work."><LoadingBlock /></Page>;
  if (content.isError || brands.isError) return <Page title="Library" subtitle="Find, refine and organize your saved work."><ErrorBlock retry={() => { void content.refetch(); void brands.refetch(); }} /></Page>;
  return <Page title="Library" subtitle="Find, refine and organize your saved work.">
    <div className="library-toolbar surface"><div className="search-wrap"><Search size={17} /><Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search titles, topics and tags" testId="input-library-search" /></div><div className="toolbar-filters"><Filter size={15} /><Select value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, 'draft', 'scheduled', 'archived']} testId="select-library-status" /><Select value={platform} onChange={setPlatform} options={[{ value: '', label: 'All platforms' }, ...platformOptions]} testId="select-library-platform" /><Select value={brandId} onChange={setBrandId} options={[{ value: '', label: 'All brands' }, ...brandList.map(b => ({ value: String(b.id), label: b.name }))]} testId="select-library-brand" /></div><Button variant="secondary" disabled={!content.data?.length} onClick={() => { const rows = content.data ?? []; const quote = (value: string) => `"${value.replaceAll('"', '""')}"`; const csv = ['Title,Body,Brand,Platform,Type,Status,Scheduled at,Tags', ...rows.map(item => [item.title, item.body, item.brandName, item.platform, item.contentType, item.status, item.scheduledAt || '', item.tags.join('; ')].map(quote).join(','))].join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'contentflow-library.csv'; link.click(); URL.revokeObjectURL(url); }} testId="button-export-library"><Download size={14} /> Export CSV</Button></div>
    {notice && <p className="inline-message success" role="status" data-testid="status-library-message">{notice}</p>}
    <div className="library-count"><span>{content.data?.length ?? 0} {content.data?.length === 1 ? 'piece' : 'pieces'} of content</span><span className="mono">FILTERS UPDATE LIVE</span></div>
    {content.data?.length ? <div className="library-list">{content.data.map(item => <article className="library-card surface" key={item.id} data-testid={`card-library-content-${item.id}`}><div className="library-card-main"><div className="library-card-meta"><PlatformTag platform={item.platform} id={item.id} /><span className="content-type">{item.contentType}</span><StatusPill status={item.status} id={item.id} /></div><button className="library-title" onClick={() => setEditing(item)} data-testid={`button-edit-content-${item.id}`}>{item.title}</button><p>{item.body}</p><div className="library-card-foot"><span>{item.brandName} <i>·</i> Updated {formatDate(item.updatedAt)}</span><span>{item.tags.map(tag => <i className="tag-chip" key={tag}>{tag}</i>)}</span></div></div><div className="library-card-actions"><button className="icon-btn" onClick={() => setEditing(item)} aria-label="Edit content" data-testid={`button-open-edit-${item.id}`}><Settings2 size={16} /></button><button className="icon-btn danger-icon" onClick={() => setDeleteTarget(item)} aria-label="Delete content" data-testid={`button-delete-content-${item.id}`}><Trash2 size={16} /></button></div></article>)}</div> : <div className="surface page-empty"><Empty title={q || status || platform || brandId ? 'No matching content' : 'Your library starts here'} detail={q || status || platform || brandId ? 'Try changing or clearing your filters.' : 'Save a generated draft to keep your ideas organized and ready.'} action={q || status || platform || brandId ? <Button variant="secondary" onClick={() => { setQ(''); setStatus(''); setPlatform(''); setBrandId(''); }} testId="button-clear-filters">Clear filters</Button> : <Link href="/create" className="btn btn-primary" data-testid="link-library-create">Create a draft <ArrowRight size={15} /></Link>} /></div>}
    {editing && <ContentEditor item={editing} brands={brandList} onClose={() => setEditing(null)} onSave={data => update.mutate({ id: editing.id, data }, { onSuccess: () => { setEditing(null); setNotice('Content updated.'); void invalidate(editing.id); }, onError: () => setNotice('Could not update content.') })} pending={update.isPending} />}
    {deleteTarget && <Modal title="Remove this content?" onClose={() => setDeleteTarget(null)}><p className="confirm-copy">“{deleteTarget.title}” will be removed from your library and calendar.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleteTarget(null)} testId="button-cancel-delete">Keep it</Button><Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ id: deleteTarget.id }, { onSuccess: () => { setDeleteTarget(null); setNotice('Content removed.'); void invalidate(deleteTarget.id); }, onError: () => setNotice('Could not remove this content.') })} testId="button-confirm-delete">{remove.isPending ? 'Removing…' : 'Remove content'}</Button></div></Modal>}
  </Page>;
}
function ContentEditor({ item, brands, onClose, onSave, pending }: { item: ContentItem; brands: Brand[]; onClose: () => void; onSave: (data: Partial<ContentInput>) => void; pending: boolean }) {
  const detail = useGetContent(item.id, { query: { queryKey: getGetContentQueryKey(item.id) } });
  const [title, setTitle] = useState(item.title); const [body, setBody] = useState(item.body); const [brandId, setBrandId] = useState(String(item.brandId)); const [platform, setPlatform] = useState(item.platform); const [contentType, setContentType] = useState(item.contentType);
  useEffect(() => { if (detail.data && body === item.body) setBody(detail.data.body); }, [detail.data, body, item.body]);
  return <Modal title="Edit saved content" onClose={onClose}><div className="edit-form">{detail.isLoading && <span className="field-hint" role="status" data-testid="status-content-detail">Loading latest saved version…</span>}<Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} testId="input-edit-title" /></Field><div className="form-two"><Field label="Brand"><Select value={brandId} onChange={setBrandId} options={brands.map(b => ({ value: String(b.id), label: b.name }))} testId="select-edit-brand" /></Field><Field label="Platform"><Select value={platform} onChange={v => setPlatform(v as Platform)} options={platformOptions} testId="select-edit-platform" /></Field></div><Field label="Format"><Select value={contentType} onChange={v => setContentType(v as ContentType)} options={typeOptions} testId="select-edit-type" /></Field><Field label="Body"><textarea value={body} onChange={e => setBody(e.target.value)} className="input textarea edit-body" maxLength={20000} data-testid="input-edit-body" /></Field><div className="modal-actions"><Button variant="secondary" onClick={onClose} testId="button-cancel-edit">Cancel</Button><Button disabled={pending || !title.trim()} onClick={() => onSave({ title: title.trim(), body, brandId: Number(brandId), platform, contentType })} testId="button-save-edit">{pending ? 'Saving…' : <><Check size={15} /> Save changes</>}</Button></div></div></Modal>;
}

function Calendar() {
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const params = useMemo(() => ({ month }), [month]); const calendar = useGetCalendar(params, { query: { queryKey: getGetCalendarQueryKey(params) } }); const contents = useListContents({ status: 'draft' }); const update = useUpdateContent(); const qc = useQueryClient();
  const [selected, setSelected] = useState<ContentItem | null>(null); const [scheduleDate, setScheduleDate] = useState(''); const [error, setError] = useState('');
  const [year, mon] = month.split('-').map(Number); const firstDay = new Date(year, mon - 1, 1).getDay(); const days = new Date(year, mon, 0).getDate();
  const itemsByDay = new Map<number, ContentItem[]>();
  calendar.data?.forEach(item => { if (item.scheduledAt) { const day = new Date(item.scheduledAt).getDate(); itemsByDay.set(day, [...(itemsByDay.get(day) || []), item]); } });
  const prev = () => { const d = new Date(year, mon - 2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const next = () => { const d = new Date(year, mon, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const schedule = (e: FormEvent) => { e.preventDefault(); if (!selected || !scheduleDate) return; const itemId = selected.id; setError(''); update.mutate({ id: itemId, data: { status: 'scheduled', scheduledAt: new Date(scheduleDate).toISOString() } }, { onSuccess: () => { setSelected(null); setScheduleDate(''); void Promise.all([qc.invalidateQueries({ queryKey: getGetCalendarQueryKey() }), qc.invalidateQueries({ queryKey: getListContentsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetContentQueryKey(itemId) })]); }, onError: () => setError('Could not schedule this content. Try again.') }); };
  if (calendar.isLoading || contents.isLoading) return <Page title="Calendar" subtitle="A simple view of what is coming up."><LoadingBlock /></Page>;
  if (calendar.isError || contents.isError) return <Page title="Calendar" subtitle="A simple view of what is coming up."><ErrorBlock retry={() => { void calendar.refetch(); void contents.refetch(); }} /></Page>;
  return <Page title="Calendar" subtitle="A simple view of what is coming up." action={<Link href="/library" className="btn btn-secondary" data-testid="link-calendar-library"><BookOpen size={15} /> Browse library</Link>}>
    <section className="calendar-panel surface fade-up"><div className="calendar-toolbar"><div><p className="eyebrow">PUBLISHING PLAN</p><h2 className="font-display" data-testid="text-calendar-month">{new Date(year, mon - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2></div><div className="calendar-controls"><button className="icon-btn" aria-label="Previous month" onClick={prev} data-testid="button-calendar-previous"><ChevronLeft size={18} /></button><button className="btn btn-secondary calendar-today" onClick={() => { const d = new Date(); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }} data-testid="button-calendar-today">Today</button><button className="icon-btn" aria-label="Next month" onClick={next} data-testid="button-calendar-next"><ChevronRight size={18} /></button></div></div>
       <div className="calendar-grid"><div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days">{Array.from({ length: firstDay }, (_, i) => <div className="calendar-cell calendar-blank" key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const day = i + 1; const entries = itemsByDay.get(day) || []; const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === mon && new Date().getFullYear() === year; return <div className={`calendar-cell ${isToday ? 'calendar-today-cell' : ''}`} key={day} data-testid={`calendar-day-${day}`}><span className="calendar-day-number">{day}</span>{entries.slice(0, 2).map(item => <button key={item.id} className="calendar-event" onClick={() => { setSelected(item); setScheduleDate(item.scheduledAt ? new Date(new Date(item.scheduledAt).getTime() - new Date(item.scheduledAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''); setError(''); }} title={item.title} data-testid={`button-calendar-item-${item.id}`}><i />{item.title}</button>)}{entries.length > 2 && <small className="calendar-more">+{entries.length - 2} more</small>}</div>; })}</div></div>
      <div className="calendar-legend"><span><i className="legend-dot" /> Scheduled content</span><span>{calendar.data?.length || 0} planned this month</span></div></section>
    <section className="unscheduled-section"><div className="section-topline"><div><p className="eyebrow">READY WHEN YOU ARE</p><h3>Drafts to schedule</h3></div><span className="mono">{contents.data?.length || 0} UNSCHEDULED</span></div>
      {contents.data?.length ? <div className="schedule-queue">{contents.data.map(item => <div className="queue-row surface" key={item.id} data-testid={`item-unscheduled-${item.id}`}><div className="queue-marker"><Clock3 size={16} /></div><div className="queue-copy"><b>{item.title}</b><span>{item.brandName} · {item.platform} · {item.contentType}</span></div><Button variant="secondary" onClick={() => { setSelected(item); setScheduleDate(''); setError(''); }} testId={`button-schedule-${item.id}`}><CalendarDays size={14} /> Schedule</Button></div>)}</div> : <div className="surface"><Empty title="No drafts waiting" detail="Draft content will appear here when it is ready to schedule." action={<Link href="/create" className="text-link" data-testid="link-calendar-create">Create a draft <ArrowRight size={14} /></Link>} /></div>}
    </section>
     {selected && <Modal title={selected.status === 'scheduled' ? 'Update scheduled time' : 'Schedule this draft'} onClose={() => setSelected(null)}><form onSubmit={schedule} className="edit-form"><div className="schedule-preview"><p className="eyebrow">{selected.brandName} · {selected.platform}</p><strong>{selected.title}</strong></div><Field label="Choose a date and time"><Input required type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} testId="input-schedule-date" /></Field><p className="field-hint">This updates your internal calendar. ContentFlow will not publish automatically.</p>{error && <p className="form-error" role="alert" data-testid="status-schedule-error">{error}</p>}<div className="modal-actions"><Button variant="secondary" onClick={() => setSelected(null)} testId="button-cancel-schedule">Cancel</Button>{selected.status === 'scheduled' && <Button variant="danger" disabled={update.isPending} onClick={() => update.mutate({ id: selected.id, data: { status: 'draft', scheduledAt: null } }, { onSuccess: () => { const itemId = selected.id; setSelected(null); void Promise.all([qc.invalidateQueries({ queryKey: getGetCalendarQueryKey() }), qc.invalidateQueries({ queryKey: getListContentsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetContentQueryKey(itemId) })]); }, onError: () => setError('Could not remove this item from the calendar.') })} testId="button-unschedule">Unschedule</Button>}<Button type="submit" disabled={update.isPending} testId="button-confirm-schedule">{update.isPending ? 'Saving…' : selected.status === 'scheduled' ? 'Save new time' : 'Add to calendar'}</Button></div></form></Modal>}
  </Page>;
}

function Brands() {
  const brands = useListBrands(); const usage = useGetUsage({ query: { queryKey: getGetUsageQueryKey() } }); const create = useCreateBrand(); const update = useUpdateBrand(); const remove = useDeleteBrand(); const qc = useQueryClient();
  const [editing, setEditing] = useState<Brand | 'new' | null>(null); const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null); const [notice, setNotice] = useState('');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: getListBrandsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getListContentsQueryKey() }), qc.invalidateQueries({ queryKey: getGetCalendarQueryKey() }), qc.invalidateQueries({ queryKey: getGetUsageQueryKey() })]);
  if (brands.isLoading) return <Page title="Brands" subtitle="Keep every voice, audience and direction distinct."><LoadingBlock text="Gathering your brand context" /></Page>;
  if (brands.isError) return <Page title="Brands" subtitle="Keep every voice, audience and direction distinct."><ErrorBlock retry={() => void brands.refetch()} /></Page>;
  const brandList = brands.data ?? [];
  return <Page title="Brands" subtitle="Keep every voice, audience and direction distinct." action={<Button disabled={usage.data ? !usage.data.canCreateBrand : false} onClick={() => setEditing('new')} testId="button-add-brand"><Plus size={16} /> Add a brand</Button>}>
    <div className="brands-intro"><div className="brands-note"><Sparkles className="note-asterisk" size={27} /><p><b>One desk, different voices.</b> Each brand keeps its own point of view, so the right context is always close at hand.</p></div><div className="brands-total"><strong data-testid="value-brand-count">{brandList.length}</strong><span>{usage.data ? `${usage.data.brandCount} / ${usage.data.brandLimit} BRANDS` : 'BRANDS'}</span></div></div>
    {usage.data && !usage.data.canCreateBrand && <p className="inline-message" role="status">You have reached the brand limit for your current plan. Plan changes are unavailable while billing is on hold.</p>}
    {notice && <p className="inline-message success" role="status" data-testid="status-brand-message">{notice}</p>}
     {brandList.length ? <div className="brand-list">{brandList.map((brand, index) => <article className="brand-card surface" key={brand.id} data-testid={`card-brand-${brand.id}`}><div className={`brand-color brand-color-${index % 4}`}><span>{brand.name.split(/\s/).map(x => x[0]).join('').slice(0, 2).toUpperCase()}</span><i>BRAND / {String(index + 1).padStart(2, '0')}</i></div><div className="brand-card-content"><div className="brand-card-heading"><div><p className="eyebrow">{brand.industry || 'BRAND CONTEXT'}</p><h2 className="font-display">{brand.name}</h2></div><div className="brand-card-actions"><button className="icon-btn" onClick={() => setEditing(brand)} aria-label={`Edit ${brand.name}`} data-testid={`button-edit-brand-${brand.id}`}><Settings2 size={16} /></button><button className="icon-btn danger-icon" onClick={() => setDeleteTarget(brand)} aria-label={`Delete ${brand.name}`} data-testid={`button-delete-brand-${brand.id}`}><Trash2 size={16} /></button></div></div><div className="brand-detail-grid"><div><span className="detail-label">VOICE</span><p>{brand.brandVoice || 'No voice defined yet.'}</p></div><div><span className="detail-label">AUDIENCE</span><p>{brand.targetAudience || 'No audience defined yet.'}</p></div></div><div className="brand-card-footer">{brand.website && <a href={brand.website.startsWith('http') ? brand.website : `https://${brand.website}`} target="_blank" rel="noreferrer" data-testid={`link-brand-website-${brand.id}`}>{brand.website}</a>}<div className="brand-pill-list">{brand.contentPillars?.map(pillar => <span className="tag-chip" key={pillar}>{pillar}</span>)}</div></div></div></article>)}</div> : <div className="surface page-empty"><Empty title="Give your first brand a home" detail="A little context here makes every future draft more consistent." action={<Button disabled={usage.data ? !usage.data.canCreateBrand : false} onClick={() => setEditing('new')} testId="button-empty-add-brand"><Plus size={15} /> Add your first brand</Button>} /></div>}
    {editing && <BrandEditor brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} pending={create.isPending || update.isPending} onSave={values => {
      if (editing === 'new') create.mutate({ data: values }, { onSuccess: () => { setEditing(null); setNotice('Brand added.'); void refresh(); }, onError: error => setNotice(apiErrorMessage(error, 'Could not add this brand.')) });
      else update.mutate({ id: editing.id, data: values }, { onSuccess: () => { setEditing(null); setNotice('Brand details updated.'); void refresh(); }, onError: () => setNotice('Could not update this brand.') });
    }} />}
    {deleteTarget && <Modal title="Remove this brand?" onClose={() => setDeleteTarget(null)}><p className="confirm-copy">“{deleteTarget.name}” will be removed. Content associated with this brand may no longer be available.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleteTarget(null)} testId="button-cancel-delete-brand">Keep brand</Button><Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ id: deleteTarget.id }, { onSuccess: () => { setDeleteTarget(null); setNotice('Brand removed.'); void refresh(); }, onError: () => setNotice('Could not remove this brand.') })} testId="button-confirm-delete-brand">{remove.isPending ? 'Removing…' : 'Remove brand'}</Button></div></Modal>}
  </Page>;
}
function BrandEditor({ brand, onClose, onSave, pending }: { brand: Brand | null; onClose: () => void; onSave: (data: { name: string; industry: string; website: string | null; brandVoice: string; targetAudience: string; contentPillars: string[] }) => void; pending: boolean }) {
  const [name, setName] = useState(brand?.name || ''); const [industry, setIndustry] = useState(brand?.industry || ''); const [website, setWebsite] = useState(brand?.website || '');
  const [voice, setVoice] = useState(brand?.brandVoice || ''); const [audience, setAudience] = useState(brand?.targetAudience || ''); const [pillars, setPillars] = useState(brand?.contentPillars?.join(', ') || '');
  return <Modal title={brand ? 'Refine this brand' : 'Add a brand'} onClose={onClose}><form className="edit-form" onSubmit={e => { e.preventDefault(); onSave({ name: name.trim(), industry, website: website || null, brandVoice: voice, targetAudience: audience, contentPillars: pillars.split(',').map(v => v.trim()).filter(Boolean) }); }}>
    <Field label="Brand name"><Input required value={name} onChange={e => setName(e.target.value)} maxLength={100} testId="input-brand-edit-name" /></Field><div className="form-two"><Field label="Industry"><Input value={industry} onChange={e => setIndustry(e.target.value)} maxLength={100} testId="input-brand-edit-industry" /></Field><Field label="Website"><Input value={website} onChange={e => setWebsite(e.target.value)} maxLength={500} testId="input-brand-edit-website" /></Field></div><Field label="Brand voice"><textarea value={voice} onChange={e => setVoice(e.target.value)} className="input textarea" maxLength={2000} data-testid="input-brand-edit-voice" /></Field><Field label="Target audience"><textarea value={audience} onChange={e => setAudience(e.target.value)} className="input textarea" maxLength={2000} data-testid="input-brand-edit-audience" /></Field><Field label="Content pillars" hint="Separate each theme with a comma."><Input value={pillars} onChange={e => setPillars(e.target.value)} testId="input-brand-edit-pillars" /></Field><div className="modal-actions"><Button variant="secondary" onClick={onClose} testId="button-cancel-brand-edit">Cancel</Button><Button type="submit" disabled={pending} testId="button-save-brand">{pending ? 'Saving…' : <><Check size={15} /> Save brand</>}</Button></div></form></Modal>;
}

function Pricing() {
  const plans = useListPlans({
    query: { queryKey: getListPlansQueryKey() },
  });

  const usage = useGetUsage({
    query: { queryKey: getGetUsageQueryKey() },
  });

  const { getToken, isLoaded, isSignedIn } = useAuth();
  const qc = useQueryClient();
  const [location, setLocation] = useLocation();

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentError, setPaymentError] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [cancelError, setCancelError] = useState(false);

  const handledReference = useRef<string | null>(null);

  // Verify a payment after Paystack redirects back to the pricing page.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const params = new URLSearchParams(window.location.search);
    const callback = params.get('payment') === 'callback';
    const reference =
      params.get('reference') || params.get('trxref');

    if (!callback || !reference) return;

    // Prevent duplicate verification from React re-renders.
    if (handledReference.current === reference) return;
    handledReference.current = reference;

    let cancelled = false;

    async function verifyPayment() {
      setPaymentMessage('Verifying your payment with Paystack…');
      setPaymentError(false);

      try {
        if (!apiBaseUrl) {
          throw new Error('The API URL is not configured.');
        }

        const token = await getToken();

        if (!token) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const response = await fetch(
          `${apiBaseUrl}/api/billing/verify/${encodeURIComponent(reference!)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success !== true) {
          throw new Error(
            typeof result.error === 'string'
              ? result.error
              : 'Payment could not be verified yet.',
          );
        }

        if (cancelled) return;

        setPaymentMessage(
          'Payment confirmed! Your plan has been activated.',
        );

        // Refresh the plan, usage and workspace shown throughout the app.
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetUsageQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
          qc.invalidateQueries({ queryKey: getListPlansQueryKey() }),
        ]);

        // Remove the payment reference from the visible URL.
        params.delete('payment');
        params.delete('reference');
        params.delete('trxref');
        params.delete('status');

        const query = params.toString();
        const cleanUrl =
          window.location.pathname +
          (query ? `?${query}` : '') +
          window.location.hash;

        window.history.replaceState({}, '', cleanUrl);
      } catch (error) {
        if (cancelled) return;

        setPaymentError(true);
        setPaymentMessage(
          error instanceof Error
            ? error.message
            : 'Payment verification failed. Please try again.',
        );

        // Keep the callback parameters so verification can be retried.
        handledReference.current = null;
      }
    }

    void verifyPayment();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, qc]);

  async function handleCancelSubscription() {
    const confirmed = window.confirm(
      'Cancel your recurring Paystack subscription now? If Paystack confirms cancellation, your workspace will immediately move to Free Forever and paid features will stop.',
    );
    if (!confirmed) return;

    setCancelLoading(true);
    setCancelMessage('');
    setCancelError(false);
    try {
      if (!apiBaseUrl) throw new Error('The API URL is not configured.');
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');

      const response = await fetch(`${apiBaseUrl}/api/billing/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Paystack could not confirm cancellation.');
      }

      setCancelMessage(typeof result.message === 'string' ? result.message : 'Subscription cancellation confirmed.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetUsageQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        qc.invalidateQueries({ queryKey: getListPlansQueryKey() }),
      ]);
    } catch (error) {
      setCancelError(true);
      setCancelMessage(error instanceof Error ? error.message : 'Could not cancel your subscription. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleUpgrade(planId: 'starter' | 'pro') {
    setCheckoutLoading(planId);
    setCheckoutError('');

    try {
      const email = window.prompt(
        'Enter your email address for Paystack:',
      )?.trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setCheckoutError('Please enter a valid email address.');
        return;
      }

      if (!apiBaseUrl) {
        throw new Error(
          'The API URL is not configured. Set VITE_API_BASE_URL in your frontend deployment.',
        );
      }

      const token = await getToken();

      if (!token) {
        throw new Error(
          'Your session could not be verified. Please sign in again.',
        );
      }

      const response = await fetch(
        `${apiBaseUrl}/api/billing/initialize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ planId, email }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'Unable to initialize payment.',
        );
      }

      if (
        typeof result.authorizationUrl !== 'string' ||
        !result.authorizationUrl.startsWith(
          'https://checkout.paystack.com/',
        )
      ) {
        throw new Error('Paystack returned an invalid checkout URL.');
      }

      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (plans.isLoading) {
    return (
      <Page title="Plans" subtitle="A clear view of what each workspace plan includes.">
        <LoadingBlock text="Loading plan details" />
      </Page>
    );
  }

  if (plans.isError) {
    return (
      <Page title="Plans" subtitle="A clear view of what each workspace plan includes.">
        <ErrorBlock retry={() => void plans.refetch()} />
      </Page>
    );
  }

  return (
    <Page title="Plans" subtitle="Compare what is included in each workspace plan.">
      {paymentMessage && (
        <div
          className={`inline-message ${paymentError ? '' : 'success'}`}
          role="status"
          data-testid="status-payment-message"
        >
          {paymentMessage}

          {paymentError && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                handledReference.current = null;
                setPaymentMessage('');
                setPaymentError(false);

                // Re-run the callback verification effect.
                setLocation(window.location.pathname + window.location.search);
              }}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {cancelMessage && (
        <div
          className={`inline-message ${cancelError ? '' : 'success'}`}
          role={cancelError ? 'alert' : 'status'}
          data-testid="status-cancellation-message"
        >
          {cancelMessage}
        </div>
      )}

      {usage.isError && (
        <ErrorBlock
          message="Your current usage could not be loaded."
          retry={() => void usage.refetch()}
        />
      )}

      {usage.data && (
        <section className="plan-current surface">
          <div>
            <p className="eyebrow">YOUR CURRENT PLAN</p>
            <h2 className="font-display">{usage.data.planName}</h2>
            <p>
              {usage.data.used} of {usage.data.limit} successful AI generations used
              {' · '}{usage.data.remaining} remaining
              {' · '}resets {formatUtcDate(usage.data.periodEnd)} UTC
            </p>
            <p>
              {usage.data.brandCount} of {usage.data.brandLimit} brand profiles used
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="plan-status">
              {label(usage.data.subscriptionStatus)}
            </span>
            {(usage.data.plan === 'starter' || usage.data.plan === 'pro') && (
              <Button
                variant="danger"
                disabled={cancelLoading}
                onClick={() => void handleCancelSubscription()}
                testId="button-cancel-subscription"
              >
                {cancelLoading ? 'Cancelling with Paystack…' : 'Cancel subscription'}
              </Button>
            )}
          </div>
        </section>
      )}

      {usage.isLoading && (
        <LoadingBlock text="Loading your current usage" />
      )}

      {plans.data?.length ? (
        <div className="plans-list">
          {plans.data.map((plan, index) => {
            const current = usage.data?.plan === plan.id;
            const isPaid = plan.monthlyPriceNgn > 0;
            const paidPlanId =
              plan.id === 'starter' || plan.id === 'pro'
                ? plan.id
                : null;

            return (
              <article
                className={`plan-card surface ${index === 1 ? 'plan-featured' : ''}`}
                key={plan.id}
                data-testid={`card-plan-${plan.id}`}
              >
                <div className="plan-head">
                  <div>
                    <p className="eyebrow">
                      {index === 0
                        ? 'A PRACTICAL START'
                        : index === 1
                          ? 'MORE ROOM TO GROW'
                          : 'FOR BUSIER DESKS'}
                    </p>
                    <h2 className="font-display">{plan.name}</h2>
                  </div>

                  <span className="plan-price">
                    {plan.monthlyPriceNgn === 0
                      ? '₦0'
                      : `₦${plan.monthlyPriceNgn.toLocaleString()}`}
                    <small>{isPaid ? '/ month' : 'forever'}</small>
                  </span>
                </div>

                <p className="plan-volume">
                  {plan.generationLimit} successful AI generations / UTC month
                  {' · '}{plan.brandLimit}
                  {' '}{plan.brandLimit === 1 ? 'brand' : 'brands'}
                </p>

                <ul>
                  {plan.features.map(feature => (
                    <li key={feature}>
                      <Check size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="plan-detail">
                  <span>CALENDAR</span>
                  <p>{plan.calendarDescription}</p>
                </div>

                <div className="plan-detail">
                  <span>EXPORTS</span>
                  <p>{plan.exportDescription}</p>
                </div>

                <div
                  className="plan-unavailable"
                  data-testid={`text-plan-availability-${plan.id}`}
                >
                  <strong>
                    {current
                      ? 'Current plan'
                      : isPaid
                        ? 'Paid plan'
                        : 'Free Forever'}
                  </strong>
                  <small>
                    {current
                      ? `Resets ${formatUtcDate(usage.data?.periodEnd ?? null)} UTC`
                      : isPaid
                        ? 'Secure payments powered by Paystack.'
                        : 'Default for new workspaces'}
                  </small>
                </div>

                {isPaid && paidPlanId && !current && (
                  <Button
                    onClick={() => void handleUpgrade(paidPlanId)}
                    disabled={checkoutLoading !== null}
                    testId={`button-upgrade-${paidPlanId}`}
                  >
                    {checkoutLoading === paidPlanId ? (
                      <>
                        <LoaderCircle size={15} className="spin" />
                        Connecting to Paystack…
                      </>
                    ) : (
                      `Upgrade to ${
                        paidPlanId === 'starter'
                          ? 'Starter · ₦3,000/month'
                          : 'Pro · ₦7,000/month'
                      }`
                    )}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="surface page-empty">
          <Empty
            title="Plan details are not available yet"
            detail="Please check back later for current plan information."
          />
        </div>
      )}

      {checkoutError && (
        <p
          className="form-error text-sm text-red-600"
          role="alert"
          data-testid="status-checkout-error"
        >
          {checkoutError}
        </p>
      )}

      <p className="plans-note">Secure payments powered by Paystack.</p>
    </Page>
  );
}

function Settings() {
  const workspace = useGetWorkspace({ query: { queryKey: getGetWorkspaceQueryKey() } });
  const update = useUpdateWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (workspace.data) setName(workspace.data.name); }, [workspace.data?.id]);
  if (workspace.isLoading) return <Page title="Settings" subtitle="Keep your workspace details up to date."><LoadingBlock text="Loading workspace settings" /></Page>;
  if (workspace.isError) return <Page title="Settings" subtitle="Keep your workspace details up to date."><ErrorBlock retry={() => void workspace.refetch()} /></Page>;
  return <Page title="Settings" subtitle="A few details that make this workspace yours.">
    <section className="settings-panel surface"><div className="settings-intro"><p className="eyebrow">WORKSPACE PROFILE</p><h2 className="font-display">A name for your desk.</h2><p>This name helps your team recognize the shared home for its content.</p></div><form className="settings-form" onSubmit={e => { e.preventDefault(); setNotice(''); update.mutate({ data: { name: name.trim() } }, { onSuccess: value => { qc.setQueryData(getGetWorkspaceQueryKey(), value); void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setNotice('Workspace name saved.'); }, onError: () => setNotice('Could not save the workspace name. Please try again.') }); }}><Field label="Workspace name"><Input required minLength={1} maxLength={100} value={name} onChange={e => setName(e.target.value)} testId="input-settings-workspace-name" /></Field>{notice && <p className={`inline-message ${notice.startsWith('Workspace') ? 'success' : ''}`} role="status" data-testid="status-settings-message">{notice}</p>}<Button type="submit" disabled={update.isPending || !name.trim()} testId="button-save-workspace">{update.isPending ? 'Saving…' : <><Check size={15} /> Save workspace</>}</Button></form></section>
    <section className="settings-meta surface"><div><span className="detail-label">WORKSPACE ID</span><p>{workspace.data?.id}</p></div><div><span className="detail-label">CREATED</span><p>{workspace.data ? formatDate(workspace.data.createdAt) : '—'}</p></div><Link href="/pricing" className="text-link" data-testid="link-settings-plans">View plan details <ArrowRight size={14} /></Link></section>
  </Page>;
}

function WorkspaceGateInner() {
  const workspace = useGetWorkspace(); const brands = useListBrands();
  if (workspace.isLoading || brands.isLoading) return <Page title="Overview" subtitle="A clear view of what is moving."><LoadingBlock /></Page>;
  const missingWorkspace = Boolean(workspace.isError && workspace.error && typeof workspace.error === 'object' && 'status' in workspace.error && workspace.error.status === 404);
  if (missingWorkspace) return <Redirect to="/onboarding" />;
  if (workspace.isError || brands.isError) return <Page title="Overview" subtitle="A clear view of what is moving."><ErrorBlock message="We could not check your workspace yet." retry={() => { void workspace.refetch(); void brands.refetch(); }} /></Page>;
  return workspace.data && brands.data?.length ? <Dashboard /> : <Redirect to="/onboarding" />;
}
function WorkspaceGate() { return <Protected><WorkspaceGateInner /></Protected>; }
function AppRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to get back to your content desk.' } }, signUp: { start: { title: 'Create your account', subtitle: 'Start with a clearer content workflow.' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator /><ClerkApiTokenBridge /><Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={() => <AuthPage />} />
      <Route path="/sign-up/*?" component={() => <AuthPage signup />} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={WorkspaceGate} />
      <Route path="/create" component={CreatePage} />
      <Route path="/library" component={Library} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/brands" component={Brands} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><AppRouter /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider>;
}
export default App;
