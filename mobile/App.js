import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, clearSession, readQueue, readSession, saveQueue, saveSession } from './src/api';

const colors = {
  ink: '#102033',
  muted: '#6B7A8C',
  canvas: '#F4F7FA',
  card: '#FFFFFF',
  accent: '#3659C9',
  accentDark: '#2845A3',
  line: '#E1E7EF',
  success: '#237A57',
  danger: '#B42318',
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('home');
  const [toast, setToast] = useState(null);
  const [status, setStatus] = useState(null);
  const [recent, setRecent] = useState([]);
  const [queue, setQueue] = useState([]);
  const tenant = profile?.tenant || '';

  const notify = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAttendance = async (activeProfile, activeSession) => {
    if (!activeProfile || !activeSession) return;
    try {
      const result = await api({
        action: 'recent',
        email: activeProfile.email,
        token: activeSession.sessionToken || '',
      }, activeProfile.tenant);
      if (result.ok) setRecent(result.recent || []);
    } catch {
      notify('Unable to refresh attendance history.', 'error');
    }
  };

  useEffect(() => {
    readSession().then(async ({ auth, profile: savedProfile }) => {
      setSession(auth);
      setProfile(savedProfile);
      setQueue(await readQueue());
      await loadAttendance(savedProfile, auth);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const logout = async () => {
    await clearSession();
    setSession(null);
    setProfile(null);
    setStatus(null);
    setRecent([]);
    setScreen('home');
  };

  const postAttendance = async (payload) => {
    try {
      const result = await api(payload, tenant);
      if (!result.ok) {
        notify(result.message || 'Attendance could not be recorded.', 'error');
        return;
      }
      setStatus(result);
      await loadAttendance(profile, session);
      notify(`${result.action} recorded at ${result.time}.`, 'success');
    } catch (error) {
      if (error.offline) {
        const nextQueue = [...queue, { payload, queuedAt: Date.now() }].slice(-20);
        await saveQueue(nextQueue);
        setQueue(nextQueue);
        notify('You are offline. This attendance action will sync later.');
        return;
      }
      notify(error.message || 'Attendance could not be recorded.', 'error');
    }
  };

  const syncQueue = async () => {
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        const result = await api(item.payload, tenant);
        if (!result.ok) remaining.push(item);
      } catch (error) {
        if (error.offline) remaining.push(item);
        else notify(error.message, 'error');
      }
    }
    await saveQueue(remaining);
    setQueue(remaining);
    notify(remaining.length ? 'Some offline actions are still waiting.' : 'Offline actions synced.', remaining.length ? 'info' : 'success');
  };

  if (loading) return <Centered><ActivityIndicator size="large" color={colors.accent} /></Centered>;
  if (!session || !profile) return <Login onLogin={async (user, token) => {
    const savedProfile = await saveSession(user, token);
    const savedSession = { user, sessionToken: token };
    setProfile(savedProfile);
    setSession(savedSession);
    await loadAttendance(savedProfile, savedSession);
  }} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {screen === 'scanner' ? (
        <Scanner onClose={() => setScreen('home')} onCode={(value) => {
          setScreen('home');
          postAttendance({
            action: 'attendance',
            tenant,
            qr: value,
            name: profile.name,
            email: profile.email,
            ts: Date.now(),
          });
        }} />
      ) : (
        <>
          <Header profile={profile} onLogout={logout} />
          {screen === 'home' && <Home profile={profile} status={status} queue={queue} onScan={() => setScreen('scanner')} onSync={syncQueue} onBreak={(mode) => postAttendance({
            action: 'attendance',
            tenant,
            qr: '',
            mode,
            name: profile.name,
            email: profile.email,
            ts: Date.now(),
          })} />}
          {screen === 'history' && <History recent={recent} />}
          {screen === 'profile' && <Profile profile={profile} onLogout={logout} />}
          <BottomBar active={screen} onChange={setScreen} bottom={insets.bottom} />
        </>
      )}
      {toast && <Toast {...toast} bottom={insets.bottom + 72} />}
    </View>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async () => {
    if (!email.trim()) return setError('Enter your work email.');
    setBusy(true); setError('');
    try {
      const result = await api({ action: 'user_login', email: email.trim() });
      if (!result.ok) throw new Error(result.message || 'Could not send a code.');
      setRequested(true);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const verify = async () => {
    if (otp.length !== 6) return setError('Enter the 6-digit verification code.');
    setBusy(true); setError('');
    try {
      const result = await api({ action: 'user_login', email: email.trim(), otp });
      if (!result.ok) throw new Error(result.message || 'Invalid verification code.');
      await onLogin(result.user, result.sessionToken);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={styles.login} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={styles.brandMark}><Ionicons name="scan-outline" size={30} color={colors.card} /></View>
      <Text style={styles.kicker}>ATTENDANCE, MADE SIMPLE</Text>
      <Text style={styles.title}>Welcome to addredance</Text>
      <Text style={styles.subtitle}>Sign in to record your workday and keep your attendance history close.</Text>
      {!requested ? (
        <>
          <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={busy ? 'Sending...' : 'Send verification code'} onPress={requestCode} disabled={busy} />
        </>
      ) : (
        <>
          <Text style={styles.emailHint}>Code sent to {email}</Text>
          <Field label="Verification code" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={busy ? 'Checking...' : 'Sign in'} onPress={verify} disabled={busy} />
          <Pressable onPress={() => setRequested(false)}><Text style={styles.link}>Use a different email</Text></Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Home({ profile, status, queue, onScan, onSync, onBreak }) {
  const action = status?.action || '';
  const checkedIn = action === 'Check-in' || action === 'Break-in' || action === 'Break-out';
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Good morning, {profile.name || 'there'}</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      <View style={styles.statusCard}>
        <View style={[styles.statusIcon, checkedIn && styles.statusIconActive]}><Ionicons name={checkedIn ? 'checkmark' : 'time-outline'} size={26} color={checkedIn ? colors.success : colors.muted} /></View>
        <View style={styles.statusText}><Text style={styles.statusLabel}>{action === 'Break-out' ? 'On break' : checkedIn ? 'Checked in' : 'Not checked in'}</Text><Text style={styles.statusSub}>{status?.time ? `Since ${status.time}` : 'Scan the office QR code to start.'}</Text></View>
      </View>
      <PrimaryButton label={action === 'Break-out' ? 'Scan to resume' : checkedIn ? 'Scan to check out' : 'Scan to check in'} icon="scan-outline" onPress={onScan} />
      {checkedIn && <View style={styles.row}><SecondaryButton label={action === 'Break-out' ? 'Resume' : 'Take a break'} icon={action === 'Break-out' ? 'play-outline' : 'cafe-outline'} onPress={() => onBreak(action === 'Break-out' ? 'resume' : 'break')} /></View>}
      {queue.length > 0 && <Pressable style={styles.syncCard} onPress={onSync}><Ionicons name="cloud-offline-outline" size={22} color={colors.accent} /><Text style={styles.syncText}>{queue.length} offline action{queue.length > 1 ? 's' : ''} waiting to sync</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>}
      <Text style={styles.sectionTitle}>Today at a glance</Text>
      <View style={styles.metricGrid}><Metric label="Status" value={checkedIn ? 'Active' : 'Waiting'} /><Metric label="Last action" value={status?.time || '--:--'} /></View>
    </ScrollView>
  );
}

function History({ recent }) {
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>History</Text><Text style={styles.subtitle}>Your latest attendance activity.</Text>{recent.length ? recent.map((item, index) => <View style={styles.historyRow} key={`${item.date}-${index}`}><View><Text style={styles.historyAction}>{item.action || 'Attendance'}</Text><Text style={styles.historyDate}>{item.date || 'Recent'}</Text></View><Text style={styles.historyTime}>{item.time || '--:--'}</Text></View>) : <Empty icon="time-outline" label="No attendance records yet." />}</ScrollView>;
}

function Profile({ profile, onLogout }) {
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Profile</Text><View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>{(profile.name || profile.email || '?').slice(0, 1).toUpperCase()}</Text></View><Text style={styles.profileName}>{profile.name || 'Employee'}</Text><Text style={styles.profileEmail}>{profile.email}</Text></View><SecondaryButton label="Sign out" icon="log-out-outline" onPress={() => Alert.alert('Sign out', 'Are you sure you want to sign out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: onLogout }])} /></ScrollView>;
}

function Scanner({ onClose, onCode }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  if (!permission) return <Centered><ActivityIndicator color={colors.card} /></Centered>;
  if (!permission.granted) return <Centered dark><Text style={styles.cameraTitle}>Camera access is needed</Text><Text style={styles.cameraSub}>Allow camera access to scan your office QR code.</Text><PrimaryButton label="Allow camera" onPress={requestPermission} /><SecondaryButton label="Cancel" onPress={onClose} /></Centered>;
  return <View style={styles.scanner}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : ({ data }) => { setScanned(true); onCode(data); }} /><View style={styles.scannerOverlay}><Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={28} color={colors.card} /></Pressable><View style={styles.scanFrame} /><Text style={styles.scanText}>Place the office QR code inside the frame</Text></View></View>;
}

function Header({ profile, onLogout }) { return <View style={styles.header}><View><Text style={styles.appName}>addredance</Text><Text style={styles.headerEmail}>{profile.email}</Text></View><Pressable onPress={onLogout} accessibilityLabel="Sign out"><Ionicons name="log-out-outline" size={23} color={colors.ink} /></Pressable></View>; }
function BottomBar({ active, onChange, bottom }) { return <View style={[styles.bottomBar, { paddingBottom: Math.max(bottom, 12) }]}>{[['home', 'Home', 'home-outline'], ['history', 'History', 'time-outline'], ['profile', 'Profile', 'person-outline']].map(([key, label, icon]) => <Pressable key={key} style={styles.navItem} onPress={() => onChange(key)}><Ionicons name={active === key ? icon.replace('-outline', '') : icon} size={22} color={active === key ? colors.accent : colors.muted} /><Text style={[styles.navLabel, active === key && styles.navLabelActive]}>{label}</Text></Pressable>)}</View>; }
function Field({ label, ...props }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} autoCapitalize="none" {...props} /></View>; }
function PrimaryButton({ label, icon, onPress, disabled }) { return <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>{icon && <Ionicons name={icon} size={21} color={colors.card} />}<Text style={styles.primaryText}>{label}</Text></Pressable>; }
function SecondaryButton({ label, icon, onPress }) { return <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={onPress}>{icon && <Ionicons name={icon} size={19} color={colors.accent} />}<Text style={styles.secondaryText}>{label}</Text></Pressable>; }
function Metric({ label, value }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Empty({ icon, label }) { return <View style={styles.empty}><Ionicons name={icon} size={28} color={colors.muted} /><Text style={styles.emptyText}>{label}</Text></View>; }
function Toast({ message, type, bottom }) { return <View style={[styles.toast, { bottom }, type === 'error' && styles.toastError, type === 'success' && styles.toastSuccess]}><Text style={styles.toastText}>{message}</Text></View>; }
function Centered({ children, dark }) { return <View style={[styles.centered, dark && styles.centeredDark]}>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  login: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: colors.canvas },
  brandMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8, maxWidth: 330 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 28, maxWidth: 340 },
  field: { marginBottom: 16 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 8 }, input: { height: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, color: colors.ink, backgroundColor: colors.card, fontSize: 16 },
  primary: { height: 54, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 4 }, primaryText: { color: colors.card, fontSize: 16, fontWeight: '800' }, pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 }, disabled: { opacity: 0.55 },
  secondary: { height: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 }, secondaryText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, marginBottom: 14, fontSize: 14 }, link: { color: colors.accent, textAlign: 'center', marginTop: 20, fontWeight: '700' }, emailHint: { color: colors.muted, marginBottom: 22, fontSize: 14 },
  header: { paddingHorizontal: 22, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.canvas }, appName: { color: colors.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }, headerEmail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  content: { padding: 22, paddingBottom: 120 }, greeting: { color: colors.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.5 }, date: { color: colors.muted, marginTop: 5, marginBottom: 24, fontSize: 14 }, statusCard: { backgroundColor: colors.card, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.line }, statusIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center' }, statusIconActive: { backgroundColor: '#E2F3EB' }, statusText: { marginLeft: 14, flex: 1 }, statusLabel: { color: colors.ink, fontWeight: '800', fontSize: 17 }, statusSub: { color: colors.muted, fontSize: 13, marginTop: 5, lineHeight: 19 },
  row: { marginTop: 10, alignItems: 'flex-start' }, syncCard: { marginTop: 16, backgroundColor: '#EAF0FF', borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }, syncText: { color: colors.accentDark, flex: 1, fontSize: 14, fontWeight: '700' }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 30, marginBottom: 12 }, metricGrid: { flexDirection: 'row', gap: 12 }, metric: { flex: 1, padding: 16, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line }, metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, metricValue: { color: colors.ink, fontSize: 19, fontWeight: '800', marginTop: 8 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 }, navItem: { alignItems: 'center', minWidth: 80, gap: 3 }, navLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, navLabelActive: { color: colors.accent },
  pageTitle: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 7 }, historyRow: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 17, flexDirection: 'row', justifyContent: 'space-between' }, historyAction: { color: colors.ink, fontSize: 16, fontWeight: '800' }, historyDate: { color: colors.muted, fontSize: 13, marginTop: 4 }, historyTime: { color: colors.accent, fontSize: 16, fontWeight: '800' }, profileCard: { backgroundColor: colors.card, borderRadius: 18, padding: 24, alignItems: 'center', marginVertical: 22, borderWidth: 1, borderColor: colors.line }, avatar: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, avatarText: { color: colors.card, fontSize: 30, fontWeight: '800' }, profileName: { color: colors.ink, fontSize: 20, fontWeight: '800' }, profileEmail: { color: colors.muted, marginTop: 5 }, empty: { alignItems: 'center', padding: 45, gap: 10 }, emptyText: { color: colors.muted, fontSize: 15 },
  scanner: { flex: 1, backgroundColor: '#07111F' }, scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, closeButton: { position: 'absolute', top: 24, right: 20, padding: 8 }, scanFrame: { width: 250, height: 250, borderWidth: 3, borderColor: colors.card, borderRadius: 24 }, scanText: { color: colors.card, textAlign: 'center', fontSize: 16, fontWeight: '700', marginTop: 24 }, centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.canvas }, centeredDark: { backgroundColor: '#07111F' }, cameraTitle: { color: colors.card, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 }, cameraSub: { color: '#C7D2E0', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 }, toast: { position: 'absolute', left: 18, right: 18, backgroundColor: colors.ink, borderRadius: 14, padding: 15 }, toastSuccess: { backgroundColor: colors.success }, toastError: { backgroundColor: colors.danger }, toastText: { color: colors.card, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}
