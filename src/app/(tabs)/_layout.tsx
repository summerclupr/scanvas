import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useTheme } from '@/components/kit';

/**
 * Seven tabs. Due and Plan deliberately coexist: they answer different
 * questions over the same data - "what do I owe and when" versus "what
 * should I work on right now" - and students asked for both.
 */
export default function TabsLayout() {
  const c = useTheme();

  const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 20, color }}>{glyph}</Text>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        // Six tabs need tighter labels to avoid truncation on small phones.
        // Seven tabs is tight; small labels keep them all readable.
        tabBarLabelStyle: { fontSize: 9 },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Due', tabBarIcon: icon('📋') }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Plan', tabBarIcon: icon('🎯') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: icon('🗓️') }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: 'For you', tabBarIcon: icon('✨') }}
      />
      <Tabs.Screen
        name="careers"
        options={{ title: 'Careers', tabBarIcon: icon('💼') }}
      />
      <Tabs.Screen
        name="grades"
        options={{ title: 'Work', tabBarIcon: icon('📊') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: icon('⚙️') }}
      />
    </Tabs>
  );
}
