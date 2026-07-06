// Login gate — shown every time the app opens. For now this is a simple
// hardcoded admin sign-in (no backend yet). Once PostgreSQL + Node API land,
// the credential check here gets swapped for a real auth call; the rest of the
// screen stays the same. On success it calls onLogin() and the app reveals its
// pages.
import React, { useState } from 'react';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Envelope } from 'phosphor-react-native/src/icons/Envelope';
import { Lock } from 'phosphor-react-native/src/icons/Lock';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlash } from 'phosphor-react-native/src/icons/EyeSlash';
import { theme } from '../theme';

// `authenticate` checks the credentials against the in-memory user store (and,
// later, the DB-backed API). It returns an error string to show, or null on
// success — at which point AuthGate swaps this screen for the app.
export default function Login({ authenticate }: { authenticate: (email: string, password: string) => Promise<string | null> }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setBusy(true);
    const err = await authenticate(email, password);
    setBusy(false);
    setError(err ?? '');
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {/* Brand */}
            <View style={styles.logoWrap}>
              <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>CSR Fund Manager</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>

            {/* Email */}
            <View style={[styles.inputRow, !!error && styles.inputRowError]}>
              <Envelope size={18} color={theme.faint} weight="bold" />
              <TextInput
                value={email}
                onChangeText={t => { setEmail(t); if (error) setError(''); }}
                placeholder="you@company.com"
                placeholderTextColor={theme.faint}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={[styles.inputRow, !!error && styles.inputRowError]}>
              <Lock size={18} color={theme.faint} weight="bold" />
              <TextInput
                value={password}
                onChangeText={t => { setPassword(t); if (error) setError(''); }}
                placeholder="••••••••"
                placeholderTextColor={theme.faint}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable onPress={() => setShow(s => !s)} hitSlop={8}>
                {show
                  ? <EyeSlash size={18} color={theme.muted} />
                  : <Eye size={18} color={theme.muted} />}
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* Sign in */}
            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.signBtn, (pressed || busy) && { backgroundColor: theme.primaryDk }, busy && { opacity: 0.8 }]}>
              <Text style={styles.signText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>

            {/* Admin hint */}
            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>Administrator login</Text>
              <Text style={styles.hintBody}>admin@csr.com / Admin@123</Text>
            </View>

            <Text style={styles.footer}>
              Editor & viewer accounts are created by the administrator from the Admin Panel.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' }, // deep navy backdrop
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22 },

  card: {
    backgroundColor: '#fff', borderRadius: 22, padding: 26,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },

  logoWrap: {
    alignSelf: 'center', width: 64, height: 64, borderRadius: 16, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  logo: { width: 46, height: 46, borderRadius: 11 },

  title: { fontSize: 22, fontWeight: '800', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.muted, textAlign: 'center', marginTop: 4, marginBottom: 22 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, minHeight: 50, marginBottom: 12,
  },
  inputRowError: { borderColor: theme.danger },
  input: { flex: 1, fontSize: 14.5, color: theme.text, paddingVertical: 12 },

  error: { color: theme.danger, fontSize: 13, fontWeight: '600', marginBottom: 10, marginTop: -2 },

  signBtn: {
    backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  signText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  hintBox: {
    backgroundColor: '#f1f2f9', borderRadius: 12, padding: 12, marginTop: 18,
    borderWidth: 1, borderColor: theme.border,
  },
  hintTitle: { fontSize: 12.5, fontWeight: '800', color: theme.text },
  hintBody: { fontSize: 12.5, color: theme.muted, marginTop: 2, fontWeight: '600' },

  footer: { fontSize: 12, color: theme.faint, textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
