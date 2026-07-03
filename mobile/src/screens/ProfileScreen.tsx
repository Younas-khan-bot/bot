import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { apiClient, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface HostProfile {
  bio: string | null;
  ratePerMinute: number;
  isOnline: boolean;
  isApproved: boolean;
  totalEarnedCoins: number;
}

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [rate, setRate] = useState('10');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await apiClient.get('/hosts/me');
      setHostProfile(res.data.hostProfile);
      if (res.data.hostProfile) {
        setBio(res.data.hostProfile.bio ?? '');
        setRate(String(res.data.hostProfile.ratePerMinute));
      }
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyAsHost = async () => {
    setSaving(true);
    try {
      const ratePerMinute = parseInt(rate, 10);
      await apiClient.post('/hosts/apply', { bio, ratePerMinute });
      await load();
      Alert.alert(
        'Application submitted',
        'Your host application is pending admin approval before you can go online.',
      );
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleOnline = async (value: boolean) => {
    try {
      const res = await apiClient.post('/hosts/status', { isOnline: value });
      setHostProfile(res.data.hostProfile);
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    }
  };

  const requestWithdrawal = async () => {
    if (!hostProfile) {
      return;
    }
    Alert.alert('Request withdrawal', `Cash out ${hostProfile.totalEarnedCoins} coins?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request',
        onPress: async () => {
          try {
            await apiClient.post('/withdrawals/request', {
              coinsAmount: hostProfile.totalEarnedCoins,
            });
            Alert.alert('Requested', 'Your withdrawal request was submitted for admin review.');
            await load();
            await refreshUser();
          } catch (err) {
            Alert.alert('Error', apiErrorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.name}>{user?.displayName}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <Text style={styles.balance}>🪙 {user?.coinBalance ?? 0} coins</Text>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Become a host</Text>
      <Text style={styles.sectionSubtitle}>
        Hosts earn coins per minute when other users call them. Applications require admin approval
        before you can go online.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Short bio"
        placeholderTextColor="#8b8b9a"
        value={bio}
        onChangeText={setBio}
      />
      <TextInput
        style={styles.input}
        placeholder="Rate per minute (coins)"
        placeholderTextColor="#8b8b9a"
        keyboardType="number-pad"
        value={rate}
        onChangeText={setRate}
      />
      <TouchableOpacity style={styles.button} onPress={applyAsHost} disabled={saving}>
        <Text style={styles.buttonText}>
          {hostProfile ? 'Update host profile' : 'Apply to be a host'}
        </Text>
      </TouchableOpacity>

      {hostProfile && (
        <View style={styles.hostStatusCard}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Approved</Text>
            <Text style={hostProfile.isApproved ? styles.pillOk : styles.pillPending}>
              {hostProfile.isApproved ? 'Yes' : 'Pending review'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Online (visible to callers)</Text>
            <Switch
              value={hostProfile.isOnline}
              onValueChange={toggleOnline}
              disabled={!hostProfile.isApproved}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total earned</Text>
            <Text style={styles.rowValue}>🪙 {hostProfile.totalEarnedCoins}</Text>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={requestWithdrawal}
            disabled={hostProfile.totalEarnedCoins <= 0}>
            <Text style={styles.buttonText}>Request withdrawal</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={logout}>
        <Text style={styles.buttonText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' },
  name: { color: '#fff', fontSize: 22, fontWeight: '700' },
  email: { color: '#8b8b9a', marginTop: 4 },
  balance: { color: '#a78bfa', marginTop: 10, fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#1c1c2e', marginVertical: 20 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: '#8b8b9a', marginBottom: 16, lineHeight: 18 },
  input: {
    backgroundColor: '#1c1c2e',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#6d28d9',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryButton: { backgroundColor: '#2f2f45' },
  logoutButton: { backgroundColor: '#3f1d1d', marginTop: 30, marginBottom: 40 },
  buttonText: { color: '#fff', fontWeight: '600' },
  hostStatusCard: { backgroundColor: '#1c1c2e', borderRadius: 12, padding: 16, marginTop: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rowLabel: { color: '#c9c9d6' },
  rowValue: { color: '#fff', fontWeight: '600' },
  pillOk: { color: '#22c55e', fontWeight: '700' },
  pillPending: { color: '#f59e0b', fontWeight: '700' },
});
