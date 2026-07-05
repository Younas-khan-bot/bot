import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { Host } from '../types';

const GAP = 10;
const CARD_W = (Dimensions.get('window').width - GAP * 3) / 2;
const CARD_H = CARD_W * 1.34;

// Deterministic placeholder color from the host id, so cards without a photo
// still look intentional rather than blank.
const PALETTE = ['#6d28d9', '#be185d', '#b45309', '#0f766e', '#1d4ed8', '#9333ea'];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function HostGridCard({
  host,
  onCall,
  onOpen,
}: {
  host: Host;
  onCall: (host: Host) => void;
  onOpen?: (host: Host) => void;
}) {
  const location = [host.country, host.age].filter(Boolean).join(', ');
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.card}
      onPress={() => (onOpen ? onOpen(host) : onCall(host))}
      onLongPress={() => onOpen?.(host)}>
      {host.avatarUrl ? (
        <Image source={{ uri: host.avatarUrl }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, { backgroundColor: colorFor(host.hostId) }]}>
          <Text style={styles.placeholderInitial}>
            {host.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      {/* darken the bottom so white text is readable over any photo */}
      <View style={styles.scrim} />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {host.displayName} 🌙
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: host.isOnline ? '#22c55e' : '#8b8b9a' }]} />
          <Text style={styles.meta} numberOfLines={1}>
            {location || `🪙 ${host.ratePerMinute}/min`}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.callBtn} onPress={() => onCall(host)} activeOpacity={0.85}>
        <VideoCamIcon />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// A clean white camcorder glyph (rounded body + triangular lens), drawn with
// Views so it renders crisply on every device — no emoji inconsistencies.
function VideoCamIcon() {
  return (
    <View style={styles.vcam}>
      <View style={styles.vcamBody} />
      <View style={styles.vcamLens} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: GAP,
    backgroundColor: '#1c1c2e',
  },
  photo: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  placeholderInitial: { color: '#ffffffaa', fontSize: 56, fontWeight: '800' },
  scrim: {
    // Semi-opaque dark block behind the name so white text stays legible over
    // any photo (RN has no CSS gradients without an extra lib).
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: '#00000055',
  },
  info: { position: 'absolute', left: 10, bottom: 10, right: 44 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  meta: { color: '#e6e6ee', fontSize: 12, fontWeight: '600' },
  callBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff55',
    shadowColor: '#f97316',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 5,
  },
  // camcorder icon
  vcam: { flexDirection: 'row', alignItems: 'center' },
  vcamBody: {
    width: 15,
    height: 13,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  vcamLens: {
    width: 0,
    height: 0,
    marginLeft: 1.5,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
  },
});

export { CARD_W, GAP };
