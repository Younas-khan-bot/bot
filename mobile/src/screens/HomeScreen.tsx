import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import HostGridCard, { GAP } from '../components/HostGridCard';
import { showModerationMenu } from '../api/moderation';
import { Host } from '../types';
import type { AppStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Home'>;

const TABS = ['Popular', 'New', 'Followed'] as const;
const LANGS = ['All', 'Arabic', 'Spanish', 'Asian', 'English', 'Europe'] as const;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [callingHostId, setCallingHostId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Popular');
  const [lang, setLang] = useState<(typeof LANGS)[number]>('All');

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const loadHosts = useCallback(async () => {
    try {
      const params: Record<string, string> = { online: 'false' };
      if (tab === 'New') params.sort = 'new';
      if (lang !== 'All') params.language = lang;
      const res = await apiClient.get('/hosts/', { params });
      setHosts(res.data.hosts);
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, lang]);

  useFocusEffect(
    useCallback(() => {
      loadHosts();
    }, [loadHosts]),
  );

  const callHost = (host: Host) => {
    if (!socket) return;
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

  const openHost = (host: Host) => {
    Alert.alert(host.displayName, undefined, [
      { text: `📹 Video call (🪙 ${host.ratePerMinute}/min)`, onPress: () => callHost(host) },
      {
        text: 'Report / Block',
        style: 'destructive',
        onPress: () =>
          showModerationMenu({
            userId: host.hostId,
            displayName: host.displayName,
            onBlocked: loadHosts,
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Top bar: tabs + coins */}
      <View style={styles.topBar}>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)}>
              <Text style={[styles.tab, tab === t && styles.tabActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.coins} onPress={() => navigation.navigate('Wallet')}>
          <Text style={styles.coinsText}>🪙 {user?.coinBalance ?? 0}</Text>
        </TouchableOpacity>
      </View>

      {/* Language filter chips */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {LANGS.map((l) => (
            <TouchableOpacity key={l} onPress={() => setLang(l)}>
              <Text style={[styles.chip, lang === l && styles.chipActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={hosts}
          keyExtractor={(item) => item.hostId}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ padding: GAP, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl
              tintColor="#f97316"
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadHosts();
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No hosts here yet. As hosts join and get approved, they'll appear. Pull to refresh.
            </Text>
          }
          renderItem={({ item }) => (
            <HostGridCard host={item} onCall={callHost} onOpen={openHost} />
          )}
        />
      )}

      {/* Bottom navigation bar */}
      <View style={styles.bottomNav}>
        <NavItem label="Discover" icon="🏠" active onPress={() => loadHosts()} />
        <NavItem
          label="Match"
          icon="🎲"
          onPress={() => {
            const online = hosts.filter((h) => h.isOnline);
            if (!online.length) {
              Alert.alert('No one online', 'No hosts are online right now. Try again soon.');
              return;
            }
            callHost(online[Math.floor(Math.random() * online.length)]);
          }}
        />
        <NavItem label="Wallet" icon="🪙" onPress={() => navigation.navigate('Wallet')} />
        <NavItem
          label="Messages"
          icon="💬"
          onPress={() => Alert.alert('Coming soon', 'Direct messaging is on the way.')}
        />
        <NavItem label="Profile" icon="👤" onPress={() => navigation.navigate('Profile')} />
      </View>

      {callingHostId && (
        <View style={styles.callingOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.callingText}>Calling…</Text>
        </View>
      )}
    </View>
  );
}

function NavItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress}>
      <Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 8,
  },
  tabs: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  tab: { color: '#8b8b9a', fontSize: 17, fontWeight: '700' },
  tabActive: { color: '#f97316', fontSize: 22 },
  coins: {
    backgroundColor: '#1c1c2e',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinsText: { color: '#fbbf24', fontWeight: '700' },
  chipsWrap: { paddingBottom: 6 },
  chips: { paddingHorizontal: 16, gap: 18, alignItems: 'center' },
  chip: { color: '#8b8b9a', fontSize: 15, fontWeight: '600' },
  chipActive: { color: '#fff', fontWeight: '800' },
  empty: { color: '#8b8b9a', textAlign: 'center', marginTop: 60, paddingHorizontal: 30, lineHeight: 20 },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#12121f',
    borderTopWidth: 1,
    borderTopColor: '#22223a',
    paddingTop: 8,
    paddingBottom: 18,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { fontSize: 20, opacity: 0.55 },
  navIconActive: { opacity: 1 },
  navLabel: { color: '#8b8b9a', fontSize: 10, marginTop: 2 },
  navLabelActive: { color: '#f97316', fontWeight: '700' },
  callingOverlay: {
    position: 'absolute',
    bottom: 90,
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
