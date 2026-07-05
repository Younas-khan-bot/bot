import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiErrorMessage } from '../api/client';
import { getBlockedUsers, unblockUser, BlockedUser } from '../api/moderation';

export default function BlockedUsersScreen() {
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setBlocks(await getBlockedUsers());
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmUnblock = (item: BlockedUser) => {
    Alert.alert('Unblock user', `Unblock ${item.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await unblockUser(item.userId);
            load();
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
    <View style={styles.container}>
      <FlatList
        data={blocks}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>You haven't blocked anyone.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.displayName}</Text>
            <TouchableOpacity style={styles.unblockButton} onPress={() => confirmUnblock(item)}>
              <Text style={styles.unblockText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' },
  empty: { color: '#8b8b9a', textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  name: { color: '#fff', fontSize: 16, fontWeight: '600' },
  unblockButton: {
    backgroundColor: '#2f2f45',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  unblockText: { color: '#a78bfa', fontWeight: '600' },
});
