import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { StepRuler } from '@/components/StepRuler';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import { announceSignIn } from '@/data/SessionProvider';
import { supabase } from '@/data/supabase';
import {
  authErrorMessage,
  isCompleteCode,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
  otpRequest,
  resendSecondsLeft,
} from '@/domain/accesso';
import { space } from '@/theme/layout';
import { durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

type Step = 'email' | 'code';

/**
 * Accesso con un codice via email (RNF-04), in due passi: email, poi codice. Le iscrizioni
 * sono chiuse: un indirizzo che Enrico non ha creato riceve "Questa email non è abilitata".
 * Quando la sessione arriva, la guardia di `_layout.tsx` apre l'app da sola.
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { colors, reduceMotion } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // L'ultimo invio: a quale indirizzo e quando, per l'attesa prima di chiederne un altro.
  const [sent, setSent] = useState<{ email: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const address = normalizeEmail(email);
  const emailValid = isValidEmail(email);
  const secondsLeft = sent?.email === address ? resendSecondsLeft(sent.at, now) : 0;
  const counting = secondsLeft > 0;

  // Il conto alla rovescia gira solo mentre serve.
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  // Al secondo passo il tasto Indietro di Android torna all'email invece di chiudere l'app.
  useEffect(() => {
    if (step !== 'code') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('email');
      setError(null);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  function goTo(next: Step) {
    setStep(next);
    setCode('');
    setError(null);
  }

  async function sendCode() {
    if (!emailValid || busy !== null || counting) return;
    setBusy('send');
    setError(null);
    try {
      const { error: failure } = await supabase.auth.signInWithOtp(otpRequest(address));
      if (failure) {
        setError(authErrorMessage(failure));
        return;
      }
      const at = Date.now();
      setSent({ email: address, at });
      setNow(at);
      goTo('code');
    } catch (thrown) {
      setError(authErrorMessage(thrown));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (!isCompleteCode(code) || busy !== null) return;
    setBusy('verify');
    setError(null);
    try {
      const { data, error: failure } = await supabase.auth.verifyOtp({
        email: address,
        token: code,
        type: 'email',
      });
      if (failure || !data.session) {
        setError(authErrorMessage(failure));
        setBusy(null);
        return;
      }
      // La schermata sparisce con la sessione: l'attesa resta visibile fino ad allora.
      announceSignIn(data.session.access_token);
    } catch (thrown) {
      setError(authErrorMessage(thrown));
      setBusy(null);
    }
  }

  // Il passo nuovo entra da destra come una pagina; con il movimento ridotto solo dissolvenza.
  const entering = reduceMotion
    ? FadeIn.duration(durations.quick)
    : FadeInRight.duration(durations.sheetIn);
  const resendLabel = (verb: string) =>
    counting
      ? { label: `${verb} tra ${secondsLeft} s`, spoken: `${verb} tra ${secondsLeft} secondi` }
      : { label: verb, spoken: verb };
  const send = resendLabel('Invia il codice');
  const resend = resendLabel('Invia di nuovo');

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.l },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TaraText variant="section">Tara</TaraText>
            <TaraText variant="minimum" color="textSecondary">
              {step === 'email' ? '1 di 2 · Email' : '2 di 2 · Codice'}
            </TaraText>
          </View>
          <StepRuler step={step === 'email' ? 1 : 2} total={2} />
        </View>

        <Animated.View key={step} entering={entering} style={styles.step}>
          {step === 'email' ? (
            <>
              <View style={styles.intro}>
                <TaraText variant="title" accessibilityRole="header">
                  Accedi a Tara
                </TaraText>
                <TaraText color="textSecondary">
                  Ti mandiamo un codice di 6 cifre: niente password da ricordare.
                </TaraText>
              </View>
              <TextField
                label="Email"
                testID="campo-email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                }}
                placeholder="nome@esempio.it"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={() => void sendCode()}
                invalid={error !== null}
              />
            </>
          ) : (
            <>
              <View style={styles.intro}>
                <TaraText variant="title" accessibilityRole="header">
                  Controlla l’email
                </TaraText>
                <TaraText color="textSecondary">
                  Inserisci il codice che ti abbiamo mandato a{' '}
                  <TaraText variant="bodyStrong">{address}</TaraText>
                </TaraText>
              </View>
              <TextField
                label="Codice"
                testID="campo-codice"
                variant="bigNumber"
                value={code}
                onChangeText={(text) => {
                  setCode(normalizeCode(text));
                  setError(null);
                }}
                placeholder="000000"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                textAlign="center"
                returnKeyType="done"
                onSubmitEditing={() => void verify()}
                invalid={error !== null}
              />
            </>
          )}

          {error !== null ? (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
              <Icon name="alert" color="error" size={20} />
              <TaraText color="error" style={styles.errorText}>
                {error}
              </TaraText>
            </View>
          ) : null}

          <View style={styles.spacer} />

          {step === 'email' ? (
            <View style={styles.actions}>
              <Button
                label={send.label}
                accessibilityLabel={send.spoken}
                onPress={() => void sendCode()}
                disabled={!emailValid || counting}
                loading={busy === 'send'}
              />
              <Button
                kind="quiet"
                label="Ho già un codice"
                onPress={() => goTo('code')}
                disabled={!emailValid || busy !== null}
              />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                label="Verifica"
                onPress={() => void verify()}
                disabled={!isCompleteCode(code)}
                loading={busy === 'verify'}
              />
              <View style={styles.secondaryRow}>
                <Button
                  kind="quiet"
                  label="Cambia email"
                  onPress={() => goTo('email')}
                  disabled={busy !== null}
                />
                <Button
                  kind="quiet"
                  label={resend.label}
                  accessibilityLabel={resend.spoken}
                  onPress={() => void sendCode()}
                  disabled={counting || busy !== null}
                  loading={busy === 'send'}
                />
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.l, gap: space.xxxl },
  header: { gap: space.s },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  step: { flexGrow: 1, gap: space.xxl },
  intro: { gap: space.s },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  errorText: { flex: 1 },
  spacer: { flexGrow: 1 },
  actions: { gap: space.s },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
