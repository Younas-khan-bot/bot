import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { Socket } from 'socket.io-client';
import { apiClient } from '../api/client';

interface Msg {
  id: string;
  mine: boolean;
  original: string;
  translated?: string;
}

// Target languages users can auto-translate incoming messages into.
const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'عربى' },
  { code: 'es', label: 'ES' },
  { code: 'hi', label: 'हिं' },
  { code: 'fr', label: 'FR' },
  { code: 'zh', label: '中文' },
  { code: 'ru', label: 'RU' },
];

export default function CallChat({
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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState('en');
  const targetRef = useRef(target);
  targetRef.current = target;

  const translateInto = useCallback(async (id: string, text: string, to: string) => {
    try {
      const res = await apiClient.post('/translate', { text, to });
      const translated = res.data.translated as string;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, translated } : m)));
    } catch {
      // leave original if translation fails
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onMessage = ({ callId: cId, text }: { callId: string; text: string }) => {
      if (cId !== callId) return;
      const id = `${Date.now()}-${Math.random()}`;
      setMessages((prev) => [...prev, { id, mine: false, original: text }]);
      translateInto(id, text, targetRef.current);
    };
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [socket, callId, translateInto]);

  const send = () => {
    const text = input.trim();
    if (!text || !socket) return;
    socket.emit('chat:send', { callId, text });
    setMessages((prev) => [...prev, { id: `${Date.now()}`, mine: true, original: text }]);
    setInput('');
  };

  // Re-translate all received messages when the target language changes.
  const changeTarget = (code: string) => {
    setTarget(code);
    messages.forEach((m) => {
      if (!m.mine) translateInto(m.id, m.original, code);
    });
  };

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>💬 Live chat</Text>
        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <TouchableOpacity key={l.code} onPress={() => changeTarget(l.code)}>
              <Text style={[styles.lang, target === l.code && styles.langActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
            <Text style={styles.msgText}>{item.mine ? item.original : item.translated ?? '…'}</Text>
            {!item.mine && item.translated && item.translated !== item.original ? (
              <Text style={styles.orig}>{item.original}</Text>
            ) : null}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor="#8b8b9a"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: '#0f0f1aee',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22223a',
  },
  title: { color: '#fff', fontWeight: '700', marginRight: 8 },
  langRow: { flexDirection: 'row', gap: 8, flex: 1, flexWrap: 'wrap' },
  lang: { color: '#8b8b9a', fontSize: 13, fontWeight: '700' },
  langActive: { color: '#f97316' },
  close: { color: '#fff', fontSize: 18, paddingHorizontal: 6 },
  list: { flex: 1 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#6d28d9' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#1c1c2e' },
  msgText: { color: '#fff', fontSize: 15 },
  orig: { color: '#8b8b9a', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', padding: 10, gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#1c1c2e',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18 },
});
