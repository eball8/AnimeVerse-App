import React from 'react';
import { Compass } from 'lucide-react';

const Explore: React.FC = () => {
  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Compass className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">استكشاف</h2>
      </div>
      <div className="card p-6 text-center text-slate-500 text-sm">
        <p>قيد الإنشاء...</p>
      </div>
    </div>
  );
};

export default Explore;
