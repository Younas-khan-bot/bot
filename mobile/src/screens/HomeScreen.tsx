import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import HostCard from '../components/HostCard';
import { showModerationMenu } from '../api/moderation';
import { Host } from '../types';
import type { AppStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [callingHostId, setCallingHostId] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.headerLink}>🪙 {user?.coinBalance ?? 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.headerLink}>Profile</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, user?.coinBalance]);

  const loadHosts = useCallback(async () => {
    try {
      const res = await apiClient.get('/hosts/');
      setHosts(res.data.hosts);
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHosts();
    }, [loadHosts]),
  );

  const callHost = (host: Host) => {
    if (!socket) {
      return;
    }
    setCallingHostId(host.hostId);
    socket.emit(
      'call:request',
      { hostId: host.hostId },
      (ack: { callId?: string; error?: string }) => {
        setCallingHostId(null);
        if (ack?.error) {
          Alert.alert('Cannot start call', ack.error);
          return;
        }
        if (ack?.callId) {
          navigation.navigate('Call', {
            callId: ack.callId,
            role: 'caller',
            peerId: host.hostId,
            peer: { displayName: host.displayName, avatarUrl: host.avatarUrl },
          });
        }
      },
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={hosts}
        keyExtractor={(item) => item.hostId}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadHosts();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No hosts online right now. Pull to refresh.</Text>
        }
        renderItem={({ item }) => (
          <HostCard
            host={item}
            onCall={callHost}
            onModerate={(host) =>
              showModerationMenu({
                userId: host.hostId,
                displayName: host.displayName,
                onBlocked: loadHosts,
              })
            }
          />
        )}
      />
      {callingHostId && (
        <View style={styles.callingOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.callingText}>Calling...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' },
  headerLink: { color: '#a78bfa', fontWeight: '600' },
  empty: { color: '#8b8b9a', textAlign: 'center', marginTop: 40 },
  callingOverlay: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#1c1c2e',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callingText: { color: '#fff', marginLeft: 8 },
});
