import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import type { Socket } from 'socket.io-client';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Gift {
  id: string;
  name: string;
  emoji: string;
  coins: number;
}

// Full-screen floating animation played when a gift is sent/received.
function FlyingGift({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(v, { toValue: 2, duration: 500, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(onDone);
  }, [v, onDone]);

  const scale = v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.4] });
  const opacity = v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const translateY = v.interpolate({ inputRange: [0, 1, 2], outputRange: [40, 0, -80] });

  return (
    <Animated.Text style={[styles.flying, { opacity, transform: [{ scale }, { translateY }] }]}>
      {emoji}
    </Animated.Text>
  );
}

export default function CallGifts({
  socket,
  callId,
  visible,
  onClose,
}: {
  socket: Socket | null;
  callId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { user, refreshUser } = useAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [flying, setFlying] = useState<{ key: string; emoji: string }[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/gifts')
      .then((res) => setGifts(res.data.gifts))
      .catch(() => {});
  }, []);

  const playGift = useCallback((emoji: string) => {
    const key = `${Date.now()}-${Math.random()}`;
    setFlying((prev) => [...prev, { key, emoji }]);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onGift = ({ callId: cId, emoji }: { callId: string; emoji: string }) => {
      if (cId !== callId) return;
      playGift(emoji);
      refreshUser();
    };
    socket.on('gift:received', onGift);
    return () => {
      socket.off('gift:received', onGift);
    };
  }, [socket, callId, playGift, refreshUser]);

  const send = (gift: Gift) => {
    if (!socket || sending) return;
    setSending(gift.id);
    socket.emit(
      'gift:send',
      { callId, giftId: gift.id },
      (ack: { ok?: boolean; error?: string }) => {
        setSending(null);
        if (ack?.error) {
          Alert.alert('Cannot send gift', ack.error);
          return;
        }
        refreshUser();
        onClose();
      },
    );
  };

  return (
    <>
      {/* floating animations layer (always mounted) */}
      <View pointerEvents="none" style={styles.flyLayer}>
        {flying.map((f) => (
          <FlyingGift
            key={f.key}
            emoji={f.emoji}
            onDone={() => setFlying((prev) => prev.filter((x) => x.key !== f.key))}
          />
        ))}
      </View>

      {visible && (
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>🎁 Send a gift</Text>
            <Text style={styles.balance}>🪙 {user?.coinBalance ?? 0}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={gifts}
            keyExtractor={(g) => g.id}
            numColumns={4}
            contentContainerStyle={{ padding: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.gift}
                onPress={() => send(item)}
                disabled={!!sending}>
                <Text style={styles.giftEmoji}>{item.emoji}</Text>
                <Text style={styles.giftName}>{item.name}</Text>
                <Text style={styles.giftCost}>🪙 {item.coins}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flyLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  flying: { fontSize: 96, position: 'absolute' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: '#12121f',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22223a',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  balance: { color: '#fbbf24', fontWeight: '700', marginRight: 14 },
  close: { color: '#fff', fontSize: 18 },
  gift: {
    flex: 1 / 4,
    alignItems: 'center',
    paddingVertical: 12,
    margin: 4,
    backgroundColor: '#1c1c2e',
    borderRadius: 12,
  },
  giftEmoji: { fontSize: 30 },
  giftName: { color: '#c9c9d6', fontSize: 11, marginTop: 4 },
  giftCost: { color: '#fbbf24', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
