import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrashScreen from '../screens/TrashScreen';
import { TrashStackParamList } from './types';

const Stack = createNativeStackNavigator<TrashStackParamList>();

export default function TrashStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Trash"
        component={TrashScreen}
        options={{
          headerShown: true,
          headerTitle: 'Trash',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
