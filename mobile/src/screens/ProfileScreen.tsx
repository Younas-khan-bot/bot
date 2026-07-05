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
  Linking,
  Image,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../config/env';
import type { AppStackParamList } from '../navigation/RootNavigator';

interface HostProfile {
  bio: string | null;
  country: string | null;
  age: number | null;
  language: string | null;
  ratePerMinute: number;
  isOnline: boolean;
  isApproved: boolean;
  totalEarnedCoins: number;
}

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout, refreshUser } = useAuth();
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [rate, setRate] = useState('10');
  const [country, setCountry] = useState('');
  const [age, setAge] = useState('');
  const [language, setLanguage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const uploadPhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        maxWidth: 900,
        maxHeight: 900,
        quality: 0.6,
      });
      if (result.didCancel || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read that image. Try another one.');
        return;
      }
      setUploadingPhoto(true);
      await apiClient.post('/users/me/avatar', {
        base64: asset.base64,
        mime: asset.type ?? 'image/jpeg',
      });
      await refreshUser();
      Alert.alert('Photo updated', 'Your profile photo has been saved.');
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const load = async () => {
    try {
      const res = await apiClient.get('/hosts/me');
      setHostProfile(res.data.hostProfile);
      if (res.data.hostProfile) {
        const hp = res.data.hostProfile;
        setBio(hp.bio ?? '');
        setRate(String(hp.ratePerMinute));
        setCountry(hp.country ?? '');
        setAge(hp.age ? String(hp.age) : '');
        setLanguage(hp.language ?? '');
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
      const payload: Record<string, unknown> = { bio, ratePerMinute };
      if (country.trim()) payload.country = country.trim();
      if (age.trim()) payload.age = parseInt(age, 10);
      if (language.trim()) payload.language = language.trim();
      await apiClient.post('/hosts/apply', payload);
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
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={uploadPhoto} activeOpacity={0.8}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Text style={{ fontSize: 14 }}>{uploadingPhoto ? '⏳' : '📷'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={uploadPhoto} disabled={uploadingPhoto}>
          <Text style={styles.uploadText}>
            {uploadingPhoto ? 'Uploading…' : user?.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Text>
        </TouchableOpacity>
      </View>

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
      <View style={styles.rowInputs}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Country (e.g. Egypt)"
          placeholderTextColor="#8b8b9a"
          value={country}
          onChangeText={setCountry}
        />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Age"
          placeholderTextColor="#8b8b9a"
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Language (Arabic, Spanish, Asian, English, Europe)"
        placeholderTextColor="#8b8b9a"
        value={language}
        onChangeText={setLanguage}
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

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Safety &amp; legal</Text>
      <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('BlockedUsers')}>
        <Text style={styles.linkText}>Blocked users</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
        <Text style={styles.linkText}>Privacy Policy</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(TERMS_URL)}>
        <Text style={styles.linkText}>Terms of Service</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={logout}>
        <Text style={styles.buttonText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' },
  avatarSection: { alignItems: 'center', marginBottom: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#1c1c2e' },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#6d28d9' },
  avatarInitial: { color: '#fff', fontSize: 40, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: '#f97316',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f0f1a',
  },
  uploadText: { color: '#a78bfa', fontWeight: '600', marginTop: 8 },
  name: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  email: { color: '#8b8b9a', marginTop: 4, textAlign: 'center' },
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
  rowInputs: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
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
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c2e',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  linkText: { color: '#c9c9d6', fontSize: 15 },
  chevron: { color: '#8b8b9a', fontSize: 20 },
});
