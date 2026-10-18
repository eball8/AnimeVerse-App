import React, { useEffect, useState } from 'react';

interface Props {
  src?: string | null;
  seed: string;
  name?: string;
  className?: string;
}

const Avatar: React.FC<Props> = ({ src, seed, name, className = '' }) => {
  const fallback = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
  const sources = [src, fallback].filter((s): s is string => !!s);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [src]);

  if (idx >= sources.length) {
    return (
      <div className={`${className} bg-primary-500/20 text-white font-bold flex items-center justify-center`}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
};

export default Avatar;
