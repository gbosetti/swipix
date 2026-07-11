import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import TrashScreen from '../screens/TrashScreen';
import { TrashStackParamList } from './types';
import { Colors } from '../theme/colors';

const Stack = createNativeStackNavigator<TrashStackParamList>();

export default function TrashStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Trash"
        component={TrashScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.trash'),
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
