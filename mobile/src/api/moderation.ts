import { Alert } from 'react-native';
import { apiClient, apiErrorMessage } from './client';

export type ReportReason =
  | 'NUDITY_OR_SEXUAL'
  | 'HARASSMENT'
  | 'SCAM_OR_FRAUD'
  | 'UNDERAGE'
  | 'VIOLENCE'
  | 'OTHER';

const REASON_LABELS: { reason: ReportReason; label: string }[] = [
  { reason: 'NUDITY_OR_SEXUAL', label: 'Nudity or sexual content' },
  { reason: 'HARASSMENT', label: 'Harassment or bullying' },
  { reason: 'SCAM_OR_FRAUD', label: 'Scam or fraud' },
  { reason: 'UNDERAGE', label: 'Underage user' },
  { reason: 'VIOLENCE', label: 'Violence or threats' },
  { reason: 'OTHER', label: 'Something else' },
];

export interface BlockedUser {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export async function reportUser(params: {
  reportedUserId: string;
  reason: ReportReason;
  callId?: string;
}): Promise<void> {
  await apiClient.post('/moderation/report', params);
}

export async function blockUser(blockedUserId: string): Promise<void> {
  await apiClient.post('/moderation/block', { blockedUserId });
}

export async function unblockUser(userId: string): Promise<void> {
  await apiClient.delete(`/moderation/block/${userId}`);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const res = await apiClient.get('/moderation/blocks');
  return res.data.blocks;
}

// Present the "report reason" picker, then submit. Used from the call screen
// and host list. Google Play requires this flow to be reachable in-app.
function pickReasonAndReport(userId: string, displayName: string, callId?: string) {
  Alert.alert(
    `Report ${displayName}`,
    'Why are you reporting this user?',
    [
      ...REASON_LABELS.map(({ reason, label }) => ({
        text: label,
        onPress: async () => {
          try {
            await reportUser({ reportedUserId: userId, reason, callId });
            Alert.alert('Report submitted', 'Thanks — our team will review this.');
          } catch (err) {
            Alert.alert('Error', apiErrorMessage(err));
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}

// The "⋮" safety menu shown next to another user. `onBlocked` lets the caller
// refresh its list / leave the call after a successful block.
export function showModerationMenu(params: {
  userId: string;
  displayName: string;
  callId?: string;
  onBlocked?: () => void;
}) {
  const { userId, displayName, callId, onBlocked } = params;
  Alert.alert(displayName, 'Keep yourself safe', [
    {
      text: 'Report user',
      onPress: () => pickReasonAndReport(userId, displayName, callId),
    },
    {
      text: 'Block user',
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          `Block ${displayName}?`,
          "You won't see each other or be able to call again.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                try {
                  await blockUser(userId);
                  Alert.alert('Blocked', `${displayName} has been blocked.`);
                  onBlocked?.();
                } catch (err) {
                  Alert.alert('Error', apiErrorMessage(err));
                }
              },
            },
          ],
        );
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
