import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Host } from '../types';

export default function HostCard({
  host,
  onCall,
  onModerate,
}: {
  host: Host;
  onCall: (host: Host) => void;
  onModerate?: (host: Host) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        {host.avatarUrl ? (
          <Image source={{ uri: host.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{host.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {host.isOnline && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{host.displayName}</Text>
        {host.bio ? (
          <Text style={styles.bio} numberOfLines={1}>
            {host.bio}
          </Text>
        ) : null}
        <Text style={styles.rate}>🪙 {host.ratePerMinute}/min</Text>
      </View>
      <TouchableOpacity style={styles.callButton} onPress={() => onCall(host)}>
        <Text style={styles.callButtonText}>Call</Text>
      </TouchableOpacity>
      {onModerate ? (
        <TouchableOpacity
          style={styles.moreButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => onModerate(host)}>
          <Text style={styles.moreIcon}>⋮</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c2e',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: { backgroundColor: '#6d28d9', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#1c1c2e',
  },
  info: { flex: 1, marginLeft: 12 },
  name: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bio: { color: '#8b8b9a', fontSize: 13, marginTop: 2 },
  rate: { color: '#a78bfa', fontSize: 13, marginTop: 4, fontWeight: '600' },
  callButton: {
    backgroundColor: '#6d28d9',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  callButtonText: { color: '#fff', fontWeight: '700' },
  moreButton: { paddingHorizontal: 6, paddingVertical: 4, marginLeft: 4 },
  moreIcon: { color: '#8b8b9a', fontSize: 22, fontWeight: '700' },
});
