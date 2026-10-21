import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'moderator' | 'user';
export type AccountType = 'public' | 'private';
export type Gender = 'male' | 'female' | 'none';

export interface UserProfile {
  uid: string;
  email?: string;
  username: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  bio?: string;
  gender?: Gender;
  birthDate?: string;
  pronouns?: string;
  age?: number;
  role: UserRole;
  accountType: AccountType;
  isVerified: boolean;
  isEmailVerified?: boolean;
  isBanned: boolean;
  isDeactivated?: boolean;
  deactivatedAt?: Timestamp;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  preferredLanguage: 'ar' | 'en';
  themePreference: 'dark' | 'light' | 'system';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsernameChange?: Timestamp;
  lastDisplayNameChange?: Timestamp;
  showActivity?: boolean;
  showLikedReels?: boolean;
  messagePrivacy?: 'everyone' | 'following' | 'nobody';
  lastActive?: Timestamp;
}

export interface Anime {
  malId: number;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  synopsis?: string;
  imageUrl: string;
  trailerUrl?: string;
  type?: string;
  episodes?: number;
  status?: string;
  airing: boolean;
  score?: number;
  rank?: number;
  popularity?: number;
  season?: string;
  year?: number;
  genres: string[];
  studios?: string[];
}

export interface EpisodeLink {
  animeId: number;
  episodeNumber: number;
  season: number;
  server: string;
  quality: '1080' | '720' | '480';
  url: string;
  addedBy: string;
  addedAt: Timestamp;
}

export interface Report {
  id: string;
  type: 'broken-link' | 'abuse' | 'spam';
  targetId: string;
  targetType: 'episode' | 'comment' | 'post' | 'user';
  reporterUid: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: Timestamp;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
}
