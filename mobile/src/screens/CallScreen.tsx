import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, BackHandler } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { showModerationMenu } from '../api/moderation';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { IceServer } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Call'>;

// Fallback ICE config used only if the server didn't hand us one (e.g. the
// host screen navigated here before the accept round-trip resolved).
const DEFAULT_ICE: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function CallScreen({ route, navigation }: Props) {
  const { callId, role, peerId, peer, iceServers: hostIceServers } = route.params;
  const { socket } = useSocket();
  const { refreshUser } = useAuth();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState('Connecting…');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const endedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t) => t.stop());
  }, [localStream]);

  const endCall = useCallback(
    (silent = false) => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      if (!silent) {
        socket?.emit('call:end', { callId });
      }
      cleanup();
      refreshUser();
      navigation.goBack();
    },
    [socket, callId, cleanup, navigation, refreshUser],
  );

  useEffect(() => {
    const onBack = () => {
      endCall();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [endCall]);

  const setupPeerConnection = useCallback(
    async (iceServers: IceServer[]) => {
      const pc = new RTCPeerConnection({
        iceServers: iceServers.length ? iceServers : DEFAULT_ICE,
      });
      pcRef.current = pc;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' },
      });
      setLocalStream(stream);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // @ts-expect-error react-native-webrtc's RTCPeerConnection extends EventTarget
      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          socket?.emit('webrtc:ice-candidate', { callId, candidate: event.candidate });
        }
      };

      // @ts-expect-error react-native-webrtc event typings
      pc.ontrack = (event: any) => {
        setRemoteStream(event.streams[0]);
        setStatus('Connected');
      };

      // @ts-expect-error react-native-webrtc event typings
      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          endCall(true);
        }
      };

      return pc;
    },
    [socket, callId, endCall],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    let cancelled = false;

    const onOffer = async ({ callId: cId, sdp }: { callId: string; sdp: any }) => {
      if (cId !== callId || !pcRef.current) {
        return;
      }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit('webrtc:answer', { callId, sdp: answer });
    };

    const onAnswer = async ({ callId: cId, sdp }: { callId: string; sdp: any }) => {
      if (cId !== callId || !pcRef.current) {
        return;
      }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    };

    const onIceCandidate = async ({
      callId: cId,
      candidate,
    }: {
      callId: string;
      candidate: any;
    }) => {
      if (cId !== callId || !pcRef.current || !candidate) {
        return;
      }
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add ICE candidate', err);
      }
    };

    const onBillingTick = ({ callId: cId }: { callId: string }) => {
      if (cId !== callId) {
        return;
      }
      refreshUser();
    };

    const onCallEnded = ({ callId: cId, reason }: { callId: string; reason: string }) => {
      if (cId !== callId) {
        return;
      }
      if (reason === 'INSUFFICIENT_BALANCE') {
        Alert.alert('Call ended', 'Ran out of coins.');
      }
      endCall(true);
    };

    const onRejected = ({ callId: cId }: { callId: string }) => {
      if (cId !== callId) {
        return;
      }
      Alert.alert('Call declined', `${peer.displayName} is not available.`);
      endCall(true);
    };

    const onAccepted = async ({
      callId: cId,
      iceServers,
    }: {
      callId: string;
      iceServers: IceServer[];
    }) => {
      if (cId !== callId || role !== 'caller' || cancelled) {
        return;
      }
      const pc = await setupPeerConnection(iceServers);
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { callId, sdp: offer });
      setStatus('Ringing…');
    };

    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIceCandidate);
    socket.on('call:billing-tick', onBillingTick);
    socket.on('call:ended', onCallEnded);
    socket.on('call:rejected', onRejected);
    socket.on('call:accepted', onAccepted);

    // Host lands on this screen already "accepted" (RootNavigator emitted
    // call:accept before navigating), so it can set up immediately and wait
    // for the caller's offer.
    if (role === 'host') {
      setupPeerConnection(hostIceServers ?? DEFAULT_ICE).then(() => setStatus('Ringing…'));
    }

    timerRef.current = setInterval(() => setDurationSeconds((d) => d + 1), 1000);

    return () => {
      cancelled = true;
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIceCandidate);
      socket.off('call:billing-tick', onBillingTick);
      socket.off('call:ended', onCallEnded);
      socket.off('call:rejected', onRejected);
      socket.off('call:accepted', onAccepted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, callId, role]);

  useEffect(() => cleanup, [cleanup]);

  const toggleMic = () => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicEnabled((v) => !v);
  };

  const toggleCam = () => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamEnabled((v) => !v);
  };

  const mm = String(Math.floor(durationSeconds / 60)).padStart(2, '0');
  const ss = String(durationSeconds % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      {remoteStream ? (
        <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
      ) : (
        <View style={[styles.remoteVideo, styles.waitingView]}>
          <Text style={styles.peerName}>{peer.displayName}</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      )}

      {localStream && (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.localVideo}
          objectFit="cover"
          mirror
        />
      )}

      <View style={styles.topBar}>
        <Text style={styles.timer}>
          {mm}:{ss}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.safetyButton}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={() =>
          showModerationMenu({
            userId: peerId,
            displayName: peer.displayName,
            callId,
            onBlocked: () => endCall(),
          })
        }>
        <Text style={styles.safetyIcon}>⚠️</Text>
      </TouchableOpacity>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleMic}>
          <Text style={styles.controlIcon}>{micEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, styles.endButton]}
          onPress={() => endCall()}>
          <Text style={styles.controlIcon}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={toggleCam}>
          <Text style={styles.controlIcon}>{camEnabled ? '📷' : '🚫'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  remoteVideo: { flex: 1 },
  waitingView: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  peerName: { color: '#fff', fontSize: 24, fontWeight: '700' },
  status: { color: '#8b8b9a', marginTop: 8 },
  localVideo: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  topBar: { position: 'absolute', top: 50, left: 16 },
  safetyButton: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: '#00000080',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  safetyIcon: { fontSize: 18 },
  timer: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: '#00000080',
    padding: 8,
    borderRadius: 8,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2f2f45',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endButton: { backgroundColor: '#dc2626', transform: [{ rotate: '135deg' }] },
  controlIcon: { fontSize: 26 },
});
