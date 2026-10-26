import { Link, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

function tabIcon(name: IconName) {
  function TabIcon({ focused }: { focused: boolean }) {
    return <Icon name={name} color={focused ? 'text' : 'textSecondary'} />;
  }
  return TabIcon;
}

function ProfileButton() {
  return (
    <Link href="/profilo" asChild>
      <PressableScale accessibilityLabel="Profilo" style={styles.headerButton}>
        <Icon name="profile" color="text" />
      </PressableScale>
    </Link>
  );
}

/** Le quattro tab di docs/design.md; il profilo si apre dall'intestazione di Oggi. */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: textStyles.section.fontFamily },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: textStyles.minimum.fontFamily },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Oggi', tabBarIcon: tabIcon('today'), headerRight: ProfileButton }}
      />
      <Tabs.Screen name="piano" options={{ title: 'Piano', tabBarIcon: tabIcon('plan') }} />
      <Tabs.Screen name="dispensa" options={{ title: 'Dispensa', tabBarIcon: tabIcon('pantry') }} />
      <Tabs.Screen
        name="andamento"
        options={{ title: 'Andamento', tabBarIcon: tabIcon('trend') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
