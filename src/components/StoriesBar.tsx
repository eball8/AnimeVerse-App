import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeStories, hasSeenAll } from '../services/storyService';
import type { StoryGroup } from '../services/storyService';
import StoryViewer from './StoryViewer';

const avatarOf = (url: string | undefined, uid: string) =>
  url || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

const StoriesBar: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => subscribeStories(setGroups), []);

  if (!user || !profile) return null;

  const mine = groups.find((g) => g.authorId === user.uid);
  const others = groups.filter((g) => g.authorId !== user.uid);
  const ordered = mine ? [mine, ...others] : others;

  const open = (g: StoryGroup) => setViewer(ordered.indexOf(g));

  return (
    <>
      <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        <button
          onClick={() => (mine ? open(mine) : navigate('/create-post?mode=story'))}
          className="shrink-0 w-[68px] flex flex-col items-center gap-1.5"
        >
          <div className="relative">
            <div
              className={`w-[68px] h-[68px] rounded-full p-[2.5px] ${
                mine && !hasSeenAll(mine)
                  ? 'bg-gradient-to-tr from-primary-500 via-accent-500 to-amber-400'
                  : 'bg-white/15'
              }`}
            >
              <img
                src={avatarOf(profile.photoURL, user.uid)}
                alt=""
                className="w-full h-full rounded-full object-cover bg-dark-900 border-[2.5px] border-dark-950"
              />
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigate('/create-post?mode=story');
              }}
              className="absolute -bottom-0.5 -left-0.5 w-6 h-6 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 border-2 border-dark-950 flex items-center justify-center"
            >
              <Plus className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </span>
          </div>
          <span className="text-[11px] text-slate-300 font-semibold truncate w-full text-center">قصتك</span>
        </button>

        {others.map((g) => {
          const seen = hasSeenAll(g);
          return (
            <button key={g.authorId} onClick={() => open(g)} className="shrink-0 w-[68px] flex flex-col items-center gap-1.5">
              <div
                className={`w-[68px] h-[68px] rounded-full p-[2.5px] ${
                  seen ? 'bg-white/15' : 'bg-gradient-to-tr from-primary-500 via-accent-500 to-amber-400'
                }`}
              >
                <img
                  src={avatarOf(g.authorPhotoURL, g.authorId)}
                  alt=""
                  className="w-full h-full rounded-full object-cover bg-dark-900 border-[2.5px] border-dark-950"
                />
              </div>
              <span className={`text-[11px] font-semibold truncate w-full text-center ${seen ? 'text-slate-500' : 'text-slate-200'}`}>
                {g.authorName}
              </span>
            </button>
          );
        })}
      </div>

      {viewer !== null && (
        <StoryViewer
          groups={ordered}
          startGroup={viewer}
          onClose={() => {
            setViewer(null);
            setTick((t) => t + 1);
          }}
        />
      )}
    </>
  );
};

export default StoriesBar;
