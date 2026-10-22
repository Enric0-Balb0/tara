import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
        <Tabs.Screen name="index" options={{ title: 'Oggi' }} />
        <Tabs.Screen name="alimenti" options={{ title: 'Alimenti' }} />
        <Tabs.Screen name="progressi" options={{ title: 'Progressi' }} />
        <Tabs.Screen name="profilo" options={{ title: 'Profilo' }} />
      </Tabs>
    </>
  );
}
