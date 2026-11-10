export interface Assistant {
  _id: string;
  name: string;
  personality: string;
  paused: boolean;
  /** the analyst a new private analysis starts with, for this person */
  isDefault?: boolean;
}
export interface AssistantInput {
  name: string;
  personality: string;
  paused: boolean;
  /** make this the default analyst (true) or stop it being so (false); left out, it is not changed */
  default?: boolean;
}
export interface SharedAssistant {
  id: string;
  name: string;
  personality: string;
  available: boolean;
}
export interface SharedAssistantSettings {
  enabled: boolean;
  lockedOff: boolean;
  policy: 'unanimous' | 'admins';
  agreed: boolean;
  canLock: boolean;
  canManage: boolean;
  whoCanAdd?: 'everyone' | 'admins';
  canAdd?: boolean;
  canSetAdditionPolicy?: boolean;
  bots: SharedAssistant[];
  pending: string[];
}
export interface SharedAssistantChange {
  action: 'add' | 'remove' | 'consent' | 'switch' | 'lock' | 'addition-policy';
  assistantId?: string;
  whoCanAdd?: 'everyone' | 'admins';
  enabled?: boolean;
}

export interface PublicAssistant {
  _id: string;
  name: string;
  paused: boolean;
  profileUserId?: string;
}

export interface AssistantProfile {
  handle: string;
  bio: string;
  public: boolean;
  userId?: string;
  picture?: string;
}
