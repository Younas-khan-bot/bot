import React, { useEffect } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import CallScreen from '../screens/CallScreen';
import { Host, IceServer } from '../types';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  Wallet: undefined;
  Profile: undefined;
  BlockedUsers: undefined;
  Call: {
    callId: string;
    role: 'caller' | 'host';
    peerId: string;
    peer: { displayName: string; avatarUrl?: string | null };
    iceServers?: IceServer[];
  };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: '#0f0f1a' },
  headerTintColor: '#fff',
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#0f0f1a' },
};

function AppNavigator() {
  const { incomingCall, clearIncomingCall, socket } = useSocket();
  const navRef = React.useRef<NavigationContainerRef<AppStackParamList>>(null);

  useEffect(() => {
    if (!incomingCall || !socket) {
      return;
    }

    Alert.alert(
      'Incoming call',
      `${incomingCall.caller.displayName} wants to video call you (${incomingCall.ratePerMinute} coins/min)`,
      [
        {
          text: 'Decline',
          style: 'cancel',
          onPress: () => {
            socket.emit('call:reject', { callId: incomingCall.callId });
            clearIncomingCall();
          },
        },
        {
          text: 'Accept',
          onPress: () => {
            clearIncomingCall();
            socket.emit(
              'call:accept',
              { callId: incomingCall.callId },
              (ack: { ok?: boolean; error?: string; iceServers?: any[] }) => {
                if (ack?.error) {
                  Alert.alert('Could not accept call', ack.error);
                  return;
                }
                navRef.current?.navigate('Call', {
                  callId: incomingCall.callId,
                  role: 'host',
                  peerId: incomingCall.caller.id,
                  peer: incomingCall.caller,
                  iceServers: ack.iceServers,
                });
              },
            );
          },
        },
      ],
    );
  }, [incomingCall, socket, clearIncomingCall]);

  return (
    <NavigationContainer ref={navRef}>
      <AppStack.Navigator screenOptions={screenOptions}>
        <AppStack.Screen name="Home" component={HomeScreen} options={{ title: 'Hosts' }} />
        <AppStack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
        <AppStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <AppStack.Screen
          name="BlockedUsers"
          component={BlockedUsersScreen}
          options={{ title: 'Blocked users' }}
        />
        <AppStack.Screen
          name="Call"
          component={CallScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
        />
      </AppStack.Navigator>
    </NavigationContainer>
  );
}

function AuthNavigator() {
  return (
    <NavigationContainer>
      <AuthStack.Navigator screenOptions={screenOptions}>
        <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <AuthStack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ headerShown: false }}
        />
      </AuthStack.Navigator>
    </NavigationContainer>
  );
}

export default function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0f0f1a',
        }}>
        <ActivityIndicator color="#a78bfa" size="large" />
      </View>
    );
  }

  return user ? <AppNavigator /> : <AuthNavigator />;
}

export type { Host };
